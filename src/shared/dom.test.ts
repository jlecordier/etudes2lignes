// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { query, queryAll } from './dom';

beforeEach(() => {
    document.body.innerHTML = `
        <section class="screen" id="screen-list"></section>
        <section class="screen" id="screen-editor"></section>
        <div id="dehors">
            <section class="screen" id="nested-screen"></section>
        </div>
        <p id="paragraphe">texte</p>
    `;
});

describe('requete', () => {
    describe('Étant donné un élément du type attendu, quand je le demande', () => {
        it("alors je l'obtiens", () => {
            expect(query('#paragraphe', HTMLParagraphElement).textContent).toBe('texte');
        });
    });

    describe("Étant donné un élément d'un autre type, quand je le demande", () => {
        it("alors c'est refusé en nommant le type trouvé", () => {
            expect(() => query('#paragraphe', HTMLButtonElement)).toThrow(
                "« #paragraphe » n'est pas un HTMLButtonElement (trouvé : P).",
            );
        });
    });

    describe('Étant donné un sélecteur qui ne trouve rien, quand je le demande', () => {
        it("alors c'est refusé en nommant le sélecteur", () => {
            expect(() => query('#absent', HTMLElement)).toThrow(
                'Élément introuvable pour le sélecteur « #absent ».',
            );
        });
    });
});

describe('queryAll', () => {
    describe('Étant donné plusieurs éléments du type attendu, quand je les demande tous', () => {
        it("alors je les obtiens dans l'ordre du document", () => {
            const screens = queryAll('.screen', HTMLElement);

            expect(screens.map((screen) => screen.id)).toEqual([
                'screen-list',
                'screen-editor',
                'nested-screen',
            ]);
        });
    });

    describe('Étant donné une racine, quand je demande tous les éléments', () => {
        it("alors la recherche s'y limite", () => {
            const dehors = query('#dehors', HTMLDivElement);

            expect(queryAll('.screen', HTMLElement, dehors).map((screen) => screen.id)).toEqual([
                'nested-screen',
            ]);
        });
    });

    describe('Étant donné aucun élément correspondant, quand je les demande tous', () => {
        it("alors j'obtiens une liste vide, sans erreur", () => {
            expect(queryAll('.introuvable', HTMLElement)).toEqual([]);
        });
    });

    describe('Étant donné un élément du mauvais type parmi les trouvés, quand je les demande tous', () => {
        it("alors c'est refusé en nommant l'élément fautif", () => {
            expect(() => queryAll('.screen', HTMLButtonElement)).toThrow(
                "« .screen » a trouvé un SECTION au lieu d'un HTMLButtonElement.",
            );
        });
    });
});
