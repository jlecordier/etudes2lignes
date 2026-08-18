// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NEVER, Subject, defer, finalize, startWith, take, type Observable } from 'rxjs';
import type { CoordonneeSelector } from '../../carte/ports/CoordonneeSelectorPort';
import type { DisplayedPoint, DisplayedPosition } from '../../carte/ports/CarteDesPointsPort';
import { query } from '../../shared/dom';
import { createRunner, type Run } from '../../shared/runner';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { FractionVerticale } from '../../trajets/domain/FractionVerticale';
import { NomDeTrajet } from '../../trajets/domain/NomDeTrajet';
import { Trajet } from '../../trajets/domain/Trajet';
import type { TrajetRepository, TrajetSummary } from '../../trajets/ports/TrajetRepository';
import { SimulationPositionSource } from '../adapters/SimulationPositionSource';
import { statusEvent, type PositionSource, type SourceEvent } from '../ports/PositionSource';
import type { ScreenWakeLock } from '../ports/ScreenWakeLockPort';
import { createSuiviScreen, type SuiviDependencies } from './SuiviScreen';

/**
 * Dépôt en mémoire, dont la lecture peut rester **en suspens** : c'est ainsi
 * qu'on observe un écran quitté avant la fin de son chargement.
 */
class FakeTrajetRepository implements TrajetRepository {
    private stored: Trajet | null = null;
    private pending: ((trajet: Trajet | null) => void) | null = null;

    put(trajet: Trajet): void {
        this.stored = trajet;
    }

    /** Suspend la prochaine lecture jusqu'à `terminerLaLecture()`. */
    suspendreLaLecture(): void {
        this.pending = null;
        this.suspendu = true;
    }

    terminerLaLecture(): void {
        const resolve = this.pending;
        this.suspendu = false;
        this.pending = null;
        resolve?.(this.stored);
    }

    private suspendu = false;

    load(): Promise<Trajet | null> {
        if (!this.suspendu) {
            return Promise.resolve(this.stored);
        }
        return new Promise((resolve) => {
            this.pending = resolve;
        });
    }

    listSummaries(): Promise<TrajetSummary[]> {
        return Promise.resolve([]);
    }

    save(): Promise<void> {
        return Promise.resolve();
    }

    delete(): Promise<void> {
        return Promise.resolve();
    }
}

/**
 * Verrou d'écran observable par son état, pas par les appels reçus : il est
 * tenu tant que quelqu'un est abonné, exactement comme le vrai.
 */
class FakeScreenWakeLock implements ScreenWakeLock {
    private holders = 0;

    readonly held$: Observable<never> = defer(() => {
        this.holders++;
        return NEVER.pipe(
            finalize(() => {
                this.holders--;
            }),
        );
    });

    isHeld(): boolean {
        return this.holders > 0;
    }
}

/**
 * Source pilotable **état par état**. `SimulationPositionSource` ne sait émettre
 * que des positions, et un fix trop grossier n'en est justement pas une : c'est
 * un état, qui porte quand même la coordonnée qu'il a mesurée.
 */
class FakePositionSource implements PositionSource {
    private readonly emissions = new Subject<SourceEvent>();

    // Le contrat du port : une source commence toujours par un état.
    readonly events$: Observable<SourceEvent> = this.emissions.pipe(
        startWith(statusEvent({ kind: 'attente' })),
    );

    emettre(event: SourceEvent): void {
        this.emissions.next(event);
    }
}

/**
 * Carte plein écran qui retient le flux qu'on lui confie et la coordonnée qu'on
 * lui fait rendre : c'est par ce flux que l'écran dit ce qu'il veut montrer.
 */
class FakeCoordonneeSelector implements CoordonneeSelector {
    private readonly recues: DisplayedPosition[] = [];
    private reponse: Coordonnee | null = null;

    /** Ce que l'utilisateur choisira au prochain passage sur la carte. */
    repondra(coordonnee: Coordonnee): void {
        this.reponse = coordonnee;
    }

    choose(
        _initialCoordonnee: Coordonnee | null,
        _reperes: readonly DisplayedPoint[],
        position$: Observable<DisplayedPosition>,
    ): Promise<Coordonnee | null> {
        // Le temps d'un choix, et pas plus : `take(1)` se désabonne de lui-même,
        // comme le vrai adapter le fait par son `takeUntil(this.choix)`.
        position$.pipe(take(1)).subscribe((position) => {
            this.recues.push(position);
        });
        const reponse = this.reponse;
        this.reponse = null;
        return Promise.resolve(reponse);
    }

    /** Ce que la carte a reçu à montrer, dans l'ordre. */
    positionsRecues(): DisplayedPosition[] {
        return this.recues;
    }
}

/** Un trajet d'une page et deux points, autour de Bordeaux. */
function trajetDeDeuxPoints(): Trajet {
    const trajet = Trajet.create(NomDeTrajet.create('Paris → Bordeaux'));
    const imageId = trajet.addImage({
        nom: 'page-1.png',
        blob: new Blob(['page']),
        largeur: 800,
        hauteur: 1200,
    });
    trajet.addPoint({
        imageId,
        fraction: FractionVerticale.create(0.9),
        coordonnee: Coordonnee.create(44.826, -0.556),
    });
    trajet.addPoint({
        imageId,
        fraction: FractionVerticale.create(0.1),
        coordonnee: Coordonnee.create(44.9, -0.5),
    });
    return trajet;
}

let repository: FakeTrajetRepository;
let realSource: SimulationPositionSource;
let simulation: SimulationPositionSource;
let carte: FakeCoordonneeSelector;
let screenWakeLock: FakeScreenWakeLock;
let echecs: string[];
let run: Run;
let trajet: Trajet;
let retours: number;
let urlsCreees: string[];
let urlsLiberees: string[];
/** Les décodages de vignette en attente : c'est ainsi qu'on voit l'enchaînement. */
let decodages: ((bitmap: ImageBitmap) => void)[];
let decodageOriginal: typeof createImageBitmap;

afterEach(() => {
    globalThis.createImageBitmap = decodageOriginal;
});

beforeEach(async () => {
    // Vider la scène **avant** de remettre les compteurs à zéro : les pages du
    // test précédent libèrent leurs URL à la microtâche suivant leur
    // détachement, et compteraient sinon dans le test qui commence.
    document.body.replaceChildren();
    await Promise.resolve();
    // jsdom n'a pas d'URL d'objet : on en pose une à la main, et le test lit
    // ainsi exactement ce que l'écran fait décoder — la pile qui défile et
    // l'aperçu montent les mêmes pages, donc chacune la sienne.
    urlsCreees = [];
    urlsLiberees = [];
    URL.createObjectURL = () => {
        const url = `blob:page-${String(urlsCreees.length + 1)}`;
        urlsCreees.push(url);
        return url;
    };
    URL.revokeObjectURL = (url: string) => {
        urlsLiberees.push(url);
    };
    // jsdom n'a pas de canevas : sans cette réponse, il annonce lui-même que
    // `getContext` n'est pas implémenté, ce qui salit la sortie des tests.
    HTMLCanvasElement.prototype.getContext = () => null;
    // jsdom ne décode rien non plus : on tient les promesses de vignette à la
    // main, ce qui rend l'enchaînement des pages observable.
    decodages = [];
    decodageOriginal = globalThis.createImageBitmap;
    globalThis.createImageBitmap = () =>
        new Promise((resolve) => {
            decodages.push(resolve);
        });
    repository = new FakeTrajetRepository();
    // Le GPS réel est ici une seconde source pilotable : l'écran ne fait
    // aucune différence entre les deux, c'est tout l'intérêt du port.
    realSource = new SimulationPositionSource();
    simulation = new SimulationPositionSource();
    carte = new FakeCoordonneeSelector();
    screenWakeLock = new FakeScreenWakeLock();
    echecs = [];
    retours = 0;
    run = createRunner((message) => echecs.push(message));
    trajet = trajetDeDeuxPoints();
    repository.put(trajet);
});

function dependances(): SuiviDependencies {
    return {
        repository,
        realSource,
        simulation,
        coordonneeSelector: carte,
        screenWakeLock,
        run,
        trajetId: trajet.id,
        onBack: () => {
            retours++;
        },
    };
}

/** Attache l'écran et laisse le chargement du trajet s'achever. */
function attacherLEcran(): Promise<HTMLElement> {
    return attacherLEcranAvec(realSource);
}

/** Le même, sur une autre source réelle : tous les états ne se simulent pas. */
async function attacherLEcranAvec(source: PositionSource): Promise<HTMLElement> {
    const element = createSuiviScreen({ ...dependances(), realSource: source });
    document.body.append(element);
    await Promise.resolve();
    await Promise.resolve();
    return element;
}

function statut(element: HTMLElement): string {
    return query('#suivi-status', HTMLSpanElement, element).textContent;
}

describe('suivi-screen', () => {
    describe("Étant donné un trajet, quand j'attache l'écran", () => {
        it("alors ses pages sont montées et l'écran est gardé allumé", async () => {
            const element = await attacherLEcran();

            expect(element.querySelectorAll('#suivi-stack schema-page')).toHaveLength(1);
            expect(screenWakeLock.isHeld()).toBe(true);
            expect(echecs).toEqual([]);
        });

        it('alors la source annonce elle-même son attente', async () => {
            const element = await attacherLEcran();

            expect(statut(element)).toBe('En attente du signal GPS…');
        });
    });

    describe("Étant donné un trajet, quand j'attache l'écran", () => {
        it("alors l'aperçu montre autant de pages que la pile qui défile", async () => {
            const element = await attacherLEcran();

            const stack = element.querySelectorAll('#suivi-stack schema-page');
            const overview = element.querySelectorAll('#overview-stack overview-page');
            expect(overview).toHaveLength(stack.length);
            expect(overview).toHaveLength(1);
        });

        it("alors l'aperçu n'ouvre aucune seconde image de la page", async () => {
            const element = await attacherLEcran();

            // Une seule URL d'objet pour une page du trajet : celle de la pile qui
            // défile. L'aperçu peint une vignette et relâche le décodage, là où une
            // seconde `<img>` retenait la page décodée pour toute la visite.
            expect(urlsCreees).toHaveLength(1);
            expect(urlsLiberees).toEqual([]);

            element.remove();
            await Promise.resolve();

            expect(urlsLiberees).toHaveLength(1);
        });

        it('alors les vignettes se peignent une page à la fois', async () => {
            trajet.addImage({
                nom: 'page-2.png',
                blob: new Blob(['page-2']),
                largeur: 800,
                hauteur: 1200,
            });
            repository.put(trajet);

            await attacherLEcran();

            // Un seul décodage en vol : deux pages pleine taille décodées en même
            // temps coûteraient précisément ce que la vignette évite.
            expect(decodages).toHaveLength(1);

            decodages[0]?.({ width: 1, height: 1, close: () => undefined });
            await Promise.resolve();
            await Promise.resolve();

            expect(decodages).toHaveLength(2);
        });

        it('alors la somme des ratios est posée pour la feuille de style', async () => {
            const element = await attacherLEcran();

            // Une page de 800 × 1200 : c'est cette somme que le CSS divise pour
            // faire tenir la pile entière dans la hauteur disponible.
            expect(element.style.getPropertyValue('--overview-ratios-sum')).toBe('1.5');
        });
    });

    describe("Étant donné un trajet sans page, quand j'attache l'écran", () => {
        it("alors il n'y a pas d'aperçu à proposer", async () => {
            trajet = Trajet.create(NomDeTrajet.create('Trajet vierge'));
            repository.put(trajet);

            const element = await attacherLEcran();

            expect(query('#trajet-overview', HTMLDivElement, element).hidden).toBe(true);
            expect(query('#overview-button', HTMLButtonElement, element).hidden).toBe(true);
            // Sans page, aucune somme : la feuille de style ne doit pas diviser par zéro.
            expect(element.style.getPropertyValue('--overview-ratios-sum')).toBe('');
        });
    });

    describe("Étant donné un écran attaché, quand je touche le bouton de l'aperçu", () => {
        it("alors l'aperçu s'ouvre, et le bouton dit qu'il est enfoncé", async () => {
            const element = await attacherLEcran();
            const bouton = query('#overview-button', HTMLButtonElement, element);

            bouton.click();

            expect(element.classList.contains('overview-ouvert')).toBe(true);
            expect(bouton.getAttribute('aria-pressed')).toBe('true');
        });

        it('alors le toucher à nouveau le referme', async () => {
            const element = await attacherLEcran();
            const bouton = query('#overview-button', HTMLButtonElement, element);

            bouton.click();
            bouton.click();

            expect(element.classList.contains('overview-ouvert')).toBe(false);
            expect(bouton.getAttribute('aria-pressed')).toBe('false');
        });
    });

    describe('Étant donné un écran attaché, quand je touche « Éditer »', () => {
        it("alors l'écran demande le retour, sans se démonter lui-même", async () => {
            const element = await attacherLEcran();

            query('#leave-suivi-button', HTMLButtonElement, element).click();

            // C'est la navigation qui détache, pas l'écran : il ne décide pas
            // où l'on va, il dit seulement qu'on veut partir.
            expect(retours).toBe(1);
            expect(element.isConnected).toBe(true);
        });
    });

    describe('Étant donné un écran attaché, quand une position arrive', () => {
        it('alors une position loin de la ligne est annoncée hors trajet', async () => {
            const element = await attacherLEcran();

            realSource.simulate(Coordonnee.create(48.857, 2.295));

            expect(statut(element)).toMatch(/^Hors trajet \(à \d+ km de la ligne\)\.$/);
        });
    });

    describe('Étant donné un écran attaché, quand je le détache', () => {
        it("alors le verrou d'écran est relâché", async () => {
            const element = await attacherLEcran();

            element.remove();

            expect(screenWakeLock.isHeld()).toBe(false);
        });

        it('alors une position qui arrive ensuite ne change plus rien', async () => {
            const element = await attacherLEcran();
            const avant = statut(element);

            element.remove();
            realSource.simulate(Coordonnee.create(48.857, 2.295));

            expect(statut(element)).toBe(avant);
        });

        it('alors la molette ne rallume plus « Reprendre le suivi »', async () => {
            const element = await attacherLEcran();
            const resume = query('#resume-button', HTMLButtonElement, element);

            element.remove();
            window.dispatchEvent(new WheelEvent('wheel'));

            // L'écouteur vit sur `window`, hors de l'écran : sans le signal
            // d'abandon, il survivrait à la sortie et s'ajouterait à chaque visite.
            expect(resume.hidden).toBe(true);
        });

        it("alors les pages libèrent ce qu'elles retenaient", async () => {
            const element = await attacherLEcran();

            element.remove();
            await Promise.resolve();

            expect(element.querySelector('schema-page')?.shadowRoot?.children).toHaveLength(0);
        });
    });

    describe("Étant donné un chargement encore en cours, quand je détache l'écran", () => {
        it("alors rien n'est monté et aucun verrou n'est demandé", async () => {
            repository.suspendreLaLecture();
            const element = createSuiviScreen(dependances());
            document.body.append(element);

            element.remove();
            repository.terminerLaLecture();
            await Promise.resolve();
            await Promise.resolve();

            expect(element.querySelectorAll('schema-page')).toHaveLength(0);
            // Le verrou est le vrai danger : demandé après la sortie, plus
            // personne n'était là pour le rendre.
            expect(screenWakeLock.isHeld()).toBe(false);
        });
    });

    describe("Étant donné le suivi au GPS, quand j'ouvre la carte pour simuler", () => {
        it('alors elle reçoit ma position réelle', async () => {
            const element = await attacherLEcran();
            realSource.simulate(Coordonnee.create(44.83, -0.57));

            query('#simuler-button', HTMLButtonElement, element).click();
            await Promise.resolve();

            expect(carte.positionsRecues()).toEqual([
                { kind: 'connue', coordonnee: Coordonnee.create(44.83, -0.57) },
            ]);
        });
    });

    describe("Étant donné un fix trop grossier pour caler la page, quand j'ouvre la carte", () => {
        it('alors elle reçoit quand même où je suis, et de combien près', async () => {
            const gps = new FakePositionSource();
            const element = await attacherLEcranAvec(gps);

            gps.emettre(
                statusEvent({
                    kind: 'imprecise',
                    imprecisionMetres: 8_000,
                    position: Coordonnee.create(46.6, 2.4),
                }),
            );
            query('#simuler-button', HTMLButtonElement, element).click();
            await Promise.resolve();

            // Une carte ne cale aucune page : ce fix ne fait pas défiler le
            // schéma, mais il situe très bien sur une carte de France — cerclé
            // de l'incertitude que la source a mesurée.
            expect(carte.positionsRecues()).toEqual([
                {
                    kind: 'approximative',
                    coordonnee: Coordonnee.create(46.6, 2.4),
                    imprecisionMetres: 8_000,
                    message: 'Position approximative (± 8 km) — trop imprécise pour caler la page.',
                },
            ]);
        });
    });

    describe('Étant donné le suivi déjà en simulation, quand je rouvre la carte', () => {
        it('alors elle ne reçoit rien : le marqueur de sélection porte déjà cette position', async () => {
            const element = await attacherLEcran();
            // Le premier passage est ce qui fait entrer en simulation.
            carte.repondra(Coordonnee.create(44.9, -0.5));
            query('#simuler-button', HTMLButtonElement, element).click();
            await Promise.resolve();
            await Promise.resolve();

            query('#simuler-button', HTMLButtonElement, element).click();
            await Promise.resolve();

            // Une seule position reçue : celle du premier passage, fait en GPS.
            expect(carte.positionsRecues()).toHaveLength(1);
        });
    });

    describe("Étant donné une simulation qu'on quitte", () => {
        it('alors la carte remontre le GPS, jamais la position simulée restée en mémoire', async () => {
            const element = await attacherLEcran();
            realSource.simulate(Coordonnee.create(44.83, -0.57));
            carte.repondra(Coordonnee.create(48.85, 2.35));
            query('#simuler-button', HTMLButtonElement, element).click();
            await Promise.resolve();
            await Promise.resolve();
            query('#leave-simulation-button', HTMLButtonElement, element).click();

            query('#simuler-button', HTMLButtonElement, element).click();
            await Promise.resolve();

            expect(carte.positionsRecues().at(-1)).toEqual({
                kind: 'connue',
                coordonnee: Coordonnee.create(44.83, -0.57),
            });
        });
    });
});
