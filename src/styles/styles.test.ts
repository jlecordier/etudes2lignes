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

describe('Le palier semantique', () => {
    describe('Étant donné les deux apparences, quand on cherche ou elles sont ecrites', () => {
        it("alors aucune couleur ne vit dans une requete d'apparence", () => {
            // Le defaut d'origine : `--verre` et `--verre-reflet` manquaient au
            // bloc sombre, et le bouton flottant etait un disque blanc portant
            // un symbole blanc. Un test l'a vu **apres** la publication.
            // `light-dark()` ne laisse pas la place a l'oubli : les deux
            // valeurs sont dans la meme declaration.
            const blocsSombres =
                systeme.match(/@media \(prefers-color-scheme: dark\)[\s\S]*?\n\}/g) ?? [];
            const couleursDedans = blocsSombres.filter((bloc) => /--color-|--material-/.test(bloc));

            expect(couleursDedans).toEqual([]);
        });
    });

    describe('Étant donné un role de couleur, quand on lit sa declaration', () => {
        it('alors elle porte ses deux apparences a la fois', () => {
            const roles = semantique.match(/--(?:color|material)-[a-z-]+:[^;]+;/g) ?? [];
            const sansLesDeux = roles.filter((d) => !d.includes('light-dark('));

            expect(roles.length).toBeGreaterThan(0);
            expect(sansLesDeux).toEqual([]);
        });
    });

    describe('Étant donné le palier semantique, quand on regarde ce dont il depend', () => {
        it('alors chacun de ses var() designe une primitive, et jamais un role', () => {
            // La regle des paliers : un palier ne reference que celui du dessus.
            const references = [...semantique.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
            // Un role peut s'appuyer sur un role du meme palier — rien
            // n'interdit un alias vers un autre role de `semantic.css`. Ce
            // que la regle interdit, c'est de descendre chercher **plus
            // bas** que soi.
            const horsPalier = references.filter(
                (nom) => !primitives.includes(`${nom}:`) && !semantique.includes(`${nom}:`),
            );

            expect(horsPalier).toEqual([]);
        });
    });

    describe('Étant donné la teinte du verre, quand on cherche d ou elle vient', () => {
        it('alors elle se derive du fond, au lieu de le recopier', () => {
            // Elle etait une copie manuelle : `--verre: rgba(242, 242, 247, .72)`
            // devait s'accorder a la main avec `--fond-groupe`. Deux valeurs a
            // tenir d'accord, donc deux valeurs qui derivent.
            expect(semantique).toMatch(/--material-regular:[^;]*rgb\(from var\(--grey-grouped/);
        });
    });

    describe('Étant donné le pont vers la feuille en transit, quand on l ouvre', () => {
        it("alors il n'y a que des alias : aucune valeur ne s'y decide", () => {
            const declarations = pont.match(/--[a-z-]+:[^;]+;/g) ?? [];
            const quiDecident = declarations.filter((d) => !/:\s*var\(--/.test(d));

            expect(declarations.length).toBeGreaterThan(0);
            expect(quiDecident).toEqual([]);
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
