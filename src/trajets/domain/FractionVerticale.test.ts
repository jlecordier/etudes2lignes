import { describe, expect, it } from 'vitest';
import { FractionVerticale } from './FractionVerticale';

describe('FractionVerticale', () => {
    describe('Étant donné une valeur entre 0 et 1', () => {
        it('alors la fraction est créée avec cette valeur', () => {
            expect(FractionVerticale.create(0).value).toBe(0);
            expect(FractionVerticale.create(0.42).value).toBe(0.42);
            expect(FractionVerticale.create(1).value).toBe(1);
        });
    });

    describe('Étant donné une valeur hors de [0, 1]', () => {
        it('alors la création est refusée', () => {
            expect(() => FractionVerticale.create(-0.01)).toThrow('Fraction verticale invalide');
            expect(() => FractionVerticale.create(1.01)).toThrow('Fraction verticale invalide');
            expect(() => FractionVerticale.create(Number.NaN)).toThrow(
                'Fraction verticale invalide',
            );
        });
    });

    describe('Étant donné deux fractions de même valeur', () => {
        it('alors elles sont égales', () => {
            expect(FractionVerticale.create(0.5).equals(FractionVerticale.create(0.5))).toBe(true);
        });
    });

    describe('Étant donné une distance verticale dans une hauteur', () => {
        it('alors la fraction est le rapport des deux', () => {
            expect(FractionVerticale.fromHeight(150, 600).value).toBe(0.25);
        });
    });

    describe('Étant donné une distance négative', () => {
        it('alors la fraction depuis la hauteur vaut 0', () => {
            expect(FractionVerticale.fromHeight(-40, 600).value).toBe(0);
        });
    });

    describe('Étant donné une distance supérieure à la hauteur', () => {
        it('alors la fraction depuis la hauteur vaut 1', () => {
            expect(FractionVerticale.fromHeight(900, 600).value).toBe(1);
        });
    });

    describe('Étant donné une hauteur nulle ou négative', () => {
        it('alors la fraction depuis la hauteur est refusée (division impossible)', () => {
            expect(() => FractionVerticale.fromHeight(150, 0)).toThrow('Hauteur invalide');
            expect(() => FractionVerticale.fromHeight(150, -600)).toThrow('Hauteur invalide');
        });
    });

    describe("Étant donné une distance qui n'est pas un nombre", () => {
        it('alors la fraction depuis la hauteur est refusée', () => {
            expect(() => FractionVerticale.fromHeight(Number.NaN, 600)).toThrow(
                'Fraction verticale invalide',
            );
        });
    });
});
