import { describe, expect, it } from 'vitest';
import { FractionVerticale } from './FractionVerticale';

describe('FractionVerticale', () => {
    describe('Étant donné une valeur entre 0 et 1', () => {
        it('alors la fraction est créée avec cette valeur', () => {
            expect(FractionVerticale.creer(0).valeur).toBe(0);
            expect(FractionVerticale.creer(0.42).valeur).toBe(0.42);
            expect(FractionVerticale.creer(1).valeur).toBe(1);
        });
    });

    describe('Étant donné une valeur hors de [0, 1]', () => {
        it('alors la création est refusée', () => {
            expect(() => FractionVerticale.creer(-0.01)).toThrow('Fraction verticale invalide');
            expect(() => FractionVerticale.creer(1.01)).toThrow('Fraction verticale invalide');
            expect(() => FractionVerticale.creer(Number.NaN)).toThrow(
                'Fraction verticale invalide',
            );
        });
    });

    describe('Étant donné deux fractions de même valeur', () => {
        it('alors elles sont égales', () => {
            expect(FractionVerticale.creer(0.5).egale(FractionVerticale.creer(0.5))).toBe(true);
        });
    });
});
