import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Le palier sémantique, pour les deux témoins qui doivent y suivre une
 * dérivation : `--fond-groupe` et `--verre` ne sont plus, dans `feuille`, que
 * des alias (`legacy-bridge.css`) vers `--color-background-grouped` et
 * `--material-regular` — c'est là, et non plus ici, que la garantie se lit.
 */
const semantique = readFileSync(new URL('./tokens/semantic.css', import.meta.url), 'utf8');

/**
 * Le socle d'éléments, pour les témoins dont la règle a émigré hors de
 * `feuille` : `html`, `body` et leurs défauts vivent maintenant dans
 * `base/elements.css`, la tâche 6 les en ayant sortis.
 */
const socle = readFileSync(new URL('./base/elements.css', import.meta.url), 'utf8');

/**
 * Le matériau, pour les témoins dont la règle a émigré hors de `feuille` :
 * le `@supports` qui pose le verre et sa retraction d'accessibilité vivent
 * maintenant dans `components/surface.css`, la tâche 1 de la partie 2 les en
 * ayant sortis. `styles.test.ts` porte désormais le contrat neuf (un seul
 * fichier qui floute, la préfixée à la lettre, aucun `var()` dans le flou) ;
 * les témoins d'ici restent parce qu'ils affirment autre chose que ce
 * contrat-là — la liste close des surfaces, et la non-superposition du verre.
 */
const materiau = readFileSync(new URL('./components/surface.css', import.meta.url), 'utf8');

/**
 * La barre d'écran, pour les témoins dont la règle a émigré hors de
 * `feuille` : `.header` et `.suivi-bar` fusionnent leur socle commun dans
 * `components/bar.css`, la tâche 2 de la partie 2 les en ayant sortis —
 * `styles.test.ts` porte désormais le contrat neuf (un seul jeton pour la
 * hauteur, aucun modificateur n'y touche) ; les témoins d'ici restent parce
 * qu'ils affirment autre chose que ce contrat-là — le détail des propriétés
 * de chaque barre, que la fusion ne devait pas changer.
 */
const bar = readFileSync(new URL('./components/bar.css', import.meta.url), 'utf8');

/**
 * La famille des contrôles, pour les témoins dont la règle a émigré hors de
 * `feuille` : `button`, `.icon`, `.action-bar`, `.image-bar`,
 * `.point-actions` et les six contrôles flottants ont rejoint
 * `components/button.css`, `components/button-group.css` et
 * `components/floating-action.css` (tâche 3 de la partie 2). `styles.test.ts`
 * porte le contrat neuf (le verre sur le groupe, jamais l'enfant ; le rayon
 * intérieur qui se calcule ; la cible plancher sur les deux dimensions) ; les
 * témoins d'ici restent parce qu'ils affirment autre chose — le détail des
 * propriétés que le déplacement ne devait pas changer.
 */
const boutonCss = readFileSync(new URL('./components/button.css', import.meta.url), 'utf8');
const groupeCss = readFileSync(new URL('./components/button-group.css', import.meta.url), 'utf8');
const flottantCss = readFileSync(
    new URL('./components/floating-action.css', import.meta.url),
    'utf8',
);

/**
 * La rangée de liste, pour le témoin dont la règle a émigré hors de
 * `feuille` : `trajet-row` a rejoint `components/row.css` (tâche 4 de la
 * partie 2), qui ne le partage plus avec `point-row` (jamais posé par aucun
 * gabarit) ni `.list-error` (`components/panel.css`) — chacun porte
 * désormais sa propre règle.
 */
const rowCss = readFileSync(new URL('./components/row.css', import.meta.url), 'utf8');

/**
 * La carte plein écran, pour les témoins dont la règle a émigré hors de
 * `feuille` : `#carte-container`, `.carte-bar`, la réconciliation Leaflet et
 * `--large-screen` ont rejoint `components/map-overlay.css` (tâche 5 de la
 * partie 2).
 */
const carteOverlay = readFileSync(new URL('./components/map-overlay.css', import.meta.url), 'utf8');

/**
 * L'écran de suivi, pour le témoin dont la règle a émigré hors de `feuille` :
 * `.guide-line` a rejoint `screens/suivi.css` (tâche 5 de la partie 2).
 */
const suivi = readFileSync(new URL('./screens/suivi.css', import.meta.url), 'utf8');

/**
 * Rend la valeur **effective** d'une propriété de `.icon`, un `var()` résolu.
 *
 * Écrire `/\.icon\s*\{[^}]*stroke:\s*currentcolor/` ne marche plus depuis que
 * la règle porte un jeton : `[^}]*` avale jusqu'à `--icon-` et la sous-chaîne
 * `stroke: currentcolor` du **nom de la propriété personnalisée** satisfait le
 * motif. Mesuré : le témoin restait vert sur un `stroke: red`, c'est-à-dire à
 * travers une régression qui aurait peint tous les pictogrammes de la mauvaise
 * couleur. Le `(?<![\w-])` est ce qui distingue la propriété de son jeton.
 *
 * La résolution ne descend que d'un niveau, et c'est assez : le contrat est que
 * le tracé vaille la couleur courante, pas qu'il passe par un nom précis. Une
 * réécriture qui supprimerait le jeton pour réécrire `stroke: currentcolor`
 * directement doit rester verte — vérifié.
 */
const valeurEffectiveDeLIcone = (css: string, propriete: string): string | undefined => {
    const bloc = /\.icon\s*\{([^}]*)\}/s.exec(css)?.[1] ?? '';
    const brut = new RegExp(`(?<![\\w-])${propriete}:\\s*([^;]+);`, 'i').exec(bloc)?.[1]?.trim();
    if (brut === undefined) {
        return undefined;
    }
    const jeton = /^var\(\s*(--[\w-]+)\s*\)$/.exec(brut)?.[1];
    if (jeton === undefined) {
        return brut.toLowerCase();
    }
    return new RegExp(`${jeton}:\\s*([^;]+);`, 'i').exec(bloc)?.[1]?.trim().toLowerCase();
};

/**
 * Ce fichier éprouve la **source** de la feuille de style, et non son effet.
 *
 * Une feuille n'a pas de test unitaire : rien n'y est appelé. Mais plusieurs de
 * ses règles ne sont pas décoratives — le TypeScript lit des variables qu'elle
 * pose, les parcours e2e lisent des styles calculés, et la géométrie du suivi
 * repose sur des boîtes sans marge. Ces règles-là sont un **contrat**, et un
 * contrat sans témoin se rompt à la première refonte.
 *
 * Relire le texte est grossier, et c'est le prix à payer pour que ces liens
 * cessent d'être tacites : jsdom n'applique aucune feuille externe, et un vrai
 * navigateur ne dirait rien d'une règle simplement absente.
 */

/**
 * « Les couleurs de la feuille » et « La couverture de l'apparence sombre »
 * vivaient ici et affirmaient respectivement : aucune couleur littérale hors
 * des jetons, et aucune redéfinition de jeton dans une requête d'apparence.
 * Les deux lisaient `feuille`, qui ne porte plus aucune règle depuis la
 * tâche 5 — les garder aurait été affirmer un invariant devenu vrai par
 * vacuité, sur un fichier vide, pour toujours : exactement le défaut de
 * témoin que cette série de tâches a appris à reconnaître. Le premier
 * invariant n'a plus de témoin dédié — chaque composant écrit ses couleurs en
 * jetons, et `styles.test.ts` affirme déjà qu'un seul fichier peut flouter,
 * qu'aucune surface n'en superpose une autre, etc., sans qu'un test générique
 * « aucune couleur littérale nulle part » ait jamais existé au niveau du
 * système. Le second est toujours vrai, mais pour une raison structurelle :
 * `tokens/semantic.css` porte les deux apparences dans une seule déclaration
 * `light-dark()` par jeton, et l'unique `@media (prefers-color-scheme: dark)`
 * restant dans le système (`components/map-overlay.css`, testé plus loin dans
 * « Les tuiles de la carte ») redéfinit un `filter`, jamais un jeton de
 * couleur.
 */

describe('Les pictogrammes', () => {
    describe('Étant donné un symbole du jeu, quand une règle doit le dessiner', () => {
        it('alors la feuille lui donne son tracé et sa taille, que le jeu ne porte pas', () => {
            // `Icons.html` ne déclare ni épaisseur, ni bouts, ni dimension : un
            // `<svg>` sans taille sort en 300 × 150, et un tracé sans `fill:
            // none` sort en noir plein. Sans cette règle, chaque bouton de
            // l'interface affiche un pavé.
            // `.icon` a émigré vers `components/button.css` (tâche 3 de la
            // partie 2) : c'est `boutonCss` qui le porte désormais.
            expect(valeurEffectiveDeLIcone(boutonCss, 'fill')).toBe('none');
            // La valeur effective, jeton résolu, et en minuscules : le contrat
            // est un tracé de la couleur courante, pas l'orthographe de
            // `currentcolor` que Stylelint choisit ni le nom du jeton qui la porte.
            expect(valeurEffectiveDeLIcone(boutonCss, 'stroke')).toBe('currentcolor');
            expect(boutonCss).toMatch(/\.icon\s*\{[^}]*inline-size:/s);
        });
    });
});

describe('Les contrôles', () => {
    describe('Étant donné un bouton, quand la feuille lui donne sa forme', () => {
        it('alors il est une gélule, et sa cible atteint les 44 px de la HIG', () => {
            // « Default every button to a capsule » : c'est la forme que le
            // système donne aux contrôles, et `DefaultGlassEffectShape` est
            // littéralement une capsule. Les 6 px d'avant étaient la valeur la
            // plus étrangère de toute la feuille.
            //
            // « A button needs a hit region of at least 44x44 pt » : le bouton
            // d'avant faisait 37 px de haut. `button` a émigré vers
            // `components/button.css` (tâche 3 de la partie 2), qui porte
            // désormais le rayon et la cible sur un jeton de système plutôt
            // que sur ces deux littéraux — `styles.test.ts` (« famille des
            // contrôles ») affirme le contrat neuf sur les deux dimensions.
            const bouton = /\n[ \t]*button\s*\{([^}]*)\}/s.exec(boutonCss);

            expect(bouton?.[1]).toMatch(/border-radius:\s*var\(--radius-pill\)/);
            expect(bouton?.[1]).toMatch(/min-block-size:\s*var\(--hit-target\)/);
        });
    });
});

describe('Le contour des contrôles', () => {
    describe("Étant donné un bouton, quand la feuille décide s'il porte un trait", () => {
        it("alors il n'en porte aucun : c'est son remplissage qui le délimite", () => {
            // Un contrôle d'iOS n'a pas de contour propre — c'est sa surface qui
            // le dessine, teintée pour l'action principale et neutre sinon. La
            // bordure d'avant doublait le fond de la même couleur sur le bouton
            // principal, et cerclait de bleu les secondaires, dont la HIG veut
            // justement qu'ils s'effacent. Lu depuis `boutonCss`, comme ci-dessus.
            const bouton = /\n[ \t]*button\s*\{([^}]*)\}/s.exec(boutonCss);

            expect(bouton?.[1]).toMatch(/border:\s*none/);
        });
    });
});

describe('Les conteneurs de carte face aux panneaux de Leaflet', () => {
    describe('Étant donné un conteneur de carte, quand la feuille le positionne', () => {
        it("alors il ouvre son propre contexte d'empilement, sinon ses panneaux s'en échappent", () => {
            // Les panneaux de Leaflet portent `z-index: 400`. Un conteneur
            // positionné mais en `z-index: auto` n'ouvre **aucun** contexte
            // d'empilement : ces 400 remontent alors dans celui du parent et
            // battent tout ce que l'application pose au-dessus.
            //
            // Mesuré : le formulaire de saisie, à `z-index: 10`, était
            // intégralement recouvert par les tuiles — invisible, alors que sa
            // boîte et son fond étaient corrects.
            // Lu depuis `carteOverlay` : les deux règles ont émigré vers
            // `components/map-overlay.css` (tâche 5 de la partie 2), et c'est
            // lui qui les porte désormais — plus `feuille`.
            for (const conteneur of ['#carte-container', '.carte-points']) {
                const regle = new RegExp(`\\n[ \\t]*\\${conteneur} \\{([^}]*)\\}`).exec(
                    carteOverlay,
                );

                expect(regle?.[1]).toMatch(/position:\s*(absolute|relative)/);
                expect(regle?.[1]).toMatch(/z-index:\s*0/);
            }
        });
    });
});

describe('Le bord de défilement sous une barre', () => {
    describe('Étant donné du contenu qui passe sous une barre, quand il en approche', () => {
        it("alors une bande le fond, et elle n'assombrit ni ne bloque rien", () => {
            // « Instead of a background, use a scroll edge effect to provide a
            // transition between content and the control area », et la HIG
            // insiste : « They don't block or darken like overlays; they exist
            // to ensure controls stay visually distinct. »
            //
            // C'est donc un dégradé **de la couleur du fond vers rien**, pas un
            // voile. Il appartient au défilement, pas à la barre : d'où une
            // bande posée sous elle, transparente aux clics, qui laisse le
            // contenu passer dessous sans l'intercepter.
            //
            // Lu depuis `bar` : la règle a émigré vers `components/bar.css`
            // (tâche 2 de la partie 2), et c'est lui qui la porte désormais —
            // plus `feuille`. Son sélecteur s'est aussi simplifié : `.bar`,
            // posé sur les deux barres à la fois, la porte seule là où
            // `.header::after,\n.suivi-bar::after` la portait à deux.
            const bande = /\n[ \t]*\.bar::after \{([^}]*)\}/.exec(bar);

            expect(bande?.[1]).toMatch(/pointer-events:\s*none/);
            expect(bande?.[1]).toMatch(/linear-gradient\(\s*to bottom,\s*var\(--fond/);
            expect(bande?.[1]).toMatch(/top:\s*100%/);
        });
    });
});

describe('Une barre de navigation sur un petit iPhone', () => {
    describe('Étant donné 360 px de large, quand la barre porte un titre et deux actions', () => {
        it('alors rien ne plie : le titre abrège et la barre garde une rangée', () => {
            // Mesuré sur un iPhone 12 mini, la plus étroite des cibles de la HIG
            // (360 × 780) : « Mes trajets » passait à deux lignes, la barre
            // d'actions se cassait en deux rangées, et l'en-tête doublait de
            // hauteur. La règle de `.header` est sans `flex-wrap` exprès — mais
            // l'abrègement ne visait que `h2`, et la barre d'actions imbriquée
            // pliait pour son propre compte.
            //
            // Le titre a émigré vers `components/bar.css` (tâche 2 de la
            // partie 2), qui le porte désormais — plus `feuille`. La barre
            // d'actions imbriquée a émigré à son tour, avec `.action-bar`
            // elle-même, vers `components/button-group.css` (tâche 3) : les
            // deux vivent maintenant dans la même couche, et la dette qui les
            // séparait (l'une postée un temps dans `components/bar.css`,
            // l'autre restée dans `screens/legacy.css`, `components` perdant
            // face à `screens` quelle que soit la spécificité) est refermée —
            // voir l'en-tête de `button-group.css`.
            const titre = /\n[ \t]*\.header :is\(h1, h2\) \{([^}]*)\}/.exec(bar);
            const actions = /\n[ \t]*\.header \.action-bar \{([^}]*)\}/.exec(groupeCss);

            expect(titre?.[1]).toMatch(/text-overflow:\s*ellipsis/);
            expect(actions?.[1]).toMatch(/flex-wrap:\s*nowrap/);
        });
    });
});

describe("L'action qui conclut, dans une barre", () => {
    describe("Étant donné une barre où une action conclut, quand la feuille l'habille", () => {
        it('alors elle garde sa teinte, que la règle des pairs lui avait prise', () => {
            // Régression mesurée : `.action-bar button` neutralise les actions de
            // même rang de l'éditeur — à juste titre —, mais elle attrapait aussi
            // « Nouveau trajet », l'action proéminente de la liste. Cet écran
            // n'en avait alors plus **aucune**, et plus rien ne disait laquelle
            // compte.
            //
            // Dans une **barre**, ce qui n'est pas `.secondary` est l'action qui
            // conclut : le sélecteur le dit, et sa spécificité le fait gagner
            // contre la règle des pairs.
            // Lu depuis `groupeCss` : la règle a émigré vers
            // `components/button-group.css` (tâche 5 de la partie 2), à côté
            // de la règle des pairs qu'elle bat — plus `feuille`.
            const proeminente =
                /\n[ \t]*\.header \.action-bar button:not\(\.secondary\) \{([^}]*)\}/.exec(
                    groupeCss,
                );

            expect(proeminente?.[1]).toMatch(/background:\s*var\(--accent\)/);
        });
    });
});

/**
 * « La hauteur des barres » et « Le filet sous une barre d'écran » vivaient
 * ici et affirmaient respectivement : un seul jeton rythme les deux barres,
 * et l'effet de bord remplace tout filet. Les deux règles qu'elles lisaient
 * (`.header,\n.suivi-bar { padding-block: var(--air-barre) }` et
 * `.header::after,\n.suivi-bar::after { … }`) ont émigré vers
 * `components/bar.css` (tâche 2 de la partie 2), et leur contrat y est
 * repris — en mieux : `styles.test.ts` (« La barre d'écran ») affirme
 * désormais qu'un seul jeton porte la hauteur (`--bar-air`/`--bar-height`,
 * comptés dans tout le fichier) **et** qu'aucun modificateur n'y touche, ce
 * qu'aucun des deux témoins d'ici ne vérifiait. Les garder ici aurait
 * doublé, pour rien, une garantie désormais plus stricte ailleurs.
 */

describe('La teinte du verre au repos', () => {
    describe("Étant donné une barre sur un écran qu'on n'a pas encore fait défiler", () => {
        it('alors sa teinte se dérive du même fond que la page, donc elle ne se voit pas', () => {
            // « **Instead of a background**, use a scroll edge effect to provide
            // a transition between content and the control area. » Au repos, une
            // barre d'iOS n'a pas de fond : elle laisse voir celui du contenu, et
            // le matériau n'apparaît que lorsque quelque chose passe dessous.
            //
            // Une teinte blanche sur un fond gris clair formait une bande visible
            // avant tout défilement — l'anti-motif exact.
            //
            // Le contrat ne se lit plus dans **cette** feuille : `--fond-groupe`
            // et `--verre` y sont désormais de simples alias (`legacy-bridge.css`)
            // vers `--color-background-grouped` et `--material-regular`, qui
            // vivent au palier sémantique. La garantie qu'ils ne peuvent pas
            // diverger n'est donc plus une égalité de canaux recopiés à comparer
            // après coup, mais une dérivation depuis la **même primitive**, dans
            // chaque branche `light-dark()` : `--material-regular` ne recopie
            // pas une couleur, il l'obtient de la primitive dont
            // `--color-background-grouped` dérive lui aussi.
            const groupe =
                /--color-background-grouped:\s*light-dark\(\s*var\((--[a-z0-9-]+)\)\s*,\s*var\((--[a-z0-9-]+)\)\s*\)/.exec(
                    semantique,
                );
            const verre =
                /--material-regular:\s*light-dark\(\s*rgb\(from var\((--[a-z0-9-]+)\)[\s\S]*?,\s*rgb\(from var\((--[a-z0-9-]+)\)/.exec(
                    semantique,
                );

            expect(groupe?.[1]).toBeTruthy();
            expect(verre?.[1]).toBe(groupe?.[1]);
            expect(verre?.[2]).toBe(groupe?.[2]);
        });
    });
});

describe('La barre de navigation elle-même', () => {
    describe("Étant donné un écran qui défile, quand sa barre d'en-tête le surplombe", () => {
        it('alors elle est épinglée et pleine largeur, sinon son verre ne surplombe rien', () => {
            // « Liquid Glass forms a distinct functional layer […] that **floats
            // above** the content layer. » Mesuré : la barre était en
            // `position: static`, donc elle défilait avec le contenu — rien ne
            // passait jamais dessous, et son flou n'échantillonnait rien. Du
            // verre sans objet.
            //
            // Et elle était encartée de 17 px de chaque côté par le rembourrage
            // de l'écran : une carte flottante, pas une barre. Les marges
            // négatives l'annulent, le rembourrage interne lui rend son air.
            //
            // Lu depuis `bar` : `.header` a émigré vers `components/bar.css`
            // (tâche 2 de la partie 2), qui la porte désormais — plus
            // `feuille`. Le socle sticky et le rembourrage horizontal sont
            // maintenant partagés avec `.suivi-bar` sous un troisième nom,
            // `.bar`, posé sur les deux gabarits à côté de leur sélecteur
            // hérité ; la marge négative, elle, reste propre à l'en-tête et
            // vit dans `.bar-navigation`, son modificateur.
            const socle = /\n[ \t]*\.bar \{([^}]*)\}/.exec(bar);
            const navigation = /\n[ \t]*\.bar-navigation \{([^}]*)\}/.exec(bar);

            expect(socle?.[1]).toMatch(/position:\s*sticky/);
            expect(socle?.[1]).toMatch(/padding-inline:\s*var\(--marge-ecran\)/);
            expect(navigation?.[1]).toMatch(/margin-inline:\s*calc\(-1 \* var\(--marge-ecran\)\)/);
        });
    });
});

/**
 * « Le titre d'une barre de navigation » affirmait ici que le titre prend
 * Headline (taille, graisse) plutôt que le style d'un titre de contenu. La
 * règle qu'elle lisait (`.header :is(h1, h2) { font-size: … }`) a quitté
 * `components/bar.css` : le triplet Headline se consomme désormais en
 * portant `.text-headline` (règle des paliers — un composant ne référence
 * que le palier sémantique, et `components/text.css` dit lui-même que ses
 * trois jetons ne s'écrivent qu'à cet endroit). Le contrat ne se lit donc
 * plus dans une feuille de style, mais dans le balisage : « alors son titre
 * porte le style Headline du système, pas ses propres jetons », dans
 * `TrajetsListScreen.test.ts` et `TrajetEditorScreen.test.ts`.
 */

describe("Le titre d'un en-tête", () => {
    describe("Étant donné un nom trop long pour la barre, quand l'en-tête le pose", () => {
        it("alors il s'abrège, car c'est la ligne qui ne doit pas se casser", () => {
            // La règle de `.header` est délibérément sans `flex-wrap`, et son
            // commentaire dit pourquoi : à trois éléments sur un téléphone,
            // plier les envoyait sur trois lignes. Mais alors c'est au **titre**
            // de céder — sans quoi il se casse en deux et fait grandir la barre
            // de tout ce qu'on voulait lui épargner.
            //
            // Lu depuis `bar` : la règle a émigré vers `components/bar.css`
            // (tâche 2 de la partie 2), et c'est lui qui la porte désormais —
            // plus `feuille`.
            const titre = /\n[ \t]*\.header :is\(h1, h2\) \{([^}]*)\}/.exec(bar);

            expect(titre?.[1]).toMatch(/white-space:\s*nowrap/);
            expect(titre?.[1]).toMatch(/text-overflow:\s*ellipsis/);
        });
    });
});

describe('Les contrôles de la carte', () => {
    describe('Étant donné le recentrage et le zoom, quand la feuille les dessine', () => {
        it('alors ils partagent une seule règle, donc une seule boîte', () => {
            // Le recentrage vit dans un `.leaflet-bar`, comme le zoom : c'est la
            // colonne qui porte la surface, et ses enfants n'en ont pas. Les
            // traiter séparément donnait une gélule de 44 px dans une boîte
            // carrée — un rond dans un carré — et surtout **du verre sur du
            // verre**, que la HIG refuse : « avoid overcrowding or layering
            // Liquid Glass elements on top of each other ».
            // Lu depuis `carteOverlay` : la règle a émigré vers
            // `components/map-overlay.css` (tâche 5 de la partie 2), et c'est
            // lui qui la porte désormais — plus `feuille`.
            const partagee = /\n[ \t]*\.leaflet-bar a,\n[ \t]*\.carte-recentrer \{([^}]*)\}/.exec(
                carteOverlay,
            );

            expect(partagee?.[1]).toMatch(/inline-size:\s*34px/);
            expect(partagee?.[1]).toMatch(/block-size:\s*34px/);
            expect(partagee?.[1]).toMatch(/background:\s*none/);
        });
    });
});

describe('Les tuiles de la carte', () => {
    describe("Étant donné une carte qui porte de l'information par-dessus, quand la feuille l'habille", () => {
        it("alors ses tuiles s'assourdissent, et s'assombrissent avec l'apparence", () => {
            // « Consider using the muted emphasis style […] when you overlay
            // information-rich content on the map » : cette carte porte des
            // pastilles numérotées et un disque de position, elle ne doit pas
            // leur faire concurrence.
            //
            // En apparence sombre, OpenStreetMap ne sert **aucun** jeu de tuiles
            // nocturne : on inverse et on recolore, faute de mieux. Un rectangle
            // éclatant dans une interface noire est le défaut le plus visible
            // qui reste.
            //
            // Le filtre va sur `.leaflet-tile-pane`, et surtout pas sur le
            // conteneur : un `filter` sur un ancêtre du verre en annulerait le
            // flou. Le panneau des contrôles est un frère du panneau des tuiles,
            // donc il y échappe.
            // Lu depuis `carteOverlay` : les deux règles ont émigré vers
            // `components/map-overlay.css` (tâche 5 de la partie 2), qui reste
            // désormais le seul endroit du système où un `@media
            // (prefers-color-scheme: dark)` s'écrit — plus `feuille`.
            const tuiles = /\n[ \t]*\.leaflet-tile-pane \{([^}]*)\}/.exec(carteOverlay);
            const sombre =
                /@media \(prefers-color-scheme: dark\) \{\s*\.leaflet-tile-pane \{([^}]*)\}/.exec(
                    carteOverlay,
                );

            expect(tuiles?.[1]).toMatch(/filter:\s*saturate\(/);
            expect(sombre?.[1]).toMatch(/filter:\s*invert\(/);
        });
    });
});

describe('La carte de saisie de coordonnée', () => {
    describe("Étant donné le choix d'une coordonnée, quand la feuille dispose l'écran", () => {
        it('alors la carte occupe tout, et le formulaire flotte au-dessus', () => {
            // « Extend content to fill the screen or window […] Controls and
            // navigation components appear **on top of** content rather than on
            // the same plane. » Le formulaire était une rangée *sous* la carte,
            // qui lui prenait sa hauteur : c'est le seul écran où la carte est le
            // sujet, et elle n'en occupait pas le bas.
            // Lu depuis `carteOverlay` : les deux règles ont émigré vers
            // `components/map-overlay.css` (tâche 5 de la partie 2), et c'est
            // lui qui les porte désormais — plus `feuille`.
            const conteneur = /\n[ \t]*#carte-container \{([^}]*)\}/.exec(carteOverlay);
            const barre = /\n[ \t]*\.carte-bar \{([^}]*)\}/.exec(carteOverlay);

            expect(conteneur?.[1]).toMatch(/position:\s*absolute/);
            expect(conteneur?.[1]).toMatch(/inset:\s*0/);
            expect(barre?.[1]).toMatch(/position:\s*absolute/);
            expect(barre?.[1]).toMatch(/inset-block-end:/);
        });
    });
});

describe('Un bouton dans une barre', () => {
    describe('Étant donné une barre qui porte déjà une surface, quand un bouton y entre', () => {
        it("alors il n'en apporte pas une seconde : seule l'action proéminente garde sa gélule", () => {
            // « Put the glass on the group, not on each button » : dans une
            // barre, les items sont monochromes et partagent la surface de la
            // barre. « Trajets » y montrait une pastille grise et « Suivre » une
            // pastille bleue — deux surfaces empilées sur le verre, ce que la
            // HIG refuse, et exactement ce qui faisait que l'en-tête n'avait pas
            // le bon style.
            //
            // L'exception est nommée : `:not(.secondary)` est l'action
            // proéminente, une par barre, et elle garde sa teinte — « apply
            // color to the background rather than to symbols or text ».
            //
            // La règle groupée d'origine s'est scindée en deux, une par
            // couche : `.header`/`.suivi-bar`/`.carte-bar button.secondary`
            // vivent désormais dans `components/bar.css` — les trois barres
            // sont maintenant toutes trois des composants (tâche 5) — et
            // `.point-actions button`/`.image-bar button` ont émigré vers
            // `components/button-group.css` (tâche 3) avec leurs groupes.
            const barre =
                /\n[ \t]*\.header button\.secondary,\n[ \t]*\.suivi-bar button\.secondary,\n[ \t]*\.carte-bar button\.secondary \{([^}]*)\}/.exec(
                    bar,
                );
            const groupe =
                /\n[ \t]*\.point-actions button,\n[ \t]*\.image-bar button \{([^}]*)\}/.exec(
                    groupeCss,
                );

            expect(barre?.[1]).toMatch(/background:\s*none/);
            expect(barre?.[1]).toMatch(/color:\s*var\(--label\)/);
            expect(groupe?.[1]).toMatch(/background:\s*none/);
            expect(groupe?.[1]).toMatch(/color:\s*var\(--label\)/);
        });
    });
});

describe("Une barre d'actions", () => {
    describe('Étant donné plusieurs actions de même rang, quand la feuille les habille', () => {
        it("alors aucune n'est teintée : ce sont des pairs, et la proéminente est ailleurs", () => {
            // « Keep the number of prominent buttons to one or two per view. » Sur
            // l'éditeur la proéminente est « Suivre », dans l'en-tête ; les trois
            // actions de la barre sont des pairs. Teintées toutes les trois, elles
            // faisaient quatre aplats bleus sur un écran, et plus rien ne disait
            // laquelle compte.
            //
            // « Use style — not size — to visually distinguish the preferred
            // choice » : elles gardent donc leur taille et perdent leur teinte.
            // `.action-bar button` a émigré vers `components/button-group.css`
            // (tâche 3), avec `.action-bar` elle-même.
            const barre = /\n[ \t]*\.action-bar button \{([^}]*)\}/.exec(groupeCss);

            expect(barre?.[1]).toMatch(/background:\s*color-mix\(/);
            expect(barre?.[1]).toMatch(/color:\s*var\(--accent\)/);
        });
    });
});

describe("L'ordre des actions dans le panneau de saisie", () => {
    describe('Étant donné une annulation et une validation, quand le panneau les range', () => {
        it("alors la validation part du côté sortant, et l'annulation reste du côté entrant", () => {
            // « Only specify one primary action », et les barres d'outils la
            // placent du côté **sortant**. Mesuré : les deux tombaient collées à
            // gauche sur leur ligne, sans rien pour dire laquelle conclut.
            //
            // C'est l'annulation qui pousse, et non la validation qui est
            // poussée : en logique d'écriture, la marge automatique appartient à
            // l'élément qui cède la place. `#cancel-carte-button` a émigré vers
            // `components/floating-action.css` (tâche 3).
            const annuler = /\n[ \t]*#cancel-carte-button \{([^}]*)\}/.exec(flottantCss);

            expect(annuler?.[1]).toMatch(/margin-inline-end:\s*auto/);
        });
    });
});

describe('Les surfaces qui se répètent', () => {
    describe('Étant donné une surface posée sur le schéma et répétée, quand la feuille la traite', () => {
        it("alors une teinte la détache du dessin, sans le flou qu'elle multiplierait", () => {
            // Les actions d'un point existent une fois **par point**, la barre
            // d'une page une fois **par page** : les flouter en donnerait trente
            // exemplaires là où le budget mesuré sur mobile est de trois à cinq.
            // Or le besoin est la lisibilité, pas l'optique — un fond suffit, et
            // sans lui ces boutons sont illisibles sur un schéma chargé.
            // `.point-actions` et `.image-bar` ont émigré vers
            // `components/button-group.css` (tâche 3).
            for (const surface of ['.point-actions', '.image-bar']) {
                const regle = new RegExp(`\\n[ \\t]*\\${surface} \\{([^}]*)\\}`).exec(groupeCss);

                expect(regle?.[1]).toMatch(/background:\s*var\(--verre/);
                expect(regle?.[1]).not.toMatch(/backdrop-filter/);
            }
        });
    });
});

/**
 * « Les rayons » vivait ici et affirmait qu'aucun rayon n'était un nombre
 * inventé, en scrutant `feuille` entière pour `border-radius:`. Supprimée, et
 * non laissée vide.
 *
 * Son mécanisme n'était pas cassé : mesuré, poser `.foo { border-radius: 6px
 * }` dans `screens/legacy.css` le fait toujours rougir (`fautifs: ['6px']`).
 * Ce n'est donc pas la même famille de défaut que les cinq témoins vides déjà
 * trouvés sur ce chantier — la formule fonctionne encore. Le problème est
 * plus simple : son **sujet** a disparu. `screens/legacy.css` ne porte plus
 * aucune règle depuis cette même tâche et n'en reportera plus jamais — la
 * tâche 7 supprime le fichier — donc plus rien, dans le fonctionnement normal
 * du dépôt, ne pourra plus jamais faire rougir ce témoin : il resterait vert
 * par construction, pour toujours, ce qui revient au même risque que les cinq
 * précédents vu de l'extérieur (une protection qu'on croit avoir alors
 * qu'elle ne garde plus rien). `screens/legacy.css` reste protégé par un
 * témoin plus général et plus récent (`styles.test.ts`, « Les écrans » : zéro
 * règle, quelle qu'elle soit, pas seulement un rayon), et chaque composant
 * qui pose un rayon le fait déjà par jeton — voir le test qui suit pour
 * `trajet-row`.
 */

describe('Les cartes de contenu', () => {
    describe('Étant donné une ligne de la liste, quand la feuille lui donne sa surface', () => {
        it("alors son rayon est celui d'une section, et son fond remplace sa bordure", () => {
            // « Sections have an increased corner radius to match the curvature
            // of controls across the system. » Une bordure d'un pixel n'a plus
            // lieu d'être quand le fond de la carte se distingue déjà de celui
            // de la vue : c'est ainsi qu'une liste groupée d'iOS se lit.
            const carte = /\n[ \t]*trajet-row\s*\{([^}]*)\}/.exec(rowCss);

            // Le rayon passe par son jeton : « Les rayons », plus haut, refuse
            // désormais toute valeur écrite en clair.
            expect(carte?.[1]).toMatch(/border-radius:\s*var\(--rayon-section\)/);
            expect(carte?.[1]).not.toMatch(/\bborder:\s*1px/);
        });
    });
});

describe('La couleur sur les contrôles', () => {
    describe("Étant donné un bouton secondaire, quand la feuille l'habille", () => {
        it("alors il n'a pas de surface blanche, mais le remplissage neutre du système", () => {
            // « Be judicious with your use of color in controls and navigation
            // so they stay legible » — et surtout : « Refrain from adding color
            // to the background of multiple controls. » Un fond blanc plein sur
            // chaque bouton secondaire faisait de chacun une petite carte ; le
            // remplissage neutre les rend au verre qui les porte.
            // Le remplissage se **dérive** de la couleur du texte plutôt que de
            // vivre dans son propre jeton : il suit ainsi les deux apparences
            // sans qu'aucune valeur ne soit à tenir à jour deux fois.
            // `button.secondary` a émigré vers `components/button.css`
            // (tâche 3 de la partie 2).
            const secondaire = /\n[ \t]*button\.secondary \{([^}]*)\}/.exec(boutonCss);

            expect(secondaire?.[1]).toMatch(/background:\s*color-mix\(/);
            expect(secondaire?.[1]).not.toMatch(/var\(--fond\)/);
        });
    });
});

describe('Les actions destructrices', () => {
    describe('Étant donné une suppression, quand la feuille signale son danger', () => {
        it('alors le rouge est dans le libellé, jamais en aplat sous lui', () => {
            // « Never make the destructive action the prominent one » : un aplat
            // rouge attire précisément le pouce qu'on veut voir hésiter. Le
            // rouge nomme l'action ; la surface reste celle des autres boutons.
            // `button.danger` a émigré vers `components/button.css` (tâche 3
            // de la partie 2).
            const danger = /\n[ \t]*button\.danger \{([^}]*)\}/.exec(boutonCss);

            expect(danger?.[1]).toMatch(/color:\s*var\(--destructif\)/);
            expect(danger?.[1]).not.toMatch(/background:\s*var\(--destructif\)/);
            expect(danger?.[1]).not.toMatch(/border/);
        });
    });
});

describe("L'échelle typographique", () => {
    describe("Étant donné la taille de texte du système, quand la feuille s'en saisit", () => {
        it("alors la racine suit la taille dynamique d'iOS, avec un repli pour les autres", () => {
            // `font: -apple-system-body` est le **seul** crochet que le web offre
            // sur la taille dynamique : WebKit y résout la valeur choisie dans
            // Réglages, de 14 px à 53 px, et tous les `rem` de la feuille
            // suivent. Chrome jette la déclaration entière, d'où le `font-size`
            // qui précède et lui sert de repli — 17 px, la taille par défaut
            // d'iOS, et non les 16 px du navigateur.
            // La règle a émigré dans `base/elements.css` (tâche 6) : c'est
            // `socle`, et non plus `feuille`, qui la porte.
            // Tolérant à l'indentation : l'enveloppe `@layer base { … }`
            // décale tout le fichier d'un niveau, et un `\n` suivi directement
            // du sélecteur ne trouverait plus rien.
            const racine = /\n[ \t]*html\s*\{([^}]*)\}/.exec(socle);

            expect(racine?.[1]).toMatch(/font-size:\s*17px[\s\S]*font:\s*-apple-system-body/);
            // Une racine transparente retombe sur du blanc en clair et du noir
            // en sombre : c'est de là que viennent les barres blanches de
            // Safari 26.
            expect(racine?.[1]).toMatch(/background-color:\s*var\(/);
        });
    });
});

/**
 * « Les corps de texte » et « L'apparence sombre » vivaient ici et
 * affirmaient respectivement : aucune taille hors de l'échelle des onze
 * styles d'iOS, et aucune redéfinition de `:root` dans un bloc d'apparence —
 * toutes deux en scrutant `feuille` entière. Supprimées, et non laissées
 * vides, pour la même raison que « Les rayons » un peu plus haut : leur
 * mécanisme n'est pas cassé (mesuré : `.foo { font-size: 13px }` fait
 * toujours rougir la première, un `@media (prefers-color-scheme: dark) {
 * :root { … } }` fait toujours rougir la seconde), mais leur sujet a
 * disparu — `screens/legacy.css` ne porte plus aucune règle depuis cette
 * même tâche et n'en reportera plus jamais avant sa suppression en tâche 7.
 * Les deux resteraient vertes pour toujours, par construction. `feuille` est
 * protégée par le témoin général de `styles.test.ts` (« Les écrans » : zéro
 * règle, quelle qu'elle soit) ; les tailles de texte du système sont
 * garanties par `components/text.css` (le triplet complet) et par les jetons
 * de composant partout ailleurs.
 */

describe('La couche fonctionnelle', () => {
    /**
     * La liste **close** des surfaces en verre flouté.
     *
     * Ce que le flou coûte gouverne cette liste autant que la HIG : une surface
     * qui se répète — la barre d'une page, les actions d'un point — en aurait
     * autant d'exemplaires que d'éléments, et le budget mesuré sur mobile est de
     * trois à cinq flous simultanés. Celles-là reçoivent la teinte du verre sans
     * son flou : c'est elle qui porte la lisibilité, et elle ne coûte rien.
     *
     * « Limit these effects to the most important functional elements in your
     * app. » Ici : les deux barres épinglées, la barre flottante de la carte
     * plein écran, les contrôles isolés qui flottent sur le contenu, et la
     * colonne de contrôles de Leaflet.
     */
    const surfaces = [
        '.header',
        '.suivi-bar',
        '.carte-bar',
        '.floating-add-point-button',
        '.carte-button',
        '.overview-button',
        '.resume-button',
        '.leaflet-bar',
    ];
    // `.carte-recentrer` **n'y est pas**, et c'est une correction : il vit dans
    // un `.leaflet-bar`, donc l'y mettre aussi empilait deux verres — « avoid
    // overcrowding or layering Liquid Glass elements on top of each other ».
    // C'est la colonne qui porte la surface ; le bouton la traverse.

    describe("Étant donné une surface en verre, quand une autre l'habite", () => {
        it("alors l'enfant n'en reçoit pas : deux verres empilés sont refusés", () => {
            // « Avoid overcrowding or layering Liquid Glass elements on top of
            // each other. » Le recentrage vit dans un `.leaflet-bar`, comme le
            // zoom : c'est la colonne qui porte la surface, et le bouton la
            // traverse. Les traiter tous deux donnait une gélule dans une boîte
            // carrée — un rond dans un carré — et deux flous superposés.
            // Sans ses commentaires : ce qu'on interroge sont des **sélecteurs**,
            // pas de la prose. Le commentaire qui explique pourquoi
            // `.carte-recentrer` n'en reçoit pas ferait échouer le témoin qui
            // vérifie qu'il n'en reçoit pas.
            //
            // L'indentation de `@supports` est capturée puis rejouée en
            // rétro-référence pour sa propre fermeture : un quantificateur
            // paresseux borné par une indentation quelconque s'arrêterait à la
            // première règle imbriquée venue, pas au bloc entier — aveugle à
            // toute règle sœur ajoutée après `.leaflet-bar`.
            //
            // Lu depuis `materiau` : le bloc a émigré vers
            // `components/surface.css` (tâche 1 de la partie 2), et c'est lui
            // qui le porte désormais — plus `feuille`.
            const pose = /^([ \t]*)@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                materiau.replace(/\/\*[\s\S]*?\*\//g, ' '),
            );

            expect(pose?.[2]).toContain('.leaflet-bar');
            expect(pose?.[2]).not.toContain('.carte-recentrer');
        });
    });

    describe('Étant donné une surface en verre, quand elle porte un libellé', () => {
        it('alors il est monochrome, car le verre adapte sa clarté au contenu', () => {
            // « By default, symbols and text on these elements follow a
            // monochromatic color scheme, becoming darker when the underlying
            // content is light, and lighter when it's dark. » Un libellé fixé en
            // blanc — ce que la règle du bouton principal impose — disparaît dès
            // que le verre s'éclaircit sur une page de schéma.
            // Lu depuis `materiau`, comme ci-dessus.
            const pose = /^([ \t]*)@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                materiau,
            );

            expect(pose?.[2]).toMatch(/color:\s*var\(--label\)/);
            expect(pose?.[2]).not.toMatch(/color:\s*var\(--sur-teinte\)/);
        });
    });

    describe('Étant donné une surface en verre, quand la feuille la traite', () => {
        it('alors elle est de la liste close, floutée, et rendue opaque par les réglages', () => {
            // Lu depuis `materiau`, comme ci-dessus.
            const pose = /^([ \t]*)@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                materiau,
            );
            const retrait =
                /^([ \t]*)@media \(prefers-reduced-transparency[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                    materiau,
                );

            // Aucune surface n'est floutée en dehors de ces deux blocs : le
            // premier ajoute le verre, le second le retire.
            const flousHorsBlocs = materiau
                .replace(pose?.[0] ?? '', '')
                .replace(retrait?.[0] ?? '', '')
                .match(/^\s*(-webkit-)?backdrop-filter:/gm);
            expect(flousHorsBlocs).toBeNull();

            for (const surface of surfaces) {
                // Posée, puis retirée : oublier le retrait laisse le flou en
                // place quand la personne a demandé moins de transparence.
                expect(pose?.[2]).toContain(surface);
                expect(retrait?.[2]).toContain(surface);
            }
        });
    });
});

describe('Le verre de la couche fonctionnelle', () => {
    describe('Étant donné une barre à mettre en verre, quand la feuille pose son flou', () => {
        it('alors il est toujours doublé de sa jumelle préfixée, et jamais dans un var()', () => {
            // Un iPhone encore sous iOS 16.4 ou une version plus récente n'a
            // que la propriété préfixée, et l'unpréfixée est cassée jusqu'à
            // macOS 14.7 (bogue WebKit 297620) : chaque `backdrop-filter` doit
            // voyager avec sa jumelle.
            // Lu depuis `materiau`, où le flou vit désormais (tâche 1 de la
            // partie 2).
            // Ancrées en début de ligne (`^[ \t]*`, drapeau `m`), comme dans
            // `styles.test.ts` : `materiau` porte maintenant deux conditions
            // de `@supports` (la pose, et son repli `@supports not` ajouté
            // pour respecter l'ordre des couches — voir l'en-tête du
            // fichier), chacune répétant `backdrop-filter:` et
            // `-webkit-backdrop-filter:` au milieu d'une ligne de
            // feature-query, sans point-virgule pour la borner. Sondé : sans
            // l'ancre, ce témoin rougissait — une des deux conditions se
            // faisait avaler par la valeur capturée de la déclaration réelle
            // suivante, désynchronisant le compte des deux jumelles.
            const flous = [
                ...materiau.matchAll(/^[ \t]*(?<!-webkit-)backdrop-filter:\s*([^;\n]+);/gm),
            ];
            const prefixes = [...materiau.matchAll(/^[ \t]*-webkit-backdrop-filter:/gm)];

            expect(flous.length).toBeGreaterThan(0);
            expect(prefixes).toHaveLength(flous.length);
            // WebKit ignore purement et simplement un `var()` placé dans un
            // `backdrop-filter` (bogues 289800, 297620) : les valeurs de flou
            // sont la seule chose que les jetons ne peuvent pas tenir.
            expect(
                flous.map((flou) => flou[1]).filter((valeur) => valeur?.includes('var(')),
            ).toEqual([]);
        });
    });
});

describe('Ce que les réglages retirent au verre', () => {
    describe('Étant donné une personne qui a demandé moins de transparence, quand la feuille se charge', () => {
        it('alors le flou est coupé, et pas seulement recouvert', () => {
            // Rendre la surface opaque ne suffit pas : le flou ne part pas tout
            // seul, il faut couper les deux propriétés, préfixée comprise. Et le
            // bloc doit venir **après** le `@supports` qui pose le verre — à
            // spécificité égale, c'est l'ordre du fichier qui tranche.
            // Lu depuis `materiau`, comme ci-dessus.
            const retrait =
                /@media\s*\(prefers-reduced-transparency:\s*reduce\)[^{]*\{[\s\S]*?backdrop-filter:\s*none/.exec(
                    materiau,
                );
            const pose = materiau.indexOf('@supports (');

            expect(retrait).not.toBeNull();
            expect(retrait?.index ?? -1).toBeGreaterThan(pose);
        });
    });
});

describe('La réconciliation avec Leaflet', () => {
    describe('Étant donné que leaflet.css est chargé en couche vendor, quand la feuille reprend ses contrôles', () => {
        it("alors elle n'a besoin d'aucun !important pour les tenir", () => {
            // Une déclaration hors couche l'emporte sur toute déclaration en
            // couche : c'est la règle de la cascade, et elle rend les 16
            // `!important` de cette zone inutiles. Ils venaient de ce que
            // leaflet.css arrivait après nous dans le bundle, avec une
            // spécificité que `.carte-recentrer` ne pouvait pas battre.
            //
            // Lue depuis `carteOverlay` : la réconciliation Leaflet a émigré
            // vers `components/map-overlay.css` (tâche 5 de la partie 2), et
            // le bloc du mouvement réduit qui la bornait ici a émigré à son
            // tour vers `base/elements.css` (tâche 5) — il n'y a donc plus
            // besoin de le retrancher : `.leaflet-bar` et tout ce qui le suit
            // dans ce fichier appartiennent à la réconciliation.
            const debut = carteOverlay.indexOf('.leaflet-bar');

            // Garde indispensable : indexOf renvoie -1 si le marqueur n'existe
            // pas, et slice(-1) rendrait tout le fichier au lieu d'une tranche
            // vide. Si le marqueur disparaît, ce test doit échouer bruyamment,
            // pas passer en silence.
            expect(debut).toBeGreaterThanOrEqual(0);

            // Sans commentaires : la prose de ce même fichier, un peu plus
            // bas, cite `!important` pour expliquer qu'il n'en a plus besoin
            // — une citation qui satisferait le motif si on la laissait
            // entrer dans ce que ce témoin analyse.
            const zoneLeaflet = carteOverlay.slice(debut).replace(/\/\*[\s\S]*?\*\//g, '');

            expect(zoneLeaflet).not.toContain('!important');
            // L'autre moitié de ce contrat — leaflet.css chargé en couche
            // vendor — s'affirme désormais dans `styles.test.ts` : cette
            // ligne vit dans `index.css` depuis que les couches sont
            // devenues l'ossature du système, pas dans une feuille d'écran.
        });
    });
});

describe('Le mouvement', () => {
    describe('Étant donné une personne qui a demandé moins de mouvement, quand la feuille se charge', () => {
        it('alors les transitions cèdent, mais le défilement automatique reste', () => {
            // Ce qui part, ce sont les transitions — **pas** le défilement, qui
            // *est* la fonction de l'application. Une durée de 1 ms plutôt que
            // `none` : les gestionnaires de `transitionend` continuent de
            // recevoir leur événement, là où `none` les rendrait muets.
            // Rétro-référencé sur l'indentation de `@media`, comme les blocs de
            // « La couche fonctionnelle » : le même angle mort s'y appliquait.
            // Lu depuis `socle` : la règle a émigré vers `base/elements.css`
            // (tâche 5 de la partie 2) — c'est un défaut d'élément, et non un
            // composant — plus `feuille`.
            const bloc =
                /^([ \t]*)@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\1\}/m.exec(
                    socle,
                );

            expect(bloc?.[2]).toMatch(/transition-duration:\s*1ms/);
            expect(bloc?.[2]).not.toMatch(/scroll-behavior:\s*smooth/);
        });
    });
});

describe('La feuille de style', () => {
    describe('Étant donné le reste du code qui la lit, quand on la relit', () => {
        it('alors elle honore chacun des contrats dont il dépend', () => {
            const manques: string[] = [];
            const exige = (quoi: string, present: boolean): void => {
                if (!present) {
                    manques.push(quoi);
                }
            };

            // Le seuil du grand écran ne s'écrit qu'ici : `TrajetEditorScreen`
            // et `e2e/helpers.ts` lisent ce drapeau au lieu de recopier 900 px.
            // Lu depuis `carteOverlay` : `--large-screen` a émigré vers
            // `components/map-overlay.css` (tâche 5) — c'est le seuil de la
            // carte — plus `feuille`.
            exige('--large-screen sur :root', /:root[^}]*--large-screen:\s*0/s.test(carteOverlay));
            // Le seuil et le drapeau font le contrat, pas la notation de la
            // requête média : `min-width: 900px` et `width >= 900px` l'expriment
            // aussi bien l'une que l'autre.
            exige(
                '--large-screen: 1 dans la requête média des 900 px',
                /@media\s*\((?:min-width:\s*900px|width\s*>=\s*900px)\)[\s\S]*--large-screen:\s*1/.test(
                    carteOverlay,
                ),
            );

            // Le repère du suivi tombe là où le domaine vise, et se mesure en
            // `dvh` parce que le calcul du défilement lit `window.innerHeight`.
            // Lu depuis `suivi` : `.guide-line` a émigré vers
            // `screens/suivi.css` (tâche 5) — plus `feuille`.
            exige(
                '.guide-line calée sur --fraction-position en dvh',
                /--fraction-position,\s*0\.75\)\s*\*\s*100dvh/.test(suivi),
            );

            // Seize appels TypeScript basculent `hidden`, dont plusieurs sur des
            // conteneurs en `display: flex` — et le jeu de symboles en dépend.
            // Lu depuis `socle` : `[hidden]` a émigré vers `base/elements.css`
            // (tâche 5) — c'est un défaut d'élément, et non un composant —
            // plus `feuille`.
            exige(
                '[hidden] gagne sur tout',
                /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s.test(socle),
            );

            // Trois parcours e2e lisent ces valeurs calculées, WebKit seulement
            // par la propriété préfixée. `body` et `input` ont émigré dans
            // `base/elements.css` (tâche 6) : c'est `socle` qui les porte.
            exige('touch-action: pan-x pan-y sur body', /touch-action:\s*pan-x pan-y/.test(socle));
            exige('-webkit-user-select posé', socle.includes('-webkit-user-select:'));

            // Les symboles ne portent ni épaisseur ni taille : la feuille les
            // donne, sinon chaque pictogramme sort en 300 × 150 rempli de noir.
            // Insensible à la casse, pour la même raison que le test dédié plus haut.
            // `.icon` a émigré vers `components/button.css` (tâche 3 de la
            // partie 2) : c'est `boutonCss` qui le porte désormais.
            exige(
                '.icon dimensionnée et tracée',
                valeurEffectiveDeLIcone(boutonCss, 'stroke') === 'currentcolor',
            );

            // Le verre s'annule quand la personne l'a demandé — le flou ne part
            // pas tout seul, et il faut couper les deux propriétés.
            // Lues depuis `materiau` : la retraction a émigré avec le verre
            // qu'elle annule (tâche 1 de la partie 2).
            exige(
                'prefers-reduced-transparency honoré',
                /@media\s*\(prefers-reduced-transparency:\s*reduce\)/.test(materiau),
            );
            // Tolérant à la position dans la liste des conditions : la
            // retraction couvre `prefers-reduced-transparency` **et**
            // `prefers-contrast: more` dans le même prélude `@media`, séparées
            // par une virgule — `prefers-contrast: more` y est la **seconde**
            // condition, jamais collée à `@media`. Un ancrage direct
            // (`@media\s*\(prefers-contrast`) ne la trouverait donc jamais
            // dans la vraie règle ; mesuré : il trouvait quand même une
            // occurrence, mais dans la **prose** d'un commentaire de l'ancien
            // `feuille`, où `@media (prefers-contrast:\n   more)` apparaissait
            // au fil d'une phrase repliée sur deux lignes — un faux vert que
            // la migration vers `materiau` a fait apparaître.
            exige(
                'prefers-contrast: more honoré',
                /@media[^{]*\(prefers-contrast:\s*more\)[^{]*\{/.test(materiau),
            );
            // Lu depuis `socle` : le bloc a émigré vers `base/elements.css`
            // (tâche 5) — plus `feuille`.
            exige(
                'prefers-reduced-motion honoré',
                /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(socle),
            );
            // Lu depuis `carteOverlay` : le seul `@media (prefers-color-scheme:
            // dark)` restant du système assombrit les tuiles de la carte
            // (`components/map-overlay.css`, tâche 5) — plus `feuille`.
            exige(
                'apparence sombre fournie',
                /@media\s*\(prefers-color-scheme:\s*dark\)/.test(carteOverlay),
            );

            // Un iPhone 14 encore sous iOS 16.4 ou une version plus récente
            // n'a que la propriété préfixée : chaque `backdrop-filter` doit
            // voyager avec sa jumelle.
            // Lu depuis `materiau`, comme ci-dessus.
            const flous = [...materiau.matchAll(/(?<!-webkit-)backdrop-filter:/g)].length;
            const flousPrefixes = [...materiau.matchAll(/-webkit-backdrop-filter:/g)].length;
            exige(
                `autant de -webkit-backdrop-filter que de backdrop-filter (${String(flousPrefixes)} pour ${String(flous)})`,
                flous > 0 && flousPrefixes === flous,
            );

            expect(manques).toEqual([]);
        });
    });
});
