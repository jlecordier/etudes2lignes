# ADR 0011 — Système de design en CSS natif, à trois paliers

- **Statut** : Acceptée (2026-09-22)

## Contexte

Fin août 2026, l'interface a reçu le langage visuel Liquid Glass d'Apple. Entre
le 3 et le 7 septembre, huit défauts visuels ont été rapportés par l'auteur du
dépôt — pas trouvés par les tests, vus à l'œil sur un iPhone : en-têtes de
hauteurs différentes, bouton sans air, filet sur une barre et pas l'autre,
pastille de 44 px face à une de 27,6 px, contrepartie sombre manquante, verre
sur verre, formulaire invisible sous les tuiles, icône d'import illisible.

L'audit qui a suivi ([spec du 2026-09-07](../superpowers/specs/2026-09-07-design-system-design.md))
a mesuré la cause commune : `src/style.css` (1554 lignes, 90 règles) avait un
palier couleur systématisé (32 jetons, une contrepartie sombre chacun), et
tout le reste écrit à la main — espacement, typographie, géométrie,
composants — avec des tests posés par-dessus pour rattraper la dérive au lieu
de la rendre inécrivable. Les huit défauts tombaient chacun dans une case vide
de ce tableau.

## Décision

### 1. CSS natif, aucun préprocesseur

Sass a été envisagé et écarté. La mesure qui a tranché : une sonde jetable,
exécutée sur les cinq projets Playwright du dépôt (`chromium`, `webkit`,
`firefox`, `iphone`, `android`), a confirmé que les cinq moteurs acceptent
`@layer`, `light-dark()`, l'imbrication native et les couleurs relatives
(`rgb(from … r g b / …)`) sans repli.

Trois motifs, au-delà de la disponibilité native :

- **La sécurité d'un préprocesseur n'arrive pas là où les bugs étaient.** Les
  jetons de ce système doivent être des propriétés personnalisées **à
  l'exécution** : `light-dark()` en a besoin, `prefers-contrast` en a besoin,
  et `--large-screen` est relu depuis TypeScript et depuis les e2e — un front
  de chaînes que l'[ADR 0007](0007-langue-du-code-metier-francais-technique-anglais.md)
  documente déjà. Une variable Sass est de compilation : elle ne peut rien de
  tout cela.
- **Sass recule du terrain qu'il avait gagné.** `@import` et les fonctions
  globales sont dépréciés depuis Dart Sass 1.80, retirés en 3.0 ; imbrication,
  variables et imports — ses trois arguments historiques — sont natifs.
- **Il mélangerait deux sémantiques d'imbrication.** `.foo &` donne une
  spécificité différente en Sass (`.foo .bar`) et en natif
  (`:is(.foo .bar)`) : une feuille où les deux idiomes cohabitent est un piège
  permanent.

À quoi s'ajoute un coût propre à la stratégie de test retenue au point 3 : les
invariants lisent la feuille **comme texte source**. En SCSS ils liraient un
artefact de build.

### 2. Trois paliers, et une seule règle : un palier ne référence que celui au-dessus de lui

- **Palier A — primitives** ([`src/styles/tokens/primitives.css`](../../src/styles/tokens/primitives.css)).
  Échelles brutes, sans signification : rampes de couleur, échelle
  d'espacement, échelle de rayons, les onze styles de texte iOS en triplets
  complets. Ne référence rien.
- **Palier B — sémantique** ([`src/styles/tokens/semantic.css`](../../src/styles/tokens/semantic.css)).
  Les rôles. Ne référence que A. Chaque couleur déclarée une seule fois via
  `light-dark()` — les deux blocs `@media (prefers-color-scheme: dark)`
  disparaissent, et une contrepartie sombre oubliée devient **impossible à
  écrire** plutôt que détectée après coup. La teinte du verre s'y dérive du
  fond (`--material-regular: light-dark(rgb(from var(--color-background-grouped) …))`)
  au lieu d'en être une copie à la main.
- **Palier C — composant.** Déclaré dans le fichier du composant lui-même
  ([`src/styles/components/`](../../src/styles/components/), douze fichiers —
  onze composants, plus `text.css`), ne référence que B.

La règle est vérifiable et c'est elle qui interdit à un jeton sémantique de
contenir une valeur brute, ou à un composant de contenir une couleur — elle
est appliquée en partie par Stylelint (point 3) et en partie par les
invariants structurels de
[`src/styles/styles.test.ts`](../../src/styles/styles.test.ts) (portée
détaillée au point 3, Stylelint ne sachant pas tout vérifier).

Deux dettes ouvertes, héritées de la construction palier par palier et
assumées comme telles plutôt que masquées :

- `--radius-pill` (999px) est déclaré au palier A
  (`tokens/primitives.css`) mais référencé directement par trois fichiers de
  composant — `components/badge.css`, `components/button.css` et
  `components/map-overlay.css`, chacun avec sa propre justification en
  commentaire plutôt qu'un jeton sémantique partagé. Soit `--radius-pill`
  monte au palier B, soit les trois portent la même justification écrite une
  fois.
- `--group-radius: 999px` et `--group-padding: 2px` (`components/button-group.css`)
  dupliquent respectivement `--radius-pill` et une valeur hors de toute
  échelle déclarée. Nommées en exception dans le témoin plutôt que tolérées
  en silence — les vider fait rougir le témoin, mesuré pendant la tâche qui
  les a introduites.

Une troisième, de même nature, tient à la contrainte TDD plutôt qu'aux
paliers : trois triplets typographiques complets — `.trajet-name` et
`.trajet-details` (`components/row.css`), `.help` (`components/panel.css`) —
vivent en jetons de composant, en dehors de `components/text.css`, faute
d'avoir pu composer `.text-headline`/`.text-subheadline` dans les gabarits
HTML qui les portent : le hook `probity` a refusé la migration à plusieurs
reprises, rejouée immédiatement après un rouge observé comme sa propre
configuration le prescrit, et l'incrément a été coupé plutôt que contourné.

### 3. La contrainte est machine, pas seulement testée

Trois dépendances de développement dans l'étape `lint:css` de `pnpm quality` :
`stylelint` + `stylelint-config-standard`,
`stylelint-value-no-unknown-custom-properties` (un `var(--x)` qui ne pointe
sur aucun jeton déclaré) et `stylelint-declaration-strict-value` (un littéral
là où un jeton est attendu). Le second est la réponse directe au bug de la
contrepartie sombre de septembre : un jeton absent devient une erreur de lint,
pas un disque blanc sur fond blanc.

**Ce que Stylelint ne sait pas faire, mesuré et non supposé** : il ne connaît
pas les abrégés (`border: 1px solid #333` ne déclenche aucune règle de
`declaration-strict-value`, qui ignore les raccourcis) et il ne regarde jamais
la valeur d'un `var()` (`--rayon-invente: 7px; border-radius:
var(--rayon-invente);` ne déclenche rien). Les trois invariants que la
suppression de `screens/legacy.css` (point 5) avait un temps fait disparaître
ont dû renaître au périmètre du système entier dans
`src/styles/styles.test.ts`, et celui des rayons a dû descendre d'un niveau
dans le jeton : un jeton déclaré dans `tokens/` reste admissible quelle que
soit sa valeur, c'est l'endroit où un nombre a le droit de vivre.

### 4. Le plancher Safari 16.4 / iOS 16.4

Il est **documenté et détaillé dans [AGENTS.md](../../AGENTS.md#liquid-glass--what-you-may-not-break)**,
qui distingue déjà ses deux moitiés — celle du matériau, irréductible, et
celle de la mise en page, artefact du build — avec les mesures qui les
soutiennent ; cet ADR n'en répète que la décision.

La moitié matériau ne peut pas être abaissée : la teinte du verre se dérive du
fond via une couleur relative (`rgb(from var(--…) r g b / …%)`), et l'origine
d'une couleur relative est un `var()`, résolu seulement à l'exécution — aucune
cible de build ne peut donc l'abaisser. Mesuré avec lightningcss 1.32.0 :
verbatim aussi bien à `safari 16.0` qu'à `safari 16.4`, aussi bien sans cible
du tout. En dessous de 16.4, le repli `@supports` documenté dans
`components/surface.css` s'applique : un remplissage opaque, pas un plantage.

La moitié mise en page est, elle, un artefact du bundler : les feuilles
écrivent `@media (min-width: 900px)`, mais lightningcss réémet
`@media (width >= 900px)` — la notation d'intervalle, elle-même 16.4 — si bien
qu'en dessous de ce seuil les règles grand écran sont **entièrement
abandonnées**, l'éditeur deux colonnes avec elles. Mesuré sur le CSS construit
(`dist/assets/styles-*.css`), pas déduit. Un `css.lightningcss.targets` de
Safari 16.0 restituerait `min-width` sans coûter les couleurs, mais
épinglerait du même geste tout autre abaissement que Vite choisit seul
aujourd'hui — un compromis que le dépôt n'a délibérément pas pris.

### 5. Ce que le chantier a coûté et trouvé

**Des défauts réels, interceptés par la machinerie plutôt que par l'œil.** La
partie qui a posé le socle (paliers, Stylelint, plancher, couches) en a
intercepté neuf, dont un — onze boutons à pictogramme seul rendant 36×44 sous
WebKit, soit sous le minimum de 44×44 d'Apple — trouvé par le premier passage
d'un test e2e et non par une relecture visuelle (le commentaire CSS fautif
citait pourtant lui-même « a region of at least 44x44 pt »). La partie qui a
suivi, découpant la feuille en composants, en a trouvé d'autres du même
ordre : une vraie inversion de cascade sur `.action-bar { flex-wrap: nowrap }`
qui ne pouvait plus jamais gagner depuis `components/bar.css` — le même bug
que celui du 3 septembre, réintroduit par un déplacement supposé neutre, et
mesuré à 360 px avant/après la correction — puis trois inversions de plus de
la même famille pendant le découpage des composants de contenu, et un angle
mort du brief (six sélecteurs renommés référencés depuis `screens/` en dehors
du périmètre annoncé de onze composants) que c'est la suite e2e, et non la
relecture, qui a signalé.

**Un phénomène que la spec n'avait pas prévu : douze témoins qui passaient
sans rien garder.** Chacun relève d'un seul principe : **tout ce que le témoin
analyse sans l'avoir vérifié.** Décliné en mécanismes distincts, tous mesurés
avant/après par mutation de ce que le témoin est censé protéger :

- **la prose d'un commentaire, avalée par ce que le témoin analysait** — six
  occurrences. Le cas le plus fréquent : le contrat en tête d'un fichier CSS
  cite en prose la règle même que le témoin cherche dans le code (« ces
  règles n'ont plus besoin d'`!important` », « aucune couleur ne vit dans une
  requête d'apparence »), et sans retrait des commentaires cette citation
  suffit à satisfaire le motif — dans un sens (témoin qui reste vert alors que
  la vraie règle a disparu) comme dans l'autre (témoin qui rougit à tort sur
  un fichier qui respecte pourtant la règle). Une variante : un quantificateur
  paresseux (`[\s\S]*?`) qui s'arrête à la première accolade fermante
  rencontrée après la **première** mention littérale — fût-elle en
  commentaire — plutôt que la vraie.
- **un nom de jeton lu à la place de la propriété qu'il transporte** — une
  occurrence. `stroke: var(--icon-stroke)` : un motif cherchant
  `stroke:\s*currentcolor` était satisfait par la sous-chaîne du **nom** du
  jeton (`--icon-`), sans jamais lire sa valeur résolue.
- **une liste écrite à la main indexant un dictionnaire venu du disque, avec
  un repli `?? ''`** — deux occurrences. Un fichier renommé ou supprimé fait
  porter la recherche sur la chaîne vide plutôt que d'échouer, et l'assertion
  qui filtre cette liste contre le dictionnaire passe au vert en ne gardant
  plus rien.
- **une liste de propriétés qui n'était que quatre neuvièmes de sa propre
  règle** — une occurrence. Un témoin de « elle place et ne peint pas » ne
  cherchait que quatre des neuf propriétés de peinture réelles ; les cinq
  autres (`border`, `box-shadow`, `fill`, `stroke`, `background-color`)
  passaient sans être vues.
- **une comparaison de chaîne aveugle aux attributs à plusieurs classes** —
  une occurrence. `class="${nom}"` comparé à la lettre contre
  `class="header bar bar-navigation"` échoue toujours, précisément sur les
  gabarits en migration partielle qu'un tel témoin existe pour surveiller.
- **un glob sans plancher** — une occurrence. Le compte de gabarits migrés
  reposait sur un glob sans seuil minimal : un motif changé pour ne plus rien
  trouver laissait le témoin déclarer la migration terminée sur zéro fichier.
- **et un douzième, d'un mécanisme inverse des onze autres** : un témoin
  **creusé par la suppression du fichier qu'il lisait**. Il vérifiait que
  `screens/legacy.css` ne portait plus aucune règle en le lisant par
  `feuilles['./screens/legacy.css'] ?? ''` ; une fois le fichier supprimé
  (tâche 7), le repli rendait la chaîne vide et l'assertion passait pour
  toujours, sans plus rien garder — le seul des douze où c'est une
  **suppression**, et non un ajout de prose ou une lecture trompée, qui a
  vidé le témoin.

La conduite qui en sort, et qui vaut au-delà de ce chantier : **sonder un
témoin en mutant ce qu'il garde, jamais en relisant sa formule** — c'est
exactement ce qu'aucun des douze n'avait reçu avant d'être écrit ou déplacé ;
**prouver qu'un nom écrit à la main existe avant de l'indexer** dans un
dictionnaire venu du disque ; et **rendre chaque exception porteuse** —
vider une liste d'exceptions doit faire rougir le témoin qui la porte, pas
simplement rétrécir une prose.

## Conséquences

- ➕ Les huit défauts de septembre sont chacun devenus inécrivables par un
  mécanisme nommé (palier, couche, ou témoin), pas rattrapés après coup par un
  test.
- ➕ Une contrepartie sombre manquante est désormais une erreur de lint, pas un
  bug visuel.
- ➕ Les 16 `!important` de réconciliation Leaflet ont disparu : `leaflet.css`
  entre par `@import url(…) layer(vendor);` dans
  [`src/styles/index.css`](../../src/styles/index.css), la couche la plus
  basse de `@layer vendor, reset, tokens, base, components, screens;`, et
  perd contre toute déclaration de composant quelle que soit sa spécificité —
  mesuré : zéro `!important` de réconciliation Leaflet dans `src/styles/`
  aujourd'hui ; les six restants (`[hidden]`, mouvement réduit, `.awaiting-click *`)
  sont les exceptions déjà jugées légitimes par la spec d'origine.
- ➖ Trois dépendances de développement de plus, et une étape de plus dans
  `pnpm quality`.
- ➖ Douze fichiers de composants remplacent une feuille unique : la recherche
  d'une règle passe par le nom du composant, ce qui suppose le vocabulaire
  connu — d'où le contrat en commentaire de tête de chaque fichier.
- ➖ Deux dettes de palier et une dette TDD restent ouvertes (point 2), et la
  question des couleurs système d'Apple (`--color-warning`,
  `--color-success-text`) reste posée dans `tokens/semantic.css` sans être
  tranchée — trancher demande sa propre vérification de contraste.
- ⚠️ Les 90 références de régression visuelle prévues par la spec d'origine
  ([`e2e/visuel.spec.ts`](../../e2e/visuel.spec.ts)) ne sont, à ce commit, pas
  encore committées : la CI tourne sur `ubuntu-latest` et Playwright suffixe
  ses références par plateforme, donc elles doivent être générées sous Linux
  — dans le dev container que le dépôt fournit — et non sur macOS. Tant
  qu'elles ne le sont pas, `pnpm test:e2e` échoue sur ces 30 tests (6 vues ×
  5 projets) faute de référence à comparer ; `pnpm quality`, qui ne lance pas
  la suite e2e, n'en est pas affecté.
