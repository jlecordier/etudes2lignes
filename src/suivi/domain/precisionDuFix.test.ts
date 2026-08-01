import { describe, expect, it } from 'vitest';
import { PRECISION_MAXIMALE_METRES, usableFix } from './precisionDuFix';
import { SEUIL_MINIMUM_METRES } from './projection';

describe('fixUtilisable', () => {
    describe('Étant donné un fix de plein ciel (30 m)', () => {
        it('alors il est utilisable', () => {
            expect(usableFix(30)).toBe(true);
        });
    });

    describe('Étant donné un fix approximatif (2 km : cellule, vitres athermiques)', () => {
        it('alors il est utilisable : mieux vaut une position approchée que « signal perdu »', () => {
            expect(usableFix(2_000)).toBe(true);
        });
    });

    describe('Étant donné un fix pile à la limite de précision', () => {
        it('alors il est encore utilisable, et un mètre au-delà ne l’est plus', () => {
            expect(usableFix(PRECISION_MAXIMALE_METRES)).toBe(true);
            expect(usableFix(PRECISION_MAXIMALE_METRES + 1)).toBe(false);
        });
    });

    describe('Étant donné le lien entre la précision tolérée et le seuil « hors trajet »', () => {
        it('alors le pire fix utilisable reste en-deçà du seuil « hors trajet » : son imprécision seule ne peut pas faire croire qu’on a quitté la ligne', () => {
            expect(PRECISION_MAXIMALE_METRES).toBeLessThan(SEUIL_MINIMUM_METRES);
            expect(usableFix(SEUIL_MINIMUM_METRES)).toBe(false);
        });
    });
});
