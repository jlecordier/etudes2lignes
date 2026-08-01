import { describe, expect, it } from 'vitest';
import { newTrajetId, trajetIdFrom } from './ids';

describe('trajetIdFrom', () => {
    describe('Étant donné un identifiant que l’application a fabriqué, quand je le relis', () => {
        it('alors il est reconnu', () => {
            const identifier = newTrajetId();

            expect(trajetIdFrom(identifier)).toBe(identifier);
        });
    });

    describe('Étant donné une chaîne qui n’est pas un identifiant, quand je la relis', () => {
        it.each([
            ['une chaîne vide', ''],
            ['un mot', 'dernierTrajet'],
            ['un identifiant tronqué', '3f2504e0-4f89-11d3-9a0c-0305e82c33'],
            ['un identifiant avec un caractère interdit', '3f2504e0-4f89-11d3-9a0c-0305e82c33zz'],
            ['du JSON', '{"id":"3f2504e0-4f89-11d3-9a0c-0305e82c3301"}'],
        ])('alors %s est refusée', (_case, text) => {
            expect(trajetIdFrom(text)).toBeNull();
        });
    });

    describe('Étant donné un identifiant en majuscules, quand je le relis', () => {
        it('alors il est reconnu : seule la forme compte', () => {
            expect(trajetIdFrom('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe(
                '3F2504E0-4F89-11D3-9A0C-0305E82C3301',
            );
        });
    });
});

describe('newTrajetId', () => {
    describe('Étant donné deux fabrications, quand je les compare', () => {
        it('alors les identifiants diffèrent', () => {
            expect(newTrajetId()).not.toBe(newTrajetId());
        });
    });
});
