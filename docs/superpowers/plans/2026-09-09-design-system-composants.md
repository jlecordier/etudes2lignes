# Design system, partie 2 — le vocabulaire : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** remplacer les 41 classes uniques de l'application par onze composants nommés, tuer la feuille en transit et son pont d'alias, et faire passer les sept défauts encore gardés par des tests au régime de l'inécrivable.

**Architecture:** la partie 1 a posé les paliers de jetons, l'ordre de cascade et les onze styles de texte ; `screens/legacy.css` porte encore 98 règles et 1413 lignes. Chaque tâche en extrait une famille vers un fichier de composant sous `@layer components`, avec son palier C de jetons, ses invariants de source et ses tests de géométrie mesurée. Quand la feuille est vide, elle meurt avec son pont — et les 69 avertissements Stylelint qu'elle portait tombent à zéro.

**Tech Stack:** CSS natif (`@layer`, `light-dark()`, imbrication, couleurs relatives), Stylelint 17 avec `declaration-strict-value` et `csstools/value-no-unknown-custom-properties`, Vitest, Playwright sur cinq moteurs.

**Spec:** [`docs/superpowers/specs/2026-09-07-design-system-design.md`](../specs/2026-09-07-design-system-design.md)

**Partie 1 :** [`2026-09-07-design-system-socle.md`](2026-09-07-design-system-socle.md) — fusionnée sur `main` en `b00840f`.

## Global Constraints

- **Ordre de cascade** déjà posé : `@layer vendor, reset, tokens, base, components, screens;` dans `src/styles/index.css`. Chaque nouveau fichier **déclare sa couche en interne** et **doit être importé par l'entrée** — deux invariants d'ossature le vérifient déjà.
- **Règle des paliers** : un composant ne référence que le palier sémantique. Ses propres mesures — hauteur, taille, épaisseur — sont des **jetons de composant** déclarés dans son fichier, jamais des valeurs répétées.
- **Aucune valeur rendue ne change**, sauf décision nommée et mesurée. Trois régressions de la partie 1 sont nées d'un câblage tenu pour neutre.
- **Langue** : commentaires, prose et titres de tests en français **accentué**, **apostrophe ASCII `'`** (jamais `’`).
- **Tests BDD** `Étant donné / Quand / Alors`, les trois clauses. Aucun `vi.fn`, aucune assertion sur un espion.
- **Pas de `!` non-nul, pas de `as` de forme** (ADR 0002).
- **Le verre** : `-webkit-backdrop-filter` précède `backdrop-filter` **à l'octet près** ; **aucun `var()` à l'intérieur** (bugs WebKit 289800 et 297620) ; flou **≤ 20 px** (bug 319187).
- **`light-dark()` n'enveloppe qu'une couleur**, jamais une ombre entière — un invariant de grammaire le vérifie.
- **Plancher plateforme : Safari 16.4 / iOS 16.4**, déclaré dans `AGENTS.md`. Ne pas l'abaisser sans le dire.
- **Cibles tactiles** : 44 px pour les contrôles de l'application ; les contrôles de carte font 34 px délibérément, au-dessus du plancher absolu de 28 px de la HIG.
- `pnpm quality` **et** `pnpm test:e2e` verts à chaque tâche, **au premier plan**.

---

## La cadence de chaque tâche de composant

Les tâches 1 à 5 extraient des familles de règles. Elles suivent toutes la même cadence, écrite ici une fois pour être suivie **en entier** à chaque fois.

1. **Écrire les témoins d'abord**, dans `src/styles/styles.test.ts` — ils échouent parce que le fichier de composant n'existe pas.
2. **Lancer** `pnpm vitest run src/styles/` et **voir le rouge**.
3. **Créer le fichier** sous `src/styles/components/`, avec `@layer components { … }` en interne, son en-tête de contrat, et son palier C de jetons.
4. **Retirer les règles** de `screens/legacy.css` — les **déplacer**, ne rien réécrire au fond.
5. **Importer** depuis `src/styles/index.css`, avant `screens/legacy.css`.
6. **Vérifier que rien n'a bougé** : `pnpm quality`, puis `pnpm test:e2e` au premier plan. Le compte d'avertissements Stylelint doit **baisser** — noter de combien.
7. **Committer**, un commit par composant.

### L'en-tête de contrat, obligatoire dans chaque fichier

Chaque fichier de composant ouvre sur un commentaire disant, dans cet ordre : **ce que le composant est**, **ses modificateurs**, **les jetons qu'il expose**, et **le défaut historique qu'il rend inécrivable**. Sans ce dernier point, personne ne saura pourquoi la règle est ce qu'elle est.

### Ce qu'un témoin doit prouver

La partie 1 a produit **huit** témoins qui passaient pour de mauvaises raisons. Pour chaque témoin écrit ou modifié, **prouver les deux versants** : qu'il rougit quand ce qu'il garde est cassé, et qu'il ne rougit pas à tort sur un cas légitime. Rapporter les deux sondes avec leur sortie réelle. **Un témoin non sondé sera refusé.**

Et une leçon plus fine, payée trois fois : **mesurer le rendu, jamais la chaîne du jeton**. Un jeton peut contenir les bons canaux et ne rien peindre.

---

## Structure des fichiers

| Fichier                          | Responsabilité                                                       | Règles qu'il reçoit                                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/surface.css`         | **nouveau** — le matériau, seul endroit où `backdrop-filter` s'écrit | le bloc `@supports ((backdrop-filter…))`, la retraction `@media (prefers-reduced-transparency…)`, la liste close des surfaces                                                                            |
| `components/bar.css`             | **nouveau** — la barre d'écran, une hauteur pour toutes              | `.header`, `.header .action-bar`, `.header > button`, `.header :is(h1, h2)`, `.header::after`, `.suivi-bar`, `.suivi-bar::after`, `.suivi-status`                                                        |
| `components/button.css`          | **nouveau** — le contrôle et ses variantes                           | `button`, `button.secondary`, `button.danger`, `.button-label`, `.icon`                                                                                                                                  |
| `components/button-group.css`    | **nouveau** — le groupe qui porte le verre, pas ses enfants          | `.action-bar`, `.action-bar button`, `.image-bar`, `.image-bar button`, `.image-bar button.danger`, `.point-actions`                                                                                     |
| `components/floating-action.css` | **nouveau** — l'action flottante                                     | `.floating-button`, `.floating-add-point-button`, `.overview-button`, `.resume-button`, `.carte-button`, `#cancel-carte-button`                                                                          |
| `components/badge.css`           | **nouveau** — la pastille, une taille dans tous ses contextes        | `.point-number`, `point-marker .point-number`, `.placement-active .point-number`, `.page-number`, `#carte-container .carte-marker`, `.carte-points .carte-marker`                                        |
| `components/row.css`             | **nouveau** — la rangée de liste                                     | `trajet-row`, `.trajet-name`, `.trajet-details`, `.trajet-footer`, `.trajets-list`, `.image-name`                                                                                                        |
| `components/panel.css`           | **nouveau** — la carte de contenu, jamais de verre                   | `.trajet-overview`, `.overview-ouvert .trajet-overview`, `.help`, `.hint-banner`, `.list-error`, `.empty-message`, `.overview-stack`, `.overview-position`, `overview-page`                              |
| `components/banner.css`          | **nouveau** — le bandeau d'état                                      | `.simulation-banner`, `.offline-indicator`                                                                                                                                                               |
| `components/field.css`           | **nouveau** — la saisie                                              | `.carte-bar input`, `.carte-position-bar`, `.carte-position-status`                                                                                                                                      |
| `components/map-overlay.css`     | **nouveau** — la carte plein écran, partagée par deux écrans         | `#carte-container`, `.carte-column`, `.carte-points`, `.screen-carte`, `.carte-ouverte …`, `.carte-bar`, `.carte-recentrer`, les règles `.leaflet-*`, `.carte-position-marker`, `.carte-position-circle` |
| `screens/trajets-list.css`       | **nouveau** — placement seulement                                    | `trajets-list-screen`                                                                                                                                                                                    |
| `screens/trajet-editor.css`      | **nouveau** — placement seulement                                    | `trajet-editor-screen`, `.editor-body`, `.images-column`, `image-frame`, `image-frame schema-page`, `.image-area`, `.placement-active .image-area`, `.point-ghost`, `.awaiting-click *`                  |
| `screens/suivi.css`              | **nouveau** — placement seulement                                    | `suivi-screen`, `.suivi-body`, `.suivi-stack`, `.guide-line`, `.overview-ouvert .guide-line`, `suivi-screen .*`                                                                                          |
| `base/elements.css`              | modifié — reçoit ce qui est un défaut d'élément                      | `*`, `[hidden]`, `@media (prefers-reduced-motion: reduce)`                                                                                                                                               |
| `screens/legacy.css`             | **supprimé** en Task 7                                               | —                                                                                                                                                                                                        |
| `screens/legacy-bridge.css`      | **supprimé** en Task 7                                               | —                                                                                                                                                                                                        |
| `src/styles/legacy.test.ts`      | **supprimé** en Task 7, après migration de trois contrats            | —                                                                                                                                                                                                        |

**Pourquoi `map-overlay` est un composant et non un écran.** La carte plein écran est partagée par l'éditeur et le suivi. Ce que deux écrans partagent est un composant ; ce qui appartient à un seul est un écran. C'est la règle qui décide, pas la taille.

---

## Task 1 : `surface` — le matériau en un seul endroit

**Files:**

- Create: `src/styles/components/surface.css`
- Modify: `src/styles/index.css`, `src/styles/screens/legacy.css`, `src/styles/styles.test.ts`

**Interfaces:**

- Produces: la classe `.surface`, ses modificateurs `.surface-regular` et `.surface-thick`, et le jeton de composant `--surface-blur`. Toutes les tâches suivantes composent avec elle au lieu de redéclarer le verre.

**Pourquoi celle-ci d'abord.** Huit règles redéclarent aujourd'hui `backdrop-filter`. Tant qu'elles existent, chaque composant extrait en emporterait une copie. Ce fichier les absorbe une fois pour toutes.

- [ ] **Step 1 : écrire les témoins qui échouent**

Ajouter à `src/styles/styles.test.ts` :

```ts
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
            const paires = [
                ...surface.matchAll(
                    /-webkit-backdrop-filter:\s*([^;]+);\s*\n\s*backdrop-filter:\s*([^;]+);/g,
                ),
            ];

            expect(paires.length).toBeGreaterThan(0);
            for (const [, prefixee, standard] of paires) {
                expect(prefixee).toBe(standard);
            }
            // Aucune `backdrop-filter` orpheline : autant de standards que de paires.
            expect((surface.match(/[^-]backdrop-filter:/g) ?? []).length).toBe(paires.length);
        });
    });

    describe('Étant donné les bogues 289800 et 297620 de WebKit, quand on écrit le flou', () => {
        it("alors aucune variable n'entre dans la déclaration", () => {
            // WebKit ignore un `var()` a l'interieur de `backdrop-filter` :
            // le verre disparait sans erreur. Le plafond de 20 px s'ecrit donc
            // en clair, et le jeton --surface-blur reste documentaire.
            const declarations = surface.match(/backdrop-filter:[^;]+;/g) ?? [];

            expect(declarations.length).toBeGreaterThan(0);
            expect(declarations.filter((d) => d.includes('var('))).toEqual([]);
        });
    });
});
```

- [ ] **Step 2 : lancer et voir le rouge**

Run: `pnpm vitest run src/styles/styles.test.ts -t "matériau"`
Expected: FAIL — `surface` est la chaîne vide, `fichiersQuiFloutent` liste `./screens/legacy.css`.

- [ ] **Step 3 : créer le fichier**

Créer `src/styles/components/surface.css`, avec son en-tête de contrat, et y **déplacer** depuis `screens/legacy.css` le bloc `@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` et la retraction `@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)`.

La liste close des surfaces devient une classe et deux modificateurs. Les huit sélecteurs qui la composaient — `.header`, `.suivi-bar`, `.carte-bar`, `.floating-add-point-button`, `.carte-button`, `.overview-button`, `.resume-button`, `.leaflet-bar` — la **portent** désormais, chacun depuis son propre fichier de composant. Le temps de la transition, garde-les en liste dans `surface.css` : les tâches 2 à 5 les retireront une par une en posant la classe.

**Trois choses qui ne doivent pas se perdre dans le déplacement**, et que le fichier doit commenter :

1. Le fond opaque **d'abord**, le verre **ensuite** dans le `@supports` : un moteur sans `backdrop-filter` doit voir une surface pleine, pas une vitre transparente.
2. Le flou plafonné à **20 px** écrit en clair — au-delà, WebKit bloque environ vingt secondes au premier rendu (bogue 319187), et un `var()` y serait ignoré.
3. La retraction d'accessibilité **après** le `@supports`, sinon elle ne peut pas l'annuler.

- [ ] **Step 4 : importer, vérifier, committer**

Ajouter `@import url('./components/surface.css');` à `src/styles/index.css`, **avant** `screens/legacy.css`.

```bash
pnpm vitest run src/styles/
pnpm quality
pnpm test:e2e
```

Expected: tout vert. Noter la baisse du compte Stylelint.

```bash
git add src/styles
git commit -m "Rassemble en un seul fichier le verre que huit regles redeclaraient"
```

---

## Task 2 : `bar` — deux barres deviennent une

**Files:**

- Create: `src/styles/components/bar.css`
- Modify: `src/styles/index.css`, `src/styles/screens/legacy.css`, `src/styles/styles.test.ts`

**Interfaces:**

- Consumes: `.surface` de la tâche 1.
- Produces: la classe `.bar`, ses modificateurs `.bar-navigation` et `.bar-status`, et les jetons `--bar-air` et `--bar-height`.

**C'est la tâche fondatrice du chantier.** Le défaut d'origine — un en-tête de 44 px face à une barre de suivi de 62 — venait de ce que deux règles écrivaient chacune leur rembourrage. Après cette tâche, **il n'y a plus deux barres** : il y a un composant, et deux modificateurs qui ne touchent pas à sa hauteur.

- [ ] **Step 1 : écrire les témoins qui échouent**

```ts
const bar = feuilles['./components/bar.css'] ?? '';

describe('La barre d écran', () => {
    describe('Étant donné les deux barres, quand on cherche ce qui fixe leur hauteur', () => {
        it("alors un seul jeton la porte, et aucun modificateur n'y touche", () => {
            // Le defaut fondateur : `.header` et `.suivi-bar` declaraient
            // chacune leur rembourrage vertical, et avaient derive de 18 px.
            // Pire, celui de l'en-tete etait NUL : un bouton de 44 px y
            // touchait les deux bords.
            const declarationsDeHauteur = bar.match(/--bar-(?:air|height):/g) ?? [];

            expect(declarationsDeHauteur).toHaveLength(2);
            // Les modificateurs ne redefinissent ni l'un ni l'autre.
            const modificateurs = bar.match(/\.bar-[a-z]+\s*\{([^}]*)\}/g) ?? [];
            expect(modificateurs.length).toBeGreaterThan(0);
            expect(modificateurs.filter((m) => /--bar-(?:air|height)/.test(m))).toEqual([]);
        });
    });

    describe('Étant donné une barre au repos, quand on regarde ce qui la separe du contenu', () => {
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
```

- [ ] **Step 2 : lancer et voir le rouge**

Run: `pnpm vitest run src/styles/styles.test.ts -t "barre d écran"`
Expected: FAIL sur les deux — `bar` est vide.

- [ ] **Step 3 : créer le fichier et fondre les deux barres**

Déplacer depuis `screens/legacy.css` : `.header`, `.header .action-bar`, `.header > button`, `.header :is(h1, h2)`, `.header::after`, `.suivi-bar`, `.suivi-bar::after`, `.suivi-status`.

La hauteur vit dans **un** jeton :

```css
@layer components {
    .bar {
        --bar-air: var(--space-8);
        --bar-height: calc(var(--hit-target) + 2 * var(--bar-air));
        /* … le reste du socle commun : sticky, flex, l'effet de bord … */
    }
}
```

`.bar-navigation` reçoit ce qui appartenait à `.header` seul — la marge négative qui annule le rembourrage d'écran, le titre en ellipse, la rangée d'actions qui ne plie pas. `.bar-status` reçoit ce qui appartenait à `.suivi-bar` seul. **Ni l'un ni l'autre ne redéclare `--bar-air` ou `--bar-height`** : c'est ce que le témoin vérifie, et c'est ce qui rend la dérive impossible.

- [ ] **Step 4 : vérifier que la géométrie n'a pas bougé, puis committer**

Le témoin e2e `« les deux barres d'écran ont la même hauteur »` existe déjà et couvre les trois écrans à trois largeurs. Il doit rester vert **sans être modifié** — c'est lui le juge.

```bash
pnpm vitest run src/styles/
pnpm quality
pnpm test:e2e
git add src/styles && git commit -m "Fond les deux barres en un composant, et la derive avec elles"
```

---

## Task 3 : la famille des contrôles — `button`, `button-group`, `floating-action`

**Files:**

- Create: `src/styles/components/button.css`, `button-group.css`, `floating-action.css`
- Modify: `src/styles/index.css`, `src/styles/screens/legacy.css`, `src/styles/styles.test.ts`

**Interfaces:**

- Consumes: `.surface` (tâche 1).
- Produces: `.button` avec `.button-prominent`, `.button-plain`, `.button-destructive`, `.button-icon` ; `.button-group` ; `.floating-action`. Jetons : `--group-padding` et `--group-radius`, dont le témoin des rayons concentriques vérifie l'appariement. Le bouton, lui, prend son rayon du palier sémantique (`--radius-pill` pour la gélule) : un jeton de composant qui ne ferait que renommer un jeton de système est une indirection de plus, pas un contrat.

**Les trois vont ensemble** parce que deux règles de la HIG les lient : le verre se pose **sur le groupe** et non sur chaque bouton, et les rayons sont **concentriques** — le rayon intérieur vaut l'extérieur moins le rembourrage. Séparer ces trois fichiers dans trois tâches reviendrait à écrire deux fois la même contrainte.

- [ ] **Step 1 : écrire les témoins qui échouent**

```ts
const bouton = feuilles['./components/button.css'] ?? '';
const groupe = feuilles['./components/button-group.css'] ?? '';

describe('La famille des contrôles', () => {
    describe('Étant donné un groupe de boutons, quand le verre se pose', () => {
        it('alors il se pose sur le groupe, jamais sur ses enfants', () => {
            // « Group related controls and apply Liquid Glass to the group
            // rather than to each control. » Deux verres empiles ne floutent
            // pas deux fois : le second echantillonne le premier, et le
            // materiau devient laiteux.
            expect(groupe).toMatch(/\.button-group\b/);
            const reglesEnfants = groupe.match(/\.button-group\s+\.button[^{]*\{([^}]*)\}/g) ?? [];

            expect(reglesEnfants.filter((r) => /background:|backdrop-filter/.test(r))).toEqual([]);
        });
    });

    describe('Étant donné des rayons imbriqués, quand on les calcule', () => {
        it("alors l'intérieur se dérive de l'extérieur, au lieu d'être écrit à côté", () => {
            // « Consider aligning the shape of controls with other rounded
            // elements. » Deux rayons ecrits separement derivent ; un calcul
            // ne le peut pas.
            expect(groupe).toMatch(/--group-radius:/);
            expect(groupe).toMatch(
                /calc\(\s*var\(--group-radius\)\s*-\s*var\(--group-padding\)\s*\)/,
            );
        });
    });

    describe('Étant donné un bouton, quand on mesure sa cible', () => {
        it('alors les deux dimensions ont leur plancher, pas seulement la hauteur', () => {
            // Mesure en partie 1 : onze boutons a pictogramme rendaient 36x44
            // sous WebKit. La regle citait « at least 44x44 pt » et n'en
            // planchait qu'une.
            const regle = /\.button\s*\{([^}]*)\}/.exec(bouton);

            expect(regle?.[1]).toMatch(/min-block-size:\s*var\(--hit-target\)/);
            expect(regle?.[1]).toMatch(/min-inline-size:\s*var\(--hit-target\)/);
        });
    });
});
```

- [ ] **Step 2 : lancer et voir le rouge**

Run: `pnpm vitest run src/styles/styles.test.ts -t "famille des contrôles"`
Expected: FAIL sur les trois.

- [ ] **Step 3 : créer les trois fichiers**

`button.css` reçoit `button`, `button.secondary`, `button.danger`, `.button-label`, `.icon`. **La cible de 44 px passe par `var(--hit-target)`** au lieu du littéral que la partie 1 y avait laissé : c'est le geste qui fait basculer ce contrat du régime « testé » au régime « inécrivable ».

`button-group.css` reçoit `.action-bar`, `.action-bar button`, `.image-bar`, `.image-bar button`, `.image-bar button.danger`, `.point-actions`. Le rayon intérieur **se calcule** ; le verre se pose ici, et nulle part en dessous.

`floating-action.css` reçoit `.floating-button`, `.floating-add-point-button`, `.overview-button`, `.resume-button`, `.carte-button`, `#cancel-carte-button`. Ces six portent `.surface` au lieu de redéclarer le verre — retire-les d'autant de la liste de transition de `surface.css`.

**Une exception à préserver, et à commenter** : la pastille neutralise `min-inline-size: 0` et `min-block-size: 0`. Sans cela, le plancher de 44 px déformerait le disque, et la pastille du schéma cesserait de correspondre à celle de la carte — ce que `points.spec.ts` mesure au pixel près.

- [ ] **Step 4 : vérifier et committer**

Le témoin e2e `« aucune cible sous 44 px »` couvre les boutons flottants attachés à un point : il doit rester vert **sans modification**.

```bash
pnpm vitest run src/styles/ && pnpm quality && pnpm test:e2e
git add src/styles && git commit -m "Donne un nom aux controles, et le verre au groupe"
```

---

## Task 4 : la couche de contenu — `badge`, `row`, `panel`, `banner`, `field`

**Files:**

- Create: `src/styles/components/badge.css`, `row.css`, `panel.css`, `banner.css`, `field.css`
- Modify: `src/styles/index.css`, `src/styles/screens/legacy.css`, `src/styles/styles.test.ts`

**Interfaces:**

- Produces: `.badge`, `.row`, `.panel`, `.banner` avec `.banner-simulation` et `.banner-offline`, `.field`. Jeton : `--badge-size`.

**Les cinq vont ensemble** parce qu'ils partagent une règle et une seule : **la couche de contenu ne porte jamais de verre**. « Don't use Liquid Glass in the content layer. » Un témoin unique les couvre tous les cinq, ce qui serait cinq témoins identiques si on les séparait.

- [ ] **Step 1 : écrire les témoins qui échouent**

```ts
const contenu = ['badge', 'row', 'panel', 'banner', 'field'];

describe('La couche de contenu', () => {
    describe('Étant donné un composant de contenu, quand on regarde sa surface', () => {
        it("alors aucun n'emprunte le verre, qui appartient à la couche fonctionnelle", () => {
            // « Liquid Glass forms a distinct functional layer […] that floats
            // above the content layer », et son corollaire explicite : « Don't
            // use Liquid Glass in the content layer. »
            const fautifs = contenu.filter((nom) => {
                const f = feuilles[`./components/${nom}.css`] ?? '';
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
```

- [ ] **Step 2 : lancer et voir le rouge**

Run: `pnpm vitest run src/styles/styles.test.ts -t "couche de contenu"`
Expected: FAIL — les cinq fichiers sont vides, donc `tailles` est vide.

- [ ] **Step 3 : créer les cinq fichiers**

La répartition est celle du tableau de structure. **Deux points de vigilance :**

- `--badge-size` est en **pixels absolus, pas en rem** : mesuré en partie 1, une valeur relative faisait diverger Firefox de `27.633346` contre `27.633331` sur une comparaison au pixel près.
- `.panel` reçoit l'aperçu du trajet, l'aide, l'encart de consigne, l'erreur de liste et le message vide. Ce sont des cartes de contenu : rayon, fond opaque, **jamais de flou**.

- [ ] **Step 4 : vérifier et committer**

Le témoin e2e des pastilles — `« elles ont la même taille ici et là »` — doit rester vert sans modification.

```bash
pnpm vitest run src/styles/ && pnpm quality && pnpm test:e2e
git add src/styles && git commit -m "Nomme la couche de contenu, et lui refuse le verre"
```

---

## Task 5 : `map-overlay` et les trois écrans

**Files:**

- Create: `src/styles/components/map-overlay.css`, `src/styles/screens/trajets-list.css`, `trajet-editor.css`, `suivi.css`
- Modify: `src/styles/index.css`, `src/styles/screens/legacy.css`, `src/styles/base/elements.css`, `src/styles/styles.test.ts`

**Interfaces:**

- Consumes: `.surface`, `.button`, `.button-group`, `.badge`.
- Produces: `.map-overlay` ; trois feuilles d'écran qui ne font **que du placement**.

**Cette tâche vide la feuille.** Ce qui reste après elle doit être zéro règle.

- [ ] **Step 1 : écrire les témoins qui échouent**

```ts
describe('Les écrans', () => {
    describe("Étant donné une feuille d'écran, quand on regarde ce qu'elle déclare", () => {
        it('alors elle place, et ne peint pas', () => {
            // Un ecran compose des composants ; il ne redecide pas leur
            // apparence. Une couleur ou un rayon ecrit ici est un composant
            // qui n'a pas ete nomme.
            const ecrans = ['trajets-list', 'trajet-editor', 'suivi'];
            const fautifs = ecrans.flatMap((nom) => {
                const f = (feuilles[`./screens/${nom}.css`] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
                return ['color:', 'background:', 'font-size:', 'border-radius:']
                    .filter((propriete) => f.includes(propriete))
                    .map((propriete) => `${nom} declare ${propriete}`);
            });

            expect(fautifs).toEqual([]);
        });
    });

    describe('Étant donné la feuille en transit, quand cette tâche est finie', () => {
        it('alors elle ne porte plus aucune règle', () => {
            // Le critere de la tache : ce qui reste est vide, et la tache 7
            // pourra la supprimer sans rien emporter.
            const transit = (feuilles['./screens/legacy.css'] ?? '').replace(
                /\/\*[\s\S]*?\*\//g,
                '',
            );

            expect(transit).not.toMatch(/[.#a-z\[][^{}]*\{/);
        });
    });
});
```

- [ ] **Step 2 : lancer et voir le rouge**

Run: `pnpm vitest run src/styles/styles.test.ts -t "Les écrans"`
Expected: FAIL — les feuilles d'écran sont vides, et la feuille en transit porte encore ses règles.

- [ ] **Step 3 : créer les quatre fichiers et vider la feuille**

`map-overlay.css` reçoit toute la carte, **y compris la réconciliation Leaflet**. Trois choses à ne pas perdre, et à commenter :

1. `#carte-container` garde son `z-index: 0`. Sans lui, les panneaux de Leaflet — qui portent `z-index: 400` — s'échappent du contexte d'empilement et recouvrent le formulaire. Mesuré : le formulaire de saisie était intégralement invisible sous les tuiles.
2. Les contrôles de carte gardent leurs **34 px** : le plancher absolu de la HIG est 28 px, et des contrôles de 44 px feraient déborder leur colonne sur la vignette. Le groupe `.leaflet-bar` porte le matériau et le rayon ; ses enfants n'ont ni l'un ni l'autre.
3. Le filtre des tuiles en apparence sombre — c'est le seul `@media (prefers-color-scheme: dark)` légitime du système, puisqu'il applique un **filtre** et non une couleur.

Les trois feuilles d'écran reçoivent le placement, et **rien d'autre**. Ce qui est un défaut d'élément — `*`, `[hidden]`, le bloc de mouvement réduit — remonte dans `base/elements.css`.

- [ ] **Step 4 : vérifier et committer**

```bash
pnpm vitest run src/styles/ && pnpm quality && pnpm test:e2e
git add src/styles && git commit -m "Vide la feuille en transit dans les composants et les ecrans"
```

Expected: le compte d'avertissements `declaration-strict-value` tombe **à zéro** — la feuille qui les portait tous est vide.

---

## Task 6 : la migration des noms de classes

**Files:**

- Modify: les gabarits `src/**/*.html` et `index.html` (41 classes), `src/shared/elements.ts` et les écrans (10 chaînes), `e2e/*.spec.ts` (9 locators)
- Modify: `src/styles/components/*.css` — les sélecteurs suivent

**Interfaces:**

- Produces: le vocabulaire est **employé**, plus seulement déclaré. Les onze composants cessent d'être un dictionnaire pour devenir la langue de l'application.

**Le piège de cette tâche est documenté**, et l'[ADR 0007](../../adr/0007-langue-du-code-metier-francais-technique-anglais.md) l'énumère : la moitié du chantier ne tient qu'à des **chaînes de caractères** que le typecheck ne voit pas. Quatre fronts :

1. le nom de balise passé à `customElements.define` est recopié en toutes lettres dans le CSS et dans les locators e2e ;
2. `src/shared/elements.ts` compose les classes en dur depuis les littéraux de `ButtonVariant`, et des tests unitaires les affirment au caractère près ;
3. `--large-screen` est relu par chaîne depuis le TypeScript **et** depuis les e2e ;
4. les globs de `stryker.config.mjs` désignent les dossiers.

**Un glob vide n'échoue pas.** Vérifier qu'aucun ne correspond à zéro fichier fait partie du geste.

- [ ] **Step 1 : écrire le témoin qui échoue**

```ts
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
            const restantes = anciennes.filter((nom) =>
                gabarits.some((chemin) =>
                    readFileSync(new URL(chemin, import.meta.url), 'utf8').includes(
                        `class="${nom}"`,
                    ),
                ),
            );

            expect(restantes).toEqual([]);
        });
    });
});
```

- [ ] **Step 2 : lancer et voir le rouge**

Run: `pnpm vitest run src/styles/styles.test.ts -t "vocabulaire"`
Expected: FAIL, avec la liste des classes encore employées.

- [ ] **Step 3 : migrer, front par front**

Prendre les quatre fronts **dans cet ordre**, et lancer `pnpm quality` entre chacun — une erreur trouvée tôt coûte moins qu'une erreur trouvée à la fin :

1. les sélecteurs CSS des onze composants ;
2. les gabarits HTML ;
3. `src/shared/elements.ts` et les écrans, avec les tests unitaires qui affirment les classes au caractère près ;
4. les 9 locators e2e — ceux qui visent une classe ; les 75 qui passent par un nom accessible ne bougent pas.

- [ ] **Step 4 : vérifier les globs de mutation**

```bash
pnpm exec stryker run --dryRunOnly 2>&1 | tail -20
```

Expected: le périmètre de mutation n'est pas vide. Un glob qui ne correspond à rien viderait le périmètre **en silence**, et la suite de contrat se mettrait à être mutée — l'inverse de ce que dit l'[ADR 0006](../../adr/0006-tests-de-mutation-stryker.md).

- [ ] **Step 5 : vérifier et committer**

```bash
pnpm quality && pnpm test:e2e
git add -A && git commit -m "Fait parler l'application dans le vocabulaire du systeme"
```

---

## Task 7 : la mort de la feuille en transit, du pont et de leur témoin

**Files:**

- Delete: `src/styles/screens/legacy.css`, `src/styles/screens/legacy-bridge.css`, `src/styles/legacy.test.ts`
- Modify: `src/styles/index.css`, `src/styles/styles.test.ts`, `.stylelintrc.json`

**Trois contrats à sauver avant de supprimer**, et c'est la note de passation que la partie 1 a laissée. `legacy.test.ts` est aujourd'hui le **seul témoin** de trois choses qui vivent dans des fichiers **permanents** :

| Contrat                                                                | Où il vit             | Ce qu'il garde                                                       |
| ---------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| `font-size: 17px` **avant** `font: -apple-system-body`                 | `base/elements.css`   | un reformatage qui inverserait les deux ferait tomber Chrome à 16 px |
| `touch-action: pan-x pan-y` et `-webkit-user-select`                   | `base/elements.css`   | trois parcours e2e lisent ces valeurs calculées                      |
| la teinte du verre dérivée de la **même primitive** que le fond groupé | `tokens/semantic.css` | c'est ce qui rend la barre invisible au repos                        |

Les supprimer avec le fichier les emporterait **en silence**, `pnpm quality` restant vert.

- [ ] **Step 1 : migrer les trois contrats**

Les déplacer dans `src/styles/styles.test.ts`, en gardant leurs commentaires — chacun nomme le défaut qu'il garde, et c'est ce qui les rend relisibles.

- [ ] **Step 2 : vérifier qu'ils discriminent après le déplacement**

Pour chacun : casser temporairement ce qu'il garde, vérifier qu'il rougit, remettre. Un contrat déplacé sans sonde est un contrat qu'on croit avoir sauvé.

- [ ] **Step 3 : supprimer les trois fichiers**

```bash
git rm src/styles/screens/legacy.css src/styles/screens/legacy-bridge.css src/styles/legacy.test.ts
```

Retirer leurs `@import` de `src/styles/index.css`, et l'override devenu vide de `.stylelintrc.json` — celui qui abaissait `declaration-strict-value` en avertissement pour la feuille en transit.

- [ ] **Step 4 : le compte qui prouve la fin du chantier**

```bash
pnpm lint:css
```

Expected: **0 erreur, 0 avertissement.** C'était l'objectif chiffré du plan de la partie 1, et il devient atteignable exactement ici.

```bash
pnpm quality && pnpm test:e2e
git add -A && git commit -m "Supprime la feuille en transit, son pont et leur temoin"
```

---

## Task 8 : les références de régression visuelle

**Files:**

- Create: `e2e/visuel.spec.ts`
- Create: les références sous `e2e/visuel.spec.ts-snapshots/`

**Interfaces:**

- Produces: six vues × trois apparences × cinq projets Playwright — **90 références**.

**Ce que l'auteur du dépôt doit savoir avant cette tâche.** La CI exécute `pnpm test:e2e` sur `ubuntu-latest`, et Playwright suffixe ses références par plateforme : des captures prises sur macOS ne s'y compareront jamais. Les références doivent donc être générées **sous Linux, dans le dev container** que le dépôt possède déjà — et un agent confiné au bac à sable macOS ne peut pas le piloter.

**Cette tâche est donc à exécuter par l'auteur**, ou par un agent tournant dans le container. Le reste du plan n'en dépend pas.

- [ ] **Step 1 : écrire le spec, sans références**

Les six vues : la planche, la liste, l'éditeur, la carte plein écran, le suivi, l'aperçu du trajet. Les trois apparences par `emulateMedia` — et **passer `contrast` explicitement à chaque appel** : Playwright conserve l'émulation entre appels, et l'omettre laisse traîner la valeur précédente. Mesuré en partie 1, deux relevés en avaient été faussés.

Stabilisation, sans quoi les références clignoteront : animations coupées, tuiles OSM masquées, texte d'état GPS masqué, échelle de pixel fixée.

- [ ] **Step 2 : générer les références dans le dev container**

```bash
pnpm exec playwright test e2e/visuel.spec.ts --update-snapshots
```

- [ ] **Step 3 : vérifier qu'elles discriminent**

Changer temporairement un jeton visible — la teinte du verre, par exemple —, vérifier que les captures **échouent en nommant la vue**, puis remettre. Quatre-vingt-dix fichiers binaires qui ne rougiraient jamais seraient quatre-vingt-dix fichiers de trop.

- [ ] **Step 4 : committer**

```bash
git add e2e/visuel.spec.ts e2e/visuel.spec.ts-snapshots
git commit -m "Fige quatre-vingt-dix references, generees la ou la CI les lira"
```

---

## Task 9 : les documents, et l'ADR 0011

**Files:**

- Rewrite: `docs/LIQUID-GLASS.md`
- Modify: `AGENTS.md`, `docs/INDEX.md`, `llms.txt`
- Create: `docs/adr/0011-design-system-css-natif.md`

- [ ] **Step 1 : l'ADR**

Il enregistre ce que la spec a décidé et ce que l'exécution a mesuré. Cinq points, et le dernier compte autant que les autres :

1. **CSS natif contre préprocesseur**, avec la mesure qui l'a tranché — les cinq moteurs acceptent `@layer`, `light-dark()`, l'imbrication et les couleurs relatives.
2. **Les trois paliers** et la règle qui les gouverne.
3. **La contrainte confiée à Stylelint** plutôt qu'aux seuls tests.
4. **Le plancher Safari 16.4 / iOS 16.4**, et pourquoi il ne peut pas être abaissé : une dérivation `rgb(from var(…))` n'a pas d'origine connue à la compilation.
5. **Ce que le chantier a coûté et trouvé** : neuf défauts réels interceptés, dont un — onze cibles tactiles sous le minimum d'Apple — trouvé par les tests et non par l'œil.

- [ ] **Step 2 : réécrire `LIQUID-GLASS.md` autour du système**

Il explique aujourd'hui des règles ; il doit expliquer **où elles vivent**. Chaque section renvoie au fichier qui porte la règle, pour qu'un lecteur qui veut changer quelque chose sache où aller.

- [ ] **Step 3 : la section d'`AGENTS.md`**

La refondre sur la règle des paliers, et y garder ce que la partie 1 y a écrit sur le plancher plateforme — **en corrigeant la phrase inexacte** : le plancher ne borne pas le matériau seul, puisque le bundler réémet la notation d'intervalle des deux seuils de mise en page.

- [ ] **Step 4 : indexer et committer**

```bash
pnpm quality
git add -A && git commit -m "Enregistre la decision, et dit ou les regles vivent"
```

---

## Ce que ce plan ne fait pas

- **Il ne rouvre pas la question des couleurs système d'Apple.** `--color-warning` et `--color-success-text` gardent leurs valeurs historiques, et la question reste posée dans `semantic.css` avec les deux camps. Y répondre demande une vérification de contraste, donc sa propre tâche.
- **Il ne branche pas `--hit-target` ailleurs que sur le bouton.** Les autres consommateurs viendront quand ils existeront.
- **Il ne touche pas aux quinze alertes Dependabot** ni aux captures de travail à la racine : ce sont des gestes d'entretien, pas de design system.
