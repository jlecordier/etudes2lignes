import { describe, expect, it } from 'vitest';
import { borner } from './nombre';

describe('borner', () => {
    describe('Étant donné une valeur dans l’intervalle', () => {
        it('alors elle est renvoyée telle quelle', () => {
            expect(borner(0.42, 0, 1)).toBe(0.42);
            expect(borner(0, 0, 1)).toBe(0);
            expect(borner(1, 0, 1)).toBe(1);
        });
    });

    describe('Étant donné une valeur sous le minimum', () => {
        it('alors le minimum est renvoyé', () => {
            expect(borner(-3, 0, 1)).toBe(0);
            expect(borner(-3, -1, 1)).toBe(-1);
        });
    });

    describe('Étant donné une valeur au-dessus du maximum', () => {
        it('alors le maximum est renvoyé', () => {
            expect(borner(12, 0, 1)).toBe(1);
            expect(borner(12, 0, 10)).toBe(10);
        });
    });
});
