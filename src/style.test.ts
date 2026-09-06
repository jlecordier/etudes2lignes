import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Lue depuis le disque, et non importée : Vitest neutralise les imports CSS —
 * un `./style.css?raw` rend une chaîne vide, et le témoin serait vert sur une
 * feuille inexistante.
 */
const feuille = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

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
        it('alors il a sa contrepartie sombre, sauf ceux qui sont volontairement communs', () => {
            // Le piège que ce témoin existe pour attraper : un jeton **ajouté
            // après** l'écriture du bloc sombre y reste absent, sans que rien ne
            // le signale. Mesuré : `--verre` est resté blanc en apparence
            // sombre, et le bouton « Ajouter un point » était un disque blanc
            // portant un symbole blanc — invisible.
            //
            // Volontairement communs : `--sur-teinte`, qui reste blanc dans les
            // deux apparences (un bouton teinté porte un libellé blanc de nuit
            // comme de jour), et les alias — `--accent`, `--destructif`,
            // `--position` — qui suivent `--bleu` et `--rouge`, eux redéfinis.
            const communs = ['--sur-teinte', '--accent', '--destructif', '--position'];

            const clair = /^:root \{([\s\S]*?)^\}/m.exec(feuille)?.[1] ?? '';
            const sombre =
                /@media \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\n {4}\}/.exec(
                    feuille,
                )?.[1] ?? '';

            const couleurs = [...clair.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)]
                .filter(([, , valeur]) => /rgba?\(/.test(valeur ?? ''))
                .map(([, nom]) => nom ?? '');

            const oublies = couleurs.filter(
                (nom) => !communs.includes(nom) && !sombre.includes(`${nom}:`),
            );

            expect(oublies).toEqual([]);
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
            expect(feuille).toMatch(/\.icon\s*\{[^}]*stroke:\s*currentColor/s);
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
            const bouton = /\nbutton\s*\{([^}]*)\}/s.exec(feuille);

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
            const bouton = /\nbutton\s*\{([^}]*)\}/s.exec(feuille);

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
                const regle = new RegExp(`\\n\\${conteneur} \\{([^}]*)\\}`).exec(feuille);

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
            const bande = /\n\.header::after,\n\.suivi-bar::after \{([^}]*)\}/.exec(feuille);

            expect(bande?.[1]).toMatch(/pointer-events:\s*none/);
            expect(bande?.[1]).toMatch(/linear-gradient\(\s*to bottom,\s*var\(--fond/);
            expect(bande?.[1]).toMatch(/top:\s*100%/);
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
            const barre = /\n\.header \{([^}]*)\}/.exec(feuille);

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
            const titre = /\n\.header h2 \{([^}]*)\}/.exec(feuille);

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
            const titre = /\n\.header h2 \{([^}]*)\}/.exec(feuille);

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
            const partagee = /\n\.leaflet-bar a,\n\.carte-recentrer \{([^}]*)\}/.exec(feuille);

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
            const tuiles = /\n\.leaflet-tile-pane \{([^}]*)\}/.exec(feuille);
            const sombre =
                /@media \(prefers-color-scheme: dark\) \{\s*\.leaflet-tile-pane \{([^}]*)\}/.exec(
                    feuille,
                );

            expect(tuiles?.[1]).toMatch(/filter:\s*saturate\(/);
            expect(sombre?.[1]).toMatch(/filter:\s*invert\(/);
        });
    });
});

describe("L'ordre du bundle face à leaflet.css", () => {
    describe('Étant donné que leaflet.css arrive après, quand la feuille reprend ses contrôles', () => {
        it('alors ses déclarations sont marquées, seul moyen de gagner à égalité', () => {
            // Le même piège que les pastilles, déjà documenté deux fois dans la
            // feuille : `leaflet.css` est importé par l'adapter, donc **après**
            // cette feuille dans le bundle. Monter en spécificité ne suffit pas —
            // `.leaflet-touch .leaflet-bar a` vaut 0-2-1, autant qu'un sélecteur
            // scopé sous le conteneur, et l'ordre tranche alors en sa faveur.
            // Sans marque, le zoom reste en blanc opaque à côté du verre.
            const partagee = /\n\.leaflet-bar a,\n\.carte-recentrer \{([^}]*)\}/.exec(feuille);

            expect(partagee?.[1]).toMatch(/background:\s*none\s*!important/);
            expect(partagee?.[1]).toMatch(/inline-size:\s*34px\s*!important/);
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
            const conteneur = /\n#carte-container \{([^}]*)\}/.exec(feuille);
            const barre = /\n\.carte-bar \{([^}]*)\}/.exec(feuille);

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
                /\n\.header button\.secondary,\n\.suivi-bar button\.secondary,\n\.carte-bar button\.secondary,\n\.point-actions button,\n\.image-bar button \{([^}]*)\}/.exec(
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
            const barre = /\n\.action-bar button \{([^}]*)\}/.exec(feuille);

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
            const annuler = /\n#cancel-carte-button \{([^}]*)\}/.exec(feuille);

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
                const regle = new RegExp(`\\n\\${surface} \\{([^}]*)\\}`).exec(feuille);

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
            const carte = /\ntrajet-row,[\s\S]*?\{([^}]*)\}/.exec(feuille);

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
            const racine = /\nhtml\s*\{([^}]*)\}/.exec(feuille);

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
        it('alors elle redéfinit les jetons, et rien que les jetons', () => {
            // « Even if your app ships in a single appearance mode, provide both
            // light and dark colors to support Liquid Glass adaptivity. » Elle
            // sert aussi le cas d'usage : un schéma de ligne se lit de nuit,
            // dans un train.
            const sombre =
                /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/s.exec(
                    feuille,
                );

            expect(sombre?.[1]).toMatch(/--fond:/);
            expect(sombre?.[1]).toMatch(/--label:/);
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
            const pose = /@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\}/.exec(
                feuille.replace(/\/\*[\s\S]*?\*\//g, ' '),
            );

            expect(pose?.[1]).toContain('.leaflet-bar');
            expect(pose?.[1]).not.toContain('.carte-recentrer');
        });
    });

    describe('Étant donné une surface en verre, quand elle porte un libellé', () => {
        it('alors il est monochrome, car le verre adapte sa clarté au contenu', () => {
            // « By default, symbols and text on these elements follow a
            // monochromatic color scheme, becoming darker when the underlying
            // content is light, and lighter when it's dark. » Un libellé fixé en
            // blanc — ce que la règle du bouton principal impose — disparaît dès
            // que le verre s'éclaircit sur une page de schéma.
            const pose = /@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\}/.exec(feuille);

            expect(pose?.[1]).toMatch(/color:\s*var\(--label\)/);
            expect(pose?.[1]).not.toMatch(/color:\s*var\(--sur-teinte\)/);
        });
    });

    describe('Étant donné une surface en verre, quand la feuille la traite', () => {
        it('alors elle est de la liste close, floutée, et rendue opaque par les réglages', () => {
            const pose = /@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\}/.exec(feuille);
            const retrait = /@media \(prefers-reduced-transparency[^{]*\{([\s\S]*?)\n\}/.exec(
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
                expect(pose?.[1]).toContain(surface);
                expect(retrait?.[1]).toContain(surface);
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

describe('Le mouvement', () => {
    describe('Étant donné une personne qui a demandé moins de mouvement, quand la feuille se charge', () => {
        it('alors les transitions cèdent, mais le défilement automatique reste', () => {
            // Ce qui part, ce sont les transitions — **pas** le défilement, qui
            // *est* la fonction de l'application. Une durée de 1 ms plutôt que
            // `none` : les gestionnaires de `transitionend` continuent de
            // recevoir leur événement, là où `none` les rendrait muets.
            const bloc = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(
                feuille,
            );

            expect(bloc?.[1]).toMatch(/transition-duration:\s*1ms/);
            expect(bloc?.[1]).not.toMatch(/scroll-behavior:\s*smooth/);
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
            exige(
                '--large-screen: 1 dans la requête média des 900 px',
                /@media\s*\(min-width:\s*900px\)[\s\S]*--large-screen:\s*1/.test(feuille),
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
            exige(
                '.icon dimensionnée et tracée',
                /\.icon\s*\{[^}]*stroke:\s*currentColor/s.test(feuille),
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
