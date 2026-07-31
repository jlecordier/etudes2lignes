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

    describe('Étant donné une distance verticale dans une hauteur', () => {
        it('alors la fraction est le rapport des deux', () => {
            expect(FractionVerticale.depuisHauteur(150, 600).valeur).toBe(0.25);
        });
    });

    describe('Étant donné une distance négative', () => {
        it('alors la fraction depuis la hauteur vaut 0', () => {
            expect(FractionVerticale.depuisHauteur(-40, 600).valeur).toBe(0);
        });
    });

    describe('Étant donné une distance supérieure à la hauteur', () => {
        it('alors la fraction depuis la hauteur vaut 1', () => {
            expect(FractionVerticale.depuisHauteur(900, 600).valeur).toBe(1);
        });
    });

    describe('Étant donné une hauteur nulle ou négative', () => {
        it('alors la fraction depuis la hauteur est refusée (division impossible)', () => {
            expect(() => FractionVerticale.depuisHauteur(150, 0)).toThrow('Hauteur invalide');
            expect(() => FractionVerticale.depuisHauteur(150, -600)).toThrow('Hauteur invalide');
        });
    });

    describe('Étant donné une distance qui n’est pas un nombre', () => {
        it('alors la fraction depuis la hauteur est refusée', () => {
            expect(() => FractionVerticale.depuisHauteur(Number.NaN, 600)).toThrow(
                'Fraction verticale invalide',
            );
        });
    });
});
