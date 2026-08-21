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
    /** La barre de la page du haut : hors de toute `.image-area`. */
    barre: HTMLElement;
    hautId: ImageId;
    basId: ImageId;
    visees: PageAimIntent[];
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
        barre: query('.image-bar', HTMLDivElement, haut),
        hautId,
        basId,
        visees,
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

        joue([
            { at: 0, fait: pose(scene1.page, 250) },
            // Avant les 500 ms rien n'est armé, donc rien n'a vibré.
            {
                at: 400,
                fait: () => {
                    comptes.push(vibreur.motifs.length);
                },
            },
            { at: 600, fait: bouge(600) },
            { at: 700, fait: leve(600) },
        ]);
        comptes.push(vibreur.motifs.length);

        // Une fois, et à l'armement : ni à chaque mouvement de l'ajustement, ni au
        // relâchement. Ça ne dit pas « c'est fait », ça dit « allez-y ».
        expect(comptes).toEqual([0, 1]);
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
