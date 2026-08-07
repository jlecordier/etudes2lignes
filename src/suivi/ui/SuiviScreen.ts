import { Subject, merge, switchMap, takeUntil, tap } from 'rxjs';
import type { DisplayedPoint } from '../../carte/ports/CarteDesPointsPort';
import type { CoordonneeSelector } from '../../carte/ports/CoordonneeSelectorPort';
import { query, queryAll } from '../../shared/dom';
import { eventsOf, untilAborted, windowEventsOf } from '../../shared/events';
import type { Run } from '../../shared/runner';
import { SchemaPageElement, createSchemaPage } from '../../shared/SchemaPage';
import { defineScreen } from '../../shared/screen';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { Trajet } from '../../trajets/domain/Trajet';
import type { TrajetId } from '../../trajets/domain/ids';
import type { TrajetRepository } from '../../trajets/ports/TrajetRepository';
import { ratiosSum } from '../domain/overview';
import { sourceStatusText, suiviStatusText } from '../domain/presentation';
import {
    computeScrollTarget,
    computeScroll,
    offsetAt,
    POSITION_VIEWPORT_FRACTION,
    type EtapeDuVoyage,
    type SurTrajet,
} from '../domain/projection';
import type { SourceStatus } from '../domain/sourceStatus';
import type { ScreenWakeLock } from '../ports/ScreenWakeLockPort';
import type { PositionSource } from '../ports/PositionSource';
import type { PositionSimulator } from '../ports/PositionSimulator';
import {
    createOverviewPage,
    overviewPageId,
    paintOverviewPage,
    OverviewPageElement,
} from './OverviewPage';
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
    const suiviBar = query('#suivi-bar', HTMLDivElement, root);
    const overview = query('#trajet-overview', HTMLDivElement, root);
    const overviewStack = query('#overview-stack', HTMLDivElement, root);
    const overviewButton = query('#overview-button', HTMLButtonElement, root);
    const positionBar = query('#overview-position', HTMLDivElement, root);

    // Le repère visuel doit tomber là où le défilement vise : une seule valeur,
    // celle du domaine, que le CSS lit.
    document.documentElement.style.setProperty(
        '--fraction-position',
        String(POSITION_VIEWPORT_FRACTION),
    );

    let trajet: Trajet | null = null;
    let lastPosition: Coordonnee | null = null;
    /**
     * Le dernier résultat « sur trajet ». Il sert à trois choses : l'adhérence du
     * tick suivant, le défilement, et la barre de l'aperçu. C'est **la position
     * sur le trajet** qu'on garde, pas des pixels : après une rotation, les
     * offsets ont tous changé mais elle, non.
     */
    let lastSurTrajet: SurTrajet | null = null;
    let suiviAutomatique = true;
    // L'écran sait qu'il attend un choix sur la carte : il n'a pas à le déduire
    // de l'attribut `hidden` d'un écran appartenant à une autre capacité.
    let activeCoordonneeChoice = false;

    /** Le détachement de l'écran : ce qui referme tout ce qu'il a ouvert. */
    const parti$ = untilAborted(signal);

    /**
     * D'où vient la position. Rien ne coule tant que le trajet n'est pas chargé :
     * le mode n'est poussé qu'à ce moment-là.
     */
    const mode$ = new Subject<SuiviMode>();

    eventsOf(query('#leave-suivi-button', HTMLButtonElement, root), 'click')
        .pipe(takeUntil(parti$))
        .subscribe(() => {
            onBack();
        });
    eventsOf(query('#simuler-button', HTMLButtonElement, root), 'click')
        .pipe(takeUntil(parti$))
        .subscribe(() => {
            run(chooseSimulatedPosition(), 'le choix de la position simulée');
        });
    eventsOf(query('#leave-simulation-button', HTMLButtonElement, root), 'click')
        .pipe(takeUntil(parti$))
        .subscribe(() => {
            mode$.next('gps');
        });
    eventsOf(resumeButton, 'click')
        .pipe(takeUntil(parti$))
        .subscribe(() => {
            resumeSuivi();
        });
    eventsOf(overviewButton, 'click')
        .pipe(takeUntil(parti$))
        .subscribe(() => {
            toggleOverview();
        });

    /**
     * Une rotation ne déplace pas la position sur le trajet : elle déplace les
     * offsets des deux piles. Rien n'est donc reprojeté — on réinterpole.
     *
     * Posé sur `window`, donc hors de l'écran : sans le `takeUntil`, il
     * survivrait à la sortie et s'ajouterait une fois de plus à chaque visite.
     */
    windowEventsOf('resize')
        .pipe(takeUntil(parti$))
        .subscribe(() => {
            measureSuiviBar();
            replayLastSurTrajet();
        });

    /**
     * Ce qui trahit un défilement **humain** : un toucher sur le document ou la
     * molette. On n'écoute pas 'scroll', que nos propres `scrollTo` déclenchent
     * aussi. Les deux disent la même chose et se lisent donc d'un seul tenant —
     * l'un est posé sur la pile, l'autre hors de l'écran, sur `window`.
     */
    merge(
        eventsOf(pagesContainer, 'touchstart', { passive: true }),
        windowEventsOf('wheel', { passive: true }),
    )
        .pipe(takeUntil(parti$))
        .subscribe(() => {
            switchToManualScroll();
        });

    /**
     * La position, d'où qu'elle vienne.
     *
     * Changer de mode referme la source précédente et ouvre la suivante : c'est
     * le `switchMap` qui s'en charge, et il n'y a donc plus deux sources à
     * penser à arrêter avant d'en démarrer une — ni au changement de mode, ni en
     * quittant l'écran, où le `takeUntil` les referme toutes.
     */
    mode$
        .pipe(
            tap((mode) => {
                resetSuivi(mode);
            }),
            switchMap((mode) => (mode === 'simulation' ? simulation : realSource).events$),
            takeUntil(parti$),
        )
        .subscribe((event) => {
            if (event.kind === 'position') {
                onPosition(event.position);
            } else {
                onStatus(event.status);
            }
        });

    // Il ne reste **rien** à ranger en partant : le verrou d'écran se rend avec
    // son abonnement, les sources se referment avec le leur, et les pages
    // libèrent leurs URL d'objet en quittant le document avec l'écran.
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
        // L'écran reste allumé tant que ce suivi dure : le verrou est tenu par
        // l'abonnement, et rendu quand l'écran s'en va.
        screenWakeLock.held$.pipe(takeUntil(parti$)).subscribe();
        mode$.next('gps');
    }

    /**
     * La hauteur de la barre d'état, que la feuille de style retire à celle de
     * l'écran pour dimensionner l'aperçu. Mesurée, parce qu'elle change : le
     * bandeau de simulation s'ajoute, et la barre se plie sur écran étroit.
     */
    function measureSuiviBar(): void {
        const height = suiviBar.getBoundingClientRect().height;
        root.style.setProperty('--suivi-bar-height', `${String(height)}px`);
    }

    /**
     * On change de source : tout ce que l'écran savait de la précédente est
     * périmé.
     *
     * La mémoire de la dernière position et l'ancrage d'adhérence n'ont aucun
     * sens d'une source à l'autre : sans cette remise à zéro, quitter la
     * simulation puis appuyer sur « Reprendre le suivi » recalait la page sur la
     * position simulée, que l'utilisateur lisait comme sa position réelle.
     *
     * La barre de l'aperçu disparaît par la même occasion, et pour la même
     * raison : elle ne doit pas laisser une position fictive plantée sur le
     * trajet après qu'on a quitté la simulation.
     *
     * Arrêter les sources n'est plus de son ressort — le `switchMap` referme
     * celle qu'on quitte —, et le texte d'attente non plus : la source annonce
     * elle-même son état, et `presentation.ts` le rédige.
     */
    function resetSuivi(mode: SuiviMode): void {
        lastPosition = null;
        lastSurTrajet = null;
        suiviAutomatique = true;
        resumeButton.hidden = true;
        positionBar.hidden = true;
        simulationBanner.hidden = mode !== 'simulation';
        // Le bandeau vient de s'ajouter ou de partir : la barre a changé de hauteur.
        measureSuiviBar();
    }

    function renderStack(): void {
        // La pile s'affiche comme le document se lit (de bas en haut) : la
        // première page du voyage tout en bas — le voyage remonte l'écran
        // d'un seul tenant, sans rupture aux changements de page.
        const pages = trajet === null ? [] : trajet.imagesInReadingOrder();
        pagesContainer.replaceChildren(...pages.map((page) => createSchemaPage(page)));
        // Les mêmes pages en réduction, mais **pas** les mêmes images : des
        // vignettes peintes une fois dans un canevas. Les réafficher en `<img>`
        // coûtait 183 Mo de plus sur un trajet réel, et ne les rendait jamais
        // (voir `OverviewPage`). La barre reste dans cette pile — c'est elle qui
        // lui sert de repère, et un enfant en absolu ne pèse pas sur la mise en page.
        const vignettes = pages.map((page) => ({
            element: createOverviewPage(page),
            blob: page.blob,
        }));
        overviewStack.replaceChildren(...vignettes.map(({ element }) => element), positionBar);

        // Sans page, aucun aperçu à proposer — et surtout aucune somme à écrire :
        // la feuille de style diviserait par zéro.
        const hasPages = pages.length > 0;
        overview.hidden = !hasPages;
        overviewButton.hidden = !hasPages;
        if (hasPages) {
            root.style.setProperty('--overview-ratios-sum', String(ratiosSum(pages)));
            run(paintOverview(vignettes), 'la construction de l’aperçu du trajet');
        }
    }

    /**
     * Les vignettes de l'aperçu, **une page à la fois**.
     *
     * Le séquentiel est la raison d'être du canevas : six décodages concurrents
     * tiendraient six pages pleine taille en mémoire, soit exactement ce que
     * l'aperçu cherche à éviter. Le signal arrête la construction si l'écran est
     * quitté entre deux pages.
     */
    async function paintOverview(
        vignettes: readonly { element: OverviewPageElement; blob: Blob }[],
    ): Promise<void> {
        for (const { element, blob } of vignettes) {
            if (signal.aborted) {
                return;
            }
            await paintOverviewPage(element, blob);
        }
    }

    /** L'aperçu s'ouvre et se ferme ; sur grand écran il est là de toute façon. */
    function toggleOverview(): void {
        const ouvert = root.classList.toggle('overview-ouvert');
        overviewButton.setAttribute('aria-pressed', String(ouvert));
        // Il ne mesurait rien tant qu'il était replié : la barre n'avait donc
        // aucun endroit où se poser. Maintenant, si.
        replayLastSurTrajet();
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
        const result = computeScrollTarget(stackEtapes(currentTrajet), position, lastSurTrajet);
        statusElement.textContent = suiviStatusText(result);
        if (result.kind === 'sur-trajet') {
            lastSurTrajet = result;
            replayLastSurTrajet();
        }
    }

    /**
     * Place les deux vues sur la dernière position connue **sur le trajet**.
     *
     * Le seul chemin par lequel quoi que ce soit bouge, et il ne décide rien : ni
     * coordonnée relue, ni segment rechoisi. Une position qui arrive, l'ouverture
     * de l'aperçu et une rotation d'écran y mènent toutes les trois — dans les
     * deux derniers cas, seuls les pixels ont changé.
     *
     * L'ancrage est réécrit avec la cible fraîchement mesurée : après une
     * rotation, l'ancienne appartiendrait à une mise en page qui n'existe plus, et
     * l'adhérence du tick suivant la comparerait à des candidats d'aujourd'hui.
     */
    function replayLastSurTrajet(): void {
        const currentTrajet = trajet;
        const last = lastSurTrajet;
        if (currentTrajet === null || last === null) {
            return;
        }
        const scrollTarget = offsetAt(stackEtapes(currentTrajet), last);
        lastSurTrajet = { ...last, scrollTarget };
        followTarget(scrollTarget);
        placeOverviewPosition(currentTrajet, last);
    }

    /**
     * La barre, dans le référentiel de l'aperçu — la même position sur le trajet,
     * réinterpolée sur les offsets de sa propre pile.
     */
    function placeOverviewPosition(currentTrajet: Trajet, last: SurTrajet): void {
        // Aperçu replié : `display: none` ne mesure rien. On ne place donc rien —
        // et surtout on ne prend pas ce 0 pour un offset. C'est une mesure, pas un
        // seuil de largeur recopié : la feuille de style reste seule à décider.
        if (overviewStack.getBoundingClientRect().height === 0) {
            positionBar.hidden = true;
            return;
        }
        const offset = offsetAt(overviewEtapes(currentTrajet), last);
        positionBar.style.top = `${String(offset)}px`;
        positionBar.hidden = false;
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
     * Les offsets de la pile qui défile, en coordonnées du document : c'est
     * `window` qu'on fait défiler, donc c'est là que la cible doit se lire.
     */
    function stackEtapes(currentTrajet: Trajet): EtapeDuVoyage[] {
        const montees = queryAll('schema-page', SchemaPageElement, pagesContainer);
        return voyageEtapes(
            currentTrajet,
            new Map(montees.map((page) => [page.pageId, page])),
            -window.scrollY,
        );
    }

    /**
     * Ceux de l'aperçu, relativement au haut de sa propre pile : le panneau est
     * épinglé ou fixe, où les coordonnées du document ne veulent rien dire. Le
     * résultat est directement le `top` de la barre.
     */
    function overviewEtapes(currentTrajet: Trajet): EtapeDuVoyage[] {
        const vignettes = queryAll('overview-page', OverviewPageElement, overviewStack);
        return voyageEtapes(
            currentTrajet,
            new Map(vignettes.map((element) => [overviewPageId(element), element])),
            overviewStack.getBoundingClientRect().top,
        );
    }

    /**
     * Les étapes du voyage projetées dans un référentiel d'affichage : une pile
     * de pages, et l'origine depuis laquelle on compte les offsets.
     *
     * Les offsets sont relus à chaque position (jamais mis en cache) :
     * gratuit toutes les ~10 s, et insensible aux rotations d'écran.
     */
    function voyageEtapes(
        currentTrajet: Trajet,
        pages: ReadonlyMap<string, HTMLElement>,
        originTop: number,
    ): EtapeDuVoyage[] {
        return currentTrajet.pointsInOrdreDuVoyage().map((point) => {
            const affichee = pages.get(point.imageId);
            if (affichee === undefined) {
                throw new Error(`Page absente de la pile affichée : ${point.imageId}`);
            }
            const frame = affichee.getBoundingClientRect();
            return {
                coordonnee: point.coordonnee,
                offset: frame.top - originTop + point.fraction.value * frame.height,
            };
        });
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
        // La coordonnée est simulée **avant** le passage en mode simulation : la
        // source la mémorise, et l'abonnement qui s'ouvre juste après la rejoue.
        // L'inverse la pousserait à un flux que personne n'écoute encore.
        simulation.simulate(coordonnee);
        mode$.next('simulation');
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
