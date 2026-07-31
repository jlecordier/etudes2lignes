// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { requete, requeteTous } from './dom';

beforeEach(() => {
    document.body.innerHTML = `
        <section class="ecran" id="ecran-liste"></section>
        <section class="ecran" id="ecran-editeur"></section>
        <div id="dehors">
            <section class="ecran" id="ecran-imbrique"></section>
        </div>
        <p id="paragraphe">texte</p>
    `;
});

describe('requete', () => {
    describe('Étant donné un élément du type attendu, quand je le demande', () => {
        it('alors je l’obtiens', () => {
            expect(requete('#paragraphe', HTMLParagraphElement).textContent).toBe('texte');
        });
    });

    describe('Étant donné un élément d’un autre type, quand je le demande', () => {
        it('alors c’est refusé en nommant le type trouvé', () => {
            expect(() => requete('#paragraphe', HTMLButtonElement)).toThrow(
                "« #paragraphe » n'est pas un HTMLButtonElement (trouvé : P).",
            );
        });
    });

    describe('Étant donné un sélecteur qui ne trouve rien, quand je le demande', () => {
        it('alors c’est refusé en nommant le sélecteur', () => {
            expect(() => requete('#absent', HTMLElement)).toThrow(
                'Élément introuvable pour le sélecteur « #absent ».',
            );
        });
    });
});

describe('requeteTous', () => {
    describe('Étant donné plusieurs éléments du type attendu, quand je les demande tous', () => {
        it('alors je les obtiens dans l’ordre du document', () => {
            const ecrans = requeteTous('.ecran', HTMLElement);

            expect(ecrans.map((ecran) => ecran.id)).toEqual([
                'ecran-liste',
                'ecran-editeur',
                'ecran-imbrique',
            ]);
        });
    });

    describe('Étant donné une racine, quand je demande tous les éléments', () => {
        it('alors la recherche s’y limite', () => {
            const dehors = requete('#dehors', HTMLDivElement);

            expect(requeteTous('.ecran', HTMLElement, dehors).map((ecran) => ecran.id)).toEqual([
                'ecran-imbrique',
            ]);
        });
    });

    describe('Étant donné aucun élément correspondant, quand je les demande tous', () => {
        it('alors j’obtiens une liste vide, sans erreur', () => {
            expect(requeteTous('.introuvable', HTMLElement)).toEqual([]);
        });
    });

    describe('Étant donné un élément du mauvais type parmi les trouvés, quand je les demande tous', () => {
        it('alors c’est refusé en nommant l’élément fautif', () => {
            expect(() => requeteTous('.ecran', HTMLButtonElement)).toThrow(
                "« .ecran » a trouvé un SECTION au lieu d'un HTMLButtonElement.",
            );
        });
    });
});
