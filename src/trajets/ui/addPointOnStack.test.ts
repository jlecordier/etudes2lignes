// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { TestScheduler } from 'rxjs/testing';
import { query } from '../../shared/dom';
import { createSchemaPage, type ObjectUrls } from '../../shared/SchemaPage';
import { newImageId, type ImageId } from '../domain/ids';
import { addsOnStack } from './addPointOnStack';
import { ImageFrameElement } from './ImageFrame';
import type { PageAimIntent } from './intents';

/**
 * jsdom ne connaît pas `PointerEvent` : on le reconstruit au strict nécessaire,
 * un `MouseEvent` qui porte en plus l'identifiant et le type du pointeur. Le
 * type compte ici plus qu'ailleurs — c'est lui qui sépare la route du doigt de
 * celle de la souris.
 */
class FauxPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(
        type: string,
        clientY: number,
        { pointerId = 1, pointerType = 'touch', button = 0, clientX = 0 } = {},
    ) {
        super(type, { clientX, clientY, bubbles: true, button, cancelable: true });
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

function scene(scheduler?: TestScheduler): Scene {
    const stack = document.createElement('div');
    const hautId = newImageId();
    const haut = frame(hautId, 0, 1000);
    stack.append(haut);
    document.body.replaceChildren(stack);

    const visees: PageAimIntent[] = [];
    const abonnement = addsOnStack(stack, scheduler).subscribe((visee) => {
        visees.push(visee);
    });

    return {
        stack,
        page: query('schema-page', HTMLElement, haut),
        barre: query('.image-bar', HTMLDivElement, haut),
        hautId,
        visees,
        detacher: () => {
            abonnement.unsubscribe();
        },
    };
}

/**
 * Le temps de l'appui long, en virtuel. `TestScheduler.run` ne sert pas ici à
 * comparer des diagrammes : le geste se joue en événements DOM, pas en
 * notifications, et ce qu'on veut d'un scheduler virtuel c'est **avancer**
 * l'horloge à la main entre deux gestes du doigt.
 */
function horloge(): TestScheduler {
    return new TestScheduler(() => {
        // Aucune égalité de diagramme à vérifier : les assertions portent sur
        // les visées produites, comme partout ailleurs dans ce dépôt.
    });
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
            scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));

            const evenement = clicDroit(scene1.page, 250);

            expect(evenement.defaultPrevented).toBe(true);
            expect(scene1.visees).toEqual([]);
        });

        it('alors le doigt que le navigateur reprend le rend aussi', () => {
            const scene1 = scene();
            scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
            // Un doigt annulé ne se relève jamais : sans être oublié ici, il
            // étoufferait tous les clics droits suivants.
            document.documentElement.dispatchEvent(new FauxPointerEvent('pointercancel', 250));

            clicDroit(scene1.page, 250);

            expect(scene1.visees).toHaveLength(1);
        });

        it('alors le doigt relevé rend au clic droit son effet', () => {
            const scene1 = scene();
            scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
            document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));

            clicDroit(scene1.page, 250);

            expect(scene1.visees).toHaveLength(1);
        });
    });

    describe('Étant donné une souris posée sur la pile', () => {
        it('alors elle ne compte pas comme un doigt : le clic droit garde son effet', () => {
            const scene1 = scene();
            scene1.page.dispatchEvent(
                new FauxPointerEvent('pointerdown', 250, { pointerType: 'mouse' }),
            );

            clicDroit(scene1.page, 250);

            expect(scene1.visees).toHaveLength(1);
        });
    });
});

describe('Étant donné un appui long maintenu puis relâché sans bouger', () => {
    it('alors un point est visé à la hauteur du doigt', () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));

        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.imageId).toBe(scene1.hautId);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.25, 6);
    });

    it("alors un fantôme est apparu à l'armement, puis retiré au relâchement", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();

        const fantome = scene1.stack.querySelector('.point-ghost');
        expect(fantome).not.toBeNull();
        expect(fantome instanceof HTMLElement ? fantome.style.top : null).toBe('25%');

        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));

        expect(scene1.stack.querySelector('.point-ghost')).toBeNull();
    });
});

describe("Étant donné un écran qui se détache alors qu'un appui est armé", () => {
    it('alors le fantôme part avec lui : rien ne reste sur la page', () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        scene1.detacher();

        expect(scene1.stack.querySelector('.point-ghost')).toBeNull();
    });
});

describe('Étant donné un doigt relevé avant les 500 ms', () => {
    it("alors rien n'est visé : c'était un tap, et il doit atteindre l'écran", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));
        scheduler.flush();

        expect(scene1.visees).toEqual([]);
    });
});

describe('Étant donné un doigt qui dérive au-delà du seuil avant les 500 ms', () => {
    it("alors rien n'est visé : un doigt qui part ne tient pas un appui", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        // 11 px : un de plus que `SLOP`.
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointermove', 261));
        scheduler.flush();
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 261));

        expect(scene1.visees).toEqual([]);
    });

    it('alors une dérive au ras du seuil ne tue rien', () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        // 10 px pile : la limite, donc encore un appui.
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointermove', 260));
        scheduler.flush();
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 260));

        expect(scene1.visees).toHaveLength(1);
    });
});

describe('Étant donné un pointercancel avant les 500 ms', () => {
    it("alors rien n'est visé, et aucun fantôme ne survit", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointercancel', 250));
        scheduler.flush();

        expect(scene1.visees).toEqual([]);
        expect(scene1.stack.querySelector('.point-ghost')).toBeNull();
    });
});

describe("Étant donné un pointercancel après l'armement", () => {
    it('alors le geste est fini : aucun fantôme ne survit, et le relâchement ne vise plus rien', () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointercancel', 250));
        // Le doigt finit toujours par quitter le verre. Le navigateur lui a
        // retiré le geste : ce relâchement-là ne pose plus rien.
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));

        expect(scene1.visees).toEqual([]);
        expect(scene1.stack.querySelector('.point-ghost')).toBeNull();
    });
});

describe('Étant donné un doigt qui dérive de côté au-delà du seuil avant les 500 ms', () => {
    it("alors rien n'est visé : un doigt qui part de côté ne tient pas davantage un appui", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        // 11 px de côté, la hauteur inchangée : seul l'axe horizontal dérive.
        document.documentElement.dispatchEvent(
            new FauxPointerEvent('pointermove', 250, { clientX: 11 }),
        );
        scheduler.flush();
        document.documentElement.dispatchEvent(
            new FauxPointerEvent('pointerup', 250, { clientX: 11 }),
        );

        expect(scene1.visees).toEqual([]);
    });

    it('alors une dérive de côté au ras du seuil ne tue rien non plus', () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        // Posé loin du bord gauche, à dessein : un doigt qui commence à `0`
        // laisserait une addition passer pour la soustraction d'un écart.
        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250, { clientX: 100 }));
        // 10 px de côté pile, la hauteur inchangée : la limite, donc un appui.
        document.documentElement.dispatchEvent(
            new FauxPointerEvent('pointermove', 250, { clientX: 110 }),
        );
        scheduler.flush();
        document.documentElement.dispatchEvent(
            new FauxPointerEvent('pointerup', 250, { clientX: 110 }),
        );

        expect(scene1.visees).toHaveLength(1);
    });
});

describe("Étant donné un doigt immobile sur la pastille d'un point déjà posé", () => {
    it("alors rien n'est visé : la pastille est la poignée du glisser, pas une cible d'appui", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);
        const pastille = document.createElement('button');
        pastille.className = 'point-number';
        query('.image-area', HTMLDivElement, scene1.stack).append(pastille);

        pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));

        expect(scene1.visees).toEqual([]);
    });
});

describe("Étant donné un second doigt posé sur l'image, un premier tenant déjà une pastille", () => {
    it("alors rien n'est visé : le premier doigt mène un glisser", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);
        const pastille = document.createElement('button');
        pastille.className = 'point-number';
        query('.image-area', HTMLDivElement, scene1.stack).append(pastille);

        pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 250, { pointerId: 1 }));
        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 400, { pointerId: 2 }));
        scheduler.flush();
        document.documentElement.dispatchEvent(
            new FauxPointerEvent('pointerup', 400, { pointerId: 2 }),
        );

        expect(scene1.visees).toEqual([]);
    });
});

describe("Étant donné une souris maintenue immobile sur l'image", () => {
    it("alors rien n'est visé : la route de la souris est le clic droit", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(
            new FauxPointerEvent('pointerdown', 250, { pointerType: 'mouse' }),
        );
        scheduler.flush();
        document.documentElement.dispatchEvent(
            new FauxPointerEvent('pointerup', 250, { pointerType: 'mouse' }),
        );

        expect(scene1.visees).toEqual([]);
    });
});
