// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { Subject, defer, finalize, startWith, type Observable, type Subscription } from 'rxjs';
import type {
    CarteDesPoints,
    DisplayedPoint,
    DisplayedPosition,
} from '../../carte/ports/CarteDesPointsPort';
import type { CoordonneeSelector } from '../../carte/ports/CoordonneeSelectorPort';
import { requireElementAt } from '../../shared/array';
import { query, queryAll } from '../../shared/dom';
import { createRunner, type Run } from '../../shared/runner';
import {
    positionEvent,
    statusEvent,
    type PositionSource,
    type SourceEvent,
} from '../../suivi/ports/PositionSource';
import { Coordonnee } from '../domain/Coordonnee';
import type { PointId } from '../domain/ids';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import type { TrajetRepository, TrajetSummary } from '../ports/TrajetRepository';
import { PointMarkerElement } from './PointMarker';
import { createTrajetEditorScreen, type TrajetEditorDependencies } from './TrajetEditorScreen';
import { SchemaPageElement } from '../../shared/SchemaPage';
import { ImageFrameElement } from './ImageFrame';

/** jsdom ne connaît pas `PointerEvent` : un `MouseEvent` qui porte son identifiant suffit. */
class FauxPointerEvent extends MouseEvent {
    readonly pointerId = 1;

    constructor(type: string, clientY: number) {
        super(type, { clientY, bubbles: true });
    }
}

/**
 * Dépôt en mémoire qui rend à chaque lecture un agrégat **neuf**, reconstruit
 * depuis ce qui est stocké : c'est ainsi qu'on distingue ce que l'écran a en
 * mémoire de ce qui est réellement enregistré.
 */
class FakeTrajetRepository implements TrajetRepository {
    private refuseraLaProchaineEcriture = false;
    private lectureSuspendue = false;
    private pending: ((trajet: Trajet | null) => void) | null = null;

    constructor(private stocke: (() => Trajet) | null) {}

    viderLeDepot(): void {
        this.stocke = null;
    }

    refuserLaProchaineEcriture(): void {
        this.refuseraLaProchaineEcriture = true;
    }

    suspendreLaLecture(): void {
        this.lectureSuspendue = true;
    }

    terminerLaLecture(): void {
        const resolve = this.pending;
        this.lectureSuspendue = false;
        this.pending = null;
        resolve?.(this.stocke === null ? null : this.stocke());
    }

    load(): Promise<Trajet | null> {
        if (this.lectureSuspendue) {
            return new Promise((resolve) => {
                this.pending = resolve;
            });
        }
        return Promise.resolve(this.stocke === null ? null : this.stocke());
    }

    save(): Promise<void> {
        if (this.refuseraLaProchaineEcriture) {
            this.refuseraLaProchaineEcriture = false;
            return Promise.reject(new Error('Stockage plein.'));
        }
        return Promise.resolve();
    }

    listSummaries(): Promise<TrajetSummary[]> {
        return Promise.resolve([]);
    }

    delete(): Promise<void> {
        return Promise.resolve();
    }
}

/** Carte des points observable par son état : montée ou non, et ce qu'elle affiche. */
class FakeCarteDesPoints implements CarteDesPoints {
    private container: HTMLElement | null = null;
    private displayed: readonly DisplayedPoint[] = [];
    private onShow: ((id: PointId) => void) | null = null;
    private remesures = 0;
    private readonly centres: Coordonnee[] = [];
    /** Journal ordonné des gestes demandés à la carte : remesure et centrage y écrivent chacun leur mot. */
    private readonly gestes: string[] = [];
    private positionSubscription: Subscription | null = null;
    private position: DisplayedPosition | null = null;

    mount(container: HTMLElement): void {
        this.container = container;
    }

    unmount(): void {
        this.container = null;
        this.displayed = [];
        this.positionSubscription?.unsubscribe();
        this.positionSubscription = null;
    }

    show(points: readonly DisplayedPoint[], _onMove: unknown, onShow: (id: PointId) => void): void {
        this.displayed = points;
        this.onShow = onShow;
    }

    showPosition(position$: Observable<DisplayedPosition>): void {
        this.positionSubscription?.unsubscribe();
        this.positionSubscription = position$.subscribe((position) => {
            this.position = position;
        });
    }

    /** La dernière position que l'écran lui a donnée à montrer. */
    displayedPosition(): DisplayedPosition | null {
        return this.position;
    }

    resized(): void {
        this.remesures++;
        this.gestes.push('remesure');
    }

    centerOn(coordonnee: Coordonnee): void {
        this.centres.push(coordonnee);
        this.gestes.push('centrage');
    }

    /** Rejoue le clic de l'utilisateur sur le marqueur d'un point de la carte. */
    designerLePoint(number: number): void {
        const vise = this.displayed.find((point) => point.number === number);
        if (vise === undefined) {
            throw new Error(`Aucun point ${String(number)} sur la carte.`);
        }
        this.onShow?.(vise.id);
    }

    remesuresDemandees(): number {
        return this.remesures;
    }

    /** Les coordonnées sur lesquelles la carte a été calée, dans l'ordre. */
    centrages(): Coordonnee[] {
        return this.centres;
    }

    /**
     * Le journal ordonné des gestes que l'écran a demandés à la carte
     * (`'remesure'`, `'centrage'`) : contrairement à deux compteurs séparés, il
     * met l'ordre lui-même à l'épreuve — permuter les deux lignes de
     * `showPointOnCarte` change cette séquence, sans changer `remesuresDemandees`
     * ni `centrages`.
     */
    gestesDeLaCarte(): string[] {
        return this.gestes;
    }

    chooseCoordonnee(): Promise<Coordonnee | null> {
        return Promise.resolve(null);
    }

    cancelChoice(): void {
        // Rien à abandonner : aucun choix n'est armé dans ces tests.
    }

    isMounted(): boolean {
        return this.container !== null;
    }

    numerosAffiches(): number[] {
        return this.displayed.map((point) => point.number);
    }
}

/** Carte plein écran qui n'ouvre jamais rien. */
const carteMuette: CoordonneeSelector = {
    choose: () => Promise.resolve(null),
};

/**
 * Source de position observable par son état : combien de sessions elle a
 * ouvertes, et combien sont encore ouvertes. C'est le même procédé que
 * `heldResources()` de la suite de contrat — aucun espion n'est requis pour
 * voir qu'un flux froid a été souscrit.
 */
class FakePositionSource implements PositionSource {
    private ouvertes = 0;
    private total = 0;
    private readonly emissions = new Subject<SourceEvent>();

    readonly events$: Observable<SourceEvent> = defer(() => {
        this.ouvertes++;
        this.total++;
        return this.emissions.pipe(
            startWith(statusEvent({ kind: 'attente' })),
            finalize(() => {
                this.ouvertes--;
            }),
        );
    });

    emettre(event: SourceEvent): void {
        this.emissions.next(event);
    }

    sessionsOuvertes(): number {
        return this.ouvertes;
    }

    sessionsEnTout(): number {
        return this.total;
    }
}

/** Un trajet de trois pages et un point, dans l'ordre du voyage p1, p2, p3. */
function trajetDeTroisPages(): Trajet {
    const trajet = Trajet.create(NomDeTrajet.create('Paris → Bordeaux'));
    const premiere = trajet.addImage(page('p1.png'));
    trajet.addImage(page('p2.png'));
    trajet.addImage(page('p3.png'));
    trajet.addPoint({
        imageId: premiere,
        fraction: FractionVerticale.create(0.5),
        coordonnee: Coordonnee.create(44.826, -0.556),
    });
    return trajet;
}

/**
 * Le même trajet, avec un second point sur la **dernière** page du voyage — celle
 * qui s'affiche tout en haut de la pile. Deux points sur deux pages : c'est ce
 * qu'il faut pour prouver qu'on amène le bon repère à l'écran.
 */
function trajetDeDeuxPoints(): Trajet {
    const trajet = trajetDeTroisPages();
    const derniere = requireElementAt(trajet.images, 2);
    trajet.addPoint({
        imageId: derniere.id,
        fraction: FractionVerticale.create(0.25),
        coordonnee: Coordonnee.create(48.8566, 2.3522),
    });
    return trajet;
}

function page(nom: string): { nom: string; blob: Blob; largeur: number; hauteur: number } {
    return { nom, blob: new Blob([nom]), largeur: 800, hauteur: 1200 };
}

let repository: FakeTrajetRepository;
let carteDesPoints: FakeCarteDesPoints;
let positionSource: FakePositionSource;
let echecs: string[];
let run: Run;
let retours: number;
let suivis: number;
let urlsCreees: string[];
let urlsLiberees: string[];
let blobsParUrl: Map<string, Blob>;
let telechargements: { nom: string; url: string }[];
let montres: Element[];

beforeEach(async () => {
    Element.prototype.setPointerCapture = function setPointerCapture() {
        // jsdom ne l'implémente pas ; le geste n'en dépend pas pour être testé.
    };
    // Vider la scène **avant** de remettre les compteurs à zéro : les pages du
    // test précédent libèrent leurs URL à la microtâche suivant leur
    // détachement, et compteraient sinon dans le test qui commence.
    document.body.replaceChildren();
    await laisserLesPromessesSAchever();
    // jsdom n'a pas d'URL d'objet : on en pose une à la main, et le test lit
    // ainsi exactement ce que l'écran fait décoder — ou ne fait pas redécoder.
    // Le blob est gardé de côté : c'est ainsi que l'export se lit, sans espion.
    urlsCreees = [];
    urlsLiberees = [];
    blobsParUrl = new Map();
    telechargements = [];
    URL.createObjectURL = (objet: Blob | MediaSource) => {
        if (!(objet instanceof Blob)) {
            throw new Error("Ce test n'attend que des Blob.");
        }
        const url = `blob:page-${String(urlsCreees.length + 1)}`;
        urlsCreees.push(url);
        blobsParUrl.set(url, objet);
        return url;
    };
    URL.revokeObjectURL = (url: string) => {
        urlsLiberees.push(url);
    };
    // jsdom ne télécharge rien : l'ancre relève ce qu'elle aurait enregistré.
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        telechargements.push({ nom: this.download, url: this.getAttribute('href') ?? '' });
    };
    // jsdom ne défile pas non plus : l'élément relève ce qu'on lui a demandé de
    // montrer. On assère donc sur la valeur produite — le repère visé —, jamais
    // sur un appel reçu.
    montres = [];
    Element.prototype.scrollIntoView = function (this: Element) {
        montres.push(this);
    };
    repository = new FakeTrajetRepository(trajetDeTroisPages);
    carteDesPoints = new FakeCarteDesPoints();
    positionSource = new FakePositionSource();
    echecs = [];
    retours = 0;
    suivis = 0;
    run = createRunner((message) => echecs.push(message));
});

function dependances(): TrajetEditorDependencies {
    return {
        repository,
        coordonneeSelector: carteMuette,
        carteDesPoints,
        positionSource,
        run,
        trajetId: Trajet.create(NomDeTrajet.create('peu importe')).id,
        onBack: () => {
            retours++;
        },
        onSuivi: () => {
            suivis++;
        },
    };
}

/** Attache l'écran et laisse le chargement du trajet s'achever. */
async function attacherLEcran(): Promise<HTMLElement> {
    const element = createTrajetEditorScreen(dependances());
    document.body.append(element);
    await laisserLesPromessesSAchever();
    return element;
}

function laisserLesPromessesSAchever(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

/** Les noms des pages, de haut en bas — l'ordre de lecture du document. */
function pagesAffichees(element: HTMLElement): string[] {
    return queryAll('.image-name', HTMLSpanElement, element).map((nom) => nom.textContent);
}

function monter(element: HTMLElement, nomDeLaPage: string): void {
    cliquerLAction(element, `Monter ${nomDeLaPage}`);
}

function supprimer(element: HTMLElement, nomDeLaPage: string): void {
    cliquerLAction(element, `Supprimer ${nomDeLaPage}`);
}

function cliquerLaBascule(element: HTMLElement): void {
    query('#carte-button', HTMLButtonElement, element).click();
}

/** Clique la pastille numérotée d'un repère : le geste « emmène-moi à la carte ». */
function cliquerLaPastille(element: HTMLElement, numero: number): void {
    cliquerLAction(element, `Voir le point ${String(numero)} sur la carte`);
}

/**
 * Rejoue un glisser de pastille dans l'écran monté. jsdom ne mesure rien : le
 * cadre de la page est posé à la main, sinon la fraction ne peut pas se calculer.
 */
function glisserLaPastille(element: HTMLElement, numero: number, de: number, vers: number): void {
    for (const zone of queryAll('.image-area', HTMLDivElement, element)) {
        zone.getBoundingClientRect = () => new DOMRect(0, 0, 800, 1000);
    }
    const pastille = queryAll('point-marker .point-number', HTMLButtonElement, element).find(
        (candidate) => candidate.textContent === String(numero),
    );
    if (pastille === undefined) {
        throw new Error(`Aucune pastille ${String(numero)} dans l'écran.`);
    }
    pastille.dispatchEvent(new FauxPointerEvent('pointerdown', de));
    query('#images-stack', HTMLDivElement, element).dispatchEvent(
        new FauxPointerEvent('pointermove', vers),
    );
    query('#images-stack', HTMLDivElement, element).dispatchEvent(
        new FauxPointerEvent('pointerup', vers),
    );
}

function exporter(element: HTMLElement): void {
    cliquerLAction(element, 'Exporter');
}

function cliquerLAction(element: HTMLElement, intitule: string): void {
    const bouton = queryAll('button', HTMLButtonElement, element).find(
        (candidat) => candidat.getAttribute('aria-label') === intitule,
    );
    if (bouton === undefined) {
        throw new Error(`Aucun bouton « ${intitule} » dans l'écran.`);
    }
    bouton.click();
}

/** Les repères posés sur les pages, dans l'ordre de lecture du document. */
function marqueurs(element: HTMLElement): PointMarkerElement[] {
    return queryAll('point-marker', PointMarkerElement, element);
}

/** Ce qu'on a demandé au navigateur de montrer, dit par ce qui est peint dessus. */
function elementsMontres(): string[] {
    return montres.map(
        (montre) =>
            `${montre.localName} ${query('.point-number', HTMLButtonElement, montre).textContent}`,
    );
}

/** Le fichier que le navigateur s'est vu proposer : son nom et son contenu. */
async function fichierPropose(): Promise<{ nom: string; contenu: unknown }> {
    const telechargement = requireElementAt(telechargements, 0);
    const blob = blobsParUrl.get(telechargement.url);
    if (blob === undefined) {
        throw new Error(`Aucun blob derrière « ${telechargement.url} ».`);
    }
    return { nom: telechargement.nom, contenu: JSON.parse(await blob.text()) };
}

describe('trajet-editor-screen', () => {
    describe("Étant donné un trajet, quand j'attache l'écran", () => {
        it('alors il affiche son nom, ses pages en ordre de lecture et ses points', async () => {
            const element = await attacherLEcran();

            expect(element.querySelector('#trajet-title')?.textContent).toBe('Paris → Bordeaux');
            // Le document se lit de bas en haut : la dernière page du voyage
            // s'affiche en haut de la pile.
            expect(pagesAffichees(element)).toEqual(['p3.png', 'p2.png', 'p1.png']);
            expect(marqueurs(element)).toHaveLength(1);
        });

        it("alors chaque cadre dit l'identifiant de son image, celui-là même que porte sa page", async () => {
            const element = await attacherLEcran();

            // Trois cadres, trois identifiants distincts : l'assertion ne peut
            // pas passer par un accesseur qui rendrait toujours la même chose.
            const cadres = queryAll('image-frame', ImageFrameElement, element);
            const pages = queryAll('schema-page', SchemaPageElement, element);
            expect(cadres.map((cadre) => cadre.imageId)).toEqual(pages.map((page) => page.pageId));
            expect(new Set(cadres.map((cadre) => cadre.imageId)).size).toBe(3);
        });

        it('alors chaque repère porte la coordonnée de son point, sans jamais la montrer', async () => {
            const element = await attacherLEcran();

            // Elle reste là où le point est posé — c'est ce que le repère marque
            // —, mais elle ne s'affiche plus : ni en clair, ni au survol. Une
            // suite de décimales n'apprend rien à qui la lit.
            expect(marqueurs(element).map((marqueur) => marqueur.dataset['coordonnee'])).toEqual([
                '44.826,-0.556',
            ]);
            expect(marqueurs(element).map((marqueur) => marqueur.title)).toEqual(['']);
            // « En clair » : aucun texte affiché par l'écran ne porte la
            // coordonnée — pas seulement son infobulle, que l'assertion
            // précédente couvre déjà. Les deux moitiés du nombre plutôt que la
            // phrase jointe : ça débusque aussi bien un format qui les sépare.
            expect(element.textContent).not.toContain('44.826');
            expect(element.textContent).not.toContain('-0.556');
        });

        it('alors les pages portent leur numéro, compté depuis le haut de la pile', async () => {
            const element = await attacherLEcran();

            expect(
                queryAll('.page-number', HTMLSpanElement, element).map(
                    (pastille) => pastille.textContent,
                ),
            ).toEqual(['1', '2', '3']);
        });

        it("alors la carte est montée sur le conteneur que l'écran vient de créer", async () => {
            await attacherLEcran();

            expect(carteDesPoints.isMounted()).toBe(true);
            expect(carteDesPoints.numerosAffiches()).toEqual([1]);
        });
    });

    describe('Étant donné un écran attaché, quand je le détache', () => {
        it('alors la carte est démontée avec lui', async () => {
            const element = await attacherLEcran();

            element.remove();

            // Elle ne peut pas survivre à son conteneur, qui part avec l'écran.
            expect(carteDesPoints.isMounted()).toBe(false);
        });
    });

    describe("Étant donné un dépôt qui refuse d'écrire, quand je déplace une page", () => {
        it("alors l'échec est signalé à l'utilisateur", async () => {
            const element = await attacherLEcran();

            repository.refuserLaProchaineEcriture();
            monter(element, 'p1.png');
            await laisserLesPromessesSAchever();

            expect(echecs).toEqual(['Échec de le déplacement de la page : Stockage plein.']);
        });

        it("alors l'écran repart de ce qui est réellement stocké", async () => {
            const element = await attacherLEcran();

            repository.refuserLaProchaineEcriture();
            monter(element, 'p1.png');
            await laisserLesPromessesSAchever();
            // Le même geste, cette fois accepté : s'il part de la mémoire
            // modifiée par l'échec précédent, la page aura avancé deux fois.
            monter(element, 'p1.png');
            await laisserLesPromessesSAchever();

            expect(pagesAffichees(element)).toEqual(['p3.png', 'p1.png', 'p2.png']);
        });
    });

    describe("Étant donné trois pages affichées, quand l'écran rend à nouveau", () => {
        it("alors aucune page inchangée n'est redécodée", async () => {
            const element = await attacherLEcran();
            expect(urlsCreees).toHaveLength(3);

            // Un déplacement réordonne la pile : les cadres et les repères sont
            // refaits, les images non.
            monter(element, 'p1.png');
            await laisserLesPromessesSAchever();

            expect(urlsCreees).toHaveLength(3);
            expect(urlsLiberees).toEqual([]);
            expect(pagesAffichees(element)).toEqual(['p3.png', 'p1.png', 'p2.png']);
        });

        it('alors supprimer une page libère la sienne, et elle seule', async () => {
            const element = await attacherLEcran();
            window.confirm = () => true;

            supprimer(element, 'p3.png');
            await laisserLesPromessesSAchever();

            // C'est tout l'enjeu du projet : une page décodée pèse une trentaine
            // de mégaoctets, et rien ne la libère si son URL survit. Les deux
            // autres, elles, ne doivent ni être libérées ni être refaites.
            expect(urlsLiberees).toHaveLength(1);
            expect(urlsCreees).toHaveLength(3);
            expect(pagesAffichees(element)).toEqual(['p2.png', 'p1.png']);
        });

        it('alors les pages gardent leurs éléments, donc leur décodage', async () => {
            const element = await attacherLEcran();
            const avant = [...element.querySelectorAll('schema-page')];

            monter(element, 'p1.png');
            await laisserLesPromessesSAchever();

            const apres = [...element.querySelectorAll('schema-page')];
            expect(new Set(apres)).toEqual(new Set(avant));
        });
    });

    describe("Étant donné un trajet supprimé entre-temps, quand j'ouvre l'écran", () => {
        it("alors il repart en arrière plutôt que d'afficher un écran vide", async () => {
            repository.viderLeDepot();

            await attacherLEcran();

            expect(retours).toBe(1);
        });
    });

    describe("Étant donné un chargement encore en cours, quand je détache l'écran", () => {
        it("alors rien ne s'affiche et la carte est rendue", async () => {
            repository.suspendreLaLecture();
            const element = createTrajetEditorScreen(dependances());
            document.body.append(element);

            element.remove();
            repository.terminerLaLecture();
            await laisserLesPromessesSAchever();

            expect(pagesAffichees(element)).toEqual([]);
            expect(carteDesPoints.isMounted()).toBe(false);
            expect(suivis).toBe(0);
        });
    });

    describe('Étant donné un trajet ouvert, quand je clique sur « Exporter »', () => {
        it('alors le fichier proposé au téléchargement est le trajet affiché', async () => {
            const element = await attacherLEcran();

            exporter(element);
            await laisserLesPromessesSAchever();

            // L'écran exporte l'agrégat qu'il a en mémoire, sans repasser par
            // le dépôt : c'est ce qu'il montre, et c'est ce qui est stocké.
            const { nom, contenu } = await fichierPropose();
            expect(nom).toBe('Paris → Bordeaux.json');
            expect(contenu).toMatchObject({
                trajet: {
                    nom: 'Paris → Bordeaux',
                    images: [{ nom: 'p1.png' }, { nom: 'p2.png' }, { nom: 'p3.png' }],
                    points: [{ image: 0 }],
                },
            });
            expect(echecs).toEqual([]);
        });
    });

    describe('Étant donné un chargement encore en cours, quand je clique sur « Exporter »', () => {
        it("alors rien n'est proposé au téléchargement, et rien n'est signalé", async () => {
            repository.suspendreLaLecture();
            const element = createTrajetEditorScreen(dependances());
            document.body.append(element);

            exporter(element);
            await laisserLesPromessesSAchever();

            // Sans la garde, l'export partirait sans trajet : l'utilisateur
            // récolterait un « Échec de l'export du trajet » pour un simple
            // clic trop tôt.
            expect(telechargements).toEqual([]);
            expect(echecs).toEqual([]);
        });
    });

    describe('Étant donné deux points sur deux pages différentes', () => {
        it("quand j'en désigne un sur la carte, alors c'est son repère qui est amené à l'écran", async () => {
            repository = new FakeTrajetRepository(trajetDeDeuxPoints);
            const element = await attacherLEcran();

            carteDesPoints.designerLePoint(2);

            // Le second point est sur la page du haut de la pile : c'est bien son
            // repère, et non celui du premier, qu'on est allé chercher.
            expect(elementsMontres()).toEqual(['point-marker 2']);
            expect(element.isConnected).toBe(true);
        });

        it("quand rien n'est désigné, alors rien ne défile", async () => {
            repository = new FakeTrajetRepository(trajetDeDeuxPoints);
            await attacherLEcran();

            expect(elementsMontres()).toEqual([]);
        });
    });

    describe("Étant donné deux points sur deux pages, quand je clique la pastille de l'un", () => {
        it('alors la carte se cale sur SA coordonnée, pas celle de son voisin', async () => {
            repository = new FakeTrajetRepository(trajetDeDeuxPoints);
            const element = await attacherLEcran();

            cliquerLaPastille(element, 2);

            // Le point 1 est à Bordeaux, le point 2 à Paris : c'est bien celui
            // qu'on a désigné que la carte est allée chercher.
            expect(
                carteDesPoints
                    .centrages()
                    .map((coordonnee) => [coordonnee.latitude, coordonnee.longitude]),
            ).toEqual([[48.8566, 2.3522]]);
        });

        it('alors la pastille de chaque repère annonce où elle mène', async () => {
            repository = new FakeTrajetRepository(trajetDeDeuxPoints);
            const element = await attacherLEcran();

            // Le document se lit de bas en haut : le point 2, posé sur la
            // dernière page du voyage, s'affiche en haut de la pile.
            expect(
                queryAll('point-marker .point-number', HTMLButtonElement, element).map(
                    (pastille) => [pastille.textContent, pastille.getAttribute('aria-label')],
                ),
            ).toEqual([
                ['2', 'Voir le point 2 sur la carte'],
                ['1', 'Voir le point 1 sur la carte'],
            ]);
        });
    });

    describe("Étant donné un petit écran où la carte n'est pas par-dessus le schéma", () => {
        it("quand je clique la pastille d'un point, alors la carte vient par-dessus le schéma", async () => {
            const element = await attacherLEcran();

            cliquerLaPastille(element, 1);

            expect(element.classList.contains('carte-ouverte')).toBe(true);
            // La remesure part avant le centrage : sans cet ordre, la carte se
            // calerait sur la taille de la vignette qu'elle vient de quitter.
            // Un journal unique et ordonné, plutôt que deux compteurs séparés,
            // est ce qui met vraiment l'ordre à l'épreuve.
            expect(carteDesPoints.gestesDeLaCarte()).toEqual(['remesure', 'centrage']);
        });

        it('quand la carte est déjà ouverte, alors elle y reste et se contente de se caler', async () => {
            const element = await attacherLEcran();
            cliquerLaBascule(element);

            cliquerLaPastille(element, 1);

            expect(element.classList.contains('carte-ouverte')).toBe(true);
            // Une seule remesure : celle de la bascule. Le geste n'en demande
            // pas une seconde pour un conteneur qui n'a pas changé de taille.
            expect(carteDesPoints.remesuresDemandees()).toBe(1);
            expect(carteDesPoints.centrages()).toHaveLength(1);
        });

        it("quand un placement est en cours, alors la pastille n'emmène nulle part", async () => {
            const element = await attacherLEcran();
            // La feuille de style rend la pastille transparente aux clics tant
            // qu'on vise une hauteur ; le clavier, lui, ne connaît pas
            // `pointer-events`. Les deux doivent dire la même chose.
            cliquerLAction(element, 'Ajouter un point');

            cliquerLaPastille(element, 1);

            expect(carteDesPoints.centrages()).toEqual([]);
            expect(element.classList.contains('carte-ouverte')).toBe(false);
        });
    });

    describe('Étant donné un petit écran, quand je bascule sur la carte', () => {
        it('alors elle passe par-dessus le schéma, et se remesure', async () => {
            const element = await attacherLEcran();

            cliquerLaBascule(element);

            expect(element.classList.contains('carte-ouverte')).toBe(true);
            // Le conteneur vient de changer de taille sans que la fenêtre bouge :
            // sans remesure, la carte garderait l'échelle de sa vignette.
            expect(carteDesPoints.remesuresDemandees()).toBe(1);
            expect(query('#carte-button', HTMLButtonElement, element).textContent).toBe(
                '🖼️ Schéma',
            );
        });

        it("alors désigner un point la referme, pour laisser voir ce qu'on demande", async () => {
            repository = new FakeTrajetRepository(trajetDeDeuxPoints);
            const element = await attacherLEcran();
            cliquerLaBascule(element);

            carteDesPoints.designerLePoint(2);

            expect(element.classList.contains('carte-ouverte')).toBe(false);
            expect(elementsMontres()).toEqual(['point-marker 2']);
        });
    });

    describe('Étant donné un point posé à mi-hauteur de sa page', () => {
        it("quand je glisse sa pastille au quart, alors c'est là qu'il est enregistré", async () => {
            const element = await attacherLEcran();

            glisserLaPastille(element, 1, 500, 250);
            await laisserLesPromessesSAchever();

            // Le rendu suit l'enregistrement : la hauteur relue est celle que
            // l'agrégat a retenue, pas celle que le geste avait peinte.
            expect(marqueurs(element).map((marqueur) => marqueur.style.top)).toEqual(['25%']);
            expect(echecs).toEqual([]);
        });

        it("quand je glisse, alors la carte n'est pas convoquée par le clic qui suit", async () => {
            const element = await attacherLEcran();

            glisserLaPastille(element, 1, 500, 250);
            query('point-marker .point-number', HTMLButtonElement, element).dispatchEvent(
                new MouseEvent('click', { bubbles: true }),
            );
            await laisserLesPromessesSAchever();

            expect(carteDesPoints.centrages()).toEqual([]);
        });
    });

    describe("Étant donné la barre d'actions de l'éditeur", () => {
        it('alors chaque bouton porte un nom accessible, que le masquage de son libellé ne peut pas lui retirer', async () => {
            const element = await attacherLEcran();

            // Sous 560 px la feuille de style masque les libellés visibles : le
            // nom accessible ne vit plus que dans `aria-label`. Sans lui, le
            // bouton s'annonce « 🖼️ » — et les parcours e2e joués sur iPhone et
            // Pixel, tous deux sous le seuil, ne le trouvent plus.
            const boutons = queryAll(
                '.action-bar button, #editor-position-button',
                HTMLButtonElement,
                element,
            );
            expect(boutons.map((bouton) => bouton.getAttribute('aria-label'))).toEqual([
                'Ajouter des images',
                'Ajouter un point',
                'Exporter',
                'Ma position',
            ]);
        });
    });

    describe("Étant donné l'éditeur ouvert", () => {
        it('alors une session de position est ouverte, et une seule', async () => {
            await attacherLEcran();

            // La carte de l'éditeur est toujours en page : l'abonnement vit le
            // temps de l'écran. Le compte en tout est ce qui attrape la double
            // souscription d'un flux froid — la carte et la barre l'écoutent
            // toutes deux, et sans partage chacune ouvrirait sa session.
            expect(positionSource.sessionsOuvertes()).toBe(1);
            expect(positionSource.sessionsEnTout()).toBe(1);
        });
    });

    describe("Étant donné l'éditeur qu'on quitte", () => {
        it("alors plus aucune session de position n'est ouverte", async () => {
            const element = await attacherLEcran();

            element.remove();
            await laisserLesPromessesSAchever();

            expect(positionSource.sessionsOuvertes()).toBe(0);
        });
    });

    describe('Étant donné une position reçue', () => {
        it('alors la carte la montre, et la barre la connaît', async () => {
            const element = await attacherLEcran();

            positionSource.emettre(positionEvent(Coordonnee.create(44.83, -0.57)));

            expect(carteDesPoints.displayedPosition()).toEqual({
                kind: 'connue',
                coordonnee: Coordonnee.create(44.83, -0.57),
            });
            // La barre l'a reçue aussi : sa phrase se vide, et son bouton s'anime.
            expect(query('#editor-position-status', HTMLSpanElement, element).textContent).toBe('');
            expect(query('#editor-position-button', HTMLButtonElement, element).disabled).toBe(
                false,
            );
        });
    });

    describe('Étant donné un fix trop grossier pour caler la page', () => {
        it("alors la carte le montre quand même, avec l'incertitude mesurée", async () => {
            await attacherLEcran();

            positionSource.emettre(
                statusEvent({
                    kind: 'imprecise',
                    imprecisionMetres: 8_000,
                    position: Coordonnee.create(46.6, 2.4),
                }),
            );

            // Une carte ne cale aucune page : la coordonnée d'un fix à ± 8 km ne
            // sert peut-être pas au suivi, elle situe très bien sur une carte.
            expect(carteDesPoints.displayedPosition()).toEqual({
                kind: 'approximative',
                coordonnee: Coordonnee.create(46.6, 2.4),
                imprecisionMetres: 8_000,
                message: 'Position approximative (± 8 km) — trop imprécise pour caler la page.',
            });
        });
    });

    describe('Étant donné une position refusée', () => {
        it("alors l'écran dit pourquoi aucun marqueur n'apparaît", async () => {
            const element = await attacherLEcran();

            positionSource.emettre(statusEvent({ kind: 'permission-refusee' }));

            expect(query('#editor-position-status', HTMLSpanElement, element).textContent).toBe(
                'Accès à la position refusé — autorisez la localisation pour ce site puis revenez.',
            );
        });
    });

    describe('Étant donné une position connue, quand je demande « Ma position »', () => {
        it('alors la carte vient dessus', async () => {
            const element = await attacherLEcran();
            positionSource.emettre(positionEvent(Coordonnee.create(44.83, -0.57)));

            query('#editor-position-button', HTMLButtonElement, element).click();

            expect(
                carteDesPoints
                    .centrages()
                    .map((coordonnee) => [coordonnee.latitude, coordonnee.longitude])
                    .at(-1),
            ).toEqual([44.83, -0.57]);
        });
    });

    describe("Étant donné qu'aucune position n'est encore connue", () => {
        it('alors le bouton « Ma position » reste inerte', async () => {
            const element = await attacherLEcran();

            expect(query('#editor-position-button', HTMLButtonElement, element).disabled).toBe(
                true,
            );
        });
    });
});
