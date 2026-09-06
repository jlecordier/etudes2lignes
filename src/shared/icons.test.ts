// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createIcon, mountIcons } from './icons';

describe('createIcon', () => {
    describe('Étant donné un nom de symbole, quand je fabrique son pictogramme', () => {
        it('alors il désigne ce symbole du jeu', () => {
            const icone = createIcon('trash');

            expect(icone.querySelector('use')?.getAttribute('href')).toBe('#i-trash');
        });
    });
});

/**
 * Tout ce qui compose l'interface, lu tel quel.
 *
 * Deux choses échappent au compilateur et se valent : un emoji resté dans un
 * gabarit ou un intitulé, et un `<use href="#i-…">` qui ne désigne rien. Ni le
 * type fermé `IconName` ni le navigateur ne les signalent — le bouton s'affiche
 * simplement vide, ou polychrome sur du verre monochrome.
 */
const interfaceSources: Record<string, string> = import.meta.glob(
    ['../**/*.html', '../**/*.ts', '../../index.html'],
    { query: '?raw', eager: true, import: 'default' },
);

/** Les sources qui décrivent l'interface : ni les tests, ni le jeu lui-même. */
function gabaritsEtEcrans(): [string, string][] {
    return Object.entries(interfaceSources).filter(
        ([chemin]) => !chemin.endsWith('.test.ts') && !chemin.endsWith('Icons.html'),
    );
}

/**
 * La source débarrassée de ses commentaires.
 *
 * Ce qu'on traque est ce que l'interface **montre**, pas ce que la prose écrit :
 * « une hauteur sur une image ↔ une coordonnée » est un commentaire du domaine,
 * et un témoin qui le refuserait obligerait à appauvrir la prose pour satisfaire
 * une règle sur les pictogrammes.
 */
function sansCommentaires(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ');
}

describe("Les pictogrammes de l'interface", () => {
    describe('Étant donné les sources des écrans, quand elles montrent un pictogramme', () => {
        it("alors c'est un symbole du jeu, et jamais un emoji", () => {
            const emojis = gabaritsEtEcrans().flatMap(([chemin, source]) =>
                [...sansCommentaires(source).matchAll(/\p{Extended_Pictographic}/gu)].map(
                    (trouve) => `${chemin} : ${trouve[0]}`,
                ),
            );

            expect(emojis).toEqual([]);
        });
    });
});

describe('mountIcons', () => {
    describe('Étant donné un document sans jeu de symboles, quand je le pose', () => {
        it('alors les symboles que les pictogrammes désignent deviennent atteignables', () => {
            document.body.replaceChildren();

            mountIcons();

            expect(document.getElementById('i-trash')).not.toBeNull();
        });
    });
});
