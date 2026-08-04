import { describe, expect, it } from 'vitest';
import { trajetContentsText } from './presentation';

describe('trajetContentsText', () => {
    describe('Étant donné un trajet sans aucune image', () => {
        it('alors le compte des points est passé sous silence : il n’y en a pas', () => {
            // Un point vise toujours une image du trajet (invariant de l'agrégat) :
            // sans image, il n'y a pas de point à compter.
            expect(trajetContentsText(0, 0)).toBe('Aucune image');
        });
    });

    describe('Étant donné un trajet avec des images mais aucun point', () => {
        it('alors l’absence de point se dit en mots, pas par un zéro', () => {
            expect(trajetContentsText(1, 0)).toBe('1 image · aucun point');
            expect(trajetContentsText(3, 0)).toBe('3 images · aucun point');
        });
    });

    describe('Étant donné un trajet géoréférencé', () => {
        it('alors chaque compte porte son propre pluriel', () => {
            expect(trajetContentsText(1, 1)).toBe('1 image · 1 point');
            expect(trajetContentsText(1, 4)).toBe('1 image · 4 points');
            expect(trajetContentsText(6, 1)).toBe('6 images · 1 point');
            expect(trajetContentsText(6, 4)).toBe('6 images · 4 points');
        });
    });
});
