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
    const haut = frame(hautId, 0, 1000);
    stack.append(haut);
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

function clicDroit(cible: HTMLElement, clientY: number): MouseEvent {
    const evenement = new MouseEvent('contextmenu', {
        clientY,
        bubbles: true,
        cancelable: true,
    });
    cible.dispatchEvent(evenement);
    return evenement;
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
