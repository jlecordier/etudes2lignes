import { describe, expect, it } from 'vitest';
import {
    isPositiveInteger,
    isFiniteNumber,
    isObject,
    isArray,
    isStringArray,
    isArrayBuffer,
    isString,
    isDate,
} from './predicats';

/**
 * Ces prédicats sont ce qui remplace le `as` banni par l'ADR 0002 : ils sont la
 * seule chose qui vérifie vraiment une donnée venue du dehors. Ils étaient
 * jusqu'ici éprouvés de biais, par le chemin heureux du dépôt — un prédicat
 * réécrit en `return true` ne faisait rougir aucun test. Ils se testent donc
 * pour eux-mêmes, et par leurs bords.
 */
describe('predicats', () => {
    describe('isObject', () => {
        it('alors un objet ordinaire est reconnu', () => {
            expect(isObject({ nom: 'Paris' })).toBe(true);
            expect(isObject({})).toBe(true);
        });

        it.each([
            ['null, qui est de type « object »', null],
            ['un tableau, qui en est un aussi', []],
            ['une chaîne', 'Paris'],
            ['un nombre', 42],
            ['undefined', undefined],
        ])('alors %s est refusé', (_case, value) => {
            expect(isObject(value)).toBe(false);
        });
    });

    describe('isArray', () => {
        it('alors un tableau est reconnu, même vide', () => {
            expect(isArray([])).toBe(true);
            expect(isArray([1, 'deux'])).toBe(true);
        });

        it.each([
            ['un objet', {}],
            ['une chaîne', 'abc'],
            ['null', null],
        ])('alors %s est refusé', (_case, value) => {
            expect(isArray(value)).toBe(false);
        });
    });

    describe('isString', () => {
        it('alors une chaîne est reconnue, même vide', () => {
            expect(isString('page-1.jpg')).toBe(true);
            expect(isString('')).toBe(true);
        });

        it.each([
            ['un nombre', 42],
            ['null', null],
            ['undefined', undefined],
            ['un objet', {}],
        ])('alors %s est refusé', (_case, value) => {
            expect(isString(value)).toBe(false);
        });
    });

    describe('isStringArray', () => {
        it('alors un tableau de chaînes est reconnu, même vide', () => {
            expect(isStringArray(['a', 'b'])).toBe(true);
            expect(isStringArray([])).toBe(true);
        });

        it('alors un seul élément non-chaîne suffit à le refuser', () => {
            expect(isStringArray(['a', 2])).toBe(false);
            expect(isStringArray(['a', null])).toBe(false);
        });

        it("alors une chaîne seule n'est pas un tableau de chaînes", () => {
            expect(isStringArray('abc')).toBe(false);
        });
    });

    describe('isFiniteNumber', () => {
        it('alors un nombre fini est reconnu, zéro et négatifs compris', () => {
            expect(isFiniteNumber(42)).toBe(true);
            expect(isFiniteNumber(0)).toBe(true);
            expect(isFiniteNumber(-1.5)).toBe(true);
        });

        it.each([
            ['NaN', Number.NaN],
            ['Infinity', Number.POSITIVE_INFINITY],
            ['-Infinity', Number.NEGATIVE_INFINITY],
            ['une chaîne numérique', '42'],
            ['null', null],
        ])('alors %s est refusé', (_case, value) => {
            expect(isFiniteNumber(value)).toBe(false);
        });
    });

    describe('isPositiveInteger', () => {
        it("alors une dimension d'image plausible est reconnue", () => {
            expect(isPositiveInteger(2481)).toBe(true);
            expect(isPositiveInteger(1)).toBe(true);
        });

        it.each([
            ["zéro — une image de largeur nulle n'en est pas une", 0],
            ['un négatif', -100],
            ['un décimal', 1.5],
            ['NaN', Number.NaN],
            ['Infinity', Number.POSITIVE_INFINITY],
            ['une chaîne numérique', '100'],
        ])('alors %s est refusé', (_case, value) => {
            expect(isPositiveInteger(value)).toBe(false);
        });
    });

    describe('isDate', () => {
        it('alors une date utilisable est reconnue', () => {
            expect(isDate(new Date('2026-07-10T10:00:00Z'))).toBe(true);
        });

        it('alors une Date invalide est refusée — le clone structuré peut en rendre une', () => {
            expect(isDate(new Date('pas une date'))).toBe(false);
        });

        it.each([
            ['un horodatage en nombre', 1_752_141_600_000],
            ['une chaîne ISO', '2026-07-10T10:00:00Z'],
            ['null', null],
        ])('alors %s est refusé', (_case, value) => {
            expect(isDate(value)).toBe(false);
        });
    });

    describe('isArrayBuffer', () => {
        it('alors un ArrayBuffer est reconnu', () => {
            expect(isArrayBuffer(new ArrayBuffer(8))).toBe(true);
        });

        it.each([
            ["une vue sur un tampon, qui n'en est pas un", new Uint8Array(8)],
            ['un Blob', new Blob(['x'])],
            ['null', null],
        ])('alors %s est refusé', (_case, value) => {
            expect(isArrayBuffer(value)).toBe(false);
        });
    });
});
