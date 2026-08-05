import { describe, expect, it } from 'vitest';
import { ratiosSum } from './overview';

// Deux formats qui n'ont rien à voir : un scan A4 à 300 dpi et un schéma
// panoramique. Un même trajet a plutôt des pages semblables, mais rien ne
// l'impose — et surtout pas l'aperçu.
const a4Portrait = { largeur: 2481, hauteur: 3508 };
const panoramique = { largeur: 8000, hauteur: 800 };

describe('ratiosSum', () => {
    describe('Étant donné une seule page', () => {
        it('alors la somme est le ratio de cette page', () => {
            expect(ratiosSum([{ largeur: 800, hauteur: 1200 }])).toBeCloseTo(1.5, 10);
        });
    });

    describe('Étant donné aucune page', () => {
        it('alors la somme est nulle', () => {
            // C'est ce zéro que l'écran teste avant d'écrire la propriété CSS :
            // sans lui, la feuille de style diviserait par zéro.
            expect(ratiosSum([])).toBe(0);
        });
    });

    describe('Étant donné des pages de ratios différents', () => {
        it('alors chaque page compte pour son propre ratio', () => {
            const pages = [a4Portrait, panoramique, a4Portrait];

            expect(ratiosSum(pages)).toBeCloseTo(3508 / 2481 + 0.1 + 3508 / 2481, 10);
        });
    });

    describe('Étant donné la largeur déduite de cette somme', () => {
        it('alors les hauteurs affichées remplissent exactement la hauteur disponible', () => {
            // La règle que la feuille de style applique : toutes les pages sont
            // posées à la même largeur, chacune garde son ratio, et le total
            // tient dans la hauteur — quel que soit le mélange de formats.
            const pages = [a4Portrait, panoramique, { largeur: 1000, hauteur: 1000 }];
            const availableHeight = 775;

            const width = availableHeight / ratiosSum(pages);
            const displayed = pages.reduce(
                (total, page) => total + (width * page.hauteur) / page.largeur,
                0,
            );

            expect(displayed).toBeCloseTo(availableHeight, 6);
        });
    });
});
