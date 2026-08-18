import { describe, expect, it } from 'vitest';
import { clamp } from './number';

describe('clamp', () => {
    describe("Étant donné une valeur dans l'intervalle", () => {
        it('alors elle est renvoyée telle quelle', () => {
            expect(clamp(0.42, 0, 1)).toBe(0.42);
            expect(clamp(0, 0, 1)).toBe(0);
            expect(clamp(1, 0, 1)).toBe(1);
        });
    });

    describe('Étant donné une valeur sous le minimum', () => {
        it('alors le minimum est renvoyé', () => {
            expect(clamp(-3, 0, 1)).toBe(0);
            expect(clamp(-3, -1, 1)).toBe(-1);
        });
    });

    describe('Étant donné une valeur au-dessus du maximum', () => {
        it('alors le maximum est renvoyé', () => {
            expect(clamp(12, 0, 1)).toBe(1);
            expect(clamp(12, 0, 10)).toBe(10);
        });
    });
});
