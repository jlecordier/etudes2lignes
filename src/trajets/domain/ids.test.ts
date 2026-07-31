import { describe, expect, it } from 'vitest';
import { nouveauTrajetId, trajetIdDepuis } from './ids';

describe('trajetIdDepuis', () => {
    describe('Étant donné un identifiant que l’application a fabriqué, quand je le relis', () => {
        it('alors il est reconnu', () => {
            const identifiant = nouveauTrajetId();

            expect(trajetIdDepuis(identifiant)).toBe(identifiant);
        });
    });

    describe('Étant donné une chaîne qui n’est pas un identifiant, quand je la relis', () => {
        it.each([
            ['une chaîne vide', ''],
            ['un mot', 'dernierTrajet'],
            ['un identifiant tronqué', '3f2504e0-4f89-11d3-9a0c-0305e82c33'],
            ['un identifiant avec un caractère interdit', '3f2504e0-4f89-11d3-9a0c-0305e82c33zz'],
            ['du JSON', '{"id":"3f2504e0-4f89-11d3-9a0c-0305e82c3301"}'],
        ])('alors %s est refusée', (_cas, texte) => {
            expect(trajetIdDepuis(texte)).toBeNull();
        });
    });

    describe('Étant donné un identifiant en majuscules, quand je le relis', () => {
        it('alors il est reconnu : seule la forme compte', () => {
            expect(trajetIdDepuis('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe(
                '3F2504E0-4F89-11D3-9A0C-0305E82C3301',
            );
        });
    });
});

describe('nouveauTrajetId', () => {
    describe('Étant donné deux fabrications, quand je les compare', () => {
        it('alors les identifiants diffèrent', () => {
            expect(nouveauTrajetId()).not.toBe(nouveauTrajetId());
        });
    });
});
