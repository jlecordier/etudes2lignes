import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Lue depuis le disque, et non importée : Vitest neutralise les imports CSS —
 * un `./screens/legacy.css?raw` rend une chaîne vide, et le témoin serait vert
 * sur une feuille inexistante.
 */
const feuille = readFileSync(new URL('./screens/legacy.css', import.meta.url), 'utf8');

/**
 * Le palier sémantique, pour les deux témoins qui doivent y suivre une
 * dérivation : `--fond-groupe` et `--verre` ne sont plus, dans `feuille`, que
 * des alias (`legacy-bridge.css`) vers `--color-background-grouped` et
 * `--material-regular` — c'est là, et non plus ici, que la garantie se lit.
 */
const semantique = readFileSync(new URL('./tokens/semantic.css', import.meta.url), 'utf8');

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

/** La feuille privée de ses blocs de jetons : tout le reste du fichier. */
function horsDesJetons(): string {
    return feuille.replace(/:root\s*\{[^}]*\}/gs, '');
}

describe('Les couleurs de la feuille', () => {
    describe('Étant donné une couleur à poser, quand la règle la nomme', () => {
        it("alors elle passe par un jeton, car aucune n'est écrite en clair hors des jetons", () => {
            // La HIG prévient que « the actual color values may fluctuate from
            // release to release ». Une valeur recopiée dans une règle est une
            // valeur qui échappera à la prochaine mise à jour — et surtout à
            // l'apparence sombre, qui ne peut redéfinir que des jetons.
            const literales = [
                ...horsDesJetons().matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)/g),
            ].map((trouve) => trouve[0]);

            expect(literales).toEqual([]);
        });
    });
});

describe("La couverture de l'apparence sombre", () => {
    describe("Étant donné un jeton de couleur, quand l'apparence bascule", () => {
        it("alors aucune couleur ne vit plus dans une requête d'apparence : light-dark() ne laisse pas la place à l'oubli", () => {
            // Ce témoin exigeait qu'un jeton **ajouté après** l'écriture du bloc
            // sombre y ait sa contrepartie — un piège qui a laissé passer
            // `--verre` resté blanc en apparence sombre, et le bouton « Ajouter
            // un point » devenu un disque blanc portant un symbole blanc.
            //
            // L'invariant devient vrai pour une autre raison : il n'y a plus de
            // second bloc à tenir à jour. `screens/legacy.css` ne redéfinit plus
            // aucun jeton de couleur dans un `@media (prefers-color-scheme: dark)`
            // ni dans un `@media (prefers-contrast: more)` — ces jetons vivent
            // maintenant au palier sémantique (`tokens/semantic.css`), une seule
            // fois chacun, par `light-dark()`. Une contrepartie oubliée y serait
            // une erreur de syntaxe, pas une omission silencieuse.
            const blocsApparence =
                feuille.match(
                    /@media \(prefers-(?:color-scheme: dark|contrast: more)(?:\)|[^{]*\)) \{[\s\S]*?\n {4}\}/g,
                ) ?? [];

            const couleursDedans = blocsApparence.filter((bloc) =>
                /--[a-z-]+:\s*rgba?\(/.test(bloc),
            );

            expect(couleursDedans).toEqual([]);
        });
    });
});

describe('Les pictogrammes', () => {
    describe('Étant donné un symbole du jeu, quand une règle doit le dessiner', () => {
        it('alors la feuille lui donne son tracé et sa taille, que le jeu ne porte pas', () => {
            // `Icons.html` ne déclare ni épaisseur, ni bouts, ni dimension : un
            // `<svg>` sans taille sort en 300 × 150, et un tracé sans `fill:
            // none` sort en noir plein. Sans cette règle, chaque bouton de
            // l'interface affiche un pavé.
            expect(feuille).toMatch(/\.icon\s*\{[^}]*fill:\s*none/s);
            // Insensible à la casse : le contrat est un tracé de la couleur
            // courante, pas l'orthographe de `currentcolor` que Stylelint choisit.
            expect(feuille).toMatch(/\.icon\s*\{[^}]*stroke:\s*currentcolor/is);
            expect(feuille).toMatch(/\.icon\s*\{[^}]*inline-size:/s);
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
            // d'avant faisait 37 px de haut.
            const bouton = /\n[ \t]*button\s*\{([^}]*)\}/s.exec(feuille);

            expect(bouton?.[1]).toMatch(/border-radius:\s*999px/);
            expect(bouton?.[1]).toMatch(/min-block-size:\s*44px/);
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
            // justement qu'ils s'effacent.
            const bouton = /\n[ \t]*button\s*\{([^}]*)\}/s.exec(feuille);

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
            for (const conteneur of ['#carte-container', '.carte-points']) {
                const regle = new RegExp(`\\n[ \\t]*\\${conteneur} \\{([^}]*)\\}`).exec(feuille);

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
            const bande = /\n[ \t]*\.header::after,\n[ \t]*\.suivi-bar::after \{([^}]*)\}/.exec(
                feuille,
            );

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
            const titre = /\n[ \t]*\.header :is\(h1, h2\) \{([^}]*)\}/.exec(feuille);
            const actions = /\n[ \t]*\.header \.action-bar \{([^}]*)\}/.exec(feuille);

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
            const proeminente =
                /\n[ \t]*\.header \.action-bar button:not\(\.secondary\) \{([^}]*)\}/.exec(feuille);

            expect(proeminente?.[1]).toMatch(/background:\s*var\(--accent\)/);
        });
    });
});

describe('La hauteur des barres', () => {
    describe("Étant donné les barres d'écran, quand la feuille les dimensionne", () => {
        it("alors une seule règle les rythme, donc aucune ne peut dériver de l'autre", () => {
            // Mesuré : l'en-tête faisait 44 px et la barre de suivi 62 px, parce
            // que chacune déclarait son rembourrage de son côté. Pire, celui de
            // l'en-tête était **nul** en vertical : un bouton de 44 px y touchait
            // les deux bords, sans un pixel d'air.
            //
            // Les deux barres jouent le même rôle — la couche fonctionnelle d'un
            // écran — donc leur rythme s'écrit une fois. Écrit deux fois, il a
            // déjà dérivé.
            const rythme = /\n[ \t]*\.header,\n[ \t]*\.suivi-bar \{([^}]*)\}/.exec(feuille);

            expect(rythme?.[1]).toMatch(/padding-block:\s*var\(--air-barre\)/);
            expect(feuille).toMatch(/--air-barre:/);
        });
    });
});

describe("Le filet sous une barre d'écran", () => {
    describe('Étant donné une barre qui porte déjà son effet de bord, quand la feuille la borde', () => {
        it("alors elle ne trace aucun filet, que l'effet remplace", () => {
            // « Instead of a background, use a scroll edge effect to provide a
            // transition between content and the control area. » Un filet
            // **et** l'effet font deux transitions pour un seul bord, et le
            // filet est celle qui se voit au repos.
            //
            // Il était la dernière asymétrie mesurée entre les deux barres :
            // la barre de suivi le portait seule, d'où 62 px contre 61.
            const barres = /\n[ \t]*\.header::after,\n[ \t]*\.suivi-bar::after \{/.test(feuille);

            expect(barres).toBe(true);
            expect(feuille).not.toMatch(/border-(?:bottom|block-end):\s*1px/);
        });
    });
});

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
            const barre = /\n[ \t]*\.header \{([^}]*)\}/.exec(feuille);

            expect(barre?.[1]).toMatch(/position:\s*sticky/);
            expect(barre?.[1]).toMatch(/margin-inline:\s*calc\(-1 \* var\(--marge-ecran\)\)/);
            expect(barre?.[1]).toMatch(/padding-inline:\s*var\(--marge-ecran\)/);
        });
    });
});

describe("Le titre d'une barre de navigation", () => {
    describe("Étant donné le titre d'un écran, quand il vit dans la barre", () => {
        it("alors il prend Headline, et non le style d'un titre de contenu", () => {
            // Le titre d'une barre de navigation iOS est **Headline** : 17 pt
            // semibold, c'est-à-dire le corps du texte distingué par sa seule
            // graisse. Title 2 Bold — 22 px, graisse 700 — est un titre de
            // *contenu* : dans une barre, entre un chevron et une action, il
            // écrase tout et se tronque. Mesuré : « Paris → Bordeaux » tombait à
            // « Paris → Bordea… » sur 390 px.
            const titre = /\n[ \t]*\.header :is\(h1, h2\) \{([^}]*)\}/.exec(feuille);

            expect(titre?.[1]).toMatch(/font-size:\s*1rem/);
            expect(titre?.[1]).toMatch(/font-weight:\s*600/);
        });
    });
});

describe("Le titre d'un en-tête", () => {
    describe("Étant donné un nom trop long pour la barre, quand l'en-tête le pose", () => {
        it("alors il s'abrège, car c'est la ligne qui ne doit pas se casser", () => {
            // La règle de `.header` est délibérément sans `flex-wrap`, et son
            // commentaire dit pourquoi : à trois éléments sur un téléphone,
            // plier les envoyait sur trois lignes. Mais alors c'est au **titre**
            // de céder — sans quoi il se casse en deux et fait grandir la barre
            // de tout ce qu'on voulait lui épargner.
            const titre = /\n[ \t]*\.header :is\(h1, h2\) \{([^}]*)\}/.exec(feuille);

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
            const partagee = /\n[ \t]*\.leaflet-bar a,\n[ \t]*\.carte-recentrer \{([^}]*)\}/.exec(
                feuille,
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
            const tuiles = /\n[ \t]*\.leaflet-tile-pane \{([^}]*)\}/.exec(feuille);
            const sombre =
                /@media \(prefers-color-scheme: dark\) \{\s*\.leaflet-tile-pane \{([^}]*)\}/.exec(
                    feuille,
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
            const conteneur = /\n[ \t]*#carte-container \{([^}]*)\}/.exec(feuille);
            const barre = /\n[ \t]*\.carte-bar \{([^}]*)\}/.exec(feuille);

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
            const groupe =
                /\n[ \t]*\.header button\.secondary,\n[ \t]*\.suivi-bar button\.secondary,\n[ \t]*\.carte-bar button\.secondary,\n[ \t]*\.point-actions button,\n[ \t]*\.image-bar button \{([^}]*)\}/.exec(
                    feuille,
                );

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
            const barre = /\n[ \t]*\.action-bar button \{([^}]*)\}/.exec(feuille);

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
            // l'élément qui cède la place.
            const annuler = /\n[ \t]*#cancel-carte-button \{([^}]*)\}/.exec(feuille);

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
            for (const surface of ['.point-actions', '.image-bar']) {
                const regle = new RegExp(`\\n[ \\t]*\\${surface} \\{([^}]*)\\}`).exec(feuille);

                expect(regle?.[1]).toMatch(/background:\s*var\(--verre/);
                expect(regle?.[1]).not.toMatch(/backdrop-filter/);
            }
        });
    });
});

describe('Les rayons', () => {
    describe('Étant donné une surface arrondie, quand la règle lui donne son rayon', () => {
        it("alors c'est une gélule, un angle vif, ou un jeton — jamais un nombre inventé", () => {
            // « Consider aligning the shape of controls with other rounded
            // elements throughout the interface. » Trois rayons de 6 px avaient
            // survécu à la refonte, et deux « 22px » étaient écrits en clair :
            // autant d'occasions de dériver.
            //
            // Surtout, un rayon **intérieur** se calcule depuis celui qui le
            // contient, moins le rembourrage qui les sépare — c'est la règle
            // concentrique d'Apple, et un `calc()` la tient là où deux
            // constantes l'auraient perdue.
            const rayons = [...feuille.matchAll(/border-radius:\s*([^;]+);/g)].map((trouve) =>
                (trouve[1] ?? '').replace(/\s*!important$/, '').trim(),
            );

            const admis = (rayon: string): boolean =>
                rayon === '0' ||
                rayon === '999px' ||
                rayon === 'inherit' ||
                rayon.split(/\s+/).every((part) => part === '0' || part.startsWith('var(--rayon-'));

            expect(rayons.filter((rayon) => !admis(rayon))).toEqual([]);
        });
    });
});

describe('Les cartes de contenu', () => {
    describe('Étant donné une ligne de la liste, quand la feuille lui donne sa surface', () => {
        it("alors son rayon est celui d'une section, et son fond remplace sa bordure", () => {
            // « Sections have an increased corner radius to match the curvature
            // of controls across the system. » Une bordure d'un pixel n'a plus
            // lieu d'être quand le fond de la carte se distingue déjà de celui
            // de la vue : c'est ainsi qu'une liste groupée d'iOS se lit.
            const carte = /\n[ \t]*trajet-row,[\s\S]*?\{([^}]*)\}/.exec(feuille);

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
            const secondaire = /button\.secondary\s*\{([^}]*)\}/.exec(feuille);

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
            const danger = /button\.danger\s*\{([^}]*)\}/.exec(feuille);

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
            // Tolérant à l'indentation : l'enveloppe `@layer screens { … }`
            // décale tout le fichier d'un niveau, et un `\n` suivi directement
            // du sélecteur ne trouverait plus rien.
            const racine = /\n[ \t]*html\s*\{([^}]*)\}/.exec(feuille);

            expect(racine?.[1]).toMatch(/font-size:\s*17px[\s\S]*font:\s*-apple-system-body/);
            // Une racine transparente retombe sur du blanc en clair et du noir
            // en sombre : c'est de là que viennent les barres blanches de
            // Safari 26.
            expect(racine?.[1]).toMatch(/background-color:\s*var\(/);
        });
    });
});

describe('Les corps de texte', () => {
    /**
     * Les onze styles d'iOS au corps par défaut, exprimés en fraction du corps
     * de texte (Body = 17 pt = 1 rem, la racine suivant la taille dynamique) :
     *
     *   Large Title 34/17 = 2      Title 1 28/17 = 1.647   Title 2 22/17 = 1.294
     *   Title 3     20/17 = 1.176  Headline/Body   = 1     Callout 16/17 = 0.941
     *   Subhead     15/17 = 0.882  Footnote 13/17 = 0.765  Caption 1 12/17 = 0.706
     *   Caption 2   11/17 = 0.647
     *
     * Headline ne diffère de Body que par la graisse : c'est le geste de
     * hiérarchie le moins coûteux d'Apple, et le bon sur une interface dense.
     */
    const echelle = [
        '2',
        '1.647',
        '1.294',
        '1.176',
        '1',
        '0.941',
        '0.882',
        '0.765',
        '0.706',
        '0.647',
    ];

    describe('Étant donné un texte à dimensionner, quand la règle choisit son corps', () => {
        it("alors c'est un des onze styles d'iOS, et jamais une taille inventée", () => {
            /**
             * Une taille est admise si elle est le corps de référence lui-même
             * (`17px` sur la racine), si elle suit celle de son voisin (`em`,
             * comme un pictogramme), ou si c'est un des onze styles en `rem`.
             */
            const admise = (taille: string): boolean =>
                taille === '17px' ||
                (taille.endsWith('em') && !taille.endsWith('rem')) ||
                echelle.includes(taille.replace(/rem$/, ''));

            const hors = [...feuille.matchAll(/font-size:\s*([^;]+);/g)]
                .map((trouve) => (trouve[1] ?? '').trim())
                .filter((taille) => !admise(taille));

            expect(hors).toEqual([]);
        });
    });
});

describe("L'apparence sombre", () => {
    describe('Étant donné une personne qui a choisi le thème sombre, quand la feuille se charge', () => {
        it('alors elle ne redéfinit plus aucun jeton : la seconde apparence vit dans la déclaration `light-dark()` du palier sémantique', () => {
            // « Even if your app ships in a single appearance mode, provide both
            // light and dark colors to support Liquid Glass adaptivity. » Elle
            // sert aussi le cas d'usage : un schéma de ligne se lit de nuit,
            // dans un train — mais ce n'est plus cette feuille qui la fournit.
            //
            // Ce témoin vérifiait qu'un `@media (prefers-color-scheme: dark)`
            // redéfinissait `:root`, et rien que `:root`. Il n'y a désormais plus
            // aucun `:root` à redéfinir dans un bloc d'apparence de cette feuille
            // — `tokens/semantic.css` porte les deux apparences dans une seule
            // déclaration `light-dark()` par jeton, une fois pour toutes. Le seul
            // `@media (prefers-color-scheme: dark)` restant ici n'a jamais porté
            // de jeton : il assombrit les tuiles de la carte, un `filter`, testé
            // plus loin dans « Les tuiles de la carte ».
            const rootSombre = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{/.exec(
                feuille,
            );

            expect(rootSombre).toBeNull();
        });
    });
});

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
            const pose = /^([ \t]*)@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                feuille.replace(/\/\*[\s\S]*?\*\//g, ' '),
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
            const pose = /^([ \t]*)@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                feuille,
            );

            expect(pose?.[2]).toMatch(/color:\s*var\(--label\)/);
            expect(pose?.[2]).not.toMatch(/color:\s*var\(--sur-teinte\)/);
        });
    });

    describe('Étant donné une surface en verre, quand la feuille la traite', () => {
        it('alors elle est de la liste close, floutée, et rendue opaque par les réglages', () => {
            const pose = /^([ \t]*)@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                feuille,
            );
            const retrait =
                /^([ \t]*)@media \(prefers-reduced-transparency[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                    feuille,
                );

            // Aucune surface n'est floutée en dehors de ces deux blocs : le
            // premier ajoute le verre, le second le retire.
            const flousHorsBlocs = feuille
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
            // Un iPhone encore sous iOS 16 ou 17 n'a que la propriété préfixée,
            // et l'unpréfixée est cassée jusqu'à macOS 14.7 (bogue WebKit
            // 297620) : chaque `backdrop-filter` doit voyager avec sa jumelle.
            const flous = [...feuille.matchAll(/(?<!-webkit-)backdrop-filter:\s*([^;]+);/g)];
            const prefixes = [...feuille.matchAll(/-webkit-backdrop-filter:/g)];

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
            const retrait =
                /@media\s*\(prefers-reduced-transparency:\s*reduce\)[^{]*\{[\s\S]*?backdrop-filter:\s*none/.exec(
                    feuille,
                );
            const pose = feuille.indexOf('@supports (');

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
            // Bornée avant le bloc du mouvement réduit : ses quatre
            // `!important` sont légitimes et lui survivent quelle que soit
            // l'issue de cette réconciliation — ils ne relèvent pas de
            // Leaflet, mais se trouvent après `.leaflet-bar` dans le fichier.
            const debut = feuille.indexOf('.leaflet-bar');
            const fin = feuille.indexOf('@media (prefers-reduced-motion');

            // Garde indispensable : indexOf renvoie -1 si le marqueur n'existe
            // pas, et slice(-1, X) crée une tranche vide qui passe
            // l'assertion sans rien affirmer. Si l'un disparaît ou se déplace
            // avant l'autre, ce test doit échouer bruyamment, pas passer en
            // silence.
            expect(debut).toBeGreaterThanOrEqual(0);
            expect(fin).toBeGreaterThanOrEqual(0);
            expect(fin).toBeGreaterThan(debut);

            const zoneLeaflet = feuille.slice(debut, fin);

            expect(zoneLeaflet).not.toContain('!important');
            // L'autre moitié de ce contrat — leaflet.css chargé en couche
            // vendor — s'affirme désormais dans `styles.test.ts` : cette
            // ligne vit dans `index.css` depuis que les couches sont
            // devenues l'ossature du système, pas dans cette feuille d'écran.
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
            const bloc =
                /^([ \t]*)@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\1\}/m.exec(
                    feuille,
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
            exige('--large-screen sur :root', /:root[^}]*--large-screen:\s*0/s.test(feuille));
            // Le seuil et le drapeau font le contrat, pas la notation de la
            // requête média : `min-width: 900px` et `width >= 900px` l'expriment
            // aussi bien l'une que l'autre.
            exige(
                '--large-screen: 1 dans la requête média des 900 px',
                /@media\s*\((?:min-width:\s*900px|width\s*>=\s*900px)\)[\s\S]*--large-screen:\s*1/.test(
                    feuille,
                ),
            );

            // Le repère du suivi tombe là où le domaine vise, et se mesure en
            // `dvh` parce que le calcul du défilement lit `window.innerHeight`.
            exige(
                '.guide-line calée sur --fraction-position en dvh',
                /--fraction-position,\s*0\.75\)\s*\*\s*100dvh/.test(feuille),
            );

            // Seize appels TypeScript basculent `hidden`, dont plusieurs sur des
            // conteneurs en `display: flex` — et le jeu de symboles en dépend.
            exige(
                '[hidden] gagne sur tout',
                /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s.test(feuille),
            );

            // Trois parcours e2e lisent ces valeurs calculées, WebKit seulement
            // par la propriété préfixée.
            exige(
                'touch-action: pan-x pan-y sur body',
                /touch-action:\s*pan-x pan-y/.test(feuille),
            );
            exige('-webkit-user-select posé', feuille.includes('-webkit-user-select:'));

            // Les symboles ne portent ni épaisseur ni taille : la feuille les
            // donne, sinon chaque pictogramme sort en 300 × 150 rempli de noir.
            // Insensible à la casse, pour la même raison que le test dédié plus haut.
            exige(
                '.icon dimensionnée et tracée',
                /\.icon\s*\{[^}]*stroke:\s*currentcolor/is.test(feuille),
            );

            // Le verre s'annule quand la personne l'a demandé — le flou ne part
            // pas tout seul, et il faut couper les deux propriétés.
            exige(
                'prefers-reduced-transparency honoré',
                /@media\s*\(prefers-reduced-transparency:\s*reduce\)/.test(feuille),
            );
            exige(
                'prefers-contrast: more honoré',
                /@media\s*\(prefers-contrast:\s*more\)/.test(feuille),
            );
            exige(
                'prefers-reduced-motion honoré',
                /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(feuille),
            );
            exige(
                'apparence sombre fournie',
                /@media\s*\(prefers-color-scheme:\s*dark\)/.test(feuille),
            );

            // Un iPhone 14 encore sous iOS 16 ou 17 n'a que la propriété
            // préfixée : chaque `backdrop-filter` doit voyager avec sa jumelle.
            const flous = [...feuille.matchAll(/(?<!-webkit-)backdrop-filter:/g)].length;
            const flousPrefixes = [...feuille.matchAll(/-webkit-backdrop-filter:/g)].length;
            exige(
                `autant de -webkit-backdrop-filter que de backdrop-filter (${String(flousPrefixes)} pour ${String(flous)})`,
                flous > 0 && flousPrefixes === flous,
            );

            expect(manques).toEqual([]);
        });
    });
});
