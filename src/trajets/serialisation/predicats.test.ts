import { describe, expect, it } from 'vitest';
import {
    estUnEntierPositif,
    estUnNombreFini,
    estUnObjet,
    estUnTableau,
    estUnTableauDeChaines,
    estUnTampon,
    estUneChaine,
    estUneDate,
} from './predicats';

/**
 * Ces prédicats sont ce qui remplace le `as` banni par l'ADR 0002 : ils sont la
 * seule chose qui vérifie vraiment une donnée venue du dehors. Ils étaient
 * jusqu'ici éprouvés de biais, par le chemin heureux du dépôt — un prédicat
 * réécrit en `return true` ne faisait rougir aucun test. Ils se testent donc
 * pour eux-mêmes, et par leurs bords.
 */
describe('predicats', () => {
    describe('estUnObjet', () => {
        it('alors un objet ordinaire est reconnu', () => {
            expect(estUnObjet({ nom: 'Paris' })).toBe(true);
            expect(estUnObjet({})).toBe(true);
        });

        it.each([
            ['null, qui est de type « object »', null],
            ['un tableau, qui en est un aussi', []],
            ['une chaîne', 'Paris'],
            ['un nombre', 42],
            ['undefined', undefined],
        ])('alors %s est refusé', (_cas, valeur) => {
            expect(estUnObjet(valeur)).toBe(false);
        });
    });

    describe('estUnTableau', () => {
        it('alors un tableau est reconnu, même vide', () => {
            expect(estUnTableau([])).toBe(true);
            expect(estUnTableau([1, 'deux'])).toBe(true);
        });

        it.each([
            ['un objet', {}],
            ['une chaîne', 'abc'],
            ['null', null],
        ])('alors %s est refusé', (_cas, valeur) => {
            expect(estUnTableau(valeur)).toBe(false);
        });
    });

    describe('estUneChaine', () => {
        it('alors une chaîne est reconnue, même vide', () => {
            expect(estUneChaine('page-1.jpg')).toBe(true);
            expect(estUneChaine('')).toBe(true);
        });

        it.each([
            ['un nombre', 42],
            ['null', null],
            ['undefined', undefined],
            ['un objet', {}],
        ])('alors %s est refusé', (_cas, valeur) => {
            expect(estUneChaine(valeur)).toBe(false);
        });
    });

    describe('estUnTableauDeChaines', () => {
        it('alors un tableau de chaînes est reconnu, même vide', () => {
            expect(estUnTableauDeChaines(['a', 'b'])).toBe(true);
            expect(estUnTableauDeChaines([])).toBe(true);
        });

        it('alors un seul élément non-chaîne suffit à le refuser', () => {
            expect(estUnTableauDeChaines(['a', 2])).toBe(false);
            expect(estUnTableauDeChaines(['a', null])).toBe(false);
        });

        it('alors une chaîne seule n’est pas un tableau de chaînes', () => {
            expect(estUnTableauDeChaines('abc')).toBe(false);
        });
    });

    describe('estUnNombreFini', () => {
        it('alors un nombre fini est reconnu, zéro et négatifs compris', () => {
            expect(estUnNombreFini(42)).toBe(true);
            expect(estUnNombreFini(0)).toBe(true);
            expect(estUnNombreFini(-1.5)).toBe(true);
        });

        it.each([
            ['NaN', Number.NaN],
            ['Infinity', Number.POSITIVE_INFINITY],
            ['-Infinity', Number.NEGATIVE_INFINITY],
            ['une chaîne numérique', '42'],
            ['null', null],
        ])('alors %s est refusé', (_cas, valeur) => {
            expect(estUnNombreFini(valeur)).toBe(false);
        });
    });

    describe('estUnEntierPositif', () => {
        it('alors une dimension d’image plausible est reconnue', () => {
            expect(estUnEntierPositif(2481)).toBe(true);
            expect(estUnEntierPositif(1)).toBe(true);
        });

        it.each([
            ['zéro — une image de largeur nulle n’en est pas une', 0],
            ['un négatif', -100],
            ['un décimal', 1.5],
            ['NaN', Number.NaN],
            ['Infinity', Number.POSITIVE_INFINITY],
            ['une chaîne numérique', '100'],
        ])('alors %s est refusé', (_cas, valeur) => {
            expect(estUnEntierPositif(valeur)).toBe(false);
        });
    });

    describe('estUneDate', () => {
        it('alors une date utilisable est reconnue', () => {
            expect(estUneDate(new Date('2026-07-10T10:00:00Z'))).toBe(true);
        });

        it('alors une Date invalide est refusée — le clone structuré peut en rendre une', () => {
            expect(estUneDate(new Date('pas une date'))).toBe(false);
        });

        it.each([
            ['un horodatage en nombre', 1_752_141_600_000],
            ['une chaîne ISO', '2026-07-10T10:00:00Z'],
            ['null', null],
        ])('alors %s est refusé', (_cas, valeur) => {
            expect(estUneDate(valeur)).toBe(false);
        });
    });

    describe('estUnTampon', () => {
        it('alors un ArrayBuffer est reconnu', () => {
            expect(estUnTampon(new ArrayBuffer(8))).toBe(true);
        });

        it.each([
            ['une vue sur un tampon, qui n’en est pas un', new Uint8Array(8)],
            ['un Blob', new Blob(['x'])],
            ['null', null],
        ])('alors %s est refusé', (_cas, valeur) => {
            expect(estUnTampon(valeur)).toBe(false);
        });
    });
});
