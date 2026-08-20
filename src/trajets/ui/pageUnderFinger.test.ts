// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { FractionVerticale } from '../domain/FractionVerticale';
import { newImageId, type ImageId } from '../domain/ids';
import { ImageFrameElement } from './ImageFrame';
import { placeAt } from './pageFraction';
import { areaUnderFinger } from './pageUnderFinger';

/**
 * jsdom ne calcule aucune mise en page : les cadres sont posés à la main, sans
 * quoi `FractionVerticale.fromHeight` lèverait sur une hauteur nulle.
 */
function frame(imageId: ImageId, top: number, hauteur: number): ImageFrameElement {
    const element = new ImageFrameElement();
    element.imageId = imageId;
    const area = document.createElement('div');
    area.className = 'image-area';
    area.getBoundingClientRect = () => new DOMRect(0, top, 800, hauteur);
    element.append(area);
    return element;
}

interface Pile {
    stack: HTMLElement;
    hautId: ImageId;
    basId: ImageId;
}

/** La page du haut occupe [0, 1000], celle du bas [1100, 2100] : 100 px d'interstice. */
function pile(): Pile {
    const stack = document.createElement('div');
    const hautId = newImageId();
    const basId = newImageId();
    stack.append(frame(hautId, 0, 1000), frame(basId, 1100, 1000));
    document.body.replaceChildren(stack);
    return { stack, hautId, basId };
}

beforeEach(() => {
    document.body.replaceChildren();
});

describe('La page sous le doigt', () => {
    describe("Étant donné une hauteur à l'intérieur de la page du haut", () => {
        it('alors cette page est désignée, à sa fraction', () => {
            const { stack, hautId } = pile();

            const vise = areaUnderFinger(stack, 250);

            expect(vise?.imageId).toBe(hautId);
            expect(vise?.fraction.value).toBeCloseTo(0.25, 6);
        });
    });

    describe('Étant donné une hauteur sur la page du bas', () => {
        it("alors c'est l'identifiant de cette page-là", () => {
            const { stack, basId } = pile();

            const vise = areaUnderFinger(stack, 1600);

            expect(vise?.imageId).toBe(basId);
            expect(vise?.fraction.value).toBeCloseTo(0.5, 6);
        });
    });

    describe("Étant donné une hauteur dans l'interstice entre deux pages", () => {
        it("alors aucune page n'est désignée", () => {
            const { stack } = pile();

            expect(areaUnderFinger(stack, 1050)).toBeNull();
        });
    });

    describe('Étant donné une page de hauteur nulle', () => {
        it('alors elle est sautée plutôt que de diviser par zéro', () => {
            const stack = document.createElement('div');
            stack.append(frame(newImageId(), 0, 0));
            document.body.replaceChildren(stack);

            expect(areaUnderFinger(stack, 0)).toBeNull();
        });
    });
});

describe('Poser un élément à une hauteur relative', () => {
    describe("Étant donné un élément qui n'est pas dans la zone visée", () => {
        it('alors il y est déplacé, et porte sa hauteur en pourcentage', () => {
            const { stack } = pile();
            const vise = areaUnderFinger(stack, 250);
            const element = document.createElement('div');
            document.body.append(element);

            placeAt(element, vise?.area ?? stack, FractionVerticale.create(0.25));

            expect(element.parentElement).toBe(vise?.area);
            expect(element.style.top).toBe('25%');
        });
    });
});
