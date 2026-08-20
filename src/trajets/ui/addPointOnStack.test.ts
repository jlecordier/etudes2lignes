// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../../shared/dom';
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
        { pointerId = 1, pointerType = 'touch', button = 0 } = {},
    ) {
        super(type, { clientY, bubbles: true, button, cancelable: true });
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
}

/** Un cadre mesuré, avec sa barre au-dessus et sa page dedans. */
function frame(imageId: ImageId, top: number, hauteur: number): ImageFrameElement {
    const element = new ImageFrameElement();
    element.imageId = imageId;
    const barre = document.createElement('div');
    barre.className = 'image-bar';
    const area = document.createElement('div');
    area.className = 'image-area';
    area.getBoundingClientRect = () => new DOMRect(0, top, 800, hauteur);
    const page = document.createElement('schema-page');
    area.append(page);
    element.append(barre, area);
    return element;
}

function scene(): Scene {
    const stack = document.createElement('div');
    const hautId = newImageId();
    const haut = frame(hautId, 0, 1000);
    stack.append(haut);
    document.body.replaceChildren(stack);

    const visees: PageAimIntent[] = [];
    addsOnStack(stack).subscribe((visee) => visees.push(visee));

    return {
        stack,
        page: query('schema-page', HTMLElement, haut),
        barre: query('.image-bar', HTMLDivElement, haut),
        hautId,
        visees,
    };
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
