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
            //
            // Onzième témoin vide de ce chantier, trouvé en substituant les alias
            // du pont (tâche 7) : `[\s\S]*?\n\}` s'arrête au premier `\n}`
            // rencontré, y compris dans un COMMENTAIRE qui cite la requête en
            // prose — l'en-tête de `map-overlay.css` le fait — et avale alors
            // tout le fichier jusqu'à sa dernière accolade, sans rapport avec le
            // vrai bloc. Tant que les composants référençaient les alias
            // français du pont (`--fond`, `--verre-epais`…), cette capture
            // fantôme ne contenait jamais `--color-` ni `--material-` et restait
            // invisible ; la substitution vers le palier sémantique l'a fait
            // rougir en révélant un vrai bloc de 13 000 caractères de large.
            // Comme « le palier contraste élevé » un peu plus bas : hors
            // commentaires, et bornage par comptage d'accolades plutôt que par
            // une regex paresseuse.
            const sansProse = sansCommentaires(systeme);
            const blocsSombres: string[] = [];
            const motif = /@media \(prefers-color-scheme: dark\)\s*\{/g;
            let ouverture;
            while ((ouverture = motif.exec(sansProse)) !== null) {
                let indice = ouverture.index + ouverture[0].length;
                let profondeur = 1;
                let bloc = '';
                while (profondeur > 0 && indice < sansProse.length) {
                    const caractere = sansProse[indice] ?? '';
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
                blocsSombres.push(bloc);
            }

            expect(blocsSombres.length).toBeGreaterThan(0);

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
        it('alors elle se dérive de la même primitive que le fond groupé, au lieu de le recopier', () => {
            // Contrat à sauver n° 3 (registre de la tâche 7, ex-« La teinte du
            // verre au repos » de `legacy.test.ts`) : la teinte du verre au
            // repos DOIT dériver de la **même primitive** que le fond groupé —
            // c'est ce qui rend une barre invisible avant tout défilement.
            //
            // Elle était une copie manuelle : `--verre: rgba(242, 242, 247,
            // .72)` devait s'accorder à la main avec `--fond-groupe`. Deux
            // valeurs à tenir d'accord, donc deux valeurs qui dérivent — une
            // teinte blanche sur un fond gris clair formait une bande visible
            // avant tout défilement, l'anti-motif exact.
            //
            // Un simple `toMatch` sur `--grey-grouped` prouverait qu'une
            // primitive de CE nom-là intervient quelque part, pas que c'est
            // la MÊME que celle du fond : les deux noms capturés sont donc
            // comparés entre eux, dans chaque branche `light-dark()`.
            const fondGroupe =
                /--color-background-grouped:\s*light-dark\(\s*var\((--[a-z0-9-]+)\)\s*,\s*var\((--[a-z0-9-]+)\)\s*\)/.exec(
                    semantique,
                );
            const verreRegulier =
                /--material-regular:\s*light-dark\(\s*rgb\(from var\((--[a-z0-9-]+)\)[\s\S]*?,\s*rgb\(from var\((--[a-z0-9-]+)\)/.exec(
                    semantique,
                );

            expect(fondGroupe?.[1]).toBeTruthy();
            expect(verreRegulier?.[1]).toBe(fondGroupe?.[1]);
            expect(verreRegulier?.[2]).toBe(fondGroupe?.[2]);
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

            // `.map-overlay-bar` ne portait ni fond ni ombre en dehors du
            // verre : l'omettre du repli n'est pas un oubli, c'est qu'il n'a
            // jamais eu de valeur à y répéter — la tâche 5 en a décidé.
            // `.bar-navigation` en sortait aussi jusqu'à la tâche 2
            // (partie 2), mais pour la mauvaise raison : c'était le défaut
            // fondateur du chantier, pas un choix. Il a désormais son repli,
            // comme tous les autres.
            const EXCEPTIONS = new Set(['.map-overlay-bar']);

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

            // Compter ne suffit pas : un jeton déclaré puis ignoré ne
            // protège rien. Le socle doit réellement s'en servir pour fixer
            // le rembourrage — sans quoi une édition future pourrait
            // déclarer `--bar-air` d'un côté et écrire `padding-block:
            // 0.5rem` en dur de l'autre, et passer ce témoin tout en
            // recréant exactement la dérive qu'il existe pour interdire.
            expect(bar).toMatch(/padding-block:\s*var\(--bar-air\)/);

            // Les modificateurs ne redéfinissent ni l'un ni l'autre.
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
            expect(bar).toMatch(/\.bar::after\s*\{/);
            expect(bar).not.toMatch(/border-(?:bottom|block-end):\s*1px/);
        });
    });
});

const bouton = sansCommentaires(feuilles['./components/button.css'] ?? '');
const groupe = sansCommentaires(feuilles['./components/button-group.css'] ?? '');

describe('La famille des contrôles', () => {
    describe('Étant donné un groupe de boutons, quand le verre se pose', () => {
        it('alors il se pose sur le groupe, jamais sur ses enfants', () => {
            // « Group related controls and apply Liquid Glass to the group
            // rather than to each control. » Deux verres empilés ne
            // floutent pas deux fois : le second échantillonne le premier,
            // et le matériau devient laiteux. Un enfant garde le droit à son
            // propre remplissage plat — les « pairs » de `.button-group
            // button` par exemple — ce que la règle interdit, c'est qu'il
            // porte le matériau lui-même : `backdrop-filter`, ou une teinte
            // `--verre*` qui l'imiterait. Sans commentaires : un exemple en
            // prose ne doit ni faire rougir ce témoin, ni compter comme une
            // vraie déclaration — même piège que celui déjà couvert par « La
            // grammaire de light-dark() ».
            expect(groupe).toMatch(/\.button-group-point\b/);
            expect(groupe).toMatch(/\.button-group-image\b/);

            const reglesEnfants =
                groupe.match(
                    /\.(?:button-group|button-group-image|button-group-point)\s+[^\s{,][^{,]*\{([^}]*)\}/g,
                ) ?? [];

            expect(reglesEnfants.length).toBeGreaterThan(0);
            expect(
                reglesEnfants.filter((regle) => /backdrop-filter|var\(--verre/.test(regle)),
            ).toEqual([]);
        });
    });

    describe('Étant donné des rayons imbriqués, quand on les calcule', () => {
        it("alors l'intérieur se dérive de l'extérieur, au lieu d'être écrit à côté", () => {
            // « Consider aligning the shape of controls with other rounded
            // elements. » Deux rayons écrits séparément dérivent ; un calcul
            // ne le peut pas. Sans commentaires, pour la même raison que
            // ci-dessus : sondé — sans le retrait, ce témoin restait vert
            // même quand la vraie déclaration ne portait plus que
            // `var(--group-radius)` seul, parce que l'en-tête du fichier cite
            // la formule complète en exemple.
            expect(groupe).toMatch(/--group-radius:/);
            expect(groupe).toMatch(/--group-padding:/);
            expect(groupe).toMatch(
                /calc\(\s*var\(--group-radius\)\s*-\s*var\(--group-padding\)\s*\)/,
            );
        });
    });

    describe('Étant donné un bouton, quand on mesure sa cible', () => {
        it('alors les deux dimensions ont leur plancher, pas seulement la hauteur', () => {
            // Mesuré en partie 1 : onze boutons à pictogramme rendaient
            // 36x44 sous WebKit. La règle citait « at least 44x44 pt » et
            // n'en planchait qu'une.
            const regle = /(?:^|\n)\s*button\s*\{([^}]*)\}/.exec(bouton);

            expect(regle?.[1]).toMatch(/min-block-size:\s*var\(--hit-target\)/);
            expect(regle?.[1]).toMatch(/min-inline-size:\s*var\(--hit-target\)/);
        });
    });
});

interface RegleBrute {
    selecteur: string;
    corps: string;
}
interface BlocEnCours {
    selecteur: string;
    debut: number;
    enfants: boolean;
}

/** Referme le bloc en tête de pile : l'enregistre comme règle feuille s'il
 *  n'a lui-même reçu aucun enfant, et marque son parent comme en ayant un —
 *  extrait de `reglesFeuilles` pour garder chaque fonction lisible d'un
 *  coup d'œil. */
function fermerBloc(pile: BlocEnCours[], texte: string, fin: number, regles: RegleBrute[]): void {
    const bloc = pile.pop();
    if (!bloc) {
        return;
    }
    if (!bloc.enfants) {
        regles.push({ selecteur: bloc.selecteur, corps: texte.slice(bloc.debut, fin) });
    }
    const parent = pile[pile.length - 1];
    if (parent) {
        parent.enfants = true;
    }
}

/**
 * Une règle « feuille » : un sélecteur suivi de déclarations, sans aucune
 * accolade imbriquée dans son corps — par opposition à un conteneur
 * (`@media`, `@supports`, `@layer`), dont les propres règles internes sont,
 * elles, remontées individuellement par le même parcours.
 */
function reglesFeuilles(texte: string): RegleBrute[] {
    const sansCommentaires = texte.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const regles: RegleBrute[] = [];
    const pile: BlocEnCours[] = [];
    let tampon = '';

    for (let i = 0; i < sansCommentaires.length; i += 1) {
        const caractere = sansCommentaires[i] ?? '';
        if (caractere === '{') {
            pile.push({ selecteur: tampon.trim(), debut: i + 1, enfants: false });
            tampon = '';
        } else if (caractere === '}') {
            fermerBloc(pile, sansCommentaires, i, regles);
            tampon = '';
        } else {
            tampon += caractere;
        }
    }

    return regles;
}

/** Coupe une liste de sélecteurs séparés par des virgules de sommet — jamais
 *  à l'intérieur d'une parenthèse, comme celle de `:is(h1, h2)`. */
function separerSelecteurs(selecteur: string): string[] {
    const parties: string[] = [];
    let profondeur = 0;
    let debut = 0;

    for (let i = 0; i < selecteur.length; i += 1) {
        const caractere = selecteur[i] ?? '';
        if (caractere === '(') {
            profondeur += 1;
        }
        if (caractere === ')') {
            profondeur -= 1;
        }
        if (caractere === ',' && profondeur === 0) {
            parties.push(selecteur.slice(debut, i));
            debut = i + 1;
        }
    }
    parties.push(selecteur.slice(debut));

    return parties.map((partie) => partie.trim()).filter((partie) => partie.length > 0);
}

/**
 * Le dernier maillon d'un sélecteur composé — celui dont dépend l'élément
 * réellement stylé, en ignorant ses ancêtres. `.header .action-bar` et
 * `.action-bar` ciblent le même maillon, donc le même élément ; `.header
 * button.secondary` et `.header` non — l'un style un bouton descendant,
 * l'autre l'en-tête lui-même.
 */
function dernierMaillon(selecteurUnique: string): string {
    let profondeur = 0;
    let derniereCoupure = 0;

    for (let i = 0; i < selecteurUnique.length; i += 1) {
        const caractere = selecteurUnique[i] ?? '';
        if (caractere === '(') {
            profondeur += 1;
        }
        if (caractere === ')') {
            profondeur -= 1;
        }
        if (profondeur === 0 && /[\s>+~]/.test(caractere)) {
            derniereCoupure = i + 1;
        }
    }

    return selecteurUnique.slice(derniereCoupure).trim();
}

/** Les classes que le dernier maillon de chaque alternative d'un sélecteur
 *  cible réellement — jamais celles d'un simple ancêtre, ni celle qu'un
 *  `:not(...)` exclut. `button:not(.secondary)` et `button.secondary` ne
 *  peuvent jamais styler le même élément : le premier ne « cible » pas
 *  `.secondary`, il l'écarte. Sans ce retrait, `.header .action-bar
 *  button:not(.secondary)` (screens) se disputerait à tort `.secondary`
 *  avec `button.secondary` (components) — deux sélecteurs mutuellement
 *  exclusifs, jamais deux règles qui se recouvrent. */
function classesCiblees(selecteur: string): string[] {
    return separerSelecteurs(selecteur).flatMap((partie) =>
        [
            ...dernierMaillon(partie)
                .replace(/:not\([^)]*\)/g, '')
                .matchAll(/\.([a-zA-Z][\w-]*)/g),
        ].map((correspondance) => correspondance[1] ?? ''),
    );
}

/** Les propriétés qu'un corps de règle déclare, jetons de composant
 *  compris — `;` ou début de corps devant chacune. */
function proprietesDuCorps(corps: string): string[] {
    return [...corps.matchAll(/(?:^|;)\s*(-{0,2}[a-zA-Z][\w-]*)\s*:/g)].map(
        (correspondance) => correspondance[1] ?? '',
    );
}

/**
 * Les familles de propriétés dans lesquelles un abrégé et un long se
 * disputent la même chose. Le mécanisme n'est pas la ressemblance des noms :
 * `padding-block` (posé par un composant) et `padding` (resté dans
 * `screens/`) écrivent tous deux le rembourrage vertical d'un élément, donc
 * la couche tranche entre eux avant que la spécificité n'entre en jeu —
 * exactement comme elle l'a fait pour `flex-wrap` contre `flex-wrap`, sauf
 * qu'ici les deux noms diffèrent et qu'une comparaison de chaînes littérales
 * ne les verrait jamais entrer en collision.
 *
 * La table n'a pas besoin d'être exhaustive : elle couvre les familles que
 * ce dépôt emploie réellement, déclinaisons logiques comprises
 * (`-block`, `-inline`, `-block-start`…) — celles des règles que les tâches
 * 3 à 5 s'apprêtent justement à extraire (`.action-bar`, les rangées de
 * liste), où ce dépôt mélange déjà l'abrégé et le long.
 *
 * `border-radius` est délibérément une famille à part, et non un membre de
 * `border` : les deux ne se disputent rien, l'un la bordure, l'autre son
 * rayon — un témoin qui les confondrait crierait à tort.
 */
const FAMILLES_DE_PROPRIETES: Record<string, string[]> = {
    padding: [
        'padding',
        'padding-block',
        'padding-inline',
        'padding-block-start',
        'padding-block-end',
        'padding-inline-start',
        'padding-inline-end',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
    ],
    margin: [
        'margin',
        'margin-block',
        'margin-inline',
        'margin-block-start',
        'margin-block-end',
        'margin-inline-start',
        'margin-inline-end',
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
    ],
    border: [
        'border',
        'border-width',
        'border-style',
        'border-color',
        'border-block',
        'border-inline',
        'border-block-start',
        'border-block-end',
        'border-inline-start',
        'border-inline-end',
        'border-top',
        'border-right',
        'border-bottom',
        'border-left',
    ],
    'border-radius': [
        'border-radius',
        'border-start-start-radius',
        'border-start-end-radius',
        'border-end-start-radius',
        'border-end-end-radius',
        'border-top-left-radius',
        'border-top-right-radius',
        'border-bottom-left-radius',
        'border-bottom-right-radius',
    ],
    background: [
        'background',
        'background-color',
        'background-image',
        'background-position',
        'background-size',
        'background-repeat',
        'background-attachment',
        'background-clip',
        'background-origin',
        'background-blend-mode',
    ],
    font: [
        'font',
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'font-variant',
        'font-stretch',
        'line-height',
    ],
    flex: ['flex', 'flex-grow', 'flex-shrink', 'flex-basis'],
    'flex-flow': ['flex-flow', 'flex-direction', 'flex-wrap'],
    gap: ['gap', 'row-gap', 'column-gap'],
    inset: [
        'inset',
        'inset-block',
        'inset-inline',
        'inset-block-start',
        'inset-block-end',
        'inset-inline-start',
        'inset-inline-end',
        'top',
        'right',
        'bottom',
        'left',
    ],
    overflow: ['overflow', 'overflow-x', 'overflow-y', 'overflow-block', 'overflow-inline'],
};

const FAMILLE_PAR_PROPRIETE = new Map<string, string>(
    Object.entries(FAMILLES_DE_PROPRIETES).flatMap(([famille, proprietes]) =>
        proprietes.map((propriete): [string, string] => [propriete, famille]),
    ),
);

/** La famille d'une propriété — elle-même si la table ne lui en connaît pas,
 *  auquel cas la comparaison reste l'égalité de chaîne d'avant cette
 *  extension. */
function familleDe(propriete: string): string {
    return FAMILLE_PAR_PROPRIETE.get(propriete) ?? propriete;
}

interface ProprieteEnConflit {
    composant: string;
    ecran: string;
}

/** Les paires (propriété de composant, propriété d'écran) de même famille —
 *  abrégé contre long compris. */
function proprietesEnConflit(
    proprietesComposant: Set<string>,
    proprietesEcran: Set<string>,
): ProprieteEnConflit[] {
    const conflits: ProprieteEnConflit[] = [];
    for (const proprieteEcran of proprietesEcran) {
        for (const proprieteComposant of proprietesComposant) {
            if (familleDe(proprieteComposant) === familleDe(proprieteEcran)) {
                conflits.push({ composant: proprieteComposant, ecran: proprieteEcran });
            }
        }
    }
    return conflits;
}

interface RegleUtile {
    chemin: string;
    selecteur: string;
    classes: Set<string>;
    proprietes: Set<string>;
}

/** Les règles d'un ensemble de feuilles qui ciblent au moins une classe et
 *  déclarent au moins une propriété — les seules qui peuvent entrer en
 *  collision avec une autre. */
function reglesUtiles(fichiers: [string, string][]): RegleUtile[] {
    const resultat: RegleUtile[] = [];
    for (const [chemin, contenu] of fichiers) {
        for (const regle of reglesFeuilles(contenu)) {
            const classes = new Set(classesCiblees(regle.selecteur));
            const proprietes = new Set(proprietesDuCorps(regle.corps));
            if (classes.size > 0 && proprietes.size > 0) {
                resultat.push({ chemin, selecteur: regle.selecteur, classes, proprietes });
            }
        }
    }
    return resultat;
}

/** Décrit la collision entre une règle de composant et une règle d'écran —
 *  `null` si elles ne partagent ni classe ni propriété de même famille. */
function decrireInversion(composant: RegleUtile, ecran: RegleUtile): string | null {
    const classesCommunes = [...ecran.classes].filter((classe) => composant.classes.has(classe));
    const conflits = proprietesEnConflit(composant.proprietes, ecran.proprietes);
    if (classesCommunes.length === 0 || conflits.length === 0) {
        return null;
    }

    const classes = classesCommunes.map((classe) => `.${classe}`).join(', ');
    const proprietesTexte = conflits
        .map(({ composant: proprieteComposant, ecran: proprieteEcran }) =>
            proprieteComposant === proprieteEcran ?
                `« ${proprieteEcran} »`
            :   `« ${proprieteComposant} » (composant) contre « ${proprieteEcran} » (écran)`,
        )
        .join(', ');
    return `${composant.chemin} « ${composant.selecteur} » et ${ecran.chemin} « ${ecran.selecteur} » se disputent ${proprietesTexte} sur ${classes}`;
}

/** Toute paire (règle de composant, règle d'écran) qui partage une classe
 *  ciblée et une propriété : une couche `components` déclarée plus tôt que
 *  `screens` ne peut jamais gagner une telle paire, quelle que soit sa
 *  spécificité.
 *
 *  `.carte-bar` n'a plus besoin de son exception : la tâche 1 l'avait
 *  explicitement laissé hors de ce témoin en attendant la tâche 5, qui vient
 *  de lui donner son fichier de composant (`components/map-overlay.css`) —
 *  `.carte-bar` n'apparaît donc plus jamais dans une feuille de `screens/`,
 *  et `viseCarteBar` (le filtre qui l'excluait) devenait de l'échafaudage
 *  mort. */
function trouverInversions(feuillesDuSysteme: Record<string, string>): string[] {
    const entrees = Object.entries(feuillesDuSysteme);
    const composants = reglesUtiles(
        entrees.filter(([chemin]) => chemin.startsWith('./components/')),
    );
    const ecrans = reglesUtiles(entrees.filter(([chemin]) => chemin.startsWith('./screens/')));

    const inversions: string[] = [];
    for (const composant of composants) {
        for (const ecran of ecrans) {
            const description = decrireInversion(composant, ecran);
            if (description) {
                inversions.push(description);
            }
        }
    }
    return inversions;
}

describe("L'inversion de cascade entre un composant et un écran", () => {
    describe('Étant donné une classe stylée à la fois par un composant et par screens/, quand on cherche qui gagne', () => {
        it('alors aucune : components perd toujours face à screens, quelle que soit la spécificité', () => {
            // `@layer vendor, reset, tokens, base, components, screens` —
            // une couche déclarée plus tard l'emporte **toujours**, quelle
            // que soit la spécificité. Une règle qui reste dans `screens/`
            // après qu'une autre a migré vers `components/` pour la même
            // classe et la même propriété ne peut donc plus jamais perdre
            // contre elle, même si sa spécificité était plus faible avant
            // le déplacement.
            //
            // Mesuré : `.header .action-bar { flex-wrap: nowrap }`, posée un
            // temps dans `components/bar.css`, perdait *toujours* contre
            // `.action-bar { flex-wrap: wrap }` restée dans
            // `screens/legacy.css` — `flex-wrap` calculé à `wrap` sur
            // `.action-bar` à 360 px, l'en-tête à deux rangées au lieu
            // d'une. Ce témoin est générique — il ne nomme aucune classe —
            // pour attraper la même dérive sur n'importe laquelle des trois
            // extractions qui restent après cette tâche.
            expect(trouverInversions(feuilles)).toEqual([]);
        });
    });
});

const contenu = ['badge', 'row', 'panel', 'banner', 'field'];

describe('La couche de contenu', () => {
    describe('Étant donné un composant de contenu, quand on regarde sa surface', () => {
        it("alors aucun n'emprunte le verre, qui appartient à la couche fonctionnelle", () => {
            // « Liquid Glass forms a distinct functional layer […] that floats
            // above the content layer », et son corollaire explicite : « Don't
            // use Liquid Glass in the content layer. »
            // Garde de non-vacuité, et il est porteur : `contenu` est une
            // liste écrite à la main, `feuilles` vient du disque. Si l'un des
            // cinq fichiers était renommé ou supprimé, la recherche porterait
            // sur la chaîne vide, `fautifs` resterait vide, et le seul témoin
            // du « pas de verre dans la couche de contenu » passerait au vert
            // en ne gardant plus rien. Mesuré sur la liste : retirer
            // `panel.css` du disque laisse `fautifs` à `[]` et remplit
            // `absents`. La liste reste écrite à la main à dessein — elle
            // nomme la couche de contenu, et les composants fonctionnels que
            // les tâches suivantes ajouteront ne doivent pas y entrer.
            const absents = contenu.filter(
                (nom) => !Object.hasOwn(feuilles, `./components/${nom}.css`),
            );

            expect(absents).toEqual([]);

            const fautifs = contenu.filter((nom) => {
                // `sansCommentaires` : l'en-tête de contrat de `panel.css` et
                // de `banner.css` cite en prose l'interdit qu'il applique —
                // « ne porte backdrop-filter ni la classe .surface » —, et
                // cette citation, lue telle quelle, satisfait le motif que
                // ce témoin est censé faire échouer. Une prose ne doit pas
                // pouvoir faire rougir l'invariant qu'elle documente.
                const f = sansCommentaires(feuilles[`./components/${nom}.css`] ?? '');
                return /backdrop-filter|\.surface\b/.test(f);
            });

            expect(fautifs).toEqual([]);
        });
    });

    describe('Étant donné la pastille, quand on cherche ce qui fixe sa taille', () => {
        it('alors un seul jeton la porte, pour tous ses contextes', () => {
            // Mesure : la pastille du schema faisait 44 px et celle de la
            // carte 27,6 — le plancher de la regle du bouton s'appliquait a
            // l'une et pas a l'autre, et les deux vues cessaient de montrer le
            // meme reperage.
            const badge = feuilles['./components/badge.css'] ?? '';
            const tailles = badge.match(/--badge-size:/g) ?? [];

            expect(tailles).toHaveLength(1);
            expect(badge).toMatch(/min-inline-size:\s*0/);
            expect(badge).toMatch(/min-block-size:\s*0/);
        });
    });
});

describe('Les écrans', () => {
    describe("Étant donné une feuille d'écran, quand on regarde ce qu'elle déclare", () => {
        it('alors elle place, et ne peint pas', () => {
            // Un écran compose des composants ; il ne redécide pas leur
            // apparence. Une couleur ou un rayon écrit ici est un composant
            // qu'on n'a pas nommé.
            const ecrans = ['trajets-list', 'trajet-editor', 'suivi'];

            // Garde de non-vacuité : `ecrans` est écrit à la main, `feuilles`
            // vient du disque. Sans lui, renommer une feuille d'écran ferait
            // porter la recherche sur la chaîne vide et ce témoin passerait au
            // vert en ne gardant plus rien — le même défaut que le témoin de la
            // couche de contenu portait avant la tâche 4.
            const absents = ecrans.filter(
                (nom) => !Object.hasOwn(feuilles, `./screens/${nom}.css`),
            );

            expect(absents).toEqual([]);

            // La liste dit ce que « peindre » veut dire, et elle a été élargie
            // après la tâche 5 : les quatre propriétés d'origine laissaient
            // passer `border`, `box-shadow`, `fill`, `stroke` et
            // `background-color`, c'est-à-dire de la peinture entière. Mesuré :
            // les neuf sont propres aujourd'hui, à une exception près.
            const peintures = [
                'color:',
                'background:',
                'background-color:',
                'font-size:',
                'border-radius:',
                'border:',
                'box-shadow:',
                'fill:',
                'stroke:',
            ];

            // L'exception, nommée plutôt que tolérée : `image-frame
            // schema-page` porte un filet dans `trajet-editor.css`. Il vient
            // tel quel de la feuille en transit, et il attend le composant qui
            // l'accueillera — la tâche 7, quand les gabarits porteront les noms
            // du système. L'exception est porteuse : la vider fait rougir ce
            // témoin.
            const exceptions = ['trajet-editor declare border:'];

            const fautifs = ecrans
                .flatMap((nom) => {
                    const f = sansCommentaires(feuilles[`./screens/${nom}.css`] ?? '');

                    return peintures
                        .filter((propriete) => f.includes(propriete))
                        .map((propriete) => `${nom} declare ${propriete}`);
                })
                .filter((fautif) => !exceptions.includes(fautif));

            expect(fautifs).toEqual([]);
        });
    });

    describe('Étant donné la feuille en transit, quand cette tâche est finie', () => {
        it('alors elle ne porte plus aucune règle', () => {
            // Le critere de la tache : ce qui reste est vide, et la tache 7
            // pourra la supprimer sans rien emporter.
            //
            // Les preludes d'at-regles (`@layer`, `@media`, `@supports`)
            // deviennent de simples accolades avant l'analyse : ce sont des
            // enveloppes, pas des regles, et une feuille parfaitement videe
            // garde son `@layer screens { }`. Sonde a l'ecriture, sur six
            // cas : enveloppe seule, enveloppe avec commentaire, `@media`
            // vide, une regle simple, une regle sous `@media`, un selecteur
            // d'element nu.
            const sansProse = (feuilles['./screens/legacy.css'] ?? '').replace(
                /\/\*[\s\S]*?\*\//g,
                '',
            );
            const sansEnveloppes = sansProse.replace(/@[^{}]*\{/g, '{');
            const restantes = [...sansEnveloppes.matchAll(/([^{}\s][^{}]*?)\s*\{/g)].map((m) =>
                (m[1] ?? '').trim(),
            );

            expect(restantes).toEqual([]);
        });
    });
});

/** Les feuilles hors du palier des jetons : c'est là qu'une valeur littérale
 *  est une dérive, alors que `tokens/` est précisément l'endroit où elle doit
 *  vivre. Commentaires retirés — six témoins de ce chantier sont nés vides
 *  parce qu'une prose entrait dans ce qu'ils analysaient. */
function reglesHorsDesJetons(): [string, string][] {
    return Object.entries(feuilles)
        .filter(([chemin]) => !chemin.startsWith('./tokens/'))
        .map(([chemin, contenu]) => [chemin, sansCommentaires(contenu)]);
}

/** Résout un niveau de `var(--x)` contre les déclarations du système entier.
 *  Un niveau suffit : le contrat porte sur la valeur obtenue, pas sur le nom
 *  qui la transporte. */
function valeurResolue(brut: string): string {
    const jeton = /^var\(\s*(--[\w-]+)\s*\)$/.exec(brut.trim())?.[1];
    if (jeton === undefined) {
        return brut.trim();
    }
    return new RegExp(`${jeton}:\\s*([^;]+);`).exec(sansCommentaires(systeme))?.[1]?.trim() ?? brut;
}

/** Réduit chaque groupe parenthésé à un marqueur, du plus intérieur au plus
 *  extérieur. Le marqueur ne porte pas de parenthèses, sinon la réduction se
 *  stabilise sans jamais atteindre le groupe extérieur : `(…)` rendu en `()`
 *  reste une paire que le tour suivant réduit en elle-même, et
 *  `calc(var(--a) - var(--b))` se découpait alors en trois morceaux dont aucun
 *  n'était admissible. */
function sansParentheses(valeur: string): string {
    let reduit = valeur;
    let precedent = '';

    while (reduit !== precedent) {
        precedent = reduit;
        reduit = reduit.replace(/\([^()]*\)/g, '~');
    }

    return reduit;
}

describe('Les valeurs littérales du système', () => {
    describe('Étant donné une couleur à poser, quand une règle la nomme', () => {
        it("alors elle passe par un jeton, car aucune n'est écrite en clair hors du palier", () => {
            // La HIG prévient que « the actual color values may fluctuate from
            // release to release ». Une valeur recopiée dans une règle est une
            // valeur qui échappera à la prochaine mise à jour — et surtout à
            // l'apparence sombre, qui ne peut redéfinir que des jetons.
            //
            // Ce témoin portait autrefois sur la seule feuille en transit. Elle
            // est vide depuis la tâche 5, ce qui l'avait rendu vacant ; il
            // renaît ici au périmètre du système. Stylelint ne le remplace pas :
            // mesuré, `border: 1px solid #333` ne déclenche aucune règle de
            // `declaration-strict-value`, qui ne connaît pas les abrégés.
            const litterales = reglesHorsDesJetons().flatMap(([chemin, contenu]) =>
                [...contenu.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)/g)].map(
                    (trouve) => `${chemin} « ${trouve[0]} »`,
                ),
            );

            expect(litterales).toEqual([]);
        });
    });

    describe('Étant donné une surface arrondie, quand la règle lui donne son rayon', () => {
        it("alors c'est un angle vif, un jeton ou un calcul — jamais un nombre inventé", () => {
            // « Consider aligning the shape of controls with other rounded
            // elements throughout the interface. » Trois rayons de 6 px avaient
            // survécu à une refonte, et deux « 22px » étaient écrits en clair :
            // autant d'occasions de dériver.
            const admis = (part: string): boolean =>
                part === '0' ||
                part === 'inherit' ||
                part.startsWith('var~') ||
                part.startsWith('calc~');

            // Deux jetons de composant portent encore un nombre en clair, et
            // c'est une duplication connue, pas une tolérance de principe :
            // `--group-radius: 999px` réécrit ce que `--radius-pill` porte
            // déjà, et `--group-padding: 2px` ne passe par aucune échelle.
            // L'exception est porteuse — la vider fait rougir ce témoin — et se
            // lève en faisant pointer les deux vers le palier.
            const duplicationsConnues = ['--group-radius', '--group-padding'];

            // Un jeton déclaré dans `tokens/` est admissible quelle que soit sa
            // valeur : c'est précisément là qu'un nombre doit vivre. Le témoin
            // ne descend donc que dans ceux qu'un composant ou un écran déclare
            // pour son propre compte — et c'est ce que Stylelint ne sait pas
            // faire. Mesuré : `--rayon-invente: 7px; border-radius:
            // var(--rayon-invente);` ne déclenche aucune règle de
            // `declaration-strict-value`, qui se contente de voir un `var()` et
            // ne regarde jamais ce qu'il vaut.
            const declareHorsDuPalier = (jeton: string): boolean =>
                Object.entries(feuilles)
                    .filter(([chemin]) => !chemin.startsWith('./tokens/'))
                    .some(([, contenu]) =>
                        new RegExp(`${jeton}:\\s`).test(sansCommentaires(contenu)),
                    );

            const jetonInvente = (rayon: string): string | undefined =>
                (rayon.match(/--[\w-]+/g) ?? [])
                    .filter((jeton) => !duplicationsConnues.includes(jeton))
                    .filter(declareHorsDuPalier)
                    .find((jeton) => {
                        const valeur = valeurResolue(`var(${jeton})`);
                        return (
                            valeur !== `var(${jeton})` &&
                            !sansParentheses(valeur).split(/\s+/).every(admis)
                        );
                    });

            const inventes = reglesHorsDesJetons().flatMap(([chemin, contenu]) =>
                [...contenu.matchAll(/border-radius:\s*([^;]+);/g)]
                    .map((trouve) => (trouve[1] ?? '').trim())
                    .flatMap((rayon) => {
                        if (!sansParentheses(rayon).split(/\s+/).every(admis)) {
                            return [`${chemin} « ${rayon} » : nombre écrit en clair`];
                        }

                        const jeton = jetonInvente(rayon);

                        return jeton === undefined ?
                                []
                            :   [
                                    `${chemin} « ${rayon} » : ${jeton} vaut ${valeurResolue(
                                        `var(${jeton})`,
                                    )}`,
                                ];
                    }),
            );

            expect(inventes).toEqual([]);
        });
    });

    describe('Étant donné un texte à dimensionner, quand la règle choisit son corps', () => {
        it("alors c'est un des onze styles d'iOS, et jamais une taille inventée", () => {
            // Les onze styles au corps par défaut, en fraction du corps de
            // texte (Body = 17 pt = 1 rem, la racine suivant la taille
            // dynamique) : Large Title 2, Title 1 1.647, Title 2 1.294,
            // Title 3 1.176, Headline/Body 1, Callout 0.941, Subhead 0.882,
            // Footnote 0.765, Caption 1 0.706, Caption 2 0.647.
            //
            // `17px` est admis pour la seule racine : c'est le repli de
            // `base/elements.css` pour les moteurs qui ignorent
            // `font: -apple-system-body`, et il vaut Body par construction.
            //
            // Un `var()` est résolu d'un niveau : un jeton de composant comme
            // `--banner-font-size` doit porter une valeur de l'échelle, sans
            // quoi il suffirait de nommer une taille inventée pour la faire
            // passer.
            const echelle = [
                '2rem',
                '1.647rem',
                '1.294rem',
                '1.176rem',
                '1rem',
                '0.941rem',
                '0.882rem',
                '0.765rem',
                '0.706rem',
                '0.647rem',
                '17px',
            ];

            const inventees = reglesHorsDesJetons().flatMap(([chemin, contenu]) =>
                [...contenu.matchAll(/font-size:\s*([^;]+);/g)]
                    .map((trouve) => (trouve[1] ?? '').trim())
                    .filter((corps) => !echelle.includes(valeurResolue(corps)))
                    .map((corps) => `${chemin} « ${corps} » → ${valeurResolue(corps)}`),
            );

            expect(inventees).toEqual([]);
        });
    });
});

describe('Le vocabulaire', () => {
    describe('Étant donné les composants nommés, quand on regarde ce que les gabarits emploient', () => {
        it("alors aucune classe de l'ancien vocabulaire ne subsiste", () => {
            // Mesure d'entree : 41 classes uniques dans les gabarits, dont 38
            // employees UNE SEULE FOIS — une classe par element, pas un
            // vocabulaire. La migration est finie quand aucune ne reste.
            const anciennes = [
                'header',
                'suivi-bar',
                'action-bar',
                'image-bar',
                'carte-bar',
                'floating-button',
                'floating-add-point-button',
                'overview-button',
                'resume-button',
                'carte-button',
                'point-number',
                'page-number',
                'trajet-name',
                'trajet-details',
                'trajet-footer',
                'trajet-overview',
                'help',
                'hint-banner',
                'list-error',
                'empty-message',
                'simulation-banner',
                'offline-indicator',
                'point-actions',
            ];
            // `index.html` vit a la racine, hors de portee d'un glob parti de
            // `src/styles/` — et il porte des classes comme les autres. Il est
            // donc ajoute explicitement : un temoin qui l'oublierait declarerait
            // la migration finie avec un gabarit entier non migre.
            const gabarits = [
                ...Object.keys(import.meta.glob('../**/*.html', { eager: false })),
                '../../index.html',
            ];
            // **L'attribut se decoupe, il ne se compare pas.** Mesure :
            // `class="header bar bar-navigation"`, `class="secondary
            // overview-button"` et `class="suivi-bar bar bar-status"` existent
            // deja dans les gabarits. Un `includes('class="header"')` y repond
            // `false` et declarerait migrees les trois classes les plus
            // avancees — exactement celles ou une migration partielle peut se
            // cacher. C'est le neuvieme temoin vide de ce chantier, et le seul
            // ecrit d'avance dans le plan.
            const porteLaClasse = (html: string, nom: string): boolean =>
                [...html.matchAll(/class="([^"]*)"/g)].some((attribut) =>
                    (attribut[1] ?? '').split(/\s+/).includes(nom),
                );

            // Garde de non-vacuité, et c'est le dixième de la série. Mesuré :
            // le motif du glob changé en `*.htmlx` et l'entrée `index.html`
            // retirée, ce témoin **passait** — plus rien à balayer, donc plus
            // rien à trouver, donc vert. Il aurait déclaré la migration finie
            // sur zéro gabarit.
            //
            // Neuf gabarits : les huit de `src/` et `index.html`, qui vit à la
            // racine et échappe au glob. Le nombre est un plancher, pas une
            // égalité : ajouter un écran ne doit pas faire rougir ce témoin,
            // mais en perdre un doit forcer quelqu'un à venir regarder.
            expect(gabarits.length).toBeGreaterThanOrEqual(9);
            expect(gabarits).toContain('../../index.html');

            const restantes = anciennes.filter((nom) =>
                gabarits.some((chemin) =>
                    porteLaClasse(readFileSync(new URL(chemin, import.meta.url), 'utf8'), nom),
                ),
            );

            expect(restantes).toEqual([]);
        });
    });
});

describe('Le pont disparu', () => {
    describe('Étant donné le vocabulaire français que le pont aliasait, quand une feuille du système le lit', () => {
        it('alors aucune ne le référence plus : le palier sémantique est la seule source', () => {
            // Les 25 alias que `screens/legacy-bridge.css` posait, chacun vers UN
            // SEUL rôle du palier sémantique (`tokens/semantic.css`) — la liste est
            // un instantané du pont au moment de sa suppression (tâche 7), et ne
            // peut donc plus se lire sur le disque une fois le fichier parti.
            //
            // Mesuré à l'écriture de ce témoin : 23 des 25 étaient encore
            // référencés, dans 12 fichiers — tous les composants et deux feuilles
            // d'écran. Les six tâches précédentes s'étaient appuyées sur le pont
            // transitoire au lieu du palier sémantique, alors que « un composant ne
            // référence que le palier sémantique » était une contrainte de chacun
            // de leurs briefs, sans qu'aucun témoin ne le vérifie. C'est ce témoin
            // qui aurait dit la dérive à chaque tâche plutôt qu'à la fin du
            // chantier.
            const anciensAlias = [
                'fond',
                'fond-groupe',
                'fond-consigne',
                'fond-page',
                'label',
                'label-2',
                'label-3',
                'separateur',
                'bleu',
                'accent',
                'rouge',
                'destructif',
                'orange',
                'avertissement',
                'succes',
                'position',
                'sur-teinte',
                'verre',
                'verre-epais',
                'verre-reflet',
                'ombre-pastille',
                'ombre-flottante',
                'marge-ecran',
                'rayon-controle',
                'rayon-section',
            ];

            // Hors commentaires : l'en-tête de ce fichier et celui de
            // `tokens/semantic.css` citent plusieurs de ces noms en prose, pour
            // expliquer d'où vient un rôle sémantique — une citation ne doit pas
            // faire rougir l'invariant qu'elle documente.
            //
            // `screens/legacy-bridge.css` est écarté du balayage : tant qu'il
            // existe, c'est son rôle d'à lui de déclarer ces alias — c'est leur
            // EMPLOI ailleurs que ce témoin interdit, pas leur déclaration à la
            // source. Une fois le pont supprimé, ce filtre ne retire plus rien :
            // la clé n'existe simplement plus dans `feuilles`.
            const feuillesAExaminer = Object.entries(feuilles).filter(
                ([chemin]) => chemin !== './screens/legacy-bridge.css',
            );

            // Ancré par `(?![\w-])` : sans lui, `--orange` sous-chaînerait
            // `--orange-dark` et `--orange-light`, deux primitives réelles du
            // palier — même piège que celui déjà nommé pour `--icon-stroke` dans
            // l'ancien `legacy.test.ts`.
            const references = feuillesAExaminer.flatMap(([chemin, contenu]) => {
                const texte = sansCommentaires(contenu);
                return anciensAlias
                    .filter((alias) => new RegExp(`--${alias}(?![\\w-])`).test(texte))
                    .map((alias) => `${chemin} référence --${alias}`);
            });

            expect(references).toEqual([]);
        });
    });
});

/**
 * Les témoins qui suivent viennent de `legacy.test.ts`, supprimé par cette
 * même tâche. Il en portait 27 blocs `describe` vivants — le brief n'en
 * tabulait que trois (« trois contrats à sauver ») en tenant les 24 autres
 * pour équivalents ou redondants. Mesuré : aucun des 24 n'avait de
 * contrepartie ici, dans aucune forme. Les supprimer avec le fichier les
 * aurait tous emportés en silence.
 *
 * Chacun est donc soit migré tel quel (ce bloc), soit remplacé par une
 * version structurelle quand une existait déjà, soit supprimé avec sa raison
 * écrite en commentaire à l'endroit où son sujet est repris. Les fichiers
 * qu'ils lisaient (`materiau`/`surface`, `bar`, `bouton`/`groupe` déjà sans
 * commentaires) sont pour la plupart déjà déclarés plus haut dans ce fichier ;
 * les quelques manquants sont ajoutés ici, au plus près de leur premier
 * emploi.
 */
const flottant = feuilles['./components/floating-action.css'] ?? '';
const rangee = feuilles['./components/row.css'] ?? '';
const carteOverlay = feuilles['./components/map-overlay.css'] ?? '';
const suiviCss = feuilles['./screens/suivi.css'] ?? '';
const elements = feuilles['./base/elements.css'] ?? '';

/**
 * Rend la valeur **effective** d'une propriété de `.icon`, un `var()` résolu.
 *
 * Écrire `/\.icon\s*\{[^}]*stroke:\s*currentcolor/` ne marche pas depuis que
 * la règle porte un jeton : `[^}]*` avale jusqu'à `--icon-` et la sous-chaîne
 * `stroke: currentcolor` du **nom de la propriété personnalisée** satisfait le
 * motif — troisième témoin vide trouvé par la tâche 3 de cette partie.
 *
 * La résolution ne descend que d'un niveau, et c'est assez : le contrat est
 * que le tracé vaille la couleur courante, pas qu'il passe par un nom précis.
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

describe('Les pictogrammes', () => {
    describe('Étant donné un symbole du jeu, quand une règle doit le dessiner', () => {
        it('alors la feuille lui donne son tracé et sa taille, que le jeu ne porte pas', () => {
            // `Icons.html` ne déclare ni épaisseur, ni bouts, ni dimension : un
            // `<svg>` sans taille sort en 300 × 150, et un tracé sans `fill:
            // none` sort en noir plein. Sans cette règle, chaque bouton de
            // l'interface affiche un pavé.
            expect(valeurEffectiveDeLIcone(bouton, 'fill')).toBe('none');
            // La valeur effective, jeton résolu, et en minuscules : le contrat
            // est un tracé de la couleur courante, pas l'orthographe de
            // `currentcolor` que Stylelint choisit ni le nom du jeton qui la
            // porte. Ce même contrôle remplace « .icon dimensionnée et tracée »
            // de l'ancien `legacy.test.ts`, qui ne vérifiait que cette ligne.
            expect(valeurEffectiveDeLIcone(bouton, 'stroke')).toBe('currentcolor');
            expect(bouton).toMatch(/\.icon\s*\{[^}]*inline-size:/s);
        });
    });
});

describe('Le contour des contrôles', () => {
    describe("Étant donné un bouton, quand la feuille décide s'il porte un trait", () => {
        it("alors il n'en porte aucun : c'est son remplissage qui le délimite", () => {
            // Un contrôle d'iOS n'a pas de contour propre — c'est sa surface qui
            // le dessine, teintée pour l'action principale et neutre sinon.
            const regleBouton = /(?:^|\n)\s*button\s*\{([^}]*)\}/.exec(bouton);

            expect(regleBouton?.[1]).toMatch(/border:\s*none/);
        });
    });

    describe('Étant donné un bouton, quand la feuille lui donne sa forme', () => {
        it('alors il est une gélule', () => {
            // « Default every button to a capsule » : c'est la forme que le
            // système donne aux contrôles, et `DefaultGlassEffectShape` est
            // littéralement une capsule. La cible plancher (44 px, les deux
            // dimensions) est déjà affirmée par « La famille des contrôles » ;
            // ce témoin n'en reprend que la forme, pour ne pas la doubler.
            const regleBouton = /(?:^|\n)\s*button\s*\{([^}]*)\}/.exec(bouton);

            expect(regleBouton?.[1]).toMatch(/border-radius:\s*var\(--radius-pill\)/);
        });
    });

    describe("Étant donné un bouton secondaire, quand la feuille l'habille", () => {
        it("alors il n'a pas de surface blanche, mais le remplissage neutre du système", () => {
            // « Refrain from adding color to the background of multiple
            // controls. » Un fond blanc plein sur chaque bouton secondaire
            // faisait de chacun une petite carte ; le remplissage neutre les
            // rend au verre qui les porte, et se **dérive** de la couleur du
            // texte plutôt que de vivre dans son propre jeton.
            const secondaire = /\n[ \t]*button\.secondary \{([^}]*)\}/.exec(bouton);

            expect(secondaire?.[1]).toMatch(/background:\s*color-mix\(/);
            expect(secondaire?.[1]).not.toMatch(/var\(--color-background\)/);
        });
    });

    describe('Étant donné une suppression, quand la feuille signale son danger', () => {
        it('alors le rouge est dans le libellé, jamais en aplat sous lui', () => {
            // « Never make the destructive action the prominent one » : un
            // aplat rouge attire précisément le pouce qu'on veut voir hésiter.
            const danger = /\n[ \t]*button\.danger \{([^}]*)\}/.exec(bouton);

            expect(danger?.[1]).toMatch(/color:\s*var\(--color-destructive\)/);
            expect(danger?.[1]).not.toMatch(/background:\s*var\(--color-destructive\)/);
            expect(danger?.[1]).not.toMatch(/border/);
        });
    });
});

describe('Les conteneurs de carte face aux panneaux de Leaflet', () => {
    describe('Étant donné un conteneur de carte, quand la feuille le positionne', () => {
        it("alors il ouvre son propre contexte d'empilement, sinon ses panneaux s'en échappent", () => {
            // Les panneaux de Leaflet portent `z-index: 400`. Un conteneur
            // positionné mais en `z-index: auto` n'ouvre **aucun** contexte
            // d'empilement : ces 400 remontent alors dans celui du parent et
            // battent tout ce que l'application pose au-dessus. Mesuré : le
            // formulaire de saisie, à `z-index: 10`, était intégralement
            // recouvert par les tuiles.
            for (const conteneur of ['#carte-container', '.carte-points']) {
                const regle = new RegExp(`\\n[ \\t]*\\${conteneur} \\{([^}]*)\\}`).exec(
                    carteOverlay,
                );

                expect(regle?.[1]).toMatch(/position:\s*(absolute|relative)/);
                expect(regle?.[1]).toMatch(/z-index:\s*0/);
            }
        });
    });

    describe("Étant donné le choix d'une coordonnée, quand la feuille dispose l'écran", () => {
        it('alors la carte occupe tout, et le formulaire flotte au-dessus', () => {
            // « Extend content to fill the screen or window […] Controls and
            // navigation components appear on top of content rather than on
            // the same plane. » Le formulaire était une rangée *sous* la
            // carte, qui lui prenait sa hauteur.
            const conteneur = /\n[ \t]*#carte-container \{([^}]*)\}/.exec(carteOverlay);
            const barreCarte = /\n[ \t]*\.map-overlay-bar \{([^}]*)\}/.exec(carteOverlay);

            expect(conteneur?.[1]).toMatch(/position:\s*absolute/);
            expect(conteneur?.[1]).toMatch(/inset:\s*0/);
            expect(barreCarte?.[1]).toMatch(/position:\s*absolute/);
            expect(barreCarte?.[1]).toMatch(/inset-block-end:/);
        });
    });

    describe('Étant donné le recentrage et le zoom, quand la feuille les dessine', () => {
        it('alors ils partagent une seule règle, donc une seule boîte', () => {
            // Le recentrage vit dans un `.leaflet-bar`, comme le zoom : c'est
            // la colonne qui porte la surface, et ses enfants n'en ont pas —
            // sinon une gélule de 44 px dans une boîte carrée, et du verre sur
            // du verre.
            const partagee = /\n[ \t]*\.leaflet-bar a,\n[ \t]*\.carte-recentrer \{([^}]*)\}/.exec(
                carteOverlay,
            );

            expect(partagee?.[1]).toMatch(/inline-size:\s*34px/);
            expect(partagee?.[1]).toMatch(/block-size:\s*34px/);
            expect(partagee?.[1]).toMatch(/background:\s*none/);
        });
    });

    describe("Étant donné une carte qui porte de l'information par-dessus, quand la feuille l'habille", () => {
        it("alors ses tuiles s'assourdissent, et s'assombrissent avec l'apparence", () => {
            // « Consider using the muted emphasis style […] when you overlay
            // information-rich content on the map ». En apparence sombre,
            // OpenStreetMap ne sert aucun jeu de tuiles nocturne : on inverse
            // et on recolore, faute de mieux.
            //
            // Ce contrôle remplace aussi « apparence sombre fournie » de
            // l'ancien `legacy.test.ts` (« La feuille de style ») : vérifier
            // que le bloc sombre porte `filter: invert(...)` implique déjà
            // qu'il existe — l'ancienne ligne, qui ne vérifiait que
            // l'existence de la requête, ne montait pas la garde en plus de
            // celui-ci : c'est déjà elle qui aurait attrapé une régression, le
            // registre de la tâche 5 le dit.
            const tuiles = /\n[ \t]*\.leaflet-tile-pane \{([^}]*)\}/.exec(carteOverlay);
            const sombre =
                /@media \(prefers-color-scheme: dark\) \{\s*\.leaflet-tile-pane \{([^}]*)\}/.exec(
                    carteOverlay,
                );

            expect(tuiles?.[1]).toMatch(/filter:\s*saturate\(/);
            expect(sombre?.[1]).toMatch(/filter:\s*invert\(/);
        });
    });

    describe('Étant donné que leaflet.css est chargé en couche vendor, quand la feuille reprend ses contrôles', () => {
        it("alors elle n'a besoin d'aucun !important pour les tenir", () => {
            // Une déclaration hors couche l'emporte sur toute déclaration en
            // couche : c'est la règle de la cascade. Les 16 `!important`
            // d'origine venaient de ce que leaflet.css arrivait après nous
            // dans le bundle, avec une spécificité que `.carte-recentrer` ne
            // pouvait pas battre.
            const debut = carteOverlay.indexOf('.leaflet-bar');

            // Garde indispensable : `indexOf` renvoie -1 si le marqueur
            // n'existe pas, et `slice(-1)` rendrait tout le fichier au lieu
            // d'une tranche vide.
            expect(debut).toBeGreaterThanOrEqual(0);

            // Sans commentaires : la prose de ce même fichier cite
            // `!important` pour expliquer qu'il n'en a plus besoin — une
            // citation qui satisferait le motif si on la laissait entrer.
            const zoneLeaflet = sansCommentaires(carteOverlay.slice(debut));

            expect(zoneLeaflet).not.toContain('!important');
        });
    });

    describe('Étant donné le seuil du grand écran, quand on cherche qui le décide', () => {
        it("alors il ne s'écrit qu'ici, et bascule à 900 px", () => {
            // `TrajetEditorScreen` et `e2e/helpers.ts` lisent `--large-screen`
            // au lieu de recopier 900 px, qui pouvait diverger sans que rien
            // ne le signale.
            expect(carteOverlay).toMatch(/:root[^}]*--large-screen:\s*0/s);
            // Le seuil et le drapeau font le contrat, pas la notation de la
            // requête média : `min-width: 900px` et `width >= 900px`
            // l'expriment aussi bien l'une que l'autre.
            expect(carteOverlay).toMatch(
                /@media\s*\((?:min-width:\s*900px|width\s*>=\s*900px)\)[\s\S]*--large-screen:\s*1/,
            );
        });
    });
});

describe('La barre d écran', () => {
    describe('Étant donné du contenu qui passe sous une barre, quand il en approche', () => {
        it("alors une bande le fond, et elle n'assombrit ni ne bloque rien", () => {
            // « Instead of a background, use a scroll edge effect to provide a
            // transition between content and the control area » : un dégradé
            // **de la couleur du fond vers rien**, pas un voile. Il appartient
            // au défilement, pas à la barre : d'où une bande posée sous elle,
            // transparente aux clics.
            const bande = /\n[ \t]*\.bar::after \{([^}]*)\}/.exec(bar);

            expect(bande?.[1]).toMatch(/pointer-events:\s*none/);
            expect(bande?.[1]).toMatch(/linear-gradient\(\s*to bottom,\s*var\(--color-background/);
            expect(bande?.[1]).toMatch(/top:\s*100%/);
        });
    });

    describe("Étant donné un écran qui défile, quand sa barre d'en-tête le surplombe", () => {
        it('alors elle est épinglée et pleine largeur, sinon son verre ne surplombe rien', () => {
            // « Liquid Glass forms a distinct functional layer […] that
            // floats above the content layer. » Une barre en `position:
            // static` défile avec le contenu, et son flou n'échantillonne
            // rien. Encartée par le rembourrage de l'écran, une carte
            // flottante annule cet encart par une marge négative et rend
            // l'air par un rembourrage interne.
            const socleBarre = /\n[ \t]*\.bar \{([^}]*)\}/.exec(bar);
            const navigation = /\n[ \t]*\.bar-navigation \{([^}]*)\}/.exec(bar);

            expect(socleBarre?.[1]).toMatch(/position:\s*sticky/);
            expect(socleBarre?.[1]).toMatch(/padding-inline:\s*var\(--screen-margin\)/);
            expect(navigation?.[1]).toMatch(
                /margin-inline:\s*calc\(-1 \* var\(--screen-margin\)\)/,
            );
        });
    });

    describe('Étant donné 360 px de large, quand la barre porte un titre et deux actions', () => {
        it('alors rien ne plie : le titre abrège et la barre garde une rangée', () => {
            // Mesuré sur un iPhone 12 mini, la plus étroite des cibles de la
            // HIG (360 × 780) : le titre passait à deux lignes, la barre
            // d'actions se cassait en deux rangées, et l'en-tête doublait de
            // hauteur.
            const titre = /\n[ \t]*\.bar-navigation :is\(h1, h2\) \{([^}]*)\}/.exec(bar);
            const actions = /\n[ \t]*\.bar-navigation \.button-group \{([^}]*)\}/.exec(groupe);

            expect(titre?.[1]).toMatch(/white-space:\s*nowrap/);
            expect(titre?.[1]).toMatch(/text-overflow:\s*ellipsis/);
            expect(actions?.[1]).toMatch(/flex-wrap:\s*nowrap/);
        });
    });

    describe("Étant donné une barre où une action conclut, quand la feuille l'habille", () => {
        it('alors elle garde sa teinte, que la règle des pairs lui avait prise', () => {
            // Régression mesurée : `.button-group button` neutralise les
            // actions de même rang de l'éditeur — à juste titre —, mais elle
            // attrapait aussi l'action proéminente de la liste. Dans une
            // **barre**, ce qui n'est pas `.secondary` est l'action qui
            // conclut : le sélecteur le dit, et sa spécificité le fait
            // gagner contre la règle des pairs.
            const proeminente =
                /\n[ \t]*\.bar-navigation \.button-group button:not\(\.secondary\) \{([^}]*)\}/.exec(
                    groupe,
                );

            expect(proeminente?.[1]).toMatch(/background:\s*var\(--color-accent\)/);
        });
    });

    describe('Étant donné une barre qui porte déjà une surface, quand un bouton y entre', () => {
        it("alors il n'en apporte pas une seconde : seule l'action proéminente garde sa gélule", () => {
            // « Put the glass on the group, not on each button » : dans une
            // barre, les items sont monochromes et partagent la surface de la
            // barre — deux surfaces empilées sur le verre, ce que la HIG
            // refuse.
            const barreSecondaire =
                /\n[ \t]*\.bar-navigation button\.secondary,\n[ \t]*\.bar-status button\.secondary,\n[ \t]*\.map-overlay-bar button\.secondary \{([^}]*)\}/.exec(
                    bar,
                );
            const groupeSecondaire =
                /\n[ \t]*\.button-group-point button,\n[ \t]*\.button-group-image button \{([^}]*)\}/.exec(
                    groupe,
                );

            expect(barreSecondaire?.[1]).toMatch(/background:\s*none/);
            expect(barreSecondaire?.[1]).toMatch(/color:\s*var\(--color-label\)/);
            expect(groupeSecondaire?.[1]).toMatch(/background:\s*none/);
            expect(groupeSecondaire?.[1]).toMatch(/color:\s*var\(--color-label\)/);
        });
    });

    describe('Étant donné plusieurs actions de même rang, quand la feuille les habille', () => {
        it("alors aucune n'est teintée : ce sont des pairs, et la proéminente est ailleurs", () => {
            // « Keep the number of prominent buttons to one or two per
            // view. » Teintées toutes les trois, les actions de la barre
            // faisaient quatre aplats bleus sur un écran, et plus rien ne
            // disait laquelle compte.
            const pairs = /\n[ \t]*\.button-group button \{([^}]*)\}/.exec(groupe);

            expect(pairs?.[1]).toMatch(/background:\s*color-mix\(/);
            expect(pairs?.[1]).toMatch(/color:\s*var\(--color-accent\)/);
        });
    });
});

describe('Les surfaces qui se répètent', () => {
    describe('Étant donné une surface posée sur le schéma et répétée, quand la feuille la traite', () => {
        it("alors une teinte la détache du dessin, sans le flou qu'elle multiplierait", () => {
            // Les actions d'un point existent une fois par point, la barre
            // d'une page une fois par page : les flouter en donnerait trente
            // exemplaires là où le budget mesuré sur mobile est de trois à
            // cinq. L'absence de flou elle-même est déjà affirmée au niveau
            // du système par « Le matériau » (un seul fichier peut flouter) ;
            // ce témoin n'ajoute que la teinte de repli.
            for (const surfaceRepetee of ['.button-group-point', '.button-group-image']) {
                const regle = new RegExp(`\\n[ \\t]*\\${surfaceRepetee} \\{([^}]*)\\}`).exec(
                    groupe,
                );

                expect(regle?.[1]).toMatch(/background:\s*var\(--material/);
            }
        });
    });
});

describe("L'ordre des actions dans le panneau de saisie", () => {
    describe('Étant donné une annulation et une validation, quand le panneau les range', () => {
        it("alors la validation part du côté sortant, et l'annulation reste du côté entrant", () => {
            // « Only specify one primary action », et les barres d'outils la
            // placent du côté sortant. C'est l'annulation qui pousse, et non
            // la validation qui est poussée : en logique d'écriture, la marge
            // automatique appartient à l'élément qui cède la place.
            const annuler = /\n[ \t]*#cancel-carte-button \{([^}]*)\}/.exec(flottant);

            expect(annuler?.[1]).toMatch(/margin-inline-end:\s*auto/);
        });
    });
});

describe('Les cartes de contenu', () => {
    describe('Étant donné une ligne de la liste, quand la feuille lui donne sa surface', () => {
        it("alors son rayon est celui d'une section, et son fond remplace sa bordure", () => {
            // « Sections have an increased corner radius to match the
            // curvature of controls across the system. » Une bordure d'un
            // pixel n'a plus lieu d'être quand le fond de la carte se
            // distingue déjà de celui de la vue.
            const carte = /\n[ \t]*trajet-row\s*\{([^}]*)\}/.exec(rangee);

            expect(carte?.[1]).toMatch(/border-radius:\s*var\(--radius-section\)/);
            expect(carte?.[1]).not.toMatch(/\bborder:\s*1px/);
        });
    });
});

describe("L'échelle typographique", () => {
    describe("Étant donné la taille de texte du système, quand la feuille s'en saisit", () => {
        it("alors la racine suit la taille dynamique d'iOS, avec un repli pour les autres", () => {
            // Contrat à sauver n° 1 (registre de la tâche 7) : `font-size:
            // 17px` DOIT précéder `font: -apple-system-body` dans
            // `base/elements.css` — un reformatage qui inverserait les deux
            // ferait tomber Chrome à 16 px.
            //
            // `font: -apple-system-body` est le **seul** crochet que le web
            // offre sur la taille dynamique : WebKit y résout la valeur
            // choisie dans Réglages, de 14 px à 53 px, et tous les `rem` de
            // la feuille suivent. Chrome jette la déclaration entière, d'où
            // le `font-size` qui précède et lui sert de repli.
            //
            // Tolérant à l'indentation : l'enveloppe `@layer base { … }`
            // décale tout le fichier d'un niveau.
            const racine = /\n[ \t]*html\s*\{([^}]*)\}/.exec(elements);

            expect(racine?.[1]).toMatch(/font-size:\s*17px[\s\S]*font:\s*-apple-system-body/);
            // Une racine transparente retombe sur du blanc en clair et du
            // noir en sombre : c'est de là que viennent les barres blanches
            // de Safari 26.
            expect(racine?.[1]).toMatch(/background-color:\s*var\(/);
        });
    });

    describe('Étant donné le corps de la page, quand on cherche ce qui gouverne son geste', () => {
        it('alors le défilement est vertical, et rien ne se sélectionne au doigt', () => {
            // Contrat à sauver n° 2 (registre de la tâche 7) : trois
            // parcours e2e lisent ces valeurs calculées, WebKit seulement par
            // la propriété préfixée.
            expect(elements).toMatch(/touch-action:\s*pan-x pan-y/);
            expect(elements).toContain('-webkit-user-select:');
        });
    });

    describe('Étant donné un élément marqué caché, quand une autre règle voudrait le montrer', () => {
        it('alors il reste cachė : rien ne bat `[hidden]`', () => {
            // Seize appels TypeScript basculent `hidden`, dont plusieurs sur
            // des conteneurs en `display: flex` — et le jeu de symboles en
            // dépend.
            expect(elements).toMatch(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
        });
    });

    describe('Étant donné une personne qui a demandé moins de mouvement, quand la feuille se charge', () => {
        it('alors les transitions cèdent, mais le défilement automatique reste', () => {
            // Ce qui part, ce sont les transitions — pas le défilement, qui
            // *est* la fonction de l'application. Une durée de 1 ms plutôt
            // que `none` : les gestionnaires de `transitionend` continuent
            // de recevoir leur événement, là où `none` les rendrait muets.
            // Remplace aussi « prefers-reduced-motion honoré » de l'ancien
            // `legacy.test.ts` : vérifier le contenu du bloc implique déjà
            // qu'il existe.
            const bloc =
                /^([ \t]*)@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\1\}/m.exec(
                    elements,
                );

            expect(bloc?.[2]).toMatch(/transition-duration:\s*1ms/);
            expect(bloc?.[2]).not.toMatch(/scroll-behavior:\s*smooth/);
        });
    });
});

describe("L'écran de suivi", () => {
    describe('Étant donné le repère de position, quand on cherche où il tombe', () => {
        it('alors il est calé sur --fraction-position, en dvh', () => {
            // Le repère du suivi tombe là où le domaine vise, et se mesure en
            // `dvh` parce que le calcul du défilement lit
            // `window.innerHeight`.
            expect(suiviCss).toMatch(/--fraction-position,\s*0\.75\)\s*\*\s*100dvh/);
        });
    });
});

/**
 * « Les contrôles » (l'ancien `legacy.test.ts`) vérifiait aussi que le
 * plancher de 44 px porte sur les deux dimensions du bouton — repris tel
 * quel par « La famille des contrôles » plus haut dans ce fichier, qui
 * l'affirme déjà sur `min-block-size` ET `min-inline-size`. Non dupliqué ici.
 *
 * « Le verre de la couche fonctionnelle » (jumelle préfixée présente et
 * comptée, aucun `var()` dans la valeur de flou) est repris À L'IDENTIQUE
 * par « Le matériau » › « Étant donné WebKit… » et « Étant donné les bogues
 * 289800 et 297620… », écrits dès la tâche 1 de cette partie sur les mêmes
 * ancres en début de ligne. Non dupliqué ici.
 *
 * Dans l'ancien test « La feuille de style », trois autres `exige` étaient
 * déjà redondants avant même la suppression du fichier : l'existence de
 * `prefers-reduced-transparency` et le compte des jumelles `-webkit-` sont
 * tous deux repris plus strictement par « Le matériau » (tâche 1) ; leur
 * suppression ici n'enlève donc rien que ce fichier ne garde déjà.
 */

describe('La couche fonctionnelle', () => {
    /**
     * La liste **close** des surfaces en verre flouté.
     *
     * Ce que le flou coûte gouverne cette liste autant que la HIG : une
     * surface qui se répète — la barre d'une page, les actions d'un point —
     * en aurait autant d'exemplaires que d'éléments, et le budget mesuré sur
     * mobile est de trois à cinq flous simultanés. Celles-là reçoivent la
     * teinte du verre sans son flou.
     */
    const surfacesFlouteesSansRepetition = [
        '.bar-navigation',
        '.bar-status',
        '.map-overlay-bar',
        '.floating-action-add-point',
        '.floating-action-carte',
        '.floating-action-overview',
        '.floating-action-resume',
        '.leaflet-bar',
    ];
    // `.carte-recentrer` **n'y est pas**, et c'est une correction : il vit
    // dans un `.leaflet-bar`, donc l'y mettre aussi empilait deux verres.

    describe("Étant donné une surface en verre, quand une autre l'habite", () => {
        it("alors l'enfant n'en reçoit pas : deux verres empilés sont refusés", () => {
            // « Avoid overcrowding or layering Liquid Glass elements on top
            // of each other. » Le recentrage vit dans un `.leaflet-bar` ;
            // c'est la colonne qui porte la surface, et le bouton la
            // traverse.
            //
            // Sans commentaires : ce qu'on interroge sont des sélecteurs, pas
            // de la prose. L'indentation de `@supports` est capturée puis
            // rejouée en rétro-référence pour sa propre fermeture.
            const pose = /^([ \t]*)@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                sansCommentaires(surface),
            );

            expect(pose?.[2]).toContain('.leaflet-bar');
            expect(pose?.[2]).not.toContain('.carte-recentrer');
        });
    });

    describe('Étant donné une surface en verre, quand elle porte un libellé', () => {
        it('alors il est monochrome, car le verre adapte sa clarté au contenu', () => {
            // « By default, symbols and text on these elements follow a
            // monochromatic color scheme, becoming darker when the
            // underlying content is light, and lighter when it's dark. » Un
            // libellé fixé en blanc disparaît dès que le verre s'éclaircit
            // sur une page de schéma.
            const pose = /^([ \t]*)@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                surface,
            );

            expect(pose?.[2]).toMatch(/color:\s*var\(--color-label\)/);
            expect(pose?.[2]).not.toMatch(/color:\s*var\(--color-on-accent\)/);
        });
    });

    describe('Étant donné une surface en verre, quand la feuille la traite', () => {
        it('alors elle est de la liste close, floutée, et rendue opaque par les réglages', () => {
            const pose = /^([ \t]*)@supports \(\(backdrop-filter[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                surface,
            );
            const retrait =
                /^([ \t]*)@media \(prefers-reduced-transparency[^{]*\{([\s\S]*?)\n\1\}/m.exec(
                    surface,
                );

            // Aucune surface n'est floutée en dehors de ces deux blocs : le
            // premier ajoute le verre, le second le retire.
            const flousHorsBlocs = surface
                .replace(pose?.[0] ?? '', '')
                .replace(retrait?.[0] ?? '', '')
                .match(/^\s*(-webkit-)?backdrop-filter:/gm);
            expect(flousHorsBlocs).toBeNull();

            for (const nomSurface of surfacesFlouteesSansRepetition) {
                // Posée, puis retirée : oublier le retrait laisse le flou en
                // place quand la personne a demandé moins de transparence.
                expect(pose?.[2]).toContain(nomSurface);
                expect(retrait?.[2]).toContain(nomSurface);
            }
        });
    });

    describe('Étant donné une personne qui a demandé moins de transparence ou plus de contraste, quand la feuille se charge', () => {
        it('alors le flou est coupé, et pas seulement recouvert', () => {
            // Rendre la surface opaque ne suffit pas : le flou ne part pas
            // tout seul, il faut couper les deux propriétés, préfixée
            // comprise. Et le bloc doit venir **après** le `@supports` qui
            // pose le verre — à spécificité égale, c'est l'ordre du fichier
            // qui tranche.
            const retrait =
                /@media\s*\(prefers-reduced-transparency:\s*reduce\)[^{]*\{[\s\S]*?backdrop-filter:\s*none/.exec(
                    surface,
                );
            const pose = surface.indexOf('@supports (');

            expect(retrait).not.toBeNull();
            expect(retrait?.index ?? -1).toBeGreaterThan(pose);

            // iOS ne publie toujours pas `prefers-reduced-transparency` — le
            // contraste renforcé, lui, y est honoré, d'où les deux conditions
            // dans le même prélude `@media`, séparées par une virgule.
            // Tolérant à la position : `prefers-contrast: more` y est la
            // seconde condition, jamais collée à `@media`.
            expect(surface).toMatch(/@media[^{]*\(prefers-contrast:\s*more\)[^{]*\{/);
        });
    });
});
