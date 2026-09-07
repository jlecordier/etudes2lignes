# Un design system pour l'interface — conception

L'interface a reçu, fin août 2026, le langage visuel Liquid Glass d'Apple. Le
résultat tient, et la [documentation qui l'explique](../../LIQUID-GLASS.md)
existe. Mais entre le 3 et le 7 septembre, huit défauts visuels ont été
rapportés par l'auteur du dépôt — pas trouvés par les tests, **vus à l'œil sur
un iPhone**. En-têtes de hauteurs différentes, bouton sans air, filet sur une
barre et pas l'autre, pastille de 44 px face à une de 27,6 px, contrepartie
sombre manquante, verre sur verre, formulaire invisible sous les tuiles, icône
d'import illisible.

Le diagnostic de l'auteur — « ça veut dire que tu n'as pas correctement mis en
place un design system à l'état de l'art » — est exact, et il se mesure.

## Le constat, chiffré

`src/style.css` : **1554 lignes, 90 règles, 8 requêtes média, 141 lignes de
commentaire**. Un audit palier par palier :

| Palier              | État mesuré                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Couleur**         | _systématisé_ : 32 jetons dans `:root`, 16 contreparties sombres, 10 en contraste élevé, un invariant de couverture, **zéro littéral de couleur hors `:root`** |
| **Espacement**      | **absent** : `0.5rem` ×16, `1rem` ×12, `0.25rem` ×5, `2px` ×5 — une centaine de longueurs en clair                                                             |
| **Typographie**     | **cassé** : 16 déclarations `font-size`, dont **5** portent le triplet complet d'Apple. `0.765rem` répété dans 7 règles                                        |
| **Géométrie**       | **absent** : `44px` écrit une fois en clair, `999px` ×6, `34px` ×4                                                                                             |
| **Surface (verre)** | _partiel_ : un jeton, mais **8** redéclarations de `backdrop-filter` ; la « liste close des surfaces » est un test, pas une règle                              |
| **Composant**       | **absent** : 41 classes, dont **38 employées une seule fois**. `.header` et `.suivi-bar` réimplémentaient chacune « une barre »                                |

La conclusion tient en une phrase : **un système de couleurs a été construit,
le reste a été écrit à la main, et des tests ont été posés par-dessus pour
rattraper la dérive au lieu de la rendre inécrivable.** Chacun des huit défauts
tombe dans une case vide de ce tableau.

Deux d'entre eux méritent d'être nommés, parce qu'ils disent le mécanisme :

- **Les hauteurs de barre.** `.header` déclarait son rembourrage vertical, et
  `.suivi-bar` le sien. Écrits deux fois, ils avaient dérivé — 44 px contre 62. Pire : celui de l'en-tête était **nul**, donc un bouton de 44 px touchait
  les deux bords de sa barre. Il n'existait aucun palier où « la hauteur d'une
  barre » aurait pu vivre une seule fois.
- **La contrepartie sombre.** `--verre` et `--verre-reflet` manquaient au bloc
  `prefers-color-scheme: dark`, et le bouton flottant était un disque blanc
  portant un symbole blanc. Un test a fini par le voir — **après** la
  publication. Le bloc sombre est une seconde liste tenue à la main : rien,
  dans la forme de la feuille, n'exige qu'elle soit complète.

## Ce qui a été mesuré avant de décider

Une sonde jetable, exécutée sur les cinq projets Playwright du dépôt
(`chromium`, `webkit`, `firefox`, `iphone`, `android`), puis supprimée :

| Primitive                        | chromium | webkit | firefox | iphone | android |
| -------------------------------- | -------- | ------ | ------- | ------ | ------- |
| `light-dark()`                   | ✓        | ✓      | ✓       | ✓      | ✓       |
| imbrication native               | ✓        | ✓      | ✓       | ✓      | ✓       |
| couleurs relatives `rgb(from …)` | ✓        | ✓      | ✓       | ✓      | ✓       |
| requêtes de conteneur            | ✓        | ✓      | ✓       | ✓      | ✓       |
| `@layer`                         | ✓        | ✓      | ✓       | ✓      | ✓       |

Le dépôt ne déclare ni `browserslist` ni cible de build, et
`color-scheme: light dark` est déjà posé sur `html` — la précondition de
`light-dark()`. Aucune de ces primitives ne demande donc de repli.

Vérifié aussi, parce que la suite en dépend :

- **Les 26 jetons dupliqués (16 sombres, 10 contraste) sont tous
  colorimétriques.** Les trois qui n'en ont pas l'air — `--verre-reflet`,
  `--ombre-pastille`, `--ombre-flottante` — sont des ombres, qui se décomposent
  en une géométrie invariante et une couleur. `light-dark()` peut donc tout
  absorber.
- **Le coût d'un renommage de classes est faible.** La suite e2e s'appuie sur
  75 noms accessibles (`getByRole` ×65, `getByLabel` ×6, `getByText` ×4) et 73
  identifiants ; seuls **23 locators visent une classe, sur 5 classes
  distinctes**. Le TypeScript compose 11 chaînes de classe.
- **`leaflet.css` entre par TypeScript**, importé par deux adapters — ce qui est
  précisément ce qui l'empêche d'être mis en couche.
- **16 des 22 `!important`** de la feuille sont de la réconciliation Leaflet.
  Les 6 autres (`[hidden]`, mouvement réduit, `.awaiting-click *`) sont
  légitimes et restent.

## Décision

### 1. CSS natif, aucun préprocesseur

SCSS a été envisagé et écarté, sur trois motifs mesurés.

**La sécurité qu'il vend n'arrive pas là où les bugs sont.** Les jetons de ce
système _doivent_ être des propriétés personnalisées **à l'exécution** :
`light-dark()` en a besoin, `prefers-contrast` en a besoin, et `--large-screen`
est relu depuis le TypeScript **et** depuis les e2e — front de chaînes que
l'[ADR 0007](../../adr/0007-langue-du-code-metier-francais-technique-anglais.md)
documente déjà. Une variable Sass est de compilation : elle ne peut rien de tout
cela. Sass ne générerait que les déclarations, et chaque site d'usage resterait
`var(--x)`, où une faute reste silencieuse.

**Sass recule du terrain qu'il avait gagné.** `@import` et les fonctions
globales sont dépréciés depuis Dart Sass 1.80, retirés en 3.0 ; `darken()`,
`lighten()` et `color.green()` cèdent la place à `color.scale` et
`color.channel`. Imbrication, variables, imports — ses trois arguments
historiques — sont natifs, et la sonde ci-dessus le confirme sur les cinq
moteurs.

**Il mélangerait deux sémantiques d'imbrication.** `.green-theme &` écrit dans
`.foo .bar` donne `.green-theme .foo .bar` en Sass, mais
`.green-theme :is(.foo .bar)` en natif : **spécificité différente**. Une feuille
où les deux idiomes cohabitent est un piège permanent.

À quoi s'ajoute un coût propre à la stratégie de test retenue plus bas : les
invariants lisent la feuille **comme texte source**. En SCSS ils liraient un
artefact de build.

Ce qu'on renonce à gagner : générer les 11 styles de texte depuis une `map` avec
`@each`. Ils s'écriront à la main, une fois, et un invariant assurera leur
complétude.

### 2. La contrainte est machine, pas seulement testée

Trois dépendances de développement, et une étape dans `pnpm quality` :

| Outil                                          | Ce qu'il refuse                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `stylelint` + `stylelint-config-standard`      | les fautes de CSS que rien ne voyait                                                                                                         |
| `stylelint-value-no-unknown-custom-properties` | un `var(--x)` qui ne pointe sur **aucun** jeton déclaré                                                                                      |
| `stylelint-declaration-strict-value`           | un littéral là où un jeton est attendu (`color`, `background-color`, `font-size`, `border-radius`, `padding`, `margin`, `gap`, `box-shadow`) |

Le second est la réponse directe au bug de la contrepartie sombre : un jeton
absent devient une **erreur de lint**, pas un disque blanc sur fond blanc. Le
troisième est la réponse aux cent longueurs en clair.

La portée est réglée par couche : `strict-value` s'applique aux fichiers de
composants et d'écrans, pas aux fichiers de jetons — c'est là que les valeurs
brutes ont le droit de vivre, et nulle part ailleurs.

### 3. L'ordre de cascade

```css
@layer vendor, reset, tokens, base, components, screens;
```

Déclaré une seule fois, en tête de l'entrée. Conséquence : un écran ajuste
toujours un composant sans jouer sur la spécificité, et un composant n'a jamais
besoin d'`!important` contre le socle.

**Le pari à sonder en premier.** `leaflet.css` est aujourd'hui importé depuis
`LeafletCarteDesPoints.ts` et `LeafletCoordonneeSelector.ts`. Un import
JavaScript ne peut pas être mis en couche. Déplacé vers l'entrée CSS sous la
forme `@import url('leaflet/dist/leaflet.css') layer(vendor);`, il tombe dans la
couche la plus basse et **les 16 `!important` de réconciliation Leaflet
disparaissent**.

Deux risques, tous deux à vérifier par la sonde avant d'écrire une ligne de la
suite :

1. Vite peut aplatir l'`@import` à l'inline et perdre la couche.
2. Le chargement devient éager avec la feuille principale au lieu de suivre le
   module de l'adapter. Les deux adapters étant atteints depuis la racine de
   composition, l'effet pratique est attendu nul — à confirmer sur le `dist`.

**Repli si la sonde échoue :** un unique fichier `vendor/leaflet.css` garde ses
`!important`, isolés et commentés, et la couche `vendor` reste déclarée pour le
reste. On perd 16 `!important` de moins, on ne perd rien d'autre.

### 4. Les jetons, en trois paliers

La règle qui les gouverne : **un palier ne référence que le palier au-dessus de
lui.** Elle est vérifiable, et c'est elle qui empêche un jeton sémantique de
contenir une valeur brute ou un composant de contenir une couleur.

#### Palier A — primitives (`tokens/primitives.css`)

Les échelles brutes, sans signification. Ne référence rien.

- les rampes de couleur d'Apple, telles que publiées (le bleu système clair
  `rgb(0 136 255)`, sombre `rgb(0 145 255)`, etc.)
- une échelle d'espacement : `2 4 8 12 16 20 24 32 44 64` px
- une échelle de rayons
- **les 11 styles de texte iOS, chacun un triplet complet** — taille,
  interligne, approche — exprimés en fraction du corps par défaut pour suivre la
  taille dynamique

#### Palier B — sémantique (`tokens/semantic.css`)

Les rôles. Ne référence que A. **Chaque couleur déclarée une seule fois :**

```css
--color-label: light-dark(rgb(0 0 0 / 0.85), rgb(255 255 255 / 0.85));
```

Les deux blocs `@media (prefers-color-scheme: dark)` disparaissent. Une
contrepartie sombre oubliée devient **impossible à écrire**, et non plus
détectée après coup par un test.

Le contraste élevé reste une requête média, mais ne surcharge que ce palier.

Et la teinte du verre **se dérive** du fond au lieu d'en être une copie :

```css
--material-regular: rgb(from var(--color-background-grouped) r g b / 0.72);
```

C'était la duplication manuelle qui avait obligé à recopier `rgb(242 242 247)`
dans `--verre` pour que la barre soit invisible au repos.

#### Palier C — composant

Déclaré **dans le fichier du composant**, ne référence que B. C'est le palier
qui manquait entièrement :

```css
@layer components {
    .bar {
        --bar-air: var(--space-8);
        --bar-height: calc(var(--hit-target) + 2 * var(--bar-air));
        /* … */
    }
}
```

`--bar-height`, `--badge-size`, `--field-height` : chacun écrit une fois, à un
seul endroit, par construction.

`--hit-target`, en revanche, **appartient au palier B** : les 44 pt d'Apple sont
une décision de système, que plusieurs composants lisent. Un jeton que deux
composants partagent n'est pas un jeton de composant — c'est la règle qui décide
où il vit.

### 5. Le socle (`base/`)

Défauts d'éléments seulement, aucune classe : `html` et son accroche
`font: -apple-system-body` (avec le `font-size: 17px` qui le précède comme
repli, Chrome l'ignorant), `body`, les titres câblés sur les styles de texte,
les contrôles de formulaire, `:focus-visible`, `prefers-reduced-motion`,
`::selection`.

### 6. Le vocabulaire de composants (`components/`)

Onze fichiers, un par composant, plus un douzième pour les styles de texte.
**Noms anglais** conformément à
l'[ADR 0007](../../adr/0007-langue-du-code-metier-francais-technique-anglais.md)
— une classe CSS est technique. Chaque fichier ouvre sur un contrat en
commentaire : ce que le composant est, ses modificateurs, les jetons qu'il
expose.

| Composant         | Ce qu'il remplace                                              | Le défaut qu'il rend inécrivable                                                          |
| ----------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `bar`             | `.header`, `.suivi-bar`                                        | **deux barres ne peuvent plus avoir deux hauteurs, parce qu'il n'y a plus deux barres**   |
| `surface`         | 8 redéclarations de `backdrop-filter`                          | le verre sur verre, et la posture `@supports` oubliée                                     |
| `badge`           | `.point-number`, `.carte-marker`, `.page-number`               | la pastille de 44 px face à celle de 27,6 px                                              |
| `button`          | `.secondary`, `.danger`, `.carte-recentrer`, boutons flottants | une cible sous 44 px                                                                      |
| `button-group`    | `.action-bar`, `.image-bar`, `.carte-bar`                      | le verre posé sur chaque bouton au lieu du groupe ; les rayons non concentriques          |
| `map-overlay`     | les règles `.screen-carte` et `.carte-*`                       | la carte plein écran est partagée par deux écrans : composant, donc, et non règle d'écran |
| `panel`           | `.trajet-overview`, `.help`, `.hint-banner`                    | du verre dans la couche de contenu                                                        |
| `banner`          | `.simulation-banner`, `.offline-indicator`                     | —                                                                                         |
| `field`           | les `input` et leurs libellés                                  | —                                                                                         |
| `row`             | `.trajet-name`, `.image-name`                                  | un style de texte incomplet                                                               |
| `floating-action` | `.floating-add-point-button`, `.overview-button`               | —                                                                                         |

Plus un fichier `components/text.css` : **une classe par style de texte iOS**
(`.text-body`, `.text-headline`, `.text-footnote`…). Une taille ne voyage plus
jamais sans son interligne ni son approche — 11 des 16 styles actuels sont
incomplets.

### 7. Les écrans (`screens/`)

Placement seulement : grille, flex, ordre. **Un fichier d'écran ne contient ni
`color`, ni `background`, ni `font-size`, ni `border-radius`** — et Stylelint le
refuse, en plus de l'invariant qui le décrit.

### 8. La planche de référence, publiée hors de la PWA

`design/index.html`, seconde entrée Vite, déployée à `/design/` par le workflow
existant — qui envoie `dist` en entier et n'a donc **rien à changer**.

« Hors de la PWA » demande quatre mesures précises, dont deux corrigent un
comportement que la config actuelle aurait imposé en silence :

| Mesure                                                                                  | Pourquoi                                                                                                       |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| entrée `design/index.html` dans `build.rollupOptions.input`                             | elle paraît à `/design/`, sous le `base: './'` du dépôt                                                        |
| `workbox.globIgnores: ['design/**']`                                                    | sans quoi `globPatterns: ['**/*.{js,css,html,png,svg,woff2}']` la **pré-cacherait chez tous les utilisateurs** |
| `workbox.navigateFallbackDenylist: [/design\//]`                                        | sans quoi `navigateFallback: 'index.html'` servirait l'app sous `/design/` hors ligne                          |
| aucune entrée de manifeste, aucun lien depuis l'app, son entrée n'importe pas `main.ts` | elle n'enregistre aucun service worker et ne s'installe pas : joignable par URL seule                          |

Un test vérifie les deux exclusions **sur le `dist` construit** : c'est le genre
de réglage qui se défait en silence.

Ce que la planche rend :

- chaque échelle du palier A, en pastilles et en réglettes
- **les 11 styles de texte avec leurs métriques mesurées dans le navigateur**,
  pas celles qu'on croit avoir écrites
- chaque composant, dans chaque modificateur et chaque état — repos, pressé,
  désactivé, focus clavier
- les trois apparences : clair, sombre, contraste élevé
- un panneau de concentricité, où l'on voit si `intérieur = extérieur −
rembourrage` tient
- une surimpression des cibles de 44 px, activable

Elle est consultable **depuis un iPhone réel**, ce qui est le seul endroit où le
verre, les encoches et le contraste élevé se jugent vraiment.

### 9. Les trois sortes de tests

Elles répondent à trois questions différentes, et aucune ne remplace les autres.

**a. Invariants sur la source** (`src/styles/styles.test.ts`) — la règle des
paliers, aucun littéral dans un composant ou un écran, pas de verre sur verre,
chaque style de texte complet, l'ordre des couches déclaré une seule fois. Ce
sont des affirmations **structurelles** : elles peuvent échouer autrement qu'en
supprimant la ligne qu'elles décrivent, ce que la compétence `non-brittle-tests`
demande.

**b. Tests de géométrie mesurée**, en e2e contre la planche. **C'est l'ajout
décisif.** Le 3 septembre, la hauteur des barres a été mesurée à la main dans un
navigateur ; cette mesure devient un test :

- les deux barres d'écran ont la même hauteur, sur les trois écrans et à
  360 / 390 / 430 px
- toute cible tactile fait au moins 44 × 44 px
- les pastilles ont la même taille dans tous leurs contextes
- les rayons imbriqués vérifient `intérieur = extérieur − rembourrage`
- aucune surface en verre n'a d'ancêtre en verre

**c. Régression visuelle** — six vues (la planche, la liste, l'éditeur, la
carte plein écran, le suivi, l'aperçu du trajet) × trois apparences × les cinq
projets Playwright : **90 références**. Le dépôt ne compte que **trois** écrans
(`trajets-list-screen`, `trajet-editor-screen`, `suivi-screen`) ; les deux vues
supplémentaires sont des surcouches, capturées parce qu'elles portent du verre
au-dessus d'un contenu mouvant.

La CI exécutant `pnpm test:e2e` sur `ubuntu-latest`, et Playwright suffixant ses
références par plateforme, **les références sont générées sous Linux dans le dev
container** — que le dépôt possède déjà, et où les navigateurs démarrent (ce que
le bac à sable macOS interdit). Le jugement esthétique, lui, se fait sur un
iPhone réel via la planche publiée : les références servent à détecter un
changement, pas à décider si c'est beau.

Stabilisation : animations coupées, tuiles OSM masquées, texte d'état GPS
masqué, échelle de pixel fixée.

## L'arborescence

```
src/styles/
    index.css                 @layer …; les @import, et rien d'autre
    tokens/
        primitives.css        palier A — ne référence rien
        semantic.css          palier B — ne référence que A
    base/
        elements.css
        typography.css
    components/
        bar.css  button.css  button-group.css  badge.css  panel.css
        banner.css  field.css  row.css  floating-action.css
        surface.css  map-overlay.css  text.css
    screens/
        trajets-list.css  trajet-editor.css  suivi.css
    vendor/
        leaflet.css           vide si la sonde @layer réussit
    styles.test.ts            les invariants
design/
    index.html                la planche
    gallery.ts                son rendu
    gallery.css               son propre habillage, hors du système
e2e/
    design-system.spec.ts     les tests de géométrie
    visual.spec.ts            la régression visuelle
```

`src/style.css` disparaît ; `src/main.ts` importe `./styles/index.css`.

## Ce qui demande la main de l'auteur

**Une ligne dans `probity.config.ts`.** L'auteur a accordé, au cours de la
conception, l'exception « fichier de configuration » que la compétence
`test-driven-development` liste et renvoie explicitement au partenaire humain :
la feuille de style n'a pas de comportement appelable, et une trentaine de refus
en septembre l'ont montré. Cette exception ne parvient pas au crochet, dont le
glob est `files: ['src/**']`. La rendre effective demande :

```diff
-            files: ['src/**'],
+            // L'exception « configuration files » de la compétence TDD,
+            // accordée par l'auteur du dépôt le 7 septembre 2026 pour les
+            // feuilles de style : elles n'ont pas de comportement appelable à
+            // faire rougir, et leur vérification passe par les invariants de
+            // source, les tests de géométrie mesurée et la régression
+            // visuelle. Le TypeScript et les gabarits gardent le portail.
+            files: ['src/**/*.ts', 'src/**/*.html'],
```

Le fichier dit lui-même que ces écarts sont « décidés par l'auteur du dépôt —
pas par l'agent que la règle contraint », d'où ce diff proposé plutôt
qu'appliqué.

**L'exception s'arrête à la feuille.** Le TypeScript de la planche, les tests de
géométrie, les modifications d'écrans : portail plein.

## L'ordre du chantier

Chaque étape laisse `pnpm quality` et l'e2e au vert, et se voit à l'écran.

1. **Sonde `@layer` sur Leaflet** — décide si les 16 `!important` tombent. Rien
   d'autre n'est écrit avant.
2. **Stylelint** installé et configuré, sur la feuille actuelle telle quelle :
   il chiffre la dette avant qu'on la paye, et l'étape entre dans
   `pnpm quality`.
3. **Les couches posées**, la feuille actuelle déplacée en bloc dans `screens` —
   rien ne change à l'écran, et c'est le but.
4. **Paliers A et B**, `light-dark()`, suppression des deux blocs dupliqués.
5. **Les styles de texte**, en remplacement des 16 `font-size`.
6. **Les composants, un par un** : chacun avec son contrat, son entrée de
   planche et son test de géométrie ; l'écran correspondant perd ses règles.
7. **La migration des noms de classes** — 41 en HTML, 11 en TypeScript, 5 en
   e2e. Les quatre pièges de chaînes de l'ADR 0007 sont relus avant.
8. **La planche publiée**, avec les deux exclusions Workbox et leur test sur le
   `dist`.
9. **Les références visuelles**, générées dans le dev container, en dernier —
   quand le système ne bouge plus.
10. **Les docs** : [`LIQUID-GLASS.md`](../../LIQUID-GLASS.md) réécrit autour du
    système, la section d'[`AGENTS.md`](../../../AGENTS.md) refondue sur la
    règle des paliers, et un **ADR 0011** enregistrant la décision — CSS natif
    contre préprocesseur, les trois paliers, la contrainte machine.

## Conséquences

- ➕ **Les huit défauts de septembre deviennent inécrivables**, chacun par un
  mécanisme nommé plus haut, et non par un test qui les rattrape.
- ➕ Une contrepartie sombre manquante devient une erreur de lint.
- ➕ 16 `!important` disparaissent, si la sonde le permet.
- ➕ Une planche consultable sur un iPhone réel : le verre et les encoches se
  jugent enfin là où ils se rendent.
- ➖ Trois dépendances de développement et une étape de plus dans
  `pnpm quality`.
- ➖ 90 fichiers binaires de référence, à régénérer à chaque changement
  volontaire — et régénérables **seulement dans le dev container**, ce qui
  ajoute une condition à un geste courant.
- ➖ Un dossier de douze fichiers de composants remplace un fichier unique. La
  recherche d'une règle passe par le nom du composant, ce qui suppose que le
  vocabulaire soit connu — d'où le contrat en tête de chaque fichier.
- ⚠️ La migration des noms de classes traverse quatre fronts de chaînes que le
  typecheck ne voit pas. L'ADR 0007 les énumère ; ils sont relus à l'étape 7,
  pas devinés.

## Ce que cette spec n'entreprend pas

- **Changer le langage visuel.** Liquid Glass reste la décision ; c'est sa mise
  en œuvre qui est refaite.
- **Un préprocesseur**, ni maintenant ni en repli : la décision est motivée
  ci-dessus, pas différée.
- **Un générateur de jetons**, ni un format d'échange (DTCG) : il n'y a pas
  d'outil de design dans la boucle qui le justifierait.
- **Refactorer les adapters ou le domaine.** Seuls les deux imports de
  `leaflet.css` bougent, et seulement si la sonde réussit.
- **Toucher `probity.config.ts` de l'initiative de l'agent** : le diff est
  proposé, l'auteur l'applique ou le refuse.
