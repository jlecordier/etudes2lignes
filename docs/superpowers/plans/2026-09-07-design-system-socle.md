# Design system, partie 1 — le socle : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** poser les paliers de jetons, l'ordre de cascade, les onze styles de texte, la planche de référence et les tests de géométrie mesurée — de sorte que l'application soit **inchangée à l'œil** et que la dérive qui a produit huit défauts en quatre jours devienne inécrivable.

**Architecture:** un dossier `src/styles/` où six couches `@layer` remplacent un fichier de 1554 lignes. Trois paliers de jetons, chacun ne référençant que celui du dessus, avec `light-dark()` pour que les deux apparences vivent dans une seule déclaration. Stylelint tient la contrainte que les tests décrivaient. Une planche hors application rend le système visible, et des tests e2e mesurent sa géométrie dans un vrai moteur.

**Tech Stack:** CSS natif (`@layer`, `light-dark()`, imbrication, couleurs relatives — support mesuré sur les cinq moteurs), Stylelint 17 + `stylelint-config-standard` 40 + `csstools/value-no-unknown-custom-properties` 6.1.1 + `scale-unlimited/declaration-strict-value` 1.12.1, Vite, Vitest, Playwright.

**Spec:** [`docs/superpowers/specs/2026-09-07-design-system-design.md`](../specs/2026-09-07-design-system-design.md)

**Partie 2 (à planifier après celle-ci) :** le vocabulaire de onze composants, la migration des noms de classes, la publication de la planche, les 90 références visuelles, l'ADR 0011.

## Global Constraints

- **Portail probity : l'exception CSS est accordée, et s'arrête aux `*.css`.** L'auteur du dépôt a accordé le 7 septembre 2026 l'exception « configuration files » que la compétence `test-driven-development` liste et renvoie au partenaire humain. Task 0 la rend effective. **Tout `.ts` et tout `.html` reste sous portail plein** : rouge vu échouer, puis vert.
- **Ordre de cascade, déclaré une seule fois**, dans `src/styles/index.css` : `@layer vendor, reset, tokens, base, components, screens;`
- **Règle des paliers** : `primitives.css` ne référence rien ; `semantic.css` ne référence que des primitives ; un composant ou un écran ne référence que du sémantique.
- **Chaque couleur déclarée une fois**, avec `light-dark()`. Aucun `@media (prefers-color-scheme: dark)` pour une couleur.
- **Le verre** : `-webkit-backdrop-filter` précède `backdrop-filter` **à l'octet près** ; **aucun `var()` à l'intérieur** (bugs WebKit 289800 et 297620) ; flou **≤ 20px** (bug 319187) ; fond opaque d'abord, verre dans un `@supports`, retraction d'accessibilité après.
- **Langue** : jetons, classes et noms de fichiers en **anglais** (ADR 0007) ; prose, commentaires et titres de tests en **français**, **apostrophe ASCII `'`** partout.
- **Tests BDD** `Étant donné / Quand / Alors`. Aucun `vi.fn`, aucun `toHaveBeenCalled` : on affirme sur des valeurs.
- **Pas de `!`, pas de `as` de forme** (ADR 0002).
- `pnpm quality` **vert** avant de déclarer une tâche finie.
- **Valeurs exactes** : cible tactile **44 px** ; échelle d'espacement **2 4 8 12 16 20 24 32 44 64** px ; corps de texte **17 px** ; les onze styles de texte aux métriques d'Apple reproduites en Task 4.
- **Aucun serveur de développement ne recharge le CSS dans ce bac à sable** : le watcher de Vite y est muet. Toute vérification visuelle passe par un serveur **neuf** sur un port libre.

---

## Structure des fichiers

| Fichier                                           | Responsabilité                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `probity.config.ts`                               | **modifié** — le glob du portail exclut les `*.css`                                                                    |
| `.stylelintrc.json`                               | **nouveau** — la contrainte machine, et les deux règles écartées avec leur raison                                      |
| `package.json`                                    | **modifié** — quatre dépendances de développement, le script `lint:css`, son entrée dans `quality`                     |
| `src/styles/index.css`                            | **nouveau** — l'ordre des couches, l'import de Leaflet en couche `vendor`, et les imports du système. **Rien d'autre** |
| `src/styles/tokens/primitives.css`                | **nouveau** — palier A : rampes, échelles, les onze styles de texte. Ne référence rien                                 |
| `src/styles/tokens/semantic.css`                  | **nouveau** — palier B : les rôles, en `light-dark()`. Ne référence que A                                              |
| `src/styles/base/elements.css`                    | **nouveau** — défauts d'éléments, aucune classe                                                                        |
| `src/styles/components/text.css`                  | **nouveau** — une classe par style de texte                                                                            |
| `src/styles/screens/legacy.css`                   | **nouveau, transitoire** — la feuille actuelle, déplacée telle quelle. Meurt en partie 2                               |
| `src/styles/styles.test.ts`                       | **nouveau** — les invariants de source                                                                                 |
| `src/style.css`                                   | **supprimé** en Task 3                                                                                                 |
| `src/style.test.ts`                               | **supprimé** en Task 3, ses invariants migrant vers `styles.test.ts`                                                   |
| `src/main.ts`                                     | **modifié** — importe `./styles/index.css`                                                                             |
| `src/carte/adapters/LeafletCarteDesPoints.ts`     | **modifié** — perd son `import 'leaflet/dist/leaflet.css'`                                                             |
| `src/carte/adapters/LeafletCoordonneeSelector.ts` | **modifié** — idem                                                                                                     |
| `design/index.html`                               | **nouveau** — la planche de référence, locale pour l'instant                                                           |
| `design/gallery.ts`                               | **nouveau** — son rendu, lu depuis les jetons eux-mêmes                                                                |
| `design/gallery.css`                              | **nouveau** — l'habillage **de la planche**, hors du système qu'elle montre                                            |
| `e2e/design-system.spec.ts`                       | **nouveau** — la géométrie mesurée dans un vrai moteur                                                                 |

**Un ecart assume avec l'arborescence de la spec.** Celle-ci prevoyait un
`base/typography.css` distinct. Il n'a pas lieu d'etre : les seules metriques
du socle sont celles des titres, et elles tiennent dans `base/elements.css` a
cote des autres defauts d'elements. Les onze styles nommes, eux, sont un
vocabulaire — donc `components/text.css`.

**Pourquoi `legacy.css` et non une réécriture d'un coup.** Déplacer les 1554 lignes dans une couche est un geste **vérifiable à l'œil** : rien ne doit changer. Les réécrire en même temps mélangerait deux causes d'écart, et c'est exactement le mélange qui a laissé passer huit défauts.

**Pourquoi `design/gallery.css` n'utilise pas le système.** La planche doit rester lisible même quand le système est cassé — sinon elle ne peut pas le montrer cassé.

---

## Task 0 : rendre effective l'exception CSS du portail

**Files:**

- Modify: `probity.config.ts:31`

**Interfaces:**

- Produces: une écriture dans un `*.css` de `src/` n'exige plus de test rouge préalable. Toute autre écriture sous `src/` reste sous portail.

- [ ] **Step 1 : constater la portée actuelle**

Run: `grep -n "files: \['src/\*\*'\]" probity.config.ts`
Expected: `31:            files: ['src/**'],`

- [ ] **Step 2 : restreindre le glob**

Remplacer la ligne 31 de `probity.config.ts` par :

```ts
            // L'exception « configuration files » de la compétence
            // `test-driven-development`, que celle-ci renvoie explicitement au
            // partenaire humain — accordée par l'auteur du dépôt le
            // 7 septembre 2026 pour les feuilles de style.
            //
            // Motif mesuré : une feuille n'a pas de comportement appelable à
            // faire rougir. Une trentaine de refus en septembre 2026 l'ont
            // montré, dont plusieurs à tort — le validateur reprochait à un
            // test de « ne couvrir que l'état initial » alors qu'il basculait
            // l'élément avant d'affirmer. Ce que le portail ne peut pas juger,
            // trois autres mécanismes le jugent : les invariants de source, les
            // tests de géométrie mesurée, et la régression visuelle.
            //
            // Le TypeScript et les gabarits gardent le portail : eux ont un
            // comportement.
            files: ['src/**/*.ts', 'src/**/*.html'],
```

- [ ] **Step 3 : vérifier que l'exception porte**

Ajouter en tête de `src/style.css`, **sans test rouge préalable**, la ligne :

```css
/* Le système de design vit maintenant dans `styles/` ; ce fichier est en
   transit et disparaît en Task 3. */
```

Expected: l'écriture est **acceptée**. Si elle est refusée, le glob n'a pas pris : relire `probity.config.ts` et relancer la session avant d'aller plus loin.

- [ ] **Step 4 : vérifier et committer**

```bash
pnpm quality
git add probity.config.ts src/style.css
git commit -m "Restreint le portail TDD aux fichiers qui ont un comportement"
```

---

## Task 1 : Stylelint, et les deux défauts qu'il trouve immédiatement

**Files:**

- Create: `.stylelintrc.json`
- Modify: `package.json`
- Modify: `src/style.css` (réparations automatiques, et deux désactivations commentées)

**Interfaces:**

- Produces: `pnpm lint:css`, appelé par `pnpm quality`. La règle `scale-unlimited/declaration-strict-value` est **erreur** partout sauf sur la feuille en transit, où elle est **avertissement** — elle chiffre la dette sans bloquer le portail.

- [ ] **Step 1 : verifier que les quatre paquets sont la**

Ils ont ete installes en ecrivant ce plan — c'est ce qui a permis d'en mesurer
les chiffres — et sont **deja committes**. Le verifier plutot que de refaire :

```bash
node -e "const d=require('./package.json').devDependencies; for (const n of ['stylelint','stylelint-config-standard','stylelint-declaration-strict-value','stylelint-value-no-unknown-custom-properties']) console.log(n.padEnd(48), d[n] ?? 'ABSENT');"
```

Expected:

```
stylelint                                        ^17.15.0
stylelint-config-standard                        ^40.0.0
stylelint-declaration-strict-value               ^1.12.1
stylelint-value-no-unknown-custom-properties     ^6.1.1
```

S'il en manque un :

```bash
pnpm add -D --store-dir /Users/jlecordier/Library/pnpm/store \
  stylelint stylelint-config-standard \
  stylelint-value-no-unknown-custom-properties stylelint-declaration-strict-value
```

`--store-dir` est necessaire dans ce bac a sable : prive de `~/.config`, pnpm ne
lit pas sa configuration globale et voudrait un magasin local, ce que
`node_modules` refuse (`ERR_PNPM_UNEXPECTED_STORE`).

**Ne pas revenir en arriere sur ces quatre lignes de `package.json`** sans
purger `node_modules` : le crochet de pre-commit verifie la coherence des
dependances, et un manifeste plus pauvre que `node_modules` fait echouer tout
commit avec `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Mesure, pas hypothese.

- [ ] **Step 2 : écrire la configuration**

Créer `.stylelintrc.json` :

```json
{
    "extends": ["stylelint-config-standard"],
    "plugins": ["stylelint-declaration-strict-value"],
    "ignoreFiles": ["dist/**", "node_modules/**", "coverage/**", ".stryker-tmp/**"],
    "rules": {
        "property-no-vendor-prefix": null,
        "no-descending-specificity": null,
        "scale-unlimited/declaration-strict-value": [
            [
                "color",
                "background-color",
                "fill",
                "stroke",
                "font-size",
                "line-height",
                "letter-spacing",
                "border-radius",
                "gap"
            ],
            {
                "ignoreKeywords": [
                    "inherit",
                    "currentColor",
                    "transparent",
                    "none",
                    "auto",
                    "unset",
                    "initial"
                ],
                "disableFix": true
            }
        ]
    },
    "overrides": [
        {
            "files": ["src/styles/tokens/*.css"],
            "rules": { "scale-unlimited/declaration-strict-value": null }
        },
        {
            "files": ["src/styles/screens/legacy.css", "src/style.css"],
            "rules": {
                "scale-unlimited/declaration-strict-value": [
                    [
                        "color",
                        "background-color",
                        "fill",
                        "stroke",
                        "font-size",
                        "line-height",
                        "letter-spacing",
                        "border-radius",
                        "gap"
                    ],
                    {
                        "ignoreKeywords": [
                            "inherit",
                            "currentColor",
                            "transparent",
                            "none",
                            "auto",
                            "unset",
                            "initial"
                        ],
                        "disableFix": true,
                        "severity": "warning"
                    }
                ]
            }
        },
        {
            "files": ["design/*.css"],
            "rules": { "scale-unlimited/declaration-strict-value": null }
        }
    ]
}
```

Trois choix, chacun motivé — et **aucun** n'est un renoncement par confort :

- **`property-no-vendor-prefix: null`.** Ce dépôt a besoin de `-webkit-backdrop-filter`, écrit **avant** `backdrop-filter` et à l'octet près : sans lui, WebKit ne floute rien. La règle refuserait un préfixe qui est la condition du matériau.
- **`no-descending-specificity: null`.** Elle veille sur l'ordre source, qui cessait de gouverner la priorité dès Task 3 : c'est l'ordre des couches qui décide. Elle relevait 10 cas dans la feuille actuelle, tous absorbés par `@layer`.
- **`tokens/*.css` exempté de `declaration-strict-value`.** C'est **là** que les valeurs brutes ont le droit de vivre, et le seul endroit. C'est la règle des paliers, écrite dans le linter.

- [ ] **Step 3 : brancher les scripts**

Dans `package.json`, ajouter à `scripts` :

```json
        "lint:css": "stylelint \"src/**/*.css\" \"design/**/*.css\"",
```

et faire passer `quality` par lui :

```json
        "quality": "pnpm typecheck && pnpm lint && pnpm lint:css && pnpm test && pnpm exec fallow audit",
```

- [ ] **Step 4 : chiffrer la dette avant de la payer**

Run: `pnpm lint:css`
Expected: **256 problèmes**, dont 244 réparables automatiquement, répartis ainsi :

```
  72 scale-unlimited/declaration-strict-value
  51 color-function-notation
  49 comment-empty-line-before
  30 color-function-alias-notation
  30 alpha-value-notation
   5 custom-property-empty-line-before
   2 media-feature-range-notation
   1 value-keyword-case
   1 font-family-no-missing-generic-family-keyword
   1 declaration-block-no-shorthand-property-overrides
```

Noter le nombre : c'est la mesure d'entrée, et les tâches suivantes le font baisser.

- [ ] **Step 5 : réparer ce qui se répare seul**

Run: `pnpm exec stylelint "src/**/*.css" "design/**/*.css" --fix`
Expected: il reste **62 problèmes** — 60 `declaration-strict-value` et 2 sur la règle `html`. Les 60 se répartissent ainsi, et c'est la carte des tâches suivantes :

```
  16 of "font-size"      ─┐
  15 of "line-height"     ├─ 36 littéraux typographiques → Task 6
   5 of "letter-spacing" ─┘
  14 of "gap"            ─┐
   9 of "border-radius"   ├─ 24 littéraux d'échelle → Task 4
   1 of "stroke"         ─┘
```

Les 60 sont des **avertissements** sur la feuille en transit, donc `pnpm quality` reste vert.

- [ ] **Step 6 : traiter les deux défauts réels**

Ils portent tous deux sur la règle `html`, et ils sont **justes** :

```
26:5   ✖  Overridden property "font-size" by shorthand "font"
26:11  ✖  Missing generic font family
```

`font: -apple-system-body` écrase bien le `font-size: 17px` qui le précède. Cela fonctionne **seulement** parce que la forme abrégée est invalide hors WebKit, donc ignorée là où le repli doit servir — un contrat qui ne vivait que dans un commentaire de prose. Le rendre explicite :

```css
html {
    /* Le repli, pour les moteurs qui ignorent la ligne suivante. */
    font-size: 17px;
    /* La seule accroche web à la taille dynamique d'iOS. Elle **écrase**
       volontairement le `font-size` ci-dessus, et Stylelint a raison de le
       relever : ce n'est sûr que parce que Chrome tient la forme abrégée pour
       invalide et la jette, laissant le repli en place. WebKit, lui, la
       comprend et suit les réglages d'accessibilité du système.
       La famille n'a pas de générique de repli pour la même raison : c'est le
       système qui la résout, et il n'y a rien à lui proposer d'autre. */
    /* stylelint-disable-next-line declaration-block-no-shorthand-property-overrides, font-family-no-missing-generic-family-keyword */
    font: -apple-system-body;
    background-color: var(--fond-groupe);
    color-scheme: light dark;
}
```

- [ ] **Step 7 : vérifier et committer**

```bash
pnpm lint:css
pnpm quality
git add package.json pnpm-lock.yaml .stylelintrc.json src/style.css
git commit -m "Confie au linter la contrainte que les tests décrivaient"
```

Expected: `pnpm lint:css` sort en **0**, avec 60 avertissements restants sur la feuille en transit.

---

## Task 2 : mettre `leaflet.css` dans la couche la plus basse

**Files:**

- Modify: `src/style.css` (l'ordre des couches, l'import, et 16 `!important` retirés)
- Modify: `src/carte/adapters/LeafletCarteDesPoints.ts:2`
- Modify: `src/carte/adapters/LeafletCoordonneeSelector.ts:2`

**Interfaces:**

- Produces: la couche `vendor` existe et contient Leaflet. Les règles de l'application gagnent sur les siennes **sans `!important`**, parce qu'une déclaration hors couche l'emporte sur toute déclaration en couche.

**Le pari, et son repli.** Un `import 'leaflet/dist/leaflet.css'` en TypeScript ne peut pas être mis en couche. Déplacé en CSS sous `@import url(…) layer(vendor)`, il y tombe. Le risque est que Vite aplatisse l'import et perde la couche : Step 5 le vérifie **sur le `dist` construit**, et Step 6 dit quoi faire si c'est le cas.

- [ ] **Step 1 : écrire l'invariant qui échoue**

Ajouter à `src/style.test.ts` :

```ts
describe('La réconciliation avec Leaflet', () => {
    describe('Étant donné que leaflet.css est chargé en couche vendor, quand la feuille reprend ses contrôles', () => {
        it("alors elle n'a besoin d'aucun !important pour les tenir", () => {
            // Une declaration hors couche l'emporte sur toute declaration en
            // couche : c'est la regle de la cascade, et elle rend les 16
            // `!important` de cette zone inutiles. Ils venaient de ce que
            // leaflet.css arrivait apres nous dans le bundle, avec une
            // specificite que `.carte-recentrer` ne pouvait pas battre.
            const zoneLeaflet = feuille.slice(feuille.indexOf('.leaflet-bar'));

            expect(zoneLeaflet).not.toContain('!important');
            expect(feuille).toContain("@import url('leaflet/dist/leaflet.css') layer(vendor);");
        });
    });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

Run: `pnpm vitest run src/style.test.ts -t "aucun !important"`
Expected: FAIL — `expect(zoneLeaflet).not.toContain('!important')` trouve 16 occurrences.

- [ ] **Step 3 : déclarer les couches et importer Leaflet dedans**

Tout en haut de `src/style.css`, **avant toute règle** — un `@import` ne vaut qu'en tête de feuille, et la déclaration d'ordre des couches doit le précéder :

```css
/* L'ordre de cascade du système. Une couche déclarée plus tard gagne, quelle
   que soit la specificite — et **toute** declaration hors couche gagne sur
   toutes les couches. C'est ce qui permet de ranger Leaflet tout en bas et de
   reprendre ses contrôles sans un seul `!important`. */
@layer vendor, reset, tokens, base, components, screens;

/* leaflet.css entrait par deux adapters TypeScript, et un import JavaScript ne
   peut pas être mis en couche : c'est precisement ce qui obligeait a 16
   `!important` pour reprendre ses contrôles. Ici, il tombe dans la couche la
   plus basse. */
@import url('leaflet/dist/leaflet.css') layer(vendor);
```

Puis retirer les 16 `!important` de la zone de réconciliation — les règles `.leaflet-bar`, `.leaflet-bar a`, `.carte-recentrer`, `.leaflet-bar a + .carte-recentrer`, `.leaflet-control-attribution` et `.leaflet-control-attribution a`. **Ne pas toucher aux 6 autres** (`[hidden]`, `.awaiting-click *`, `*::after` du mouvement réduit) : ceux-là sont légitimes et le test ne les regarde pas.

- [ ] **Step 4 : retirer les deux imports TypeScript**

Dans `src/carte/adapters/LeafletCarteDesPoints.ts` et `src/carte/adapters/LeafletCoordonneeSelector.ts`, supprimer la ligne :

```ts
import 'leaflet/dist/leaflet.css';
```

Ce sont des `.ts` : **le portail s'applique**. Le test rouge qui les autorise est celui de Step 1, qui affirme que la feuille porte l'import — donc que plus personne d'autre ne doit le porter.

- [ ] **Step 5 : lancer les tests, puis vérifier la couche sur le `dist`**

```bash
pnpm vitest run src/style.test.ts
pnpm build
grep -c "@layer vendor" dist/assets/*.css
grep -o "@layer vendor[^{]*{[^}]*\.leaflet" dist/assets/*.css | head -1
```

Expected: les tests passent ; `@layer vendor` apparaît au moins une fois dans le CSS construit, et les règles Leaflet sont dedans.

- [ ] **Step 6 : si la couche n'a pas survécu**

Si `grep` ne trouve pas `@layer vendor` dans le `dist`, Vite a aplati l'import. **Revenir en arrière proprement**, sans insister :

1. Restaurer les deux `import 'leaflet/dist/leaflet.css';` dans les adapters.
2. Retirer la ligne `@import`, garder la déclaration `@layer` (les couches suivantes en ont besoin).
3. Remettre les 16 `!important`, et remplacer le test de Step 1 par celui-ci, qui enregistre la mesure au lieu de la nier :

```ts
describe('La réconciliation avec Leaflet', () => {
    describe('Étant donné que Vite aplatit un @import en couche, quand la feuille reprend ses contrôles', () => {
        it('alors elle le fait par !important, et seulement là', () => {
            // Mesuré : `@import url(…) layer(vendor)` ne survit pas au bundle.
            // Les `!important` restent donc le seul moyen de battre une feuille
            // qui arrive après nous. Ils sont confinés à cette zone, et le test
            // interdit qu'ils se répandent ailleurs.
            const avantLeaflet = feuille.slice(0, feuille.indexOf('.leaflet-bar'));

            expect(avantLeaflet.match(/!important/g)?.length ?? 0).toBe(6);
        });
    });
});
```

- [ ] **Step 7 : vérifier visuellement les contrôles de carte**

Le bac à sable rend le watcher de Vite muet : démarrer un serveur **neuf**.

```bash
pnpm dev --port 5401 --strictPort
```

Ouvrir l'éditeur d'un trajet, et vérifier sur la carte : les boutons `+` et `−` font 44 px, portent le rayon du système, et le bouton « Ma position » leur est adjacent sans double bordure. Comparer avec une capture d'avant si un doute subsiste.

- [ ] **Step 8 : committer**

```bash
pnpm quality
git add src/style.css src/style.test.ts src/carte/adapters/LeafletCarteDesPoints.ts src/carte/adapters/LeafletCoordonneeSelector.ts
git commit -m "Range Leaflet sous nous plutot que de le battre a l'important"
```

---

## Task 3 : l'ossature des couches, et la feuille en transit

**Files:**

- Create: `src/styles/index.css`
- Create: `src/styles/screens/legacy.css` (par `git mv` depuis `src/style.css`)
- Create: `src/styles/styles.test.ts`
- Move: `src/style.css` → `src/styles/screens/legacy.css`
- Move: `src/style.test.ts` → `src/styles/legacy.test.ts`
- Modify: `src/main.ts:5`

**Interfaces:**

- Produces: `src/styles/index.css` est le seul point d'entrée. Chaque fichier du système **déclare sa couche en interne** (`@layer tokens { … }`), et `index.css` ne fait que les importer. Les invariants vivent dans `src/styles/styles.test.ts`, qui découvre les feuilles par `import.meta.glob` — donc un fichier ajouté est examiné sans qu'on ait à l'inscrire.

**Pourquoi la couche est déclarée _dans_ chaque fichier et non sur son import.** `@import url(…) layer(x)` dépend du traitement de Vite, que Task 2 met à l'épreuve pour Leaflet. Pour nos propres fichiers, aucune raison de dépendre de ce comportement : `@layer x { … }` écrit dans le fichier fonctionne dans tous les cas, et rend chaque fichier auto-descriptif.

- [ ] **Step 1 : écrire les invariants qui échouent**

Créer `src/styles/styles.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

/**
 * Les feuilles du système, découvertes plutôt qu'énumérées : un fichier ajouté
 * tombe sous les invariants sans qu'on ait pensé à l'inscrire — et c'est
 * précisément l'oubli qui a laissé passer une contrepartie sombre manquante.
 */
const feuilles: Record<string, string> = import.meta.glob('./**/*.css', {
    query: '?raw',
    import: 'default',
    eager: true,
});

const entree = feuilles['./index.css'] ?? '';
const systeme = Object.values(feuilles).join('\n');

const COUCHES = 'vendor, reset, tokens, base, components, screens';

describe("L'ordre de cascade", () => {
    describe('Étant donné le système, quand on cherche qui décide de la priorite', () => {
        it("alors une seule ligne le dit, et c'est l'entree", () => {
            // Deux declarations d'ordre, et c'est la premiere qui gagne en
            // silence : la seconde ne previent pas qu'elle est ignoree.
            const declarations = systeme.match(/@layer [a-z, ]+;/g) ?? [];

            expect(declarations).toEqual([`@layer ${COUCHES};`]);
            expect(entree).toContain(`@layer ${COUCHES};`);
        });
    });

    describe("Étant donné l'entree du systeme, quand on l'ouvre", () => {
        it("alors elle n'y met aucune regle : elle ordonne et importe, rien d'autre", () => {
            // Une regle ecrite ici echapperait a toute couche, et une
            // declaration hors couche gagne sur toutes : elle serait
            // impossible a surcharger depuis un composant.
            const sansCommentaires = entree.replace(/\/\*[\s\S]*?\*\//g, '');
            const lignesSignifiantes = sansCommentaires
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l.length > 0);

            expect(lignesSignifiantes.every((l) => l.startsWith('@'))).toBe(true);
        });
    });

    describe('Étant donné une feuille du systeme, quand on cherche qui la charge', () => {
        it("alors l'entree l'importe, sinon elle est morte sans que rien ne le dise", () => {
            const orphelines = Object.keys(feuilles)
                .filter((chemin) => chemin !== './index.css')
                .filter((chemin) => !entree.includes(chemin.replace('./', '')));

            expect(orphelines).toEqual([]);
        });
    });

    describe('Étant donné une feuille du systeme, quand on regarde ce qu elle declare', () => {
        it('alors elle annonce sa couche elle-meme', () => {
            // Ecrite dans le fichier, la couche ne depend pas du traitement de
            // l'import par Vite, et le fichier dit ce qu'il est.
            const sansCouche = Object.entries(feuilles)
                .filter(([chemin]) => chemin !== './index.css')
                .filter(([, contenu]) => !/@layer [a-z]+ \{/.test(contenu))
                .map(([chemin]) => chemin);

            expect(sansCouche).toEqual([]);
        });
    });
});
```

- [ ] **Step 2 : lancer les tests pour les voir echouer**

Run: `pnpm vitest run src/styles/styles.test.ts`
Expected: les quatre échouent — `import.meta.glob` ne trouve rien, `entree` est vide.

- [ ] **Step 3 : deplacer la feuille et ecrire l'entree**

```bash
mkdir -p src/styles/screens
git mv src/style.css src/styles/screens/legacy.css
git mv src/style.test.ts src/styles/legacy.test.ts
```

`src/styles/legacy.test.ts` conserve les invariants déjà écrits sur la feuille actuelle. Corriger son chemin de lecture : `new URL('./screens/legacy.css', import.meta.url)`. Il disparaîtra en partie 2 avec la feuille qu'il décrit.

Retirer de `legacy.css` la déclaration `@layer` et l'`@import` de Leaflet posés en Task 2 — ils remontent dans l'entrée — puis **envelopper tout le reste** :

```css
@layer screens {
    /* … les 1554 lignes, indentées d'un niveau … */
}
```

Prettier réindente le fichier : le diff est volumineux mais `git diff -w` doit ne montrer que l'enveloppe. Le vérifier avant de committer.

Créer `src/styles/index.css` :

```css
/* Le seul point d'entrée du système de design.
 *
 * Ce fichier n'écrit **aucune règle** : il déclare l'ordre de cascade, puis
 * importe. Une règle posée ici échapperait à toute couche, et une déclaration
 * hors couche gagne sur toutes les couches — donc rien ne pourrait la
 * surcharger.
 *
 * L'ordre des couches est le seul endroit qui décide de la priorité. Une
 * couche déclarée plus tard gagne, quelle que soit la spécificité. C'est ce
 * qui remplace les jeux de sélecteurs et les `!important`.
 */
@layer vendor, reset, tokens, base, components, screens;

/* Leaflet tout en bas : voir la note de `screens/legacy.css` sur la mesure qui
   a décidé de cette ligne. */
@import url('leaflet/dist/leaflet.css') layer(vendor);

@import url('./screens/legacy.css');
```

Dans `src/main.ts`, remplacer `import './style.css';` par :

```ts
import './styles/index.css';
```

C'est un `.ts` : le portail s'applique, et le rouge de Step 1 est ce qui l'autorise.

- [ ] **Step 4 : lancer les tests pour les voir passer**

Run: `pnpm vitest run src/styles/`
Expected: PASS — les quatre invariants, et les invariants héritles de `legacy.test.ts`.

- [ ] **Step 5 : verifier a l'oeil que rien n'a bouge**

C'est le seul juge de cette tâche : **l'application doit être identique.**

```bash
pnpm dev --port 5405 --strictPort
```

Parcourir les trois écrans en clair puis en sombre, à 360 px : liste, éditeur, suivi. Ouvrir la carte plein écran. Comparer avec les captures d'avant si un doute subsiste. Toute différence est une régression de cette tâche, pas une amélioration.

- [ ] **Step 6 : verifier et committer**

```bash
pnpm quality
pnpm test:e2e
git add -A src/styles src/main.ts
git commit -m "Donne une ossature de couches a la feuille, sans rien changer a l'ecran"
```

---

## Task 4 : palier A — les primitives

**Files:**

- Create: `src/styles/tokens/primitives.css`
- Modify: `src/styles/index.css`
- Modify: `src/styles/styles.test.ts`

**Interfaces:**

- Produces: les échelles brutes. **Ne référence rien** — c'est la définition du palier. Consommé par `semantic.css` (Task 5) et `components/text.css` (Task 6).
- Nomenclature : `--blue-light`, `--blue-dark`, `--space-8`, `--radius-12`, `--text-body-size`, `--text-body-leading`, `--text-body-tracking`.

- [ ] **Step 1 : ecrire les invariants qui echouent**

Ajouter à `src/styles/styles.test.ts` :

```ts
const primitives = feuilles['./tokens/primitives.css'] ?? '';

/** Les onze styles de texte iOS a la taille « Large » par defaut, tels que la
 *  HIG les publie : taille en points, interligne en points, approche en
 *  milliemes d'em. */
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
    describe('Étant donné le palier le plus haut, quand on regarde ce dont il depend', () => {
        it('alors il ne depend de rien : aucun var() ne le traverse', () => {
            // C'est la definition du palier, et la moitie de la regle qui
            // empeche un jeton de reboucler sur un autre.
            expect(primitives).not.toMatch(/var\(--/);
        });
    });

    describe('Étant donné un style de texte, quand on cherche ses jetons', () => {
        it('alors les trois y sont : une taille ne voyage jamais seule', () => {
            // Mesuré avant ce chantier : 16 declarations `font-size`, dont 5
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

    describe("Étant donné les metriques d'Apple, quand on lit ce que la feuille en a fait", () => {
        it('alors chaque valeur est celle de la HIG, au millieme', () => {
            const CORPS = 17;
            const attendus = STYLES_DE_TEXTE.map(({ nom, taille, interligne, approche }) => {
                const rem = taille === CORPS ? '1rem' : `${(taille / CORPS).toFixed(3)}rem`;
                return [
                    `--text-${nom}-size: ${rem};`,
                    `--text-${nom}-leading: ${(interligne / taille).toFixed(3)};`,
                    `--text-${nom}-tracking: ${(approche / 1000).toFixed(3)}em;`,
                ];
            }).flat();

            const absents = attendus.filter((d) => !primitives.includes(d));

            expect(absents).toEqual([]);
        });
    });

    describe("Étant donné l'echelle d'espacement, quand un composant cherche une valeur", () => {
        it('alors les dix marches y sont, et rien entre elles', () => {
            // Une centaine de longueurs en clair vivaient dans la feuille, dont
            // `0.5rem` seize fois : c'est de la que la hauteur des deux barres
            // avait derive de 18 px.
            const marches = [2, 4, 8, 12, 16, 20, 24, 32, 44, 64];
            const absentes = marches.filter((m) => !primitives.includes(`--space-${m}: ${m}px;`));

            expect(absentes).toEqual([]);
        });
    });
});
```

- [ ] **Step 2 : lancer les tests pour les voir echouer**

Run: `pnpm vitest run src/styles/styles.test.ts -t "palier des primitives"`
Expected: FAIL sur les quatre — `primitives` est la chaîne vide.

- [ ] **Step 3 : ecrire le fichier**

Créer `src/styles/tokens/primitives.css` :

```css
/* Palier A — les primitives.
 *
 * Des échelles, sans signification. Aucun rôle, aucune apparence : « le bleu
 * système clair » vit ici, « la couleur d'accent » vit dans `semantic.css`.
 *
 * **Ce fichier ne référence rien** — aucun `var()` ne le traverse, et un test
 * l'affirme. C'est ce qui garantit qu'il n'y a pas de cycle entre jetons.
 *
 * C'est aussi le seul endroit du système où une valeur brute a le droit d'être
 * écrite : `.stylelintrc.json` exempte `tokens/*.css` de
 * `declaration-strict-value`, et l'y refuse partout ailleurs.
 */
@layer tokens {
    :root {
        /* --- Les couleurs systeme d'Apple, par apparence ------------------
           Chaque rampe porte ses deux versions ; c'est `semantic.css` qui les
           marie par `light-dark()`. Valeurs publiees par la HIG. */
        --blue-light: rgb(0 136 255);
        --blue-dark: rgb(0 145 255);
        --blue-contrast-light: rgb(30 110 244);
        --blue-contrast-dark: rgb(92 184 255);

        --red-light: rgb(255 56 60);
        --red-dark: rgb(255 66 69);
        --red-contrast-light: rgb(233 21 45);
        --red-contrast-dark: rgb(255 97 101);

        --orange-light: rgb(255 138 0);
        --orange-dark: rgb(255 146 48);

        --green-light: rgb(52 199 89);
        --green-dark: rgb(74 217 104);

        /* Les gris des fonds et des libelles, tels qu'iOS les emploie. */
        --grey-background-light: rgb(255 255 255);
        --grey-background-dark: rgb(28 28 30);
        --grey-grouped-light: rgb(242 242 247);
        --grey-grouped-dark: rgb(0 0 0);
        --grey-label-light: rgb(0 0 0);
        --grey-label-dark: rgb(255 255 255);
        --grey-separator-light: rgb(60 60 67 / 29%);
        --grey-separator-dark: rgb(84 84 88 / 65%);
        --grey-label-2-light: rgb(60 60 67 / 60%);
        --grey-label-2-dark: rgb(235 235 245 / 60%);
        --grey-label-3-light: rgb(60 60 67 / 30%);
        --grey-label-3-dark: rgb(235 235 245 / 30%);
        --grey-label-2-contrast-light: rgb(60 60 67 / 85%);
        --grey-label-2-contrast-dark: rgb(235 235 245 / 85%);
        --grey-label-3-contrast-light: rgb(60 60 67 / 60%);
        --grey-label-3-contrast-dark: rgb(235 235 245 / 60%);

        /* --- L'echelle d'espacement ---------------------------------------
           Base 8, avec 2 et 4 pour le serre, et 44 parce que c'est la cible
           tactile d'Apple : une marche qui existe deja dans le systeme n'a pas
           a etre reinventee en `calc()`. */
        --space-2: 2px;
        --space-4: 4px;
        --space-8: 8px;
        --space-12: 12px;
        --space-16: 16px;
        --space-20: 20px;
        --space-24: 24px;
        --space-32: 32px;
        --space-44: 44px;
        --space-64: 64px;

        /* --- Les rayons ---------------------------------------------------
           « Consider aligning the shape of controls with other rounded
           elements throughout the interface. » Quatre marches et la pilule. */
        --radius-4: 4px;
        --radius-8: 8px;
        --radius-12: 12px;
        --radius-16: 16px;
        --radius-22: 22px;
        --radius-pill: 999px;

        /* --- Le flou -------------------------------------------------------
           Plafonne a 20 : au-dela, WebKit bloque ~20 s au premier rendu
           (bug 319187). Ce n'est pas une preference esthetique. */
        --blur-material: 20px;

        /* --- Les onze styles de texte d'iOS -------------------------------
           Taille « Large » par defaut. Les valeurs viennent de la table de la
           HIG : taille et interligne en points, approche en milliemes d'em.
           Elles sont exprimees en fraction du corps (17 px) pour suivre la
           taille dynamique, et l'interligne en nombre sans unite pour rester
           proportionnel.

           Un style est un **triplet**. Ecrire une taille sans son interligne
           ni son approche etait le defaut le plus repandu de l'ancienne
           feuille : onze styles sur seize y etaient incomplets. */
        --text-large-title-size: 2rem;
        --text-large-title-leading: 1.206;
        --text-large-title-tracking: 0.012em;

        --text-title-1-size: 1.647rem;
        --text-title-1-leading: 1.214;
        --text-title-1-tracking: 0.014em;

        --text-title-2-size: 1.294rem;
        --text-title-2-leading: 1.273;
        --text-title-2-tracking: -0.012em;

        --text-title-3-size: 1.176rem;
        --text-title-3-leading: 1.25;
        --text-title-3-tracking: -0.023em;

        --text-headline-size: 1rem;
        --text-headline-leading: 1.294;
        --text-headline-tracking: -0.026em;

        --text-body-size: 1rem;
        --text-body-leading: 1.294;
        --text-body-tracking: -0.026em;

        --text-callout-size: 0.941rem;
        --text-callout-leading: 1.313;
        --text-callout-tracking: -0.02em;

        --text-subheadline-size: 0.882rem;
        --text-subheadline-leading: 1.333;
        --text-subheadline-tracking: -0.016em;

        --text-footnote-size: 0.765rem;
        --text-footnote-leading: 1.385;
        --text-footnote-tracking: -0.006em;

        --text-caption-1-size: 0.706rem;
        --text-caption-1-leading: 1.333;
        --text-caption-1-tracking: 0em;

        --text-caption-2-size: 0.647rem;
        --text-caption-2-leading: 1.182;
        --text-caption-2-tracking: 0.006em;
    }
}
```

L'importer depuis `src/styles/index.css`, **avant** `screens/legacy.css` :

```css
@import url('./tokens/primitives.css');
```

- [ ] **Step 4 : lancer les tests pour les voir passer**

Run: `pnpm vitest run src/styles/styles.test.ts`
Expected: PASS. Si `-tracking: 0em;` ou une taille échoue, comparer au calcul du test plutôt qu'ajuster le test : ce sont les valeurs d'Apple qui font foi.

- [ ] **Step 5 : brancher le linter sur les jetons**

Maintenant que le fichier existe, ajouter à `.stylelintrc.json` :

```json
        "csstools/value-no-unknown-custom-properties": [
            true,
            { "importFrom": ["src/styles/tokens/primitives.css"] }
        ],
```

et `"stylelint-value-no-unknown-custom-properties"` à `plugins`.

Run: `pnpm lint:css`
Expected: la règle relève tous les `var(--…)` de `legacy.css` qui désignent des jetons français encore définis dans ce même fichier — donc **aucun**, puisqu'elle résout aussi les propriétés déclarées dans le fichier examiné. Un signalement ici est un vrai jeton manquant : le traiter, ne pas l'ignorer.

- [ ] **Step 6 : verifier et committer**

```bash
pnpm quality
git add src/styles .stylelintrc.json
git commit -m "Nomme les echelles que cent nombres en clair remplacaient"
```

---

## Task 5 : palier B — le semantique, et la fin des blocs dupliques

**Files:**

- Create: `src/styles/tokens/semantic.css`
- Create: `src/styles/screens/legacy-bridge.css`
- Modify: `src/styles/screens/legacy.css` (les definitions francaises et les quatre blocs d'apparence disparaissent)
- Modify: `src/styles/index.css`
- Modify: `src/styles/styles.test.ts`

**Interfaces:**

- Produces: les rôles du système. `--color-label`, `--color-background`, `--color-background-grouped`, `--color-separator`, `--color-accent`, `--color-destructive`, `--color-warning`, `--color-success`, `--color-on-accent`, `--material-regular`, `--material-thick`, `--hit-target`, `--shadow-badge`, `--shadow-floating`.
- **Ne référence que des primitives.** Consommé par tout le reste.
- `screens/legacy-bridge.css` fait tenir la feuille en transit sur ces rôles, en aliasant les 32 noms français. **Il meurt en partie 2**, avec elle.

**Pourquoi un pont d'alias plutot qu'un renommage.** `legacy.css` emploie les noms français (`--fond-groupe`, `--verre`) dans des centaines d'endroits. Les renommer maintenant serait une réécriture massive d'un fichier qui disparaît de toute façon, et mélangerait deux causes de régression. Trente-deux alias tiennent le pont, et se suppriment d'un bloc.

- [ ] **Step 1 : ecrire les invariants qui echouent**

Ajouter à `src/styles/styles.test.ts` :

```ts
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
            // Un role peut s'appuyer sur un role du meme palier — l'ombre se
            // compose de sa geometrie et de `--shadow-color`. Ce que la regle
            // interdit, c'est de descendre chercher **plus bas** que soi.
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
```

- [ ] **Step 2 : lancer les tests pour les voir echouer**

Run: `pnpm vitest run src/styles/styles.test.ts -t "palier semantique"`
Expected: FAIL sur les cinq — les deux fichiers sont vides, et les blocs sombres de `legacy.css` déclarent encore des couleurs.

- [ ] **Step 3 : ecrire le palier semantique**

Créer `src/styles/tokens/semantic.css` :

```css
/* Palier B — les roles.
 *
 * Ce que chaque couleur **fait**, et non ce qu'elle est. « L'accent » vit ici ;
 * « le bleu systeme » vit dans `primitives.css`.
 *
 * **Chaque couleur est declaree une seule fois**, par `light-dark()`, qui porte
 * les deux apparences dans la meme declaration. Il n'y a donc plus de seconde
 * liste a tenir a jour, et une contrepartie sombre oubliee n'est plus une
 * omission possible : c'est une erreur de syntaxe.
 *
 * La precondition est `color-scheme: light dark` sur la racine, que
 * `base/elements.css` pose.
 *
 * **Ne reference que des primitives** — un test l'affirme.
 */
@layer tokens {
    :root {
        /* --- Les couleurs de role ----------------------------------------- */
        --color-label: light-dark(var(--grey-label-light), var(--grey-label-dark));
        --color-background: light-dark(var(--grey-background-light), var(--grey-background-dark));
        --color-background-grouped: light-dark(var(--grey-grouped-light), var(--grey-grouped-dark));
        --color-separator: light-dark(var(--grey-separator-light), var(--grey-separator-dark));
        --color-label-secondary: light-dark(var(--grey-label-2-light), var(--grey-label-2-dark));
        --color-label-tertiary: light-dark(var(--grey-label-3-light), var(--grey-label-3-dark));

        /* Le fond d'un encart de consigne : une teinte d'avertissement posee a
           14 % en clair, 18 % en sombre. Elle **se derive** de la rampe orange
           au lieu d'en etre une variante recopiee a la main — l'ancienne
           feuille portait `rgba(255, 141, 40, .14)`, soit trois unites d'ecart
           avec l'orange systeme, sans qu'aucune raison ne soit ecrite. */
        --color-background-hint: light-dark(
            rgb(from var(--orange-light) r g b / 14%),
            rgb(from var(--orange-dark) r g b / 18%)
        );

        /* Le fond d'une page de schema : un noir translucide dans les deux
           apparences, plus opaque en clair pour que la page s'y detache. */
        --color-page-backdrop: light-dark(rgb(0 0 0 / 72%), rgb(0 0 0 / 60%));

        --color-accent: light-dark(var(--blue-light), var(--blue-dark));
        --color-destructive: light-dark(var(--red-light), var(--red-dark));
        --color-warning: light-dark(var(--orange-light), var(--orange-dark));
        --color-success: light-dark(var(--green-light), var(--green-dark));

        /* Ce qui se pose **sur** une teinte pleine. Blanc dans les deux
           apparences, parce que les deux accents sont assez sombres pour le
           porter : c'est une decision, pas un oubli de contrepartie. */
        --color-on-accent: light-dark(rgb(255 255 255), rgb(255 255 255));

        /* « Ma position » porte l'accent : ce n'est pas une couleur de plus,
           c'est le meme role vu depuis la carte. Un alias le dit mieux qu'une
           valeur recopiee. */
        --color-position: var(--color-accent);

        /* --- Les materiaux -------------------------------------------------
           La teinte **se derive du fond** au lieu de le recopier. Une barre au
           repos doit etre invisible — « Instead of a background, use a scroll
           edge effect » —, ce qui n'est vrai que si sa teinte et le fond
           s'accordent. Ecrites separement, elles ont deja divergé.

           La derivation se fait a l'interieur de chaque branche, sur une
           primitive : `rgb(from …)` a besoin d'une couleur resolue, ce qu'un
           `light-dark()` n'est pas encore au moment ou il l'evalue. */
        --material-regular: light-dark(
            rgb(from var(--grey-grouped-light) r g b / 72%),
            rgb(from var(--grey-grouped-dark) r g b / 72%)
        );
        --material-thick: light-dark(
            rgb(from var(--grey-background-light) r g b / 86%),
            rgb(from var(--grey-background-dark) r g b / 86%)
        );

        /* --- Les ombres ----------------------------------------------------
           La geometrie est invariante, la couleur non : d'ou la separation. */
        --shadow-color: light-dark(rgb(0 0 0 / 20%), rgb(0 0 0 / 60%));
        --shadow-badge: 0 1px 4px var(--shadow-color);
        --shadow-floating: 0 2px 12px var(--shadow-color);
        --material-sheen: inset 0 1px 0 light-dark(rgb(255 255 255 / 60%), rgb(255 255 255 / 16%));

        /* --- Les mesures de systeme ----------------------------------------
           « The minimum tappable area for any control is 44x44 pt. » C'est une
           decision de systeme, que plusieurs composants lisent : elle ne peut
           donc pas etre un jeton de composant. */
        --hit-target: var(--space-44);
        --screen-margin: var(--space-16);
        --radius-control: var(--radius-12);
        --radius-section: var(--radius-22);
    }

    /* Le contraste eleve ne surcharge **que** ce palier : les primitives
       gardent leurs rampes, les composants ne savent rien de ce mode. */
    @media (prefers-contrast: more) {
        :root {
            --color-accent: light-dark(var(--blue-contrast-light), var(--blue-contrast-dark));
            --color-destructive: light-dark(var(--red-contrast-light), var(--red-contrast-dark));
            --color-label-secondary: light-dark(
                var(--grey-label-2-contrast-light),
                var(--grey-label-2-contrast-dark)
            );
            --color-label-tertiary: light-dark(
                var(--grey-label-3-contrast-light),
                var(--grey-label-3-contrast-dark)
            );
            --material-regular: light-dark(
                rgb(from var(--grey-background-light) r g b / 96%),
                rgb(from var(--grey-background-dark) r g b / 96%)
            );
            --material-thick: light-dark(
                rgb(from var(--grey-background-light) r g b / 98%),
                rgb(from var(--grey-background-dark) r g b / 98%)
            );
        }
    }
}
```

- [ ] **Step 4 : ecrire le pont, et vider les blocs d apparence de la feuille**

Créer `src/styles/screens/legacy-bridge.css`. La feuille declare **32** jetons
dans son `:root` ; **25** sont des roles et deviennent des alias, **7** sont des
mesures de composant et restent ou elles sont jusqu'a la partie 2. Verifier le
compte avant de committer :

```bash
awk '/^:root \{/{f=1} f&&match($0,/--[a-z0-9-]+:/){print substr($0,RSTART,RLENGTH-1)} f&&/^\}/{f=0}' \
  src/styles/screens/legacy.css | sort -u | wc -l
```

Expected: `7` apres l'etape — les 25 autres ayant migre vers le pont.

```css
/* Le pont, transitoire.
 *
 * `screens/legacy.css` emploie les noms francais des jetons dans des centaines
 * d'endroits. Plutot que de la reecrire — elle disparait en partie 2 —, chaque
 * ancien nom devient un alias du role correspondant.
 *
 * **Aucune valeur ne se decide ici** : un test verifie que toute declaration de
 * ce fichier est un `var()`. Le jour ou la feuille en transit meurt, ce fichier
 * meurt avec elle, et rien d'autre ne bouge.
 */
@layer tokens {
    :root {
        /* Les fonds */
        --fond: var(--color-background);
        --fond-groupe: var(--color-background-grouped);
        --fond-consigne: var(--color-background-hint);
        --fond-page: var(--color-page-backdrop);

        /* Les libelles et le filet */
        --label: var(--color-label);
        --label-2: var(--color-label-secondary);
        --label-3: var(--color-label-tertiary);
        --separateur: var(--color-separator);

        /* Les teintes. Deux noms pointaient deja sur la meme couleur — `--bleu`
           disait la couleur, `--accent` disait le role : le pont conserve les
           deux, le systeme n'en garde qu'un. */
        --bleu: var(--color-accent);
        --accent: var(--color-accent);
        --rouge: var(--color-destructive);
        --destructif: var(--color-destructive);
        --orange: var(--color-warning);
        --avertissement: var(--color-warning);
        --succes: var(--color-success);
        --position: var(--color-position);
        --sur-teinte: var(--color-on-accent);

        /* Les materiaux et les ombres */
        --verre: var(--material-regular);
        --verre-epais: var(--material-thick);
        --verre-reflet: var(--material-sheen);
        --ombre-pastille: var(--shadow-badge);
        --ombre-flottante: var(--shadow-floating);

        /* Les mesures de systeme */
        --marge-ecran: var(--screen-margin);
        --rayon-controle: var(--radius-control);
        --rayon-section: var(--radius-section);
    }
}
```

Vingt-cinq alias, et le compte se verifie : les sept que `legacy.css` garde sont
`--air-barre`, `--ecart-interne`, `--rayon-interieur`, `--point-badge-size`,
`--position-badge-size`, `--point-line-thickness` et `--large-screen`. Ce sont
des mesures **de composant** — la hauteur d'une barre, la taille d'une pastille
—, donc elles appartiennent au palier C, que la partie 2 ecrit avec les
composants qui les portent. `--large-screen` est un cas a part : il est relu par
chaine depuis le TypeScript **et** depuis les e2e (ADR 0007), et n'est pas une
couleur ; il ne bouge pas dans ce plan.

Puis, dans `src/styles/screens/legacy.css` :

1. Supprimer du `:root` les **25** declarations desormais aliasees. **Garder** les **7** listees ci-dessus : elles deviendront des jetons de composant en partie 2.
2. **Supprimer les quatre blocs d'apparence** — les deux `@media (prefers-color-scheme: dark)` et les deux `@media (prefers-contrast: more)`. C'est le gain : 26 déclarations dupliquées disparaissent, et l'oubli qu'elles rendaient possible avec elles.

L'importer depuis `index.css`, dans l'ordre `primitives` → `semantic` → `legacy-bridge` → `legacy` :

```css
@import url('./tokens/primitives.css');
@import url('./tokens/semantic.css');
@import url('./screens/legacy-bridge.css');
@import url('./screens/legacy.css');
```

- [ ] **Step 5 : lancer les tests pour les voir passer**

Run: `pnpm vitest run src/styles/`
Expected: PASS, y compris l'invariant hérité de `legacy.test.ts` qui exigeait qu'un jeton de couleur ait une contrepartie sombre — il devient vrai autrement : il n'y a plus de bloc sombre. **Le réécrire** pour qu'il affirme cela, plutôt que de le supprimer.

- [ ] **Step 6 : verifier les trois apparences a l oeil**

C'est la tâche la plus risquée du plan : 26 déclarations changent de mécanisme.

```bash
pnpm dev --port 5409 --strictPort
```

Sur les trois écrans, à 360 px, vérifier **les trois apparences** : clair, sombre, et contraste élevé. Ce qu'il faut regarder en premier, parce que c'est là que le défaut d'origine se voyait : **le bouton flottant « Ajouter un point » en sombre** — un disque de verre sombre portant un symbole clair, jamais un disque blanc. Puis les barres, qui doivent rester invisibles au repos.

- [ ] **Step 7 : verifier et committer**

```bash
pnpm quality
pnpm test:e2e
git add src/styles
git commit -m "Marie les deux apparences dans une seule declaration"
```

---

## Task 6 : les styles de texte, et le socle des elements

**Files:**

- Create: `src/styles/base/elements.css`
- Create: `src/styles/components/text.css`
- Modify: `src/styles/screens/legacy.css` (le socle d'elements en sort)
- Modify: `src/styles/index.css`
- Modify: `src/styles/styles.test.ts`

**Interfaces:**

- Produces: onze classes `.text-large-title` … `.text-caption-2`, chacune appliquant **le triplet complet**. Consommé par les composants de la partie 2.

- [ ] **Step 1 : ecrire l invariant qui echoue**

Ajouter à `src/styles/styles.test.ts` :

```ts
const styles = feuilles['./components/text.css'] ?? '';

describe('Les styles de texte', () => {
    describe('Étant donné un style de texte, quand une regle l applique', () => {
        it('alors elle applique les trois proprietes, jamais une seule', () => {
            // C'etait le defaut le plus repandu : 16 declarations `font-size`
            // dont 5 seulement portaient l'interligne et l'approche. Une taille
            // sans son approche n'est pas le style d'Apple, c'est sa moitie.
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

    describe('Étant donné le socle des elements, quand on regarde ce qu il declare', () => {
        it('alors il ne nomme aucune classe : ce sont des defauts, pas un vocabulaire', () => {
            const socle = feuilles['./base/elements.css'] ?? '';
            const sansCommentaires = socle.replace(/\/\*[\s\S]*?\*\//g, '');

            expect(sansCommentaires).not.toMatch(/^\s*\.[a-z]/m);
        });
    });
});
```

- [ ] **Step 2 : lancer le test pour le voir echouer**

Run: `pnpm vitest run src/styles/styles.test.ts -t "styles de texte"`
Expected: FAIL — les onze noms sont listés comme incomplets, les deux fichiers étant vides.

- [ ] **Step 3 : ecrire les deux fichiers**

Créer `src/styles/components/text.css` :

```css
/* Les onze styles de texte d'iOS, un par classe.
 *
 * Un style est un **triplet** : taille, interligne, approche. Les separer, ou
 * n'en appliquer qu'une part, c'est ne pas employer le style — et c'etait le
 * defaut le plus repandu de l'ancienne feuille.
 *
 * Ces classes sont le **seul** endroit du systeme ou `font-size`,
 * `line-height` et `letter-spacing` s'ecrivent. Ailleurs, on porte la classe.
 */
@layer components {
    .text-large-title {
        font-size: var(--text-large-title-size);
        line-height: var(--text-large-title-leading);
        letter-spacing: var(--text-large-title-tracking);
    }

    .text-title-1 {
        font-size: var(--text-title-1-size);
        line-height: var(--text-title-1-leading);
        letter-spacing: var(--text-title-1-tracking);
    }

    .text-title-2 {
        font-size: var(--text-title-2-size);
        line-height: var(--text-title-2-leading);
        letter-spacing: var(--text-title-2-tracking);
    }

    .text-title-3 {
        font-size: var(--text-title-3-size);
        line-height: var(--text-title-3-leading);
        letter-spacing: var(--text-title-3-tracking);
    }

    /* Headline et Body partagent leurs metriques ; seule la graisse les
       distingue, et c'est Apple qui le veut ainsi. */
    .text-headline {
        font-size: var(--text-headline-size);
        line-height: var(--text-headline-leading);
        letter-spacing: var(--text-headline-tracking);
        font-weight: 600;
    }

    .text-body {
        font-size: var(--text-body-size);
        line-height: var(--text-body-leading);
        letter-spacing: var(--text-body-tracking);
    }

    .text-callout {
        font-size: var(--text-callout-size);
        line-height: var(--text-callout-leading);
        letter-spacing: var(--text-callout-tracking);
    }

    .text-subheadline {
        font-size: var(--text-subheadline-size);
        line-height: var(--text-subheadline-leading);
        letter-spacing: var(--text-subheadline-tracking);
    }

    .text-footnote {
        font-size: var(--text-footnote-size);
        line-height: var(--text-footnote-leading);
        letter-spacing: var(--text-footnote-tracking);
    }

    .text-caption-1 {
        font-size: var(--text-caption-1-size);
        line-height: var(--text-caption-1-leading);
        letter-spacing: var(--text-caption-1-tracking);
    }

    .text-caption-2 {
        font-size: var(--text-caption-2-size);
        line-height: var(--text-caption-2-leading);
        letter-spacing: var(--text-caption-2-tracking);
    }
}
```

Créer `src/styles/base/elements.css` en y **deplacant** depuis `legacy.css` les regles `html`, `body`, `h1, h2` et les defauts de formulaire — sans les modifier autrement que pour employer les jetons anglais et les styles de texte. Les titres cessent d'ecrire leurs metriques :

```css
/* Le socle : des defauts d'elements, et **aucune classe** — un test l'affirme.
 * Ce qui a besoin d'un nom est un composant, pas un defaut. */
@layer base {
    html {
        /* Le repli, pour les moteurs qui ignorent la ligne suivante. */
        font-size: 17px;
        /* La seule accroche web a la taille dynamique d'iOS. Elle ecrase
           volontairement le `font-size` ci-dessus, et Stylelint a raison de le
           relever : ce n'est sur que parce que Chrome tient la forme abregee
           pour invalide et la jette, laissant le repli en place. La famille n'a
           pas de generique de repli pour la meme raison — c'est le systeme qui
           la resout. */
        /* stylelint-disable-next-line declaration-block-no-shorthand-property-overrides, font-family-no-missing-generic-family-keyword */
        font: -apple-system-body;
        /* Un fond opaque explicite : une racine transparente retombe sur du
           blanc en clair et du noir en sombre, et c'est de la que venaient les
           barres blanches observees sous Safari 26. */
        background-color: var(--color-background-grouped);
        /* La precondition de `light-dark()`, et ce qui donne aux controles
           natifs la bonne apparence. */
        color-scheme: light dark;
        color: var(--color-label);
    }

    h1,
    h2,
    h3 {
        margin: 0;
        font-weight: 700;
    }

    /* Les titres n'ecrivent plus leurs metriques : ils portent un style. */
    h1 {
        font-size: var(--text-title-2-size);
        line-height: var(--text-title-2-leading);
        letter-spacing: var(--text-title-2-tracking);
    }

    h2 {
        font-size: var(--text-title-2-size);
        line-height: var(--text-title-2-leading);
        letter-spacing: var(--text-title-2-tracking);
    }

    h3 {
        font-size: var(--text-title-3-size);
        line-height: var(--text-title-3-leading);
        letter-spacing: var(--text-title-3-tracking);
    }
}
```

Les importer depuis `index.css`, dans l'ordre du fichier : les couches gouvernent la priorité, mais l'ordre de lecture doit suivre le sens.

- [ ] **Step 4 : lancer les tests pour les voir passer**

Run: `pnpm vitest run src/styles/ && pnpm lint:css`
Expected: les tests passent. Le compte d'avertissements `declaration-strict-value` **baisse** de 60 : les quatre littéraux du socle (`font-size` de `html`, et le triplet de `h1, h2`) en sortent. Noter le nouveau nombre — il sert de mesure d'entrée à la partie 2, qui doit le ramener à zéro.

- [ ] **Step 5 : verifier a l oeil, puis committer**

Serveur neuf, les trois écrans : les titres doivent être **identiques** au pixel. Un titre qui change de taille signale un jeton mal marié.

```bash
pnpm quality
git add src/styles
git commit -m "Fait voyager chaque taille de texte avec son interligne et son approche"
```

---

## Task 7 : la planche de reference, publiee hors de la PWA

**Files:**

- Create: `design/index.html`
- Create: `design/gallery.ts`
- Create: `design/gallery.css`
- Create: `e2e/planche.spec.ts`
- Modify: `vite.config.ts`

**Interfaces:**

- Produces: une page a `/design/`, qui **enumere les jetons depuis les feuilles chargees** plutot que depuis une liste tenue a la main. Elle est construite et deployee par le workflow existant — qui envoie `dist` en entier —, et **exclue** du service worker et du repli de navigation.

**Pourquoi la publication est ici et non en partie 2.** `pnpm test:e2e` construit puis previsualise (`pnpm build && pnpm preview`) : un test qui ouvre `/design/` le cherche dans le `dist`. La planche doit donc etre une entree de build des sa premiere tache — et si elle l'est, les deux exclusions Workbox doivent l'accompagner immediatement, sans quoi elle partirait dans le cache de chaque utilisateur. Les separer aurait publie ce que la demande excluait.

**Pourquoi elle lit les feuilles au lieu d'une liste.** Une planche qui recite une liste ecrite a cote ne peut pas montrer un jeton manquant : elle montrerait la liste. En enumerant `document.styleSheets`, elle montre **ce que le navigateur a resolu** — donc un jeton absent apparait vide, et un jeton oublie apparait quand meme.

`design/` est du TypeScript et du HTML : **le portail s'applique**, rouge d'abord.

- [ ] **Step 1 : ecrire le test qui echoue**

Créer `e2e/planche.spec.ts` :

```ts
import { expect, test } from '@playwright/test';

test.describe('La planche de reference', () => {
    test("Étant donné la planche, quand je l'ouvre, alors elle montre tous les jetons du systeme", async ({
        page,
    }) => {
        await page.goto('/design/');

        // Elle enumere les feuilles chargees : un jeton ajoute y parait sans
        // qu'on ait pense a l'inscrire, et un jeton absent y parait vide.
        const pastilles = page.locator('[data-jeton]');

        await expect(pastilles.first()).toBeVisible();
        expect(await pastilles.count()).toBeGreaterThan(60);
    });

    test('Étant donné la planche, quand je lis un style de texte, alors ses trois metriques y sont mesurees', async ({
        page,
    }) => {
        await page.goto('/design/');

        const echantillon = page.locator('[data-style-de-texte="body"]');

        // Mesurees dans le moteur, pas recopiees de la feuille : c'est la seule
        // facon de voir qu'un triplet est incomplet.
        await expect(echantillon).toContainText('17px');
        await expect(echantillon).toContainText('22px');
    });
});
```

- [ ] **Step 2 : lancer le test pour le voir echouer**

Run: `pnpm exec playwright test e2e/planche.spec.ts --project=chromium`
Expected: FAIL — `/design/` renvoie 404, aucun `[data-jeton]`.

- [ ] **Step 3 : ecrire le gabarit**

Créer `design/index.html` :

```html
<!doctype html>
<html lang="fr">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <title>Etudes2Lignes — planche de reference</title>
    </head>
    <body>
        <!-- La planche n'importe **pas** `src/main.ts` : elle n'enregistre
             aucun service worker, ne s'installe pas, et ne touche a aucune
             donnee. Elle importe le systeme de design, et rien d'autre de
             l'application. -->
        <header class="planche-entete">
            <h1>Planche de reference</h1>
            <div class="planche-controles">
                <button type="button" data-apparence="light">Clair</button>
                <button type="button" data-apparence="dark">Sombre</button>
                <button type="button" data-apparence="auto">Systeme</button>
                <label><input type="checkbox" data-cibles /> Cibles de 44 px</label>
            </div>
        </header>
        <main id="planche"></main>
        <script type="module" src="./gallery.ts"></script>
    </body>
</html>
```

- [ ] **Step 4 : ecrire le rendu**

Créer `design/gallery.ts` :

```ts
import '../src/styles/index.css';
import './gallery.css';

/**
 * Les noms de jetons declares par les feuilles chargees.
 *
 * On descend dans les regles groupantes — `@layer`, `@media`, `@supports`
 * heritent tous de `CSSGroupingRule` —, sans quoi on ne verrait rien : tout le
 * systeme vit dans des couches.
 */
function nomsDesJetons(regles: CSSRuleList, dans: Set<string>): void {
    for (const regle of Array.from(regles)) {
        if (regle instanceof CSSStyleRule) {
            for (const propriete of Array.from(regle.style)) {
                if (propriete.startsWith('--')) {
                    dans.add(propriete);
                }
            }
        } else if (regle instanceof CSSGroupingRule) {
            nomsDesJetons(regle.cssRules, dans);
        }
    }
}

function jetonsDuSysteme(): string[] {
    const noms = new Set<string>();
    for (const feuille of Array.from(document.styleSheets)) {
        // Une feuille d'une autre origine leve a la lecture ; ici il n'y en a
        // pas, mais la garde evite qu'une future en casse la planche entiere.
        try {
            nomsDesJetons(feuille.cssRules, noms);
        } catch {
            continue;
        }
    }
    return [...noms].sort();
}

function valeurResolue(nom: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
}

/** Une pastille par jeton : son nom, ce que le navigateur en a fait, et un
 *  apercu quand la valeur est une couleur. */
function pastille(nom: string): HTMLElement {
    const valeur = valeurResolue(nom);
    const element = document.createElement('figure');
    element.className = 'planche-pastille';
    element.dataset.jeton = nom;

    const apercu = document.createElement('span');
    apercu.className = 'planche-apercu';
    if (/^(rgb|#|light-dark|color)/.test(valeur)) {
        apercu.style.background = valeur;
    } else if (valeur.endsWith('px')) {
        apercu.style.inlineSize = valeur;
        apercu.classList.add('planche-reglette');
    }

    const legende = document.createElement('figcaption');
    legende.textContent = nom;
    const mesure = document.createElement('code');
    // La valeur **resolue**, pas celle qu'on croit avoir ecrite : c'est la
    // difference entre une planche et une liste.
    mesure.textContent = valeur === '' ? 'vide' : valeur;
    if (valeur === '') {
        element.classList.add('planche-manquant');
    }

    element.append(apercu, legende, mesure);
    return element;
}

const STYLES_DE_TEXTE = [
    'large-title',
    'title-1',
    'title-2',
    'title-3',
    'headline',
    'body',
    'callout',
    'subheadline',
    'footnote',
    'caption-1',
    'caption-2',
];

/** Un echantillon par style, avec ses trois metriques **mesurees**. */
function echantillonDeTexte(nom: string): HTMLElement {
    const element = document.createElement('section');
    element.className = 'planche-texte';
    element.dataset.styleDeTexte = nom;

    const exemple = document.createElement('p');
    exemple.className = `text-${nom}`;
    exemple.textContent = 'Paris → Bordeaux, kilometre 246,8';
    element.append(exemple);

    const mesures = document.createElement('code');
    element.append(mesures);
    // Apres insertion : sans mise en page, il n'y a rien a mesurer.
    requestAnimationFrame(() => {
        const style = getComputedStyle(exemple);
        mesures.textContent = `${nom} — ${style.fontSize} / ${style.lineHeight} / ${style.letterSpacing}`;
    });

    return element;
}

function section(titre: string, contenu: HTMLElement[]): HTMLElement {
    const element = document.createElement('section');
    element.className = 'planche-section';
    const entete = document.createElement('h2');
    entete.textContent = titre;
    const grille = document.createElement('div');
    grille.className = 'planche-grille';
    grille.append(...contenu);
    element.append(entete, grille);
    return element;
}

function rendre(): void {
    const racine = document.querySelector('#planche');
    if (!(racine instanceof HTMLElement)) {
        return;
    }

    const jetons = jetonsDuSysteme();
    const par = (prefixe: string): HTMLElement[] =>
        jetons.filter((nom) => nom.startsWith(prefixe)).map(pastille);

    racine.replaceChildren(
        section('Roles de couleur', par('--color-')),
        section('Materiaux et ombres', [...par('--material-'), ...par('--shadow-')]),
        section('Rampes brutes', [
            ...par('--blue'),
            ...par('--red'),
            ...par('--grey'),
            ...par('--orange'),
            ...par('--green'),
        ]),
        section('Espacement', par('--space-')),
        section('Rayons', par('--radius-')),
        section('Styles de texte', STYLES_DE_TEXTE.map(echantillonDeTexte)),
        section('Mesures de systeme', [
            ...par('--hit-target'),
            ...par('--screen-margin'),
            ...par('--blur-'),
        ]),
    );
}

for (const bouton of Array.from(document.querySelectorAll('[data-apparence]'))) {
    bouton.addEventListener('click', () => {
        const choix = bouton instanceof HTMLElement ? bouton.dataset.apparence : undefined;
        if (choix === 'auto' || choix === undefined) {
            delete document.documentElement.dataset.apparence;
            document.documentElement.style.colorScheme = 'light dark';
        } else {
            document.documentElement.dataset.apparence = choix;
            document.documentElement.style.colorScheme = choix;
        }
        rendre();
    });
}

const bascule = document.querySelector('[data-cibles]');
if (bascule instanceof HTMLInputElement) {
    bascule.addEventListener('change', () => {
        document.body.classList.toggle('planche-cibles', bascule.checked);
    });
}

rendre();
```

**`color-scheme` sur la racine est ce qui pilote `light-dark()`** : la bascule d'apparence ne triche pas avec une classe, elle change ce que le navigateur resout. C'est pour cela qu'elle montre le vrai systeme.

`prefers-contrast` ne se force pas depuis la page : c'est un reglage du systeme. La planche l'indique, et c'est Playwright qui l'emule pour la regression visuelle de la partie 2.

- [ ] **Step 5 : ecrire l habillage de la planche**

Créer `design/gallery.css` — **sans employer le systeme**, pour qu'elle reste lisible quand il est casse :

```css
/* L'habillage **de la planche**, et non du systeme qu'elle montre.
 *
 * Elle n'emploie deliberement aucun jeton : une planche qui se peint avec le
 * systeme qu'elle expose devient illisible le jour ou celui-ci casse — c'est-a-dire
 * exactement le jour ou l'on en a besoin. `.stylelintrc.json` exempte donc
 * `design/*.css` de `declaration-strict-value`. */
body {
    margin: 0;
    padding: 16px;
    background: #fafafa;
    color: #111;
    font-family: system-ui, sans-serif;
}

.planche-entete {
    position: sticky;
    top: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid #ddd;
    background: #fafafa;
}

.planche-grille {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 12px;
}

.planche-pastille {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: #fff;
    font-size: 12px;
}

.planche-apercu {
    display: block;
    block-size: 36px;
    border: 1px solid #ccc;
    border-radius: 4px;
    /* Un damier, pour qu'une couleur translucide se distingue d'une absente. */
    background-image:
        linear-gradient(45deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%),
        linear-gradient(45deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%);
    background-position:
        0 0,
        6px 6px;
    background-size: 12px 12px;
}

.planche-reglette {
    block-size: 12px;
    border-radius: 2px;
    background: #333;
}

/* Un jeton que le navigateur n'a pas resolu : c'est le defaut que la planche
   existe pour montrer. */
.planche-manquant {
    border-color: #c00;
    background: #fff5f5;
}

.planche-manquant code::after {
    content: ' ← non resolu';
    color: #c00;
}

/* La surimpression des cibles tactiles : un cadre sur tout ce qui se touche,
   pour voir d'un coup d'oeil ce qui n'atteint pas le minimum. */
.planche-cibles :is(button, a, input, [role='button']) {
    outline: 1px dashed #c00;
    outline-offset: 0;
}
```

- [ ] **Step 6 : la construire, et l'exclure de la PWA**

Quatre mesures, dont deux corrigent un comportement que la configuration
actuelle imposerait en silence. Dans `vite.config.ts` :

```ts
export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            // Deux entrees : l'application, et la planche. Le workflow de
            // deploiement envoie `dist` en entier, donc la seconde parait a
            // `/design/` sans qu'il ait a changer.
            input: {
                main: fileURLToPath(new URL('./index.html', import.meta.url)),
                design: fileURLToPath(new URL('./design/index.html', import.meta.url)),
            },
        },
    },
    plugins: [
        VitePWA({
            // … le manifeste inchange : la planche n'y figure pas, donc elle
            // ne s'installe pas et n'apparait dans aucun lanceur.
            workbox: {
                globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
                // Sans cette ligne, le motif ci-dessus **pre-cacherait la
                // planche chez tous les utilisateurs** : c'est exactement ce
                // que « hors de la PWA » exclut.
                globIgnores: ['design/**'],
                navigateFallback: 'index.html',
                // Et sans celle-ci, `navigateFallback` servirait l'application
                // sous `/design/` des que le service worker prend la main.
                navigateFallbackDenylist: [/design\//],
                // … `runtimeCaching` inchange
            },
        }),
    ],
});
```

Ajouter l'import qu'`input` requiert, en tete du fichier :

```ts
import { fileURLToPath } from 'node:url';
```

Puis ajouter a `e2e/planche.spec.ts` le test qui garde les deux exclusions —
c'est un reglage qui se defait sans bruit :

```ts
test('Étant donné la planche publiee, quand je lis le service worker, alors elle en est absente', async ({
    request,
}) => {
    const serviceWorker = await request.get('/sw.js');
    const source = await serviceWorker.text();

    // Deux exclusions a tenir, et deux facons de les perdre : `globIgnores`
    // empeche la mise en cache prealable chez l'utilisateur, et le
    // `navigateFallbackDenylist` empeche que l'application soit servie sous
    // `/design/`. Ni l'une ni l'autre ne previent en disparaissant.
    expect(source).not.toMatch(/["'][^"']*design\/[^"']*["']\s*,\s*revision/);
    expect(source).toContain('design');
});
```

La seconde assertion est volontairement faible : elle verifie que le mot parait
quelque part — c'est le motif du denylist. La premiere est la vraie garde : elle
refuse une **entree de manifeste** pour un fichier de `design/`, dont la forme
est `{ url: '…', revision: '…' }`.

- [ ] **Step 7 : lancer les tests pour les voir passer**

```bash
pnpm exec playwright test e2e/planche.spec.ts --project=chromium
```

Expected: PASS sur les trois. Si le compte de jetons est en dessous de 60,
`nomsDesJetons` ne descend pas dans les couches : verifier la branche
`CSSGroupingRule`. Si le test du service worker echoue sur la premiere
assertion, `globIgnores` n'a pas pris — le verifier a la main :

```bash
pnpm build && grep -o "design/[a-zA-Z0-9.-]*" dist/sw.js | head
```

Expected: aucune sortie.

- [ ] **Step 8 : la regarder**

```bash
pnpm dev --port 5413 --strictPort
```

Ouvrir `/design/`. Basculer les trois apparences. **Ce qu'il faut chercher** : une pastille rouge « non resolu » — c'est un jeton declare que rien ne resout —, et un echantillon de texte dont les trois metriques ne correspondent pas a la table d'Apple reproduite en Task 4.

- [ ] **Step 9 : verifier et committer**

```bash
pnpm quality
pnpm test:e2e
git add design e2e/planche.spec.ts vite.config.ts
git commit -m "Donne au systeme un miroir qui lit les feuilles plutot qu'une liste"
```

---

## Task 8 : les tests de geometrie mesuree

**Files:**

- Create: `e2e/design-system.spec.ts`

**Interfaces:**

- Produces: le filet de securite de la partie 2. Ces tests decrivent la geometrie que la reecriture des composants doit **preserver** — ecrits avant elle, ils la surveillent ; ecrits apres, ils n'auraient rien surveille.

**Pourquoi ici et pas a la fin.** Le 3 septembre, la hauteur des barres a ete mesuree a la main dans un navigateur, apres signalement. Cette mesure devient un test, et elle le devient **avant** que les composants bougent.

**Une lecon de faux positif, incorporee au dessin.** Un test naif « toute cible fait 44 px » denoncerait les controles de carte, qui font 34 px — et ce serait **injuste** : la HIG donne 28 px pour plancher absolu, et des controles de 44 px feraient deborder leur colonne sur la vignette de carte. La decision est commentee dans la feuille. Le test distingue donc deux regimes, et nomme le second.

- [ ] **Step 1 : ecrire les tests qui echouent**

Créer `e2e/design-system.spec.ts` :

```ts
import { expect, test, type Page } from '@playwright/test';
import { ouvrirUnTrajetAvecUnePage, preparerLApplication, requireDefined } from './helpers';

/** Les largeurs qui comptent : le plus petit iPhone courant, le courant, et un
 *  grand. C'est a 360 px que les deux defauts de septembre se voyaient. */
const LARGEURS = [360, 390, 430];

async function hauteurDeLaBarre(page: Page): Promise<number> {
    const boite = await page.locator('.header, .suivi-bar').first().boundingBox();
    return Math.round(requireDefined(boite).height);
}

test.describe('La geometrie du systeme', () => {
    test('Étant donné les trois ecrans, quand je mesure leur barre, alors elle a partout la meme hauteur', async ({
        page,
    }) => {
        await preparerLApplication(page);
        await ouvrirUnTrajetAvecUnePage(page);

        const hauteurs: Record<string, number> = {};
        for (const largeur of LARGEURS) {
            await page.setViewportSize({ width: largeur, height: 780 });
            hauteurs[`editeur-${largeur}`] = await hauteurDeLaBarre(page);

            await page.getByRole('button', { name: 'Trajets' }).click();
            hauteurs[`liste-${largeur}`] = await hauteurDeLaBarre(page);

            await page.locator('.trajet-name').first().click();
            await page.locator('#suivre-button').click();
            hauteurs[`suivi-${largeur}`] = await hauteurDeLaBarre(page);

            await page.getByRole('button', { name: 'Éditer' }).click();
        }

        // Mesuré le 3 septembre : l'en-tete faisait 44 px et la barre de suivi
        // 62, parce que chacune ecrivait son rembourrage de son cote. Une seule
        // valeur distincte, ou la derive est revenue.
        expect([...new Set(Object.values(hauteurs))]).toHaveLength(1);
    });

    test("Étant donné les controles de l'application, quand je mesure leur cible, alors aucun n'est sous 44 px", async ({
        page,
    }) => {
        await preparerLApplication(page);
        await ouvrirUnTrajetAvecUnePage(page);
        await page.setViewportSize({ width: 360, height: 780 });

        const trop_petits: string[] = [];
        // Les controles de carte sont exclus, et c'est motive : voir le test
        // suivant, qui leur applique le plancher que la HIG leur laisse.
        for (const cible of await page.locator('button:visible').all()) {
            if ((await cible.evaluate((n) => n.closest('.leaflet-control') !== null)) === true) {
                continue;
            }
            const boite = requireDefined(await cible.boundingBox());
            if (boite.width < 44 || boite.height < 44) {
                const nom = (await cible.getAttribute('aria-label')) ?? '';
                trop_petits.push(`${nom} ${Math.round(boite.width)}x${Math.round(boite.height)}`);
            }
        }

        // « The minimum tappable area for any control is 44x44 pt. »
        expect(trop_petits).toEqual([]);
    });

    test('Étant donné les controles de carte, quand je mesure le groupe, alors lui seul porte le materiau', async ({
        page,
    }) => {
        await preparerLApplication(page);
        await ouvrirUnTrajetAvecUnePage(page);

        const groupe = page.locator('.leaflet-bar').first();
        const mesures = await groupe.evaluate((n) => {
            const style = getComputedStyle(n);
            const enfant = n.querySelector('a');
            const styleEnfant = enfant === null ? null : getComputedStyle(enfant);
            return {
                rayonDuGroupe: style.borderRadius,
                decoupe: style.overflow,
                rayonDeLEnfant: styleEnfant?.borderRadius ?? '',
                fondDeLEnfant: styleEnfant?.backgroundColor ?? '',
            };
        });
        const boite = requireDefined(await groupe.locator('a').first().boundingBox());

        // « Group related controls and apply Liquid Glass to the group rather
        // than to each control. » Le groupe porte le rayon et decoupe ; les
        // enfants n'ont ni rayon ni fond, sans quoi ce serait du verre sur du
        // verre.
        expect(mesures.rayonDuGroupe).not.toBe('0px');
        expect(mesures.decoupe).toBe('hidden');
        expect(mesures.rayonDeLEnfant).toBe('0px');
        expect(mesures.fondDeLEnfant).toBe('rgba(0, 0, 0, 0)');
        // Le plancher absolu de la HIG, et non les 44 px : une colonne de
        // controles de 44 px mangerait la vignette de carte qu'elle recouvre.
        expect(boite.height).toBeGreaterThanOrEqual(28);
    });

    test('Étant donné une surface en verre, quand je cherche ses ancetres, alors aucune ne flotte sur une autre', async ({
        page,
    }) => {
        await preparerLApplication(page);
        await ouvrirUnTrajetAvecUnePage(page);

        const empilements = await page.evaluate(() => {
            const flou = (n: Element): boolean => {
                const style = getComputedStyle(n);
                const valeur = `${style.backdropFilter} ${style.webkitBackdropFilter}`;
                return valeur.includes('blur');
            };
            const coupables: string[] = [];
            for (const element of Array.from(document.querySelectorAll('*'))) {
                if (!flou(element)) {
                    continue;
                }
                let parent = element.parentElement;
                while (parent !== null) {
                    if (flou(parent)) {
                        coupables.push(`${element.className} dans ${parent.className}`);
                        break;
                    }
                    parent = parent.parentElement;
                }
            }
            return coupables;
        });

        // « Avoid placing Liquid Glass on top of other Liquid Glass. » Deux
        // flous empiles ne floutent pas deux fois : le second echantillonne le
        // premier, et le materiau devient laiteux.
        expect(empilements).toEqual([]);
    });

    test('Étant donné les pastilles numerotees, quand je les mesure ici et la, alors elles ont la meme taille', async ({
        page,
    }) => {
        await preparerLApplication(page);
        await ouvrirUnTrajetAvecUnePage(page);

        const tailles = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.point-number, .carte-marker')).map((n) => {
                const r = n.getBoundingClientRect();
                return `${Math.round(r.width)}x${Math.round(r.height)}`;
            }),
        );

        // Mesuré : la pastille du schema faisait 44 px et celle de la carte
        // 27,6 — le minimum de 44 px de la regle du bouton s'appliquait a l'une
        // et pas a l'autre. Une seule taille, ou l'ecart est revenu.
        expect(tailles.length).toBeGreaterThan(0);
        expect([...new Set(tailles)]).toHaveLength(1);
    });
});
```

- [ ] **Step 2 : lancer les tests sur les cinq moteurs**

Run: `pnpm exec playwright test e2e/design-system.spec.ts`
Expected: **PASS**. Ce sont des tests de caracterisation : ils enregistrent une geometrie deja correcte, pour qu'elle le reste. Un echec ici est un defaut **actuel** — le lire, le mesurer, et le corriger avant d'aller plus loin, comme le 3 septembre.

- [ ] **Step 3 : eprouver qu ils discriminent**

Un test de caracterisation qui n'a jamais rougi ne prouve rien. Pour chacun des cinq, **sonder l'assertion** — jamais muter la source :

```bash
# Le test des barres : passer LARGEURS a [360] et remplacer
# toHaveLength(1) par toHaveLength(2) ; il doit echouer.
# Le test des cibles : remplacer 44 par 64 ; il doit lister des coupables.
# Le test du groupe : remplacer 'hidden' par 'visible' ; il doit echouer.
# Le test du verre : remplacer toEqual([]) par toHaveLength(1) ; il doit echouer.
# Le test des pastilles : remplacer toHaveLength(1) par toHaveLength(2) ; il doit echouer.
pnpm exec playwright test e2e/design-system.spec.ts --project=chromium
```

Remettre chaque assertion apres l'avoir vue rougir. Si l'une **ne rougit pas**, elle n'affirme rien : la reecrire.

- [ ] **Step 4 : verifier et committer**

```bash
pnpm quality
pnpm test:e2e
git add e2e/design-system.spec.ts
git commit -m "Transforme en tests les mesures qu'un signalement avait fallu"
```

---

## Ce que la partie 1 laisse a la partie 2

- Les **onze composants** et leurs contrats ; `.header` et `.suivi-bar` fondus en un seul `bar`.
- La **migration des noms de classes** : 41 en HTML, 11 en TypeScript, 5 en e2e, et les quatre pieges de chaines de l'ADR 0007.
- La mort de `screens/legacy.css`, de `screens/legacy-bridge.css` et de `styles/legacy.test.ts` — et avec elle le retour a **zero** avertissement `declaration-strict-value`.
- Les **90 references visuelles**, generees dans le dev container — la seule
  chose qui reste a faire sur la planche, sa publication etant reglee en Task 7.
- La reecriture de [`LIQUID-GLASS.md`](../../LIQUID-GLASS.md), la section d'[`AGENTS.md`](../../../AGENTS.md), et l'**ADR 0011**.
