import { describe, expect, it } from 'vitest';
import { NomDeTrajet } from './NomDeTrajet';

describe('NomDeTrajet', () => {
    describe('Étant donné un nom non vide', () => {
        it('alors le nom est créé', () => {
            expect(NomDeTrajet.create('Paris → Bordeaux ERTMS').value).toBe(
                'Paris → Bordeaux ERTMS',
            );
        });
    });

    describe("Étant donné un nom entouré d'espaces", () => {
        it('alors les espaces superflus sont retirés', () => {
            expect(NomDeTrajet.create('  Paris → Bordeaux  ').value).toBe('Paris → Bordeaux');
        });
    });

    describe("Étant donné un nom vide ou fait uniquement d'espaces", () => {
        it('alors la création est refusée', () => {
            expect(() => NomDeTrajet.create('')).toThrow('Nom de trajet invalide');
            expect(() => NomDeTrajet.create('   ')).toThrow('Nom de trajet invalide');
        });
    });
});
