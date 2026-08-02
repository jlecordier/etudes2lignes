import type { DisplayedPoint } from '../../carte/ports/CarteDesPointsPort';
import type { CoordonneeSelector } from '../../carte/ports/CoordonneeSelectorPort';
import { query, queryAll } from '../../shared/dom';
import type { Run } from '../../shared/runner';
import { SchemaPageElement, createSchemaPage } from '../../shared/SchemaPage';
import { defineScreen } from '../../shared/screen';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { Trajet } from '../../trajets/domain/Trajet';
import type { TrajetId } from '../../trajets/domain/ids';
import type { TrajetRepository } from '../../trajets/ports/TrajetRepository';
import { sourceStatusText, suiviStatusText } from '../domain/presentation';
import {
    computeScrollTarget,
    computeScroll,
    POSITION_VIEWPORT_FRACTION,
    type AncragePrecedent,
    type EtapeDuVoyage,
} from '../domain/projection';
import type { SourceStatus } from '../domain/sourceStatus';
import type { ScreenWakeLock } from '../ports/ScreenWakeLockPort';
import type { PositionSource } from '../ports/PositionSource';
import type { PositionSimulator } from '../ports/PositionSimulator';
import html from './SuiviScreen.html?raw';

export interface SuiviDependencies {
    repository: TrajetRepository;
    realSource: PositionSource;
    simulation: PositionSimulator;
    coordonneeSelector: CoordonneeSelector;
    screenWakeLock: ScreenWakeLock;
    run: Run;
    /** L'écran est fabriqué **pour** un trajet : il n'a pas de vie sans lui. */
    trajetId: TrajetId;
    onBack: () => void;
}

/** Où la position vient-elle ? Le mode n'est plus deviné d'un attribut du DOM. */
type SuiviMode = 'gps' | 'simulation';

/**
 * Écran de suivi : les pages du trajet empilées, et le document qui défile
 * tout seul pour placer la position courante aux trois quarts de l'écran.
 *
 * L'écran vit exactement le temps de son attachement au document. Il n'a donc
 * ni jeton d'affichage à comparer après chaque `await`, ni méthode de sortie à
 * penser à appeler : le détachement avorte le signal, ce qui retire tous les
 * écouteurs d'un coup et déclenche le rangement.
 */
export const createSuiviScreen = defineScreen<SuiviDependencies>('suivi-screen', html, mount);

function mount(root: HTMLElement, dependencies: SuiviDependencies, signal: AbortSignal): void {
    const {
        repository,
        realSource,
        simulation,
        coordonneeSelector,
        screenWakeLock,
        run,
        trajetId,
        onBack,
    } = dependencies;
    const statusElement = query('#suivi-status', HTMLSpanElement, root);
    const simulationBanner = query('#simulation-banner', HTMLElement, root);
    const resumeButton = query('#resume-button', HTMLButtonElement, root);
    const pagesContainer = query('#suivi-stack', HTMLDivElement, root);

    // Le repère visuel doit tomber là où le défilement vise : une seule valeur,
    // celle du domaine, que le CSS lit.
    document.documentElement.style.setProperty(
        '--fraction-position',
        String(POSITION_VIEWPORT_FRACTION),
    );

    let trajet: Trajet | null = null;
    let lastPosition: Coordonnee | null = null;
    let ancragePrecedent: AncragePrecedent | null = null;
    let suiviAutomatique = true;
    // L'écran sait qu'il attend un choix sur la carte : il n'a pas à le déduire
    // de l'attribut `hidden` d'un écran appartenant à une autre capacité.
    let activeCoordonneeChoice = false;

    query('#leave-suivi-button', HTMLButtonElement, root).addEventListener(
        'click',
        () => {
            onBack();
        },
        { signal },
    );
    query('#simuler-button', HTMLButtonElement, root).addEventListener(
        'click',
        () => {
            run(chooseSimulatedPosition(), 'le choix de la position simulée');
        },
        { signal },
    );
    query('#leave-simulation-button', HTMLButtonElement, root).addEventListener(
        'click',
        () => {
            switchTo('gps');
        },
        { signal },
    );
    resumeButton.addEventListener(
        'click',
        () => {
            resumeSuivi();
        },
        { signal },
    );

    // Seuls un toucher sur le document ou la molette trahissent un défilement
    // humain ; on n'écoute pas 'scroll' (déclenché aussi par nos scrollTo).
    pagesContainer.addEventListener(
        'touchstart',
        () => {
            switchToManualScroll();
        },
        { passive: true, signal },
    );
    // Posé sur `window`, donc hors de l'écran : sans ce signal, il survivrait à
    // la sortie et s'ajouterait une fois de plus à chaque visite.
    window.addEventListener(
        'wheel',
        () => {
            switchToManualScroll();
        },
        { passive: true, signal },
    );

    /**
     * Quitter l'écran, c'est le détacher — et tout le rangement tient ici.
     * Les pages, elles, libèrent leurs URL d'objet toutes seules en quittant
     * le document avec l'écran.
     */
    signal.addEventListener('abort', () => {
        realSource.stop();
        simulation.stop();
        void screenWakeLock.release();
    });

    run(charger(), 'l’ouverture du suivi');

    async function charger(): Promise<void> {
        const loaded = await repository.load(trajetId);
        // L'écran a pu être quitté pendant la lecture : il ne démarre alors
        // rien, et surtout ne demande pas un verrou que plus personne ne rendra.
        if (signal.aborted) {
            return;
        }
        trajet = loaded;
        renderStack();
        void screenWakeLock.acquire();
        switchTo('gps');
    }

    /**
     * Le seul endroit qui change de source de position — et donc le seul qui
     * remette l'état du suivi à zéro.
     *
     * La mémoire de la dernière position et l'ancrage d'adhérence n'ont aucun
     * sens d'une source à l'autre : sans cette remise à zéro, quitter la
     * simulation puis appuyer sur « Reprendre le suivi » recalait la page sur la
     * position simulée, que l'utilisateur lisait comme sa position réelle.
     */
    function switchTo(mode: SuiviMode): void {
        realSource.stop();
        simulation.stop();
        lastPosition = null;
        ancragePrecedent = null;
        suiviAutomatique = true;
        resumeButton.hidden = true;
        simulationBanner.hidden = mode !== 'simulation';
        // Le texte d'attente n'est plus écrit ici : la source annonce elle-même
        // son état au démarrage, et `presentation.ts` le rédige.
        if (mode === 'simulation') {
            simulation.start(onPosition, onStatus);
        } else {
            realSource.start(onPosition, onStatus);
        }
    }

    function renderStack(): void {
        // La pile s'affiche comme le document se lit (de bas en haut) : la
        // première page du voyage tout en bas — le voyage remonte l'écran
        // d'un seul tenant, sans rupture aux changements de page.
        const pages = trajet === null ? [] : trajet.imagesInReadingOrder();
        pagesContainer.replaceChildren(...pages.map((page) => createSchemaPage(page)));
    }

    // --- Position → défilement --------------------------------------------------

    function onPosition(position: Coordonnee): void {
        lastPosition = position;
        applyPosition();
    }

    /**
     * Deux voix écrivent dans la ligne d'état : la source (ici) et la projection
     * (`applyPosition`). La règle est chronologique — le dernier
     * événement gagne — et elle est juste dans les deux sens : un signal perdu
     * doit couvrir un « hors trajet » devenu douteux, et une position fraîche
     * doit effacer un état d'attente périmé.
     */
    function onStatus(newStatus: SourceStatus): void {
        statusElement.textContent = sourceStatusText(newStatus);
    }

    function applyPosition(): void {
        const currentTrajet = trajet;
        const position = lastPosition;
        if (currentTrajet === null || position === null) {
            return;
        }
        const result = computeScrollTarget(voyageEtapes(currentTrajet), position, ancragePrecedent);
        statusElement.textContent = suiviStatusText(result);
        if (result.kind === 'sur-trajet') {
            ancragePrecedent = result;
            followTarget(result.scrollTarget);
        }
    }

    /** Le défilement automatique s'efface devant un défilement humain. */
    function followTarget(target: number): void {
        if (!suiviAutomatique) {
            return;
        }
        const top = computeScroll(
            target,
            window.innerHeight,
            document.documentElement.scrollHeight,
        );
        window.scrollTo({ top: top, behavior: 'smooth' });
    }

    /**
     * Les offsets sont relus à chaque position (jamais mis en cache) :
     * gratuit toutes les ~10 s, et insensible aux rotations d'écran.
     */
    function voyageEtapes(currentTrajet: Trajet): EtapeDuVoyage[] {
        const pages = displayedPages();
        return currentTrajet.pointsInOrdreDuVoyage().map((point) => {
            const affichee = pages.get(point.imageId);
            if (affichee === undefined) {
                throw new Error(`Page absente de la pile affichée : ${point.imageId}`);
            }
            const frame = affichee.getBoundingClientRect();
            return {
                coordonnee: point.coordonnee,
                offset: frame.top + window.scrollY + point.fraction.value * frame.height,
            };
        });
    }

    /**
     * Les pages montées, par identifiant. La pile est relue à chaque position
     * comme les offsets le sont : rien n'est mis en cache, donc rien ne peut
     * mentir après un rendu.
     */
    function displayedPages(): Map<string, SchemaPageElement> {
        return new Map(
            queryAll('schema-page', SchemaPageElement, pagesContainer).map((page) => [
                page.pageId,
                page,
            ]),
        );
    }

    // --- Défilement manuel -------------------------------------------------------

    function switchToManualScroll(): void {
        if (activeCoordonneeChoice || !suiviAutomatique) {
            return;
        }
        suiviAutomatique = false;
        resumeButton.hidden = false;
    }

    function resumeSuivi(): void {
        suiviAutomatique = true;
        resumeButton.hidden = true;
        applyPosition();
    }

    // --- Simulation ----------------------------------------------------------------

    async function chooseSimulatedPosition(): Promise<void> {
        activeCoordonneeChoice = true;
        let coordonnee: Coordonnee | null;
        try {
            // Les points du trajet servent de repères pour viser une position.
            coordonnee = await coordonneeSelector.choose(simulation.lastPosition, trajetReperes());
        } finally {
            activeCoordonneeChoice = false;
        }
        if (coordonnee === null || signal.aborted) {
            return;
        }
        switchTo('simulation');
        simulation.simulate(coordonnee);
    }

    function trajetReperes(): DisplayedPoint[] {
        if (trajet === null) {
            return [];
        }
        return trajet
            .numberedPointsInOrdreDuVoyage()
            .map(({ point, number }) => ({ id: point.id, number, coordonnee: point.coordonnee }));
    }
}
