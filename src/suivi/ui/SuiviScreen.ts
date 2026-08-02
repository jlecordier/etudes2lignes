import type { DisplayedPoint } from '../../carte/ports/CarteDesPointsPort';
import type { CoordonneeSelector } from '../../carte/ports/CoordonneeSelectorPort';
import { query, queryAll } from '../../shared/dom';
import type { Run } from '../../shared/runner';
import { SchemaPageElement, createSchemaPage } from '../../shared/SchemaPage';
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

export interface SuiviDependencies {
    repository: TrajetRepository;
    realSource: PositionSource;
    simulation: PositionSimulator;
    coordonneeSelector: CoordonneeSelector;
    screenWakeLock: ScreenWakeLock;
    run: Run;
    onBack: (id: TrajetId) => void;
}

/** Où la position vient-elle ? Le mode n'est plus deviné d'un attribut du DOM. */
type SuiviMode = 'gps' | 'simulation';

/**
 * Écran de suivi : les pages du trajet empilées, et le document qui défile
 * tout seul pour placer la position courante aux trois quarts de l'écran.
 */
export function createSuiviScreen(dependencies: SuiviDependencies): {
    show: (id: TrajetId) => Promise<void>;
} {
    const { repository, realSource, simulation, coordonneeSelector, screenWakeLock, run, onBack } =
        dependencies;
    const screen = query('#screen-suivi', HTMLElement);
    const statusElement = query('#suivi-status', HTMLSpanElement);
    const simulationBanner = query('#simulation-banner', HTMLElement);
    const resumeButton = query('#resume-button', HTMLButtonElement);
    const pagesContainer = query('#suivi-stack', HTMLDivElement);

    // Le repère visuel doit tomber là où le défilement vise : une seule valeur,
    // celle du domaine, que le CSS lit.
    document.documentElement.style.setProperty(
        '--fraction-position',
        String(POSITION_VIEWPORT_FRACTION),
    );

    let trajet: Trajet | null = null;
    let displayedId: TrajetId | null = null;
    // Incrémenté à chaque affichage et à chaque sortie : un chargement dont le
    // jeton est périmé (écran quitté entre-temps) ne démarre rien.
    let displayToken = 0;
    let lastPosition: Coordonnee | null = null;
    let ancragePrecedent: AncragePrecedent | null = null;
    let suiviAutomatique = true;
    // L'écran sait qu'il attend un choix sur la carte : il n'a pas à le déduire
    // de l'attribut `hidden` d'un écran appartenant à une autre capacité.
    let activeCoordonneeChoice = false;

    query('#leave-suivi-button', HTMLButtonElement).addEventListener('click', () => {
        quitter();
    });
    query('#simuler-button', HTMLButtonElement).addEventListener('click', () => {
        run(chooseSimulatedPosition(), 'le choix de la position simulée');
    });
    query('#leave-simulation-button', HTMLButtonElement).addEventListener('click', () => {
        switchTo('gps');
    });
    resumeButton.addEventListener('click', () => {
        resumeSuivi();
    });

    // Seuls un toucher sur le document ou la molette trahissent un défilement
    // humain ; on n'écoute pas 'scroll' (déclenché aussi par nos scrollTo).
    pagesContainer.addEventListener(
        'touchstart',
        () => {
            switchToManualScroll();
        },
        { passive: true },
    );
    window.addEventListener(
        'wheel',
        () => {
            switchToManualScroll();
        },
        { passive: true },
    );

    async function show(id: TrajetId): Promise<void> {
        displayedId = id;
        const jeton = ++displayToken;
        const loaded = await repository.load(id);
        if (jeton !== displayToken) {
            return;
        }
        trajet = loaded;
        renderStack();
        void screenWakeLock.acquire();
        switchTo('gps');
    }

    function quitter(): void {
        displayToken++;
        realSource.stop();
        simulation.stop();
        void screenWakeLock.release();
        // Détacher les pages, c'est libérer leurs URL d'objet : chaque
        // `<schema-page>` s'en charge en partant.
        pagesContainer.replaceChildren();
        trajet = null;
        if (displayedId !== null) {
            onBack(displayedId);
        }
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
        if (screen.hidden || activeCoordonneeChoice || !suiviAutomatique) {
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
        if (coordonnee === null) {
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

    return { show };
}
