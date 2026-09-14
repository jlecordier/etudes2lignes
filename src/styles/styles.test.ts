import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Les feuilles du système, découvertes plutôt qu'énumérées : un fichier ajouté
 * tombe sous les invariants sans qu'on ait pensé à l'inscrire — et c'est
 * précisément l'oubli qui a laissé passer une contrepartie sombre manquante.
 *
 * **Le glob ne sert qu'à trouver les chemins.** Mesuré : sous Vitest,
 * `import.meta.glob('./**\/*.css', { query: '?raw', eager: true })` rend bien
 * les clés mais un contenu **vide** — la même neutralisation des imports CSS
 * que `legacy.test.ts` documente déjà pour son propre compte. Le contenu se lit
 * donc au disque, où il fait ses 61 310 caractères.
 */
const chemins = Object.keys(import.meta.glob('./**/*.css'));
const feuilles: Record<string, string> = Object.fromEntries(
    chemins.map((chemin) => [chemin, readFileSync(new URL(chemin, import.meta.url), 'utf8')]),
);

const entree = feuilles['./index.css'] ?? '';
const systeme = Object.values(feuilles).join('\n');

const COUCHES = 'vendor, reset, tokens, base, components, screens';

describe("L'ordre de cascade", () => {
    describe('Étant donné le système, quand on cherche qui décide de la priorité', () => {
        it("alors une seule ligne le dit, et c'est l'entrée", () => {
            // Deux déclarations d'ordre, et c'est la première qui gagne en
            // silence : la seconde ne prévient pas qu'elle est ignorée.
            const declarations = systeme.match(/@layer [a-z, ]+;/g) ?? [];

            expect(declarations).toEqual([`@layer ${COUCHES};`]);
            expect(entree).toContain(`@layer ${COUCHES};`);
        });
    });

    describe("Étant donné l'entrée du système, quand on l'ouvre", () => {
        it("alors elle n'y met aucune règle : elle ordonne et importe, rien d'autre", () => {
            // Une règle écrite ici échapperait à toute couche, et une
            // déclaration hors couche gagne sur toutes : elle serait
            // impossible à surcharger depuis un composant.
            const sansCommentaires = entree.replace(/\/\*[\s\S]*?\*\//g, '');
            const lignesSignifiantes = sansCommentaires
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l.length > 0);

            expect(lignesSignifiantes.every((l) => l.startsWith('@'))).toBe(true);
        });
    });

    describe('Étant donné une feuille du système, quand on cherche qui la charge', () => {
        it("alors l'entrée l'importe, sinon elle est morte sans que rien ne le dise", () => {
            const orphelines = Object.keys(feuilles)
                .filter((chemin) => chemin !== './index.css')
                .filter((chemin) => !entree.includes(chemin.replace('./', '')));

            expect(orphelines).toEqual([]);
        });
    });

    describe("Étant donné une feuille du système, quand on regarde ce qu'elle déclare", () => {
        it('alors elle annonce sa couche elle-même', () => {
            // Écrite dans le fichier, la couche ne dépend pas du traitement de
            // l'import par Vite, et le fichier dit ce qu'il est.
            const sansCouche = Object.entries(feuilles)
                .filter(([chemin]) => chemin !== './index.css')
                .filter(([, contenu]) => !/@layer [a-z]+ \{/.test(contenu))
                .map(([chemin]) => chemin);

            expect(sansCouche).toEqual([]);
        });
    });
});

const primitives = feuilles['./tokens/primitives.css'] ?? '';

/** Les onze styles de texte iOS à la taille « Large » par défaut, tels que la
 *  HIG les publie : taille en points, interligne en points, approche en
 *  millièmes d'em. */
const STYLES_DE_TEXTE = [
    { nom: 'large-title', taille: 34, interligne: 41, approche: 12 },
    { nom: 'title-1', taille: 28, interligne: 34, approche: 14 },
    { nom: 'title-2', taille: 22, interligne: 28, approche: -12 },
    { nom: 'title-3', taille: 20, interligne: 25, approche: -23 },
    { nom: 'headline', taille: 17, interligne: 22, approche: -26 },
    { nom: 'body', taille: 17, interligne: 22, approche: -26 },
    { nom: 'callout', taille: 16, interligne: 21, approche: -20 },
    { nom: 'subheadline', taille: 15, interligne: 20, approche: -16 },
    { nom: 'footnote', taille: 13, interligne: 18, approche: -6 },
    { nom: 'caption-1', taille: 12, interligne: 16, approche: 0 },
    { nom: 'caption-2', taille: 11, interligne: 13, approche: 6 },
];

describe('Le palier des primitives', () => {
    describe('Étant donné le palier le plus haut, quand on regarde ce dont il dépend', () => {
        it('alors il ne dépend de rien : aucun var() ne le traverse', () => {
            // C'est la définition du palier, et la moitié de la règle qui
            // empêche un jeton de reboucler sur un autre.
            expect(primitives).not.toMatch(/var\(--/);
        });
    });

    describe('Étant donné un style de texte, quand on cherche ses jetons', () => {
        it('alors les trois y sont : une taille ne voyage jamais seule', () => {
            // Mesuré avant ce chantier : 16 déclarations `font-size`, dont 5
            // seulement portaient l'interligne et l'approche qu'Apple leur
            // associe. Onze styles incomplets sur seize.
            const manquants = STYLES_DE_TEXTE.flatMap(({ nom }) =>
                ['size', 'leading', 'tracking']
                    .filter((part) => !primitives.includes(`--text-${nom}-${part}:`))
                    .map((part) => `--text-${nom}-${part}`),
            );

            expect(manquants).toEqual([]);
        });
    });

    describe("Étant donné les métriques d'Apple, quand on lit ce que la feuille en a fait", () => {
        const CORPS = 17;

        /** Extrait la valeur numérique d'un jeton, quelle que soit son
         *  écriture (`2rem` ou `2.000rem`, `0` ou `0.000em`…). La comparaison
         *  qui suit est **numérique, pas textuelle** : `2rem` et `2.000rem`
         *  désignent le même nombre, et un test qui les distinguerait
         *  affirmerait une orthographe plutôt qu'un contrat — au prix, mesuré
         *  ici, de forcer la feuille à porter des zéros de fin que personne
         *  n'écrit et que le formateur du dépôt s'empresse de retirer. Un
         *  `toBeCloseTo` au millième affirme le contrat (la précision que la
         *  HIG publie) sans dicter la forme. Si une main future resserre ceci
         *  en comparaison de chaînes, elle réintroduit exactement ce piège. */
        const extraireNombre = (jeton: string): number | null => {
            const expression = new RegExp(`${jeton}:\\s*(-?\\d+(?:\\.\\d+)?)(?:px|rem|em)?;`);
            const correspondance = expression.exec(primitives);

            return correspondance ? Number(correspondance[1]) : null;
        };

        it.each(STYLES_DE_TEXTE)(
            "alors $nom porte la taille, l'interligne et l'approche de la HIG, au millième",
            ({ nom, taille, interligne, approche }) => {
                expect(extraireNombre(`--text-${nom}-size`)).toBeCloseTo(taille / CORPS, 3);
                expect(extraireNombre(`--text-${nom}-leading`)).toBeCloseTo(interligne / taille, 3);
                expect(extraireNombre(`--text-${nom}-tracking`)).toBeCloseTo(approche / 1000, 3);
            },
        );
    });

    describe("Étant donné l'échelle d'espacement, quand un composant cherche une valeur", () => {
        it('alors les dix marches y sont, et rien entre elles', () => {
            // Une centaine de longueurs en clair vivaient dans la feuille, dont
            // `0.5rem` seize fois : c'est de là que la hauteur des deux barres
            // avait dérivé de 18 px.
            const marches = [2, 4, 8, 12, 16, 20, 24, 32, 44, 64];
            const absentes = marches.filter((m) => !primitives.includes(`--space-${m}: ${m}px;`));

            expect(absentes).toEqual([]);
        });
    });
});

const semantique = feuilles['./tokens/semantic.css'] ?? '';
const pont = feuilles['./screens/legacy-bridge.css'] ?? '';

describe('Le palier sémantique', () => {
    describe('Étant donné les deux apparences, quand on cherche où elles sont écrites', () => {
        it("alors aucune couleur ne vit dans une requête d'apparence", () => {
            // Le défaut d'origine : `--verre` et `--verre-reflet` manquaient au
            // bloc sombre, et le bouton flottant était un disque blanc portant
            // un symbole blanc. Un test l'a vu **après** la publication.
            // `light-dark()` ne laisse pas la place à l'oubli : les deux
            // valeurs sont dans la même déclaration.
            const blocsSombres =
                systeme.match(/@media \(prefers-color-scheme: dark\)[\s\S]*?\n\}/g) ?? [];
            const couleursDedans = blocsSombres.filter((bloc) => /--color-|--material-/.test(bloc));

            expect(couleursDedans).toEqual([]);
        });
    });

    describe('Étant donné un rôle de couleur, quand on lit sa déclaration', () => {
        it('alors elle porte ses deux apparences à la fois', () => {
            const roles = semantique.match(/--(?:color|material)-[a-z-]+:[^;]+;/g) ?? [];
            const sansLesDeux = roles.filter((d) => !d.includes('light-dark('));

            expect(roles.length).toBeGreaterThan(0);
            expect(sansLesDeux).toEqual([]);
        });
    });

    describe('Étant donné le palier sémantique, quand on regarde ce dont il dépend', () => {
        it('alors chacun de ses var() désigne une primitive, et jamais un rôle', () => {
            // La règle des paliers : un palier ne référence que celui du dessus.
            const references = [...semantique.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
            // Un rôle peut s'appuyer sur un rôle du même palier — rien
            // n'interdit un alias vers un autre rôle de `semantic.css`. Ce
            // que la règle interdit, c'est de descendre chercher **plus
            // bas** que soi.
            const horsPalier = references.filter(
                (nom) => !primitives.includes(`${nom}:`) && !semantique.includes(`${nom}:`),
            );

            expect(horsPalier).toEqual([]);
        });
    });

    describe('Étant donné la teinte du verre, quand on cherche d où elle vient', () => {
        it('alors elle se dérive du fond, au lieu de le recopier', () => {
            // Elle était une copie manuelle : `--verre: rgba(242, 242, 247, .72)`
            // devait s'accorder à la main avec `--fond-groupe`. Deux valeurs à
            // tenir d'accord, donc deux valeurs qui dérivent.
            expect(semantique).toMatch(/--material-regular:[^;]*rgb\(from var\(--grey-grouped/);
        });
    });

    describe("Étant donné le pont vers la feuille en transit, quand on l'ouvre", () => {
        it("alors il n'y a que des alias : aucune valeur ne s'y décide", () => {
            const declarations = pont.match(/--[a-z-]+:[^;]+;/g) ?? [];
            const quiDecident = declarations.filter((d) => !/:\s*var\(--/.test(d));

            expect(declarations.length).toBeGreaterThan(0);
            expect(quiDecident).toEqual([]);
        });
    });

    describe("Étant donné le palier contraste élevé, quand on regarde ce qu'il surcharge", () => {
        it("alors les sept rôles que l'ancienne feuille y redéfinissait y sont, le séparateur compris", () => {
            // Mesuré : un premier passage omettait --separateur. Le contraste
            // élevé existe pour renforcer le filet — de 29 % à 70 % d'opacité
            // — et l'omission le laissait au poids normal, l'inverse exact de
            // la raison d'être du mode, sur huit sites de bordure. Le seul
            // témoin qui parlait jusqu'ici de ce mode vérifiait la présence de
            // la chaîne `prefers-contrast: more`, et passait pour une raison
            // sans rapport avec les rôles qu'il surcharge réellement.
            //
            // Extraction par comptage d'accolades plutôt que par regex
            // paresseuse : le bloc contient lui-même des accolades imbriquées
            // (`light-dark(...)` sur plusieurs lignes), qu'un `[\s\S]*?\n\}`
            // capturerait trop tôt ou trop tard selon l'indentation.
            const debut = semantique.indexOf('@media (prefers-contrast: more) {');
            expect(debut).toBeGreaterThanOrEqual(0);

            let indice = debut + '@media (prefers-contrast: more) {'.length;
            let profondeur = 1;
            let bloc = '';
            while (profondeur > 0 && indice < semantique.length) {
                const caractere = semantique[indice] ?? '';
                if (caractere === '{') {
                    profondeur += 1;
                }
                if (caractere === '}') {
                    profondeur -= 1;
                }
                if (profondeur > 0) {
                    bloc += caractere;
                }
                indice += 1;
            }

            const rolesHistoriques = [
                '--color-accent',
                '--color-destructive',
                '--color-label-secondary',
                '--color-label-tertiary',
                '--color-separator',
                '--material-regular',
                '--material-thick',
            ];
            const manquants = rolesHistoriques.filter((role) => !bloc.includes(`${role}:`));

            expect(manquants).toEqual([]);
        });
    });
});

/**
 * Le contenu entre une parenthèse ouvrante déjà consommée (`depuis`) et sa
 * fermante, en comptant la profondeur plutôt qu'en cherchant la prochaine
 * parenthèse : le contenu imbrique lui-même des appels
 * (`rgb(from var(--x) r g b / 40%)`), qu'une regex non récursive
 * délimiterait mal.
 */
function contenuEntreParentheses(texte: string, depuis: number): string {
    let indice = depuis;
    let profondeur = 1;
    let contenu = '';

    while (profondeur > 0 && indice < texte.length) {
        const caractere = texte[indice] ?? '';
        if (caractere === '(') {
            profondeur += 1;
        }
        if (caractere === ')') {
            profondeur -= 1;
        }
        if (profondeur > 0) {
            contenu += caractere;
        }
        indice += 1;
    }

    return contenu;
}

/** Coupe à la première virgule qui n'est dans aucune parenthèse imbriquée. */
function couperALaVirguleDeSommet(contenu: string): [string, string] {
    let profondeur = 0;
    let coupure = -1;

    for (let i = 0; i < contenu.length; i += 1) {
        const caractere = contenu[i];
        if (caractere === '(') {
            profondeur += 1;
        }
        if (caractere === ')') {
            profondeur -= 1;
        }
        if (caractere === ',' && profondeur === 0) {
            coupure = i;
            break;
        }
    }

    return [contenu.slice(0, coupure).trim(), contenu.slice(coupure + 1).trim()];
}

/** Le texte, commentaires CSS retirés : un exemple en prose ne doit ni faire
 *  rougir l'invariant, ni compter pour son garde de non-vacuité. */
function sansCommentaires(texte: string): string {
    return texte.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Extrait les deux arguments de chaque appel `light-dark(...)` du système,
 *  hors commentaires. */
function argumentsDeChaqueLightDark(texte: string): [string, string][] {
    const paires: [string, string][] = [];
    const motif = /light-dark\(/g;
    let correspondance;
    const sansProse = sansCommentaires(texte);

    while ((correspondance = motif.exec(sansProse)) !== null) {
        const depuis = correspondance.index + correspondance[0].length;
        const contenu = contenuEntreParentheses(sansProse, depuis);
        paires.push(couperALaVirguleDeSommet(contenu));
    }

    return paires;
}

/**
 * Un `<color>` valide est un seul jeton — un mot-clé, une couleur hexadécimale,
 * ou un unique appel de fonction (`rgb(...)`, `var(--x)`...). Une géométrie
 * comme `0 1px 4px rgb(0 0 0 / 40%)` en ajoute d'autres, séparés par des
 * espaces **hors de toute parenthèse** : c'est ce qui la distingue d'une
 * couleur, y compris d'une couleur dérivée par une fonction imbriquée sur
 * plusieurs lignes, dont les espaces internes restent, eux, dans la
 * parenthèse.
 */
function contientUnEspaceHorsParentheses(argument: string): boolean {
    let profondeur = 0;
    for (const caractere of argument) {
        if (caractere === '(') {
            profondeur += 1;
        } else if (caractere === ')') {
            profondeur -= 1;
        } else if (profondeur === 0 && /\s/.test(caractere)) {
            return true;
        }
    }
    return false;
}

describe('La grammaire de light-dark()', () => {
    describe("Étant donné une déclaration light-dark(), quand on regarde ce qu'elle enveloppe", () => {
        it("alors chacun de ses deux arguments n'est qu'une couleur, jamais une géométrie", () => {
            // `light-dark()` est une fonction de couleur : sa grammaire est
            // `light-dark(<color>, <color>)`. L'envelopper autour d'un
            // `box-shadow` entier (géométrie et couleur ensemble) est
            // syntaxiquement accepté par une propriété personnalisée — qui
            // avale n'importe quels jetons à l'analyse, sans protester — mais
            // invalide au calcul, où la substitution retombe sur `unset`.
            //
            // Ce défaut ne se voit **pas** au rendu construit : le
            // transformateur CSS de la chaîne de build (`lightningcss`, via
            // Vite) réécrit `light-dark(A, B)` en une paire de `var()` de
            // secours sans valider que `A` et `B` sont chacun une couleur, et
            // « répare » donc la forme invalide par le même mécanisme que la
            // forme valide — mesuré : `pnpm test:e2e`, qui exerce le build de
            // production, ne peut pas distinguer les deux (voir
            // `e2e/ombres.spec.ts`). Seul le CSS servi brut (`pnpm dev`) le
            // laisse voir tel quel à un moteur de rendu natif — et c'est donc
            // dans le texte source, pas dans un rendu, que ce témoin doit
            // vivre.
            const paires = argumentsDeChaqueLightDark(systeme);
            const fautifs = paires.filter(
                ([premier, second]) =>
                    contientUnEspaceHorsParentheses(premier) ||
                    contientUnEspaceHorsParentheses(second),
            );

            expect(paires.length).toBeGreaterThan(0);
            expect(fautifs).toEqual([]);
        });
    });

    describe("Étant donné un exemple invalide écrit dans un commentaire, quand on lit ce qu'il enveloppe", () => {
        it("alors l'invariant ne le voit pas, mais rougit toujours sur la même forme écrite hors commentaire", () => {
            // Le défaut à couvrir : lire le système « commentaires compris »
            // ferait rougir l'invariant sur cet exemple en prose — un faux
            // échec, puisque rien n'est déclaré ici.
            const texteFictif = `
                /* Jamais valide, à ne montrer qu'en exemple :
                   light-dark(0 1px 4px rgb(0 0 0 / 40%), red) */
                --ombre-fictive: light-dark(0 1px 4px rgb(0 0 0 / 40%), red);
            `;

            const paires = argumentsDeChaqueLightDark(texteFictif);
            const fautifs = paires.filter(
                ([premier, second]) =>
                    contientUnEspaceHorsParentheses(premier) ||
                    contientUnEspaceHorsParentheses(second),
            );

            // Une seule paire : celle du commentaire a disparu avec lui : seule
            // la vraie déclaration reste, et c'est elle qui rougit.
            expect(paires).toHaveLength(1);
            expect(fautifs).toHaveLength(1);
        });
    });

    describe("Étant donné une mention de light-dark() qui ne vit que dans un commentaire, quand on regarde ce que l'invariant en tire", () => {
        it('alors le garde de non-vacuité ne compte aucune paire', () => {
            // Le second symptôme du même défaut : `semantic.css` porte trois
            // `light-dark(...)` en commentaire, ce qui suffisait aujourd'hui à
            // satisfaire `paires.length > 0` même si la vraie feuille n'en
            // déclarait aucun.
            const texteFictif = `
                /* light-dark(A, B) — seulement un exemple, jamais une déclaration */
            `;

            const paires = argumentsDeChaqueLightDark(texteFictif);

            expect(paires).toEqual([]);
        });
    });
});

describe('Leaflet dans la cascade', () => {
    describe('Étant donné les contrôles de Leaflet à reprendre sans !important, quand on cherche où sa feuille est chargée', () => {
        it("alors elle l'est en couche vendor, la plus basse de l'ordre", () => {
            // Ce contrat a changé de fichier sans changer de nature : la tâche 2
            // l'a établi sur `screens/legacy.css`, mais l'`@import` de
            // leaflet.css vit désormais dans l'entrée du système — la couche
            // vendor étant la plus basse de l'ordre, toute déclaration des
            // couches suivantes l'emporte sans le moindre `!important`.
            expect(entree).toContain("@import url('leaflet/dist/leaflet.css') layer(vendor);");
        });
    });
});

const styles = feuilles['./components/text.css'] ?? '';

describe('Les styles de texte', () => {
    describe("Étant donné un style de texte, quand une règle l'applique", () => {
        it('alors elle applique les trois propriétés, jamais une seule', () => {
            // C'était le défaut le plus répandu : 16 déclarations `font-size`
            // dont 5 seulement portaient l'interligne et l'approche. Une taille
            // sans son approche n'est pas le style d'Apple, c'est sa moitié.
            const incomplets = STYLES_DE_TEXTE.filter(({ nom }) => {
                const regle = new RegExp(`\\.text-${nom}\\s*\\{([^}]*)\\}`).exec(styles);
                const corps = regle?.[1] ?? '';
                return !(
                    corps.includes(`var(--text-${nom}-size)`) &&
                    corps.includes(`var(--text-${nom}-leading)`) &&
                    corps.includes(`var(--text-${nom}-tracking)`)
                );
            }).map(({ nom }) => nom);

            expect(incomplets).toEqual([]);
        });
    });

    describe("Étant donné le socle des éléments, quand on regarde ce qu'il déclare", () => {
        it('alors il ne nomme aucune classe : ce sont des défauts, pas un vocabulaire', () => {
            const socle = feuilles['./base/elements.css'] ?? '';
            const sansCommentaires = socle.replace(/\/\*[\s\S]*?\*\//g, '');

            // Sans ancre de début de ligne : une classe glissée sur la même
            // ligne que ce qui la précède (une accolade fermante, un
            // commentaire retiré) reste un sélecteur de classe, où qu'elle
            // tombe dans le texte.
            expect(sansCommentaires).not.toMatch(/\.[a-z][\w-]*\s*\{/);
        });
    });
});

const surface = feuilles['./components/surface.css'] ?? '';

describe('Le matériau', () => {
    describe('Étant donné le verre, quand on cherche où il est écrit', () => {
        it("alors un seul fichier le déclare, et c'est celui qui le nomme", () => {
            // Huit règles le redéclaraient. Chacune était une occasion
            // d'oublier la préfixée, le plafond de flou, ou la retraction
            // d'accessibilité — et deux l'avaient déjà fait.
            const fichiersQuiFloutent = Object.entries(feuilles)
                .filter(([, contenu]) => contenu.includes('backdrop-filter:'))
                .map(([chemin]) => chemin);

            expect(fichiersQuiFloutent).toEqual(['./components/surface.css']);
        });
    });

    describe('Étant donné WebKit, quand la règle pose le flou', () => {
        it('alors la préfixée précède la standard, à la lettre', () => {
            // Mesuré : sans la préfixée AVANT, WebKit ne floute rien. Et les
            // deux valeurs doivent être identiques au caractère près, sinon
            // les deux moteurs rendent deux matériaux différents.
            //
            // Ancrées en début de ligne (`^[ \t]*`, drapeau `m`) : la
            // condition du `@supports` porte elle-même les deux chaînes
            // `backdrop-filter:` et `-webkit-backdrop-filter:`, au milieu
            // d'une ligne de feature-query et sans point-virgule pour la
            // borner. Une regex non ancrée démarre là par erreur et avale,
            // via `[^;]+`, tout le texte jusqu'au premier point-virgule
            // réel — la vraie déclaration suivante — ce qui rend `prefixee`
            // différente de `standard` sur un fichier pourtant conforme.
            // Sondé : sans l'ancre, ce témoin rougissait sur `surface.css`
            // alors que la préfixée et la standard y sont identiques.
            const paires = [
                ...surface.matchAll(
                    /^[ \t]*-webkit-backdrop-filter:\s*([^;\n]+);\s*\n[ \t]*backdrop-filter:\s*([^;\n]+);/gm,
                ),
            ];

            expect(paires.length).toBeGreaterThan(0);
            for (const [, prefixee, standard] of paires) {
                expect(prefixee).toBe(standard);
            }
            // Aucune `backdrop-filter` orpheline : autant de standards que de
            // paires. Même ancrage que ci-dessus, pour la même raison : un
            // `[^-]backdrop-filter:` compterait aussi l'occurrence non
            // préfixée de la condition du `@supports`.
            expect((surface.match(/^[ \t]*backdrop-filter:/gm) ?? []).length).toBe(paires.length);
        });
    });

    describe('Étant donné les bogues 289800 et 297620 de WebKit, quand on écrit le flou', () => {
        it("alors aucune variable n'entre dans la déclaration", () => {
            // WebKit ignore un `var()` a l'interieur de `backdrop-filter` :
            // le verre disparait sans erreur. Le plafond de 20 px s'ecrit donc
            // en clair, et le jeton --surface-blur reste documentaire.
            //
            // Ancrée en début de ligne, même raison que le témoin précédent :
            // `surface.css` porte deux conditions de `@supports` (la pose et
            // son repli `@supports not`), chacune répétant `backdrop-filter:`
            // sans point-virgule pour la borner. Sondé : sans l'ancre, ce
            // témoin rougissait — la condition du repli se faisait avaler
            // jusqu'au premier point-virgule réel, à l'intérieur du repli
            // lui-même (`background: var(--fond);`), et y trouvait un
            // `var(` qui n'appartient à aucun `backdrop-filter`.
            const declarations =
                surface.match(/^[ \t]*(-webkit-)?backdrop-filter:[^;\n]+;/gm) ?? [];

            expect(declarations.length).toBeGreaterThan(0);
            expect(declarations.filter((d) => d.includes('var('))).toEqual([]);
        });
    });

    describe('Étant donné le verre, quand on cherche son repli', () => {
        it('alors tout sélecteur qui le porte a sa contrepartie dans le repli, sauf les deux exceptions nommées', () => {
            // Le défaut à couvrir : le bloc `@supports not` n'a longtemps
            // couvert que les huit sélecteurs hérités de `screens/legacy.css`
            // — ni `.surface`, ni `.surface-regular`, ni `.surface-thick`, la
            // classe même que cette tâche produit. Dormant tant que rien ne
            // consomme encore `.surface`, ce défaut serait devenu un vrai
            // trou visuel — une vitre sans aucun fond — dès qu'une tâche
            // suivante s'y serait fiée seule sur un moteur sans
            // `backdrop-filter`.
            //
            // Sans commentaires : un exemple en prose ne doit pas compter
            // comme un sélecteur. Ancré sur l'indentation de `@supports`,
            // rejouée en rétro-référence pour sa propre fermeture — même
            // technique que `legacy.test.ts`, pour la même raison : un
            // quantificateur paresseux borné par une indentation quelconque
            // s'arrêterait à la première règle imbriquée, pas au bloc entier.
            const sansProse = surface.replace(/\/\*[\s\S]*?\*\//g, ' ');

            const pose = /^([ \t]*)@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                sansProse,
            );
            const repli = /^([ \t]*)@supports not \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                sansProse,
            );

            expect(pose?.[2]).toBeTruthy();
            expect(repli?.[2]).toBeTruthy();

            const classesDe = (bloc: string): Set<string> =>
                new Set([...bloc.matchAll(/\.[a-z][\w-]*/g)].map((m) => m[0]));

            const classesDuVerre = classesDe(pose?.[2] ?? '');
            const classesDuRepli = classesDe(repli?.[2] ?? '');

            // `.carte-bar` ne portait ni fond ni ombre en dehors du verre :
            // l'omettre du repli n'est pas un oubli, c'est qu'il n'a jamais
            // eu de valeur à y répéter — la tâche 5 en décidera. `.header`
            // en sortait aussi jusqu'à la tâche 2 (partie 2), mais pour la
            // mauvaise raison : c'était le défaut fondateur du chantier, pas
            // un choix. Il a désormais son repli, comme tous les autres.
            const EXCEPTIONS = new Set(['.carte-bar']);

            const oublies = [...classesDuVerre].filter(
                (classe) => !EXCEPTIONS.has(classe) && !classesDuRepli.has(classe),
            );

            expect(oublies).toEqual([]);
        });
    });
});

const bar = feuilles['./components/bar.css'] ?? '';

describe('La barre d écran', () => {
    describe('Étant donné les deux barres, quand on cherche ce qui fixe leur hauteur', () => {
        it("alors un seul jeton la porte, et aucun modificateur n'y touche", () => {
            // Le défaut fondateur : `.header` et `.suivi-bar` déclaraient
            // chacune leur rembourrage vertical, et avaient dérivé de 18 px.
            // Pire, celui de l'en-tête était NUL : un bouton de 44 px y
            // touchait les deux bords.
            const declarationsDeHauteur = bar.match(/--bar-(?:air|height):/g) ?? [];

            expect(declarationsDeHauteur).toHaveLength(2);

            // Les modificateurs ne redéfinissent ni l'un ni l'autre. Le plan
            // les nomme `.bar-navigation`/`.bar-status` : cette tâche déplace
            // des règles sans renommer leurs sélecteurs (`.header`,
            // `.suivi-bar` restent ce qu'ils sont, la tâche 6 s'en chargera
            // d'un bloc), mais les deux modificateurs, eux, sont neufs — rien
            // à leur substituer.
            const modificateurs = bar.match(/\.bar-[a-z]+\s*\{([^}]*)\}/g) ?? [];
            expect(modificateurs.length).toBeGreaterThan(0);
            expect(modificateurs.filter((m) => /--bar-(?:air|height)/.test(m))).toEqual([]);
        });
    });

    describe('Étant donné une barre au repos, quand on regarde ce qui la sépare du contenu', () => {
        it("alors c'est un effet de bord, et aucun filet", () => {
            // « Instead of a background, use a scroll edge effect to provide a
            // transition between content and the control area. » Un filet ET
            // l'effet font deux transitions pour un bord, et le filet est
            // celle qui se voit au repos.
            expect(bar).toMatch(/\.header::after,\s*\.suivi-bar::after\s*\{/);
            expect(bar).not.toMatch(/border-(?:bottom|block-end):\s*1px/);
        });
    });
});
