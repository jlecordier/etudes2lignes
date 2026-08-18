import { describe, expect, it } from 'vitest';
import { requireElementAt } from './array';

describe('requireElementAt', () => {
    describe('Étant donné un index dans les bornes', () => {
        it("alors l'élément est rendu", () => {
            expect(requireElementAt(['a', 'b', 'c'], 1)).toBe('b');
        });

        it('alors le premier et le dernier sont atteignables', () => {
            const pages = ['page-1', 'page-2'];

            expect(requireElementAt(pages, 0)).toBe('page-1');
            expect(requireElementAt(pages, pages.length - 1)).toBe('page-2');
        });
    });

    describe('Étant donné un index hors des bornes', () => {
        it.each([
            ['juste après le dernier', 2],
            ['bien au-delà', 99],
            ['négatif', -1],
        ])("alors %s est refusé en disant l'index et la longueur", (_case, index) => {
            expect(() => requireElementAt(['a', 'b'], index)).toThrow(
                `Index ${String(index)} hors bornes (longueur 2).`,
            );
        });
    });

    describe('Étant donné un tableau vide', () => {
        it('alors tout accès est refusé', () => {
            expect(() => requireElementAt([], 0)).toThrow(RangeError);
        });
    });

    describe('Étant donné un tableau qui contient vraiment `undefined`', () => {
        it("alors l'accès est refusé — la limite assumée de la garde", () => {
            // `requireElementAt` reconnaît « hors bornes » à un `undefined` rendu
            // par l'accès indexé : elle ne sait donc pas distinguer un trou d'une
            // valeur `undefined` légitime. Aucun tableau du projet n'en contient,
            // et le dire ici vaut mieux que de laisser croire le contraire.
            expect(() => requireElementAt([undefined], 0)).toThrow(RangeError);
        });
    });
});
