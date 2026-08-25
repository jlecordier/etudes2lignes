// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestScheduler } from 'rxjs/testing';
import { query } from '../../shared/dom';
import { createSchemaPage, type ObjectUrls } from '../../shared/SchemaPage';
import { newImageId, type ImageId } from '../domain/ids';
import { addsOnStack } from './addPointOnStack';
import { ImageFrameElement } from './ImageFrame';
import type { PageAimIntent } from './intents';

/** Ce qui distingue un pointeur d'un autre, quand le scénario a besoin de le dire. */
interface OptionsPointeur {
    readonly pointerId?: number;
    readonly pointerType?: string;
    readonly clientX?: number;
}

/**
 * jsdom ne connaît pas `PointerEvent` : on le reconstruit au strict nécessaire,
 * un `MouseEvent` qui porte en plus l'identifiant et le type du pointeur. Les
 * deux comptent ici plus qu'ailleurs — le type sépare la route du doigt de celle
 * de la souris, l'identifiant sépare le doigt qui tient le geste de ceux qui
 * traînent ailleurs sur le verre.
 */
class FauxPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(type: string, clientY: number, options: OptionsPointeur = {}) {
        const { pointerId = 1, pointerType = 'touch', clientX = 0 } = options;
        super(type, { clientX, clientY, bubbles: true, cancelable: true });
        this.pointerId = pointerId;
        this.pointerType = pointerType;
    }
}

interface Scene {
    stack: HTMLElement;
    /** L'hôte `<schema-page>` de la page du haut : « l'image nue ». */
    page: HTMLElement;
    /** Celui de la page du bas, pour les gestes qui enjambent deux pages. */
    pageDuBas: HTMLElement;
    /** La barre de la page du haut : hors de toute `.image-area`. */
    barre: HTMLElement;
    hautId: ImageId;
    basId: ImageId;
    visees: PageAimIntent[];
    /**
     * Ôte sa hauteur à la page du haut. C'est ce que jsdom rend pour toute zone
     * qu'on ne mesure pas à la main — et **rien ne dit qu'un vrai navigateur y
     * arrive** : aucun repli ne touche la pile, et `SchemaPage` pose les
     * dimensions de l'image avant tout décodage, garanties entières positives
     * par l'agrégat et revalidées à la lecture.
     *
     * Le garde se justifie donc autrement, et ce n'est pas moins : par la parité
     * avec `areaUnderFinger`, qui applique la même règle et fonde la sienne sur
     * jsdom, et par la disproportion entre deux lignes de garde et la vie
     * entière des gestes d'un écran — les quatre flux étant fusionnés, une seule
     * levée les emporte tous.
     */
    aplatirLaPageDuHaut: () => void;
    /**
     * Ce que fait l'écran qui se détache : son `takeUntil(parti$)` défait cet
     * abonnement. Rien de ce que le geste avait montré ne doit rester derrière.
     */
    detacher: () => void;
}

/**
 * Des URL d'objet inertes. Depuis que la production importe `SchemaPage`, la
 * classe est définie pendant ces tests : un hôte `<schema-page>` sans
 * configuration jetterait en s'attachant, et sa fabrique est la seule porte. Rien
 * ici ne regarde l'image, seulement la cible que le doigt touche.
 */
const urlsInertes: ObjectUrls = {
    create: () => 'blob:page-de-test',
    revoke: () => {
        // Rien à libérer : ce que `create` rend n'est pas une vraie URL d'objet.
    },
};

/** Un cadre mesuré, avec sa barre au-dessus et sa page dedans. */
function frame(imageId: ImageId, top: number, hauteur: number): ImageFrameElement {
    const element = new ImageFrameElement();
    element.imageId = imageId;
    const barre = document.createElement('div');
    barre.className = 'image-bar';
    const area = document.createElement('div');
    area.className = 'image-area';
    area.getBoundingClientRect = () => new DOMRect(0, top, 800, hauteur);
    const page = createSchemaPage(
        { id: imageId, nom: `${imageId}.jpg`, blob: new Blob(['page']), largeur: 800, hauteur },
        urlsInertes,
    );
    area.append(page);
    element.append(barre, area);
    return element;
}

/** Les scènes ouvertes par le test en cours, à défaire quand il finit. */
const scenesOuvertes: Scene[] = [];

function scene(): Scene {
    const stack = document.createElement('div');
    const hautId = newImageId();
    const basId = newImageId();
    const haut = frame(hautId, 0, 1000);
    // Deux pages, et 100 px d'interstice délibéré entre elles : c'est là qu'un
    // doigt n'est sur aucune page, ce que l'ajustement doit savoir traverser.
    const bas = frame(basId, 1100, 1000);
    stack.append(haut, bas);
    document.body.replaceChildren(stack);

    const visees: PageAimIntent[] = [];
    const abonnement = addsOnStack(stack).subscribe((visee) => {
        visees.push(visee);
    });

    const laScene: Scene = {
        stack,
        page: query('schema-page', HTMLElement, haut),
        pageDuBas: query('schema-page', HTMLElement, bas),
        barre: query('.image-bar', HTMLDivElement, haut),
        hautId,
        basId,
        visees,
        aplatirLaPageDuHaut: () => {
            query('.image-area', HTMLDivElement, haut).getBoundingClientRect = () =>
                new DOMRect(0, 0, 800, 0);
        },
        detacher: () => {
            abonnement.unsubscribe();
        },
    };
    scenesOuvertes.push(laScene);
    return laScene;
}

/** Un geste du doigt, posé à un instant du temps virtuel. */
interface Geste {
    readonly at: number;
    readonly fait: () => void;
}

/**
 * Joue un scénario en temps virtuel.
 *
 * `TestScheduler.run` détourne `AsyncScheduler.delegate` le temps de son rappel :
 * le `timer` que la production crée **sans ordonnanceur** devient donc virtuel
 * sans qu'elle en sache rien, et `addsOnStack` n'a aucune horloge à recevoir
 * (ADR 0009 — l'horloge injectée disparaît, le `TestScheduler` pilote).
 *
 * Chaque geste porte son instant, et c'est ce qui dit « avant les 500 ms » ou
 * « après » : l'ordre des lignes ne décide plus de rien.
 */
function joue(gestes: readonly Geste[]): void {
    const scheduler = new TestScheduler((actual, expected) => {
        expect(actual).toEqual(expected);
    });
    scheduler.run(({ flush }) => {
        for (const { at, fait } of gestes) {
            scheduler.schedule(fait, at);
        }
        flush();
    });
}

/** Un pointeur se pose sur une cible. */
function pose(cible: HTMLElement, clientY: number, options?: OptionsPointeur): () => void {
    return () => {
        cible.dispatchEvent(new FauxPointerEvent('pointerdown', clientY, options));
    };
}

/**
 * Un pointeur glisse, se lève, ou se fait reprendre par le navigateur. Les trois
 * partent de `documentElement`, comme dans la vraie vie : un doigt ne se lève pas
 * forcément là où il s'est posé.
 */
function bouge(clientY: number, options?: OptionsPointeur): () => void {
    return surLeDocument('pointermove', clientY, options);
}

function leve(clientY: number, options?: OptionsPointeur): () => void {
    return surLeDocument('pointerup', clientY, options);
}

function reprend(clientY: number, options?: OptionsPointeur): () => void {
    return surLeDocument('pointercancel', clientY, options);
}

function surLeDocument(type: string, clientY: number, options?: OptionsPointeur): () => void {
    return () => {
        document.documentElement.dispatchEvent(new FauxPointerEvent(type, clientY, options));
    };
}

/** La hauteur qu'affiche le fantôme, ou rien s'il n'y en a pas. */
function hauteurDuFantome(scene1: Scene): string | null {
    const fantome = scene1.stack.querySelector('.point-ghost');
    return fantome instanceof HTMLElement ? fantome.style.top : null;
}

/** L'image de la page où le fantôme se trouve, ou rien s'il n'est nulle part. */
function pageDuFantome(scene1: Scene): ImageId | null {
    const cadre = scene1.stack.querySelector('.point-ghost')?.closest('image-frame') ?? null;
    return cadre instanceof ImageFrameElement ? cadre.imageId : null;
}

/**
 * Un trait fantôme fabriqué hors de tout geste, pour interroger l'écouteur non
 * passif sans passer par un armement.
 */
function fantomeAlaMain(): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'point-ghost';
    return element;
}

/**
 * Un doigt qui glisse, vu par le tactile et non par le pointeur — c'est cet
 * événement-là que le navigateur consulte pour décider s'il défile. Rendu pour
 * qu'on puisse dire s'il a été retenu.
 */
function glisse(cible: HTMLElement): Event {
    const evenement = new Event('touchmove', { bubbles: true, cancelable: true });
    cible.dispatchEvent(evenement);
    return evenement;
}

function clicDroit(cible: HTMLElement, clientY: number): MouseEvent {
    const evenement = new MouseEvent('contextmenu', {
        clientY,
        bubbles: true,
        cancelable: true,
    });
    cible.dispatchEvent(evenement);
    return evenement;
}

/**
 * Un vibreur de pacotille, posé sur le `navigator` de jsdom qui n'en a pas.
 *
 * Écrit à la main comme tous les doubles de ce dépôt : ce qu'on regarde ensuite
 * est la **liste des motifs produits**, pas un appel qu'on aurait espionné.
 */
interface Vibreur {
    /** Les durées demandées, en millisecondes et dans l'ordre. */
    readonly motifs: number[];
}

function brancherLeVibreur(): Vibreur {
    const motifs: number[] = [];
    navigator.vibrate = (motif) => {
        // Un motif est une durée seule ou une suite de durées, et les deux
        // compilateurs de ce dépôt n'en donnent pas le même type (ADR 0004) : on
        // range donc les durées, ce qui est aussi ce que le test veut lire.
        motifs.push(...(typeof motif === 'number' ? [motif] : motif));
        return true;
    };
    return { motifs };
}

beforeEach(() => {
    document.body.replaceChildren();
});

afterEach(() => {
    // Sans ça, chaque test laisse derrière lui un abonnement vivant — et, pour
    // ceux qui posent un doigt hors du temps virtuel, une vraie minuterie de
    // 500 ms. C'est la règle que ce module impose désormais à la production :
    // se désabonner est ce qui termine un geste.
    for (const scene1 of scenesOuvertes) {
        scene1.detacher();
    }
    scenesOuvertes.length = 0;
    // Un vrai navigateur de bureau n'a pas de vibreur, et jsdom non plus : celui
    // qu'un test pose ne doit pas survivre au test qui l'a posé.
    Reflect.deleteProperty(navigator, 'vibrate');
});

describe("Poser un point d'un seul geste", () => {
    describe("Étant donné un clic droit sur l'image", () => {
        it('alors un point est visé à cette hauteur, sur cette page', () => {
            const scene1 = scene();

            clicDroit(scene1.page, 250);

            expect(scene1.visees).toHaveLength(1);
            expect(scene1.visees[0]?.imageId).toBe(scene1.hautId);
            expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.25, 6);
        });

        it('alors le menu natif est empêché', () => {
            const scene1 = scene();

            expect(clicDroit(scene1.page, 250).defaultPrevented).toBe(true);
        });
    });

    describe("Étant donné un clic droit sur la barre d'une page", () => {
        it("alors rien n'est visé, et le menu natif reste : on n'est pas sur l'image", () => {
            const scene1 = scene();

            const evenement = clicDroit(scene1.barre, 250);

            expect(scene1.visees).toEqual([]);
            expect(evenement.defaultPrevented).toBe(false);
        });
    });

    describe('Étant donné un clic droit sur une page sans hauteur', () => {
        it("alors rien n'est visé, et les gestes suivants vivent encore", () => {
            const scene1 = scene();
            scene1.aplatirLaPageDuHaut();

            clicDroit(scene1.page, 250);

            expect(scene1.visees).toEqual([]);
            // La seconde moitié est le vrai enjeu, et elle est neuve : les quatre
            // sources du module vivent dans un seul `merge`, donc une levée dans
            // ce `concatMap` les démonterait toutes — les deux routes de geste et
            // la retenue du défilement avec —, pour le reste de la vie de
            // l'écran. Et personne ne l'apprendrait : l'abonné n'a pas de
            // gestionnaire d'erreur, donc `run(…, « l'ajout du point »)` ne
            // signalerait rien.
            clicDroit(scene1.pageDuBas, 1350);

            expect(scene1.visees).toHaveLength(1);
            expect(scene1.visees[0]?.imageId).toBe(scene1.basId);
        });
    });

    describe('Étant donné un doigt encore posé sur la pile quand le contextmenu arrive', () => {
        it("alors le menu est empêché mais rien n'est visé : c'est l'appui long d'Android, et c'est notre geste qui le traite", () => {
            const scene1 = scene();
            pose(scene1.page, 250)();

            const evenement = clicDroit(scene1.page, 250);

            expect(evenement.defaultPrevented).toBe(true);
            expect(scene1.visees).toEqual([]);
        });

        it('alors le doigt que le navigateur reprend le rend aussi', () => {
            const scene1 = scene();
            pose(scene1.page, 250)();
            // Un doigt annulé ne se relève jamais : sans être oublié ici, il
            // étoufferait tous les clics droits suivants.
            reprend(250)();

            clicDroit(scene1.page, 250);

            expect(scene1.visees).toHaveLength(1);
        });

        it('alors le doigt relevé rend au clic droit son effet', () => {
            const scene1 = scene();
            pose(scene1.page, 250)();
            leve(250)();

            clicDroit(scene1.page, 250);

            expect(scene1.visees).toHaveLength(1);
        });
    });

    describe('Étant donné une souris posée sur la pile', () => {
        it('alors elle ne compte pas comme un doigt : le clic droit garde son effet', () => {
            const scene1 = scene();
            pose(scene1.page, 250, { pointerType: 'mouse' })();

            clicDroit(scene1.page, 250);

            expect(scene1.visees).toHaveLength(1);
        });
    });
});

describe('Étant donné un appui long maintenu puis relâché sans bouger', () => {
    it('alors un point est visé à la hauteur du doigt', () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            {
                // Armé, doigt encore posé : **rien** n'est émis. C'est
                // l'invariant de toute la tâche — à 500 ms, la carte des
                // coordonnées s'ouvrirait sous le doigt.
                at: 550,
                fait: () => {
                    expect(scene1.visees).toEqual([]);
                },
            },
            { at: 600, fait: leve(250) },
        ]);

        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.imageId).toBe(scene1.hautId);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.25, 6);
    });

    it("alors un fantôme est apparu à l'armement, puis retiré au relâchement", () => {
        const scene1 = scene();
        const vuALArmement: (string | null)[] = [];

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            {
                at: 550,
                fait: () => {
                    vuALArmement.push(hauteurDuFantome(scene1));
                },
            },
            { at: 600, fait: leve(250) },
        ]);

        expect(vuALArmement).toEqual(['25%']);
        expect(hauteurDuFantome(scene1)).toBeNull();
    });
});

describe("Étant donné un appui long qui atteint l'armement", () => {
    it("alors le téléphone vibre une fois, à l'armement : « vous pouvez bouger »", () => {
        const scene1 = scene();
        const vibreur = brancherLeVibreur();
        const comptes: number[] = [];
        const relever = (): void => {
            comptes.push(vibreur.motifs.length);
        };

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            // Avant les 500 ms rien n'est armé, donc rien n'a vibré.
            { at: 400, fait: relever },
            // Armé, et le doigt n'a encore rien bougé : le tic est déjà parti. Ce
            // relevé-ci est le seul qui situe l'instant, et c'est lui qui distingue
            // « à l'armement » de « au relâchement ».
            { at: 550, fait: relever },
            { at: 600, fait: bouge(600) },
            { at: 700, fait: bouge(700) },
            // **Deux** mouvements, et toujours un seul tic : un vibreur appelé
            // depuis le suivi en compterait autant que de mouvements, ce qu'un
            // relevé après un mouvement unique ne saurait pas voir.
            { at: 750, fait: relever },
            { at: 800, fait: leve(700) },
        ]);
        relever();

        // Une fois, et à l'armement : ni à chaque mouvement de l'ajustement, ni au
        // relâchement. Ça ne dit pas « c'est fait », ça dit « allez-y ».
        expect(comptes).toEqual([0, 1, 1, 1]);
        // Un tic, pas une alerte : l'ordre de grandeur du retour haptique d'un
        // appui long, pas celui d'une notification.
        expect(vibreur.motifs).toEqual([10]);
    });
});

describe("Étant donné un doigt qui se déplace après l'armement", () => {
    it('alors le fantôme le suit : la dérive est devenue la fonction du geste', () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            // 350 px, bien au-delà de `SLOP` : ce seuil ne garde plus que la
            // fenêtre d'**avant** l'armement.
            { at: 600, fait: bouge(600) },
        ]);

        // Le doigt est encore posé, donc le fantôme est encore là — et c'est lui
        // qui dit où le point tombera.
        expect(hauteurDuFantome(scene1)).toBe('60%');
    });

    it('alors le point se pose à la nouvelle hauteur, pas à celle du départ', () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            { at: 600, fait: bouge(600) },
            { at: 700, fait: leve(600) },
        ]);

        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.6, 6);
    });

    it("alors passer sur la page voisine change l'image visée", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            // 1600 est sur la page du bas, qui occupe [1100, 2100] : le doigt a
            // franchi l'interstice.
            { at: 600, fait: bouge(1600) },
            { at: 700, fait: leve(1600) },
        ]);

        expect(scene1.visees[0]?.imageId).toBe(scene1.basId);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.5, 6);
    });

    it("alors partir droit dans l'interstice pose quand même le point, là où il était armé", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            // Le doigt ne touche **aucune** page valable après l'armement : il file
            // droit dans l'interstice et s'y lève. Rien n'a donc jamais remplacé la
            // page de départ, et c'est elle qui doit être enregistrée — sans quoi un
            // geste abouti se perdrait.
            { at: 600, fait: bouge(1050) },
            { at: 700, fait: leve(1050) },
        ]);

        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.imageId).toBe(scene1.hautId);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.25, 6);
    });

    it("alors le fantôme a changé de page, et il n'en reste pas deux", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            { at: 600, fait: bouge(1600) },
        ]);

        // Le fantôme change de zone comme `placeAt` déplace le vrai repère : il
        // est déplacé, pas recopié.
        expect(pageDuFantome(scene1)).toBe(scene1.basId);
        expect(scene1.stack.querySelectorAll('.point-ghost')).toHaveLength(1);
    });

    it("alors relâcher dans l'interstice garde la dernière position valable", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            { at: 600, fait: bouge(1600) },
            // 1050 n'est sur aucune page : le fantôme reste où il était, et c'est
            // cette position-là qui est enregistrée. Un geste abouti ne doit pas
            // se perdre — la règle que le glisser a déjà tranchée.
            { at: 700, fait: bouge(1050) },
            { at: 800, fait: leve(1050) },
        ]);

        expect(scene1.visees[0]?.imageId).toBe(scene1.basId);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.5, 6);
    });
});

describe("Étant donné deux appuis longs ajustés, l'un après l'autre", () => {
    it('alors le second pose son point aussi : le premier geste avait fini', () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            { at: 600, fait: bouge(600) },
            { at: 700, fait: leve(600) },
            { at: 800, fait: pose(scene1.page, 250) },
            { at: 1400, fait: leve(250) },
        ]);

        // L'`exhaustMap` du module n'ouvre un geste que si le précédent s'est
        // achevé. Un suivi du doigt qui ne s'achève pas de lui-même le laisserait
        // souscrit pour de bon : l'ajustement marcherait une fois, puis plus
        // jamais.
        expect(scene1.visees).toHaveLength(2);
    });
});

describe('Étant donné deux doigts posés sur la même page', () => {
    it('alors le geste est armé dès le second doigt, sans attendre les 500 ms', () => {
        const scene1 = scene();
        const armeAvantLes500: boolean[] = [];

        joue([
            { at: 0, fait: pose(scene1.page, 200, { pointerId: 1 }) },
            { at: 100, fait: pose(scene1.page, 400, { pointerId: 2 }) },
            {
                at: 200,
                fait: () => {
                    // Un fantôme monté **est** l'armement, comme partout ailleurs
                    // dans ce module. Sa hauteur n'est pas la question ici, sa
                    // présence l'est : à 200 ms, le minuteur de l'appui long n'a
                    // pas atteint son terme, et deux doigts n'ont pas à l'attendre.
                    armeAvantLes500.push(hauteurDuFantome(scene1) !== null);
                },
            },
            { at: 300, fait: leve(200, { pointerId: 1 }) },
        ]);

        expect(armeAvantLes500).toEqual([true]);
    });

    it("alors relever l'un des deux pose un point à mi-hauteur", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 200, { pointerId: 1 }) },
            // Le second doigt se pose **pendant** que le premier tient, et c'est
            // l'`exhaustMap` du module qui le lui laisse : un `switchMap`
            // annulerait le geste ouvert par le premier doigt — le second
            // `pointerdown` n'ouvre aucun geste à lui, `doigts` en contenant déjà
            // deux — et il ne resterait personne pour entendre ce doigt-ci.
            { at: 100, fait: pose(scene1.page, 400, { pointerId: 2 }) },
            { at: 200, fait: leve(200, { pointerId: 1 }) },
        ]);

        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.imageId).toBe(scene1.hautId);
        // Le milieu de 200 et 400, sur une page de 1000 px de haut.
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.3, 6);
    });

    it('alors relever le second pose le point aussi : le geste est aux deux', () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 200, { pointerId: 1 }) },
            { at: 100, fait: pose(scene1.page, 400, { pointerId: 2 }) },
            // C'est le **second** doigt qui se lève, le premier tenant encore. Un
            // relâchement qui n'accepterait que le doigt d'origine laisserait ce
            // geste attendre, et le point ne se poserait qu'au doigt suivant.
            { at: 200, fait: leve(400, { pointerId: 2 }) },
        ]);

        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.3, 6);
    });
});

describe("Étant donné un second doigt posé après l'armement", () => {
    it('alors le point se pose au milieu des deux, et un seul est posé', () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 200, { pointerId: 1 }) },
            // À 600, l'appui long est armé depuis cent millisecondes : la course
            // est finie, donc la branche du second doigt qui y concourait est
            // désabonnée. Sans une seconde écoute **dans** l'ajustement, ce
            // doigt-ci ne serait entendu par personne et le point resterait à 20 %.
            { at: 600, fait: pose(scene1.page, 400, { pointerId: 2 }) },
            { at: 700, fait: leve(200, { pointerId: 1 }) },
        ]);

        // Un geste ne pose jamais deux points, quel que soit le nombre de doigts
        // qui l'ont rejoint.
        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.3, 6);
    });
});

describe("Étant donné deux doigts armés dont l'un glisse", () => {
    it('alors le fantôme suit leur milieu, et non le doigt resté immobile', () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 200, { pointerId: 1 }) },
            { at: 100, fait: pose(scene1.page, 400, { pointerId: 2 }) },
            // Le **second** doigt descend de 400 à 600 : leur milieu passe de 300
            // à 400. Un suivi qui ne connaîtrait que le doigt d'origine ne verrait
            // rien bouger — et deux doigts posés sur du verre tremblent toujours,
            // donc la visée quitterait le milieu au premier frémissement.
            { at: 200, fait: bouge(600, { pointerId: 2 }) },
        ]);

        expect(hauteurDuFantome(scene1)).toBe('40%');
    });

    it("alors le doigt d'origine qui glisse déplace ce milieu tout autant", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 200, { pointerId: 1 }) },
            { at: 100, fait: pose(scene1.page, 400, { pointerId: 2 }) },
            // Cette fois c'est le **premier** doigt qui descend, de 200 à 300 :
            // leur milieu passe de 300 à 350. Ce témoin-ci sépare « le milieu des
            // doigts » de « la position du doigt qui bouge », les deux valant 400
            // dans le scénario d'au-dessus mais 300 et 350 ici.
            { at: 200, fait: bouge(300, { pointerId: 1 }) },
        ]);

        expect(hauteurDuFantome(scene1)).toBe('35%');
    });
});

describe("Étant donné une souris cliquée pendant qu'un doigt tient la pile", () => {
    it("alors elle n'arme aucun tap à deux doigts : sa route est le clic droit", () => {
        const scene1 = scene();
        const armes: boolean[] = [];
        const relever = (): void => {
            armes.push(hauteurDuFantome(scene1) !== null);
        };

        joue([
            { at: 0, fait: pose(scene1.page, 200, { pointerId: 1 }) },
            // Un appareil hybride : le curseur vise l'image nue, sur la page même
            // du doigt, et ne passe pourtant pas. Deux doigts sont un geste
            // délibéré ; un doigt et un curseur oublié là ne le sont pas.
            { at: 100, fait: pose(scene1.page, 400, { pointerId: 2, pointerType: 'mouse' }) },
            { at: 200, fait: relever },
            { at: 550, fait: relever },
            { at: 600, fait: leve(200, { pointerId: 1 }) },
        ]);

        expect(armes).toEqual([false, true]);
        expect(scene1.visees).toHaveLength(1);
        // À la hauteur du doigt qui tient, pas au milieu des deux.
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.2, 6);
    });
});

describe("Étant donné un second doigt posé sur la pastille d'un point", () => {
    it("alors il n'arme aucun tap à deux doigts : une pastille n'est pas une cible d'appui", () => {
        const scene1 = scene();
        const pastille = document.createElement('button');
        pastille.className = 'point-number';
        query('.image-area', HTMLDivElement, scene1.stack).append(pastille);
        const armes: boolean[] = [];
        const relever = (): void => {
            armes.push(hauteurDuFantome(scene1) !== null);
        };

        joue([
            { at: 0, fait: pose(scene1.page, 200, { pointerId: 1 }) },
            // 400 est sur la page du haut, tout comme le premier doigt : c'est la
            // **cible** qui écarte ce doigt-ci, et non la géométrie. Mêmes gardes
            // d'entrée que pour le doigt qui ouvre un geste, et pour la même
            // raison — une pastille est la poignée du glisser.
            { at: 100, fait: pose(pastille, 400, { pointerId: 2 }) },
            { at: 200, fait: relever },
            { at: 550, fait: relever },
            { at: 600, fait: leve(200, { pointerId: 1 }) },
        ]);

        expect(armes).toEqual([false, true]);
        expect(scene1.visees).toHaveLength(1);
        // À la hauteur du doigt qui tient, pas au milieu des deux.
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.2, 6);
    });
});

describe('Étant donné deux doigts posés sur deux pages différentes', () => {
    it("alors aucun tap à deux doigts n'est armé : ils ne partagent pas de page", () => {
        const scene1 = scene();
        const armes: boolean[] = [];
        const relever = (): void => {
            armes.push(hauteurDuFantome(scene1) !== null);
        };

        joue([
            { at: 0, fait: pose(scene1.page, 200, { pointerId: 1 }) },
            // 1600 est sur la page du bas, qui occupe [1100, 2100]. Le milieu de
            // 200 et 1600 est 900, et 900 **est** sur la page du haut : c'est
            // pourquoi la règle est « les deux doigts sur la même page » et non
            // « le milieu tombe sur une page », qui laisserait poser ici.
            { at: 100, fait: pose(scene1.pageDuBas, 1600, { pointerId: 2 }) },
            { at: 200, fait: relever },
            // Le doigt d'origine tient toujours : son appui long, lui, s'arme à
            // son heure. Un doigt posé ailleurs n'est pas un participant, et il ne
            // tue pas pour autant le geste de celui qui tient.
            { at: 550, fait: relever },
            { at: 600, fait: leve(200, { pointerId: 1 }) },
        ]);

        expect(armes).toEqual([false, true]);
        expect(scene1.visees).toHaveLength(1);
        // À la hauteur du doigt qui tient, pas au milieu des deux.
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.2, 6);
    });
});

describe('Étant donné un tap à deux doigts, puis un appui long', () => {
    it('alors le second geste pose son point aussi, à sa propre hauteur', () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 200, { pointerId: 1 }) },
            { at: 100, fait: pose(scene1.page, 400, { pointerId: 2 }) },
            { at: 200, fait: leve(200, { pointerId: 1 }) },
            // Les deux doigts quittent le verre : la pile est libre pour un geste
            // neuf, et le troisième doigt posé est seul.
            { at: 250, fait: leve(400, { pointerId: 2 }) },
            { at: 300, fait: pose(scene1.page, 700, { pointerId: 1 }) },
            { at: 900, fait: leve(700, { pointerId: 1 }) },
        ]);

        // Le second doigt est un flux d'événements : il ne s'achève jamais de
        // lui-même, donc le geste qu'il arme ne s'achève pas non plus — et
        // l'`exhaustMap` de la pile, qui attend la fin du geste courant, n'en
        // laisserait plus jamais commencer un autre.
        expect(scene1.visees).toHaveLength(2);
        // Et le second point est à la hauteur de **son** doigt. Sans cette fin,
        // l'écoute restée ouverte du premier geste répondrait à sa place et
        // prendrait ce doigt pour un renfort du geste d'avant : un milieu, à 45 %.
        expect(scene1.visees[1]?.fraction.value).toBeCloseTo(0.7, 6);
    });
});

describe('Étant donné le défilement de la page pendant un geste', () => {
    it("alors un touchmove d'après l'armement est retenu : sinon le navigateur emporterait le doigt", () => {
        const scene1 = scene();
        const retenus: boolean[] = [];

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            {
                at: 600,
                fait: () => {
                    retenus.push(glisse(scene1.page).defaultPrevented);
                },
            },
            { at: 700, fait: leve(250) },
        ]);

        // `touch-action: pan-x pan-y` autorise le pan : sans ce refus, le
        // navigateur prendrait le pointeur au premier mouvement et émettrait
        // `pointercancel` — le geste mourrait juste quand on commence à ajuster.
        expect(retenus).toEqual([true]);
    });

    it("alors un touchmove d'avant l'armement n'est pas retenu : le doigt doit pouvoir défiler", () => {
        const scene1 = scene();
        const retenus: boolean[] = [];

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            {
                at: 200,
                fait: () => {
                    retenus.push(glisse(scene1.page).defaultPrevented);
                },
            },
            { at: 700, fait: leve(250) },
        ]);

        expect(retenus).toEqual([false]);
        // Et l'appui s'arme quand même. Un `touchmove` part au moindre pixel de
        // tremblement — c'est le même mouvement que `pointermove` rapporte —, donc
        // en faire une sortie du geste viderait `SLOP` de son sens et l'appui long
        // ne s'armerait pour ainsi dire jamais sur du verre. Si le navigateur
        // décide vraiment de défiler, c'est lui qui tue le geste, par le
        // `pointercancel` que ce module écoute déjà.
        expect(scene1.visees).toHaveLength(1);
    });

    it("alors le geste fini, le défilement n'est plus retenu : la pile ne reste pas sourde", () => {
        const scene1 = scene();
        const retenus: boolean[] = [];

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            { at: 600, fait: leve(250) },
            {
                at: 700,
                fait: () => {
                    retenus.push(glisse(scene1.page).defaultPrevented);
                },
            },
        ]);

        // Un armement qu'on oublierait de défaire coûterait le défilement de
        // l'écran pour tout le reste de sa vie, après un seul appui long.
        expect(retenus).toEqual([false]);
    });

    it("alors l'écran détaché, l'écouteur non passif est parti avec lui", () => {
        const scene1 = scene();
        // Le fantôme est posé **à la main**, sans geste : c'est le seul moyen de
        // distinguer un écouteur retiré d'un écouteur resté là. Puisque l'armement
        // se lit sur la pile, un écouteur qui aurait fui ne trouverait aucun fantôme
        // et ne retiendrait rien non plus — le témoin d'à côté le croirait donc
        // propre. Ici, la pile en porte un.
        scene1.stack.append(fantomeAlaMain());
        const retenus: boolean[] = [];

        retenus.push(glisse(scene1.page).defaultPrevented);
        scene1.detacher();
        retenus.push(glisse(scene1.page).defaultPrevented);

        // Le premier relevé prouve que ce témoin sait dire « retenu » ; le second,
        // que l'écouteur est bien parti. Sans le premier, un écouteur jamais posé
        // donnerait le même vert que l'écouteur correctement retiré.
        expect(retenus).toEqual([true, false]);
    });
});

describe("Étant donné un écran qui se détache alors qu'un appui est armé", () => {
    it('alors le fantôme part avec lui : rien ne reste sur la page', () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            {
                at: 600,
                fait: () => {
                    scene1.detacher();
                },
            },
        ]);

        expect(hauteurDuFantome(scene1)).toBeNull();
    });
});

describe('Étant donné un doigt relevé avant les 500 ms', () => {
    it("alors rien n'est visé : c'était un tap, et il doit atteindre l'écran", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            { at: 200, fait: leve(250) },
        ]);

        expect(scene1.visees).toEqual([]);
    });

    it("alors le geste est bel et bien fini : l'appui long suivant pose le sien", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            { at: 200, fait: leve(250) },
            { at: 300, fait: pose(scene1.page, 700) },
            { at: 900, fait: leve(700) },
        ]);

        // Ce témoin-ci garde `race`, et il est le seul à le faire. Depuis que le
        // minuteur n'est plus toute la source, c'est la course qui **propage
        // l'achèvement de la branche perdante** : le minuteur tué par le
        // relâchement s'achève sans rien émettre, et c'est ce qui termine le
        // geste. Un `merge` à sa place laisserait le flux des renforts ouvert
        // pour toujours — l'`exhaustMap` de la pile resterait souscrit et plus
        // aucun appui long ne s'ouvrirait de toute la vie de l'écran. Le témoin
        // d'au-dessus n'y verrait rien : il n'assère qu'une liste vide, qui le
        // resterait.
        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.7, 6);
    });
});

describe('Étant donné un doigt qui dérive au-delà du seuil avant les 500 ms', () => {
    it("alors rien n'est visé : un doigt qui part ne tient pas un appui", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            // 11 px : un de plus que `SLOP`.
            { at: 200, fait: bouge(261) },
            { at: 600, fait: leve(261) },
        ]);

        expect(scene1.visees).toEqual([]);
    });

    it("alors le geste est fini lui aussi : l'appui long suivant pose le sien", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            // 11 px : un de plus que `SLOP`, donc la dérive tue le minuteur.
            { at: 200, fait: bouge(261) },
            { at: 300, fait: leve(261) },
            { at: 400, fait: pose(scene1.page, 700) },
            { at: 1000, fait: leve(700) },
        ]);

        // La seconde sortie d'avant-armement, et le même mécanisme : c'est la
        // course qui propage l'achèvement du minuteur qu'elle a perdu.
        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.7, 6);
    });

    it('alors une dérive au ras du seuil ne tue rien', () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            // 10 px pile : la limite, donc encore un appui.
            { at: 200, fait: bouge(260) },
            { at: 600, fait: leve(260) },
        ]);

        expect(scene1.visees).toHaveLength(1);
    });
});

describe('Étant donné un pointercancel avant les 500 ms', () => {
    it("alors rien n'est visé, et aucun fantôme ne survit", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            { at: 200, fait: reprend(250) },
        ]);

        expect(scene1.visees).toEqual([]);
        expect(hauteurDuFantome(scene1)).toBeNull();
    });
});

describe("Étant donné un pointercancel pendant l'ajustement", () => {
    it("alors rien n'est posé, et aucun fantôme ne survit : ajuster n'a pas désarmé l'annulation", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            { at: 600, fait: bouge(600) },
            { at: 700, fait: reprend(600) },
            // Le doigt finit toujours par quitter le verre, et ce relâchement-là
            // ne pose plus rien.
            { at: 800, fait: leve(600) },
        ]);

        expect(scene1.visees).toEqual([]);
        expect(hauteurDuFantome(scene1)).toBeNull();
    });
});

describe("Étant donné un pointercancel après l'armement", () => {
    it('alors le geste est fini : aucun fantôme ne survit, et le relâchement ne vise plus rien', () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            { at: 600, fait: reprend(250) },
            // Le doigt finit toujours par quitter le verre. Le navigateur lui a
            // retiré le geste : ce relâchement-là ne pose plus rien.
            { at: 700, fait: leve(250) },
        ]);

        expect(scene1.visees).toEqual([]);
        expect(hauteurDuFantome(scene1)).toBeNull();
    });
});

describe("Étant donné un doigt qui a changé de page avant qu'un second se pose", () => {
    it('alors le second doigt, posé sur la page où le premier se trouve, rejoint le geste', () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250, { pointerId: 1 }) },
            // Armé, le doigt franchit l'interstice : il est désormais sur la page du
            // bas, celle qui occupe [1100, 2100]. C'est une capacité que le suivi a
            // depuis la tâche 5, et c'est elle qui rend ce scénario atteignable.
            { at: 600, fait: bouge(1600, { pointerId: 1 }) },
            // Le renfort se pose sur la page où le premier doigt **est**, et non sur
            // celle où il s'était posé. Comparer à sa hauteur de départ le
            // refuserait, alors qu'il est parfaitement légitime.
            { at: 700, fait: pose(scene1.pageDuBas, 1500, { pointerId: 2 }) },
            { at: 800, fait: leve(1600, { pointerId: 1 }) },
        ]);

        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.imageId).toBe(scene1.basId);
        // Le milieu de 1600 et 1500 est 1550, soit 45 % de la page du bas.
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.45, 6);
    });

    it("alors un second doigt sur la page qu'il a quittée ne rejoint rien, et ne peut pas terminer son geste", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250, { pointerId: 1 }) },
            { at: 600, fait: bouge(1600, { pointerId: 1 }) },
            // La page du haut, que plus aucun doigt du geste ne touche. Comparer à
            // la hauteur de départ l'accepterait — et ce doigt étranger gagnerait
            // alors le droit de terminer le geste en se relevant.
            { at: 700, fait: pose(scene1.page, 300, { pointerId: 2 }) },
            { at: 800, fait: leve(300, { pointerId: 2 }) },
        ]);

        expect(scene1.visees).toEqual([]);
        // Le geste du premier doigt continue, et vise toujours sa page — non le
        // milieu de 1600 et 300, qui tomberait dans l'interstice et figerait le
        // trait là où il était.
        expect(hauteurDuFantome(scene1)).toBe('50%');
    });
});

describe('Étant donné le navigateur qui reprend le second de deux doigts armés', () => {
    it('alors le geste continue, et la visée revient au doigt resté sur le verre', () => {
        const scene1 = scene();
        const vuApresLaReprise: (string | null)[] = [];

        joue([
            { at: 0, fait: pose(scene1.page, 200, { pointerId: 1 }) },
            { at: 100, fait: pose(scene1.page, 400, { pointerId: 2 }) },
            // Le navigateur reprend le second doigt. Il ne tue pas le geste — ce
            // n'est pas celui qui l'a ouvert —, mais il n'en fait plus partie : sa
            // dernière hauteur ne doit plus compter dans le milieu. Ne pas tuer le
            // geste et ne plus compter le doigt sont deux décisions.
            { at: 200, fait: reprend(400, { pointerId: 2 }) },
            {
                at: 250,
                fait: () => {
                    vuApresLaReprise.push(hauteurDuFantome(scene1));
                },
            },
            { at: 300, fait: bouge(800, { pointerId: 1 }) },
            { at: 400, fait: leve(800, { pointerId: 1 }) },
        ]);

        // Tout de suite, et pas au prochain mouvement : ce qu'on voit fait foi, donc
        // le trait revient sur le doigt qui reste dès que l'autre a quitté le verre.
        // Un doigt repris qui resterait dans le geste laisserait 30 %, le milieu de
        // 200 et 400.
        expect(vuApresLaReprise).toEqual(['20%']);
        expect(scene1.visees).toHaveLength(1);
        // 80 %, la hauteur du seul doigt encore posé — et non 60 %, le milieu de 800
        // et d'un 400 fantôme : le point tomberait là où plus aucun doigt n'est.
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.8, 6);
    });
});

describe('Étant donné un doigt qui dérive de côté au-delà du seuil avant les 500 ms', () => {
    it("alors rien n'est visé : un doigt qui part de côté ne tient pas davantage un appui", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            // 11 px de côté, la hauteur inchangée : seul l'axe horizontal dérive.
            { at: 200, fait: bouge(250, { clientX: 11 }) },
            { at: 600, fait: leve(250, { clientX: 11 }) },
        ]);

        expect(scene1.visees).toEqual([]);
    });

    it('alors une dérive de côté au ras du seuil ne tue rien non plus', () => {
        const scene1 = scene();

        joue([
            // Posé loin du bord gauche, à dessein : un doigt qui commence à `0`
            // laisserait une addition passer pour la soustraction d'un écart.
            { at: 0, fait: pose(scene1.page, 250, { clientX: 100 }) },
            // 10 px de côté pile, la hauteur inchangée : la limite, donc un appui.
            { at: 200, fait: bouge(250, { clientX: 110 }) },
            { at: 600, fait: leve(250, { clientX: 110 }) },
        ]);

        expect(scene1.visees).toHaveLength(1);
    });
});

describe("Étant donné un doigt immobile sur la pastille d'un point déjà posé", () => {
    it("alors rien n'est visé : la pastille est la poignée du glisser, pas une cible d'appui", () => {
        const scene1 = scene();
        const pastille = document.createElement('button');
        pastille.className = 'point-number';
        query('.image-area', HTMLDivElement, scene1.stack).append(pastille);

        joue([
            { at: 0, fait: pose(pastille, 250) },
            { at: 600, fait: leve(250) },
        ]);

        expect(scene1.visees).toEqual([]);
    });
});

describe("Étant donné un second doigt posé sur l'image, un premier tenant déjà une pastille", () => {
    it("alors rien n'est visé : le premier doigt mène un glisser", () => {
        const scene1 = scene();
        const pastille = document.createElement('button');
        pastille.className = 'point-number';
        query('.image-area', HTMLDivElement, scene1.stack).append(pastille);

        joue([
            { at: 0, fait: pose(pastille, 250, { pointerId: 1 }) },
            { at: 100, fait: pose(scene1.page, 400, { pointerId: 2 }) },
            { at: 700, fait: leve(400, { pointerId: 2 }) },
        ]);

        expect(scene1.visees).toEqual([]);
    });
});

describe('Étant donné un second pointeur qui se lève ailleurs pendant un appui armé', () => {
    it("alors rien n'est visé : ce n'est pas lui qui tient le geste", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250, { pointerId: 1 }) },
            // Un pouce posé sur la bordure, une paume, un stylet, la souris d'un
            // appareil hybride : il se pose **hors** de la pile, donc
            // `compterLesDoigts$` ne le compte pas et aucun garde d'entrée ne le
            // voit. Rien ne le distingue pourtant du premier doigt, en aval.
            { at: 100, fait: pose(document.body, 250, { pointerId: 2 }) },
            { at: 600, fait: leve(250, { pointerId: 2 }) },
        ]);

        expect(scene1.visees).toEqual([]);
        // Et le geste du premier doigt n'est pas fini pour autant : il est encore
        // sur le verre, donc son fantôme est encore là.
        expect(hauteurDuFantome(scene1)).toBe('25%');
    });
});

describe('Étant donné un second pointeur qui glisse ailleurs avant les 500 ms', () => {
    it("alors l'appui s'arme quand même : cette dérive n'est pas la sienne", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250, { pointerId: 1 }) },
            { at: 100, fait: pose(document.body, 250, { pointerId: 2 }) },
            // 40 px, bien au-delà de `SLOP` : un pouce qui traîne sur la bordure
            // pendant que l'autre doigt tient. À une main, c'est le cas courant —
            // et sans filtre l'appui long ne s'armerait jamais.
            { at: 200, fait: bouge(290, { pointerId: 2 }) },
            { at: 600, fait: leve(250, { pointerId: 1 }) },
        ]);

        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.25, 6);
    });
});

describe('Étant donné un second pointeur que le navigateur reprend, un appui étant armé', () => {
    it("alors le geste continue : ce n'est pas lui qu'on a repris", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250, { pointerId: 1 }) },
            { at: 100, fait: pose(document.body, 250, { pointerId: 2 }) },
            { at: 600, fait: reprend(250, { pointerId: 2 }) },
            { at: 700, fait: leve(250, { pointerId: 1 }) },
        ]);

        expect(scene1.visees).toHaveLength(1);
    });
});

describe('Étant donné un second pointeur qui se lève ailleurs avant les 500 ms', () => {
    it("alors l'appui s'arme quand même : ce n'est pas lui qui se retire", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250, { pointerId: 1 }) },
            { at: 100, fait: pose(document.body, 250, { pointerId: 2 }) },
            { at: 200, fait: leve(250, { pointerId: 2 }) },
            { at: 600, fait: leve(250, { pointerId: 1 }) },
        ]);

        expect(scene1.visees).toHaveLength(1);
    });
});

describe('Étant donné un second pointeur que le navigateur reprend avant les 500 ms', () => {
    it("alors l'appui s'arme quand même : ce n'est pas ce geste-ci qu'on a repris", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250, { pointerId: 1 }) },
            { at: 100, fait: pose(document.body, 250, { pointerId: 2 }) },
            { at: 200, fait: reprend(250, { pointerId: 2 }) },
            { at: 600, fait: leve(250, { pointerId: 1 }) },
        ]);

        expect(scene1.visees).toHaveLength(1);
    });
});

describe("Étant donné une souris maintenue immobile sur l'image", () => {
    it("alors rien n'est visé : la route de la souris est le clic droit", () => {
        const scene1 = scene();

        joue([
            { at: 0, fait: pose(scene1.page, 250, { pointerType: 'mouse' }) },
            { at: 600, fait: leve(250, { pointerType: 'mouse' }) },
        ]);

        expect(scene1.visees).toEqual([]);
    });
});
