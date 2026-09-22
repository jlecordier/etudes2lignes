# Liquid Glass — les règles de l'interface, et où elles vivent

Ce document explique **pourquoi** l'interface a l'apparence qu'elle a, et **où**
chaque règle est écrite dans le code. Il s'adresse à qui doit la modifier sans
la défaire : chaque section renvoie au fichier qui porte la règle, pour ne pas
avoir à la chercher.

La source des règles est la
[Human Interface Guidelines d'Apple](https://developer.apple.com/design/human-interface-guidelines/materials).
Les citations en anglais sont d'elle, mot pour mot ; ce qui suit chaque citation
est la conséquence pour **cette** application, souvent mesurée dans un
navigateur.

> Note pratique : les pages de la HIG sont une application web dont le HTML ne
> contient qu'un titre. Leur texte s'obtient par l'API JSON qui la sert :
> `https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`.
> Certaines valeurs — les couleurs système, notamment — ne vivent que dans le
> texte alternatif des images de ce JSON.

Le système qui porte ces règles — trois paliers de jetons, une contrainte
Stylelint, la raison du CSS natif — est décrit dans
[l'ADR 0011](adr/0011-design-system-css-natif.md) ; ce document-ci reste
concentré sur le **quoi** et le **pourquoi visuel**, l'ADR sur le **comment**
architectural.

## La règle qui gouverne tout : deux couches

> « Liquid Glass forms a distinct functional layer for controls and navigation
> elements — like tab bars and sidebars — that floats above the content layer. »

Et son corollaire, tout aussi explicite :

> « **Don't use Liquid Glass in the content layer.** »

D'où la frontière, qui vaut pour chaque élément qu'on ajoute :

| Couche            | Ce qu'elle contient ici                                                                                                       | Traitement                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Contenu**       | les pages du schéma, la carte, les lignes de la liste, l'aperçu du trajet, les repères et leurs pastilles, les encarts d'aide | Jamais de flou. Elle porte la couleur et l'information. |
| **Fonctionnelle** | les barres, les boutons flottants, les contrôles de la carte                                                                  | Le verre, et elle flotte au-dessus.                     |

Une barre qui **défile avec la page** n'appartient à aucune des deux : rien ne
passe jamais dessous, son flou n'échantillonne rien, et le matériau n'a plus
d'objet. C'est le défaut qu'avait l'en-tête en septembre 2026, et il ne se
voyait pas au premier regard — c'est la tâche fondatrice du système de
composants qui l'a corrigé en fusionnant les deux barres qui dérivaient
séparément
([`src/styles/components/bar.css`](../src/styles/components/bar.css)).

## Où vit le verre

**Un seul fichier écrit `backdrop-filter`** :
[`src/styles/components/surface.css`](../src/styles/components/surface.css).
[`src/styles/styles.test.ts`](../src/styles/styles.test.ts) fait rougir la
suite dès qu'un second fichier en déclare un — huit règles de l'ancienne
feuille le redéclaraient chacune, et deux avaient déjà oublié la préfixée
`-webkit-` ou le plafond de flou.

Le mécanisme n'est pas qu'un composant « pose la classe `.surface` » sur son
balisage : `.surface` (et ses modificateurs `.surface-regular`/
`.surface-thick`) est la déclaration partagée, et un composant fonctionnel y
entre en faisant lister son propre sélecteur à côté d'elle, dans le même bloc
`@supports`, plutôt qu'en redéclarant le verre. Aujourd'hui, neuf sélecteurs
partagent cette unique déclaration :

```
.surface
.bar-navigation · .bar-status · .map-overlay-bar
.floating-action-add-point · .floating-action-carte
.floating-action-overview · .floating-action-resume
.leaflet-bar
```

> « Limit these effects to the most important functional elements in your app. »

Le budget compte autant que la doctrine : sur mobile, **trois à cinq flous
simultanés** est le plafond mesuré. Deux familles de surfaces en sont donc
exclues alors qu'elles sont bien fonctionnelles — la barre d'une image
(`.button-group-image`) et les actions d'un point (`.button-group-point`),
dans
[`src/styles/components/button-group.css`](../src/styles/components/button-group.css) :
chacune existe une fois par image ou par point, et trente flous coûteraient
trente fois. Elles reçoivent la teinte du verre **sans son flou** — ce qu'il
fallait là était la lisibilité, pas l'optique, et un fond suffit. Sans lui,
ces boutons étaient illisibles sur un schéma chargé.

## Le verre ne se superpose jamais

> « Avoid overcrowding or layering Liquid Glass elements on top of each other. »

Deux conséquences quotidiennes, chacune tenue par un fichier :

- **La surface va au groupe, pas à chaque bouton.**
  [`components/button-group.css`](../src/styles/components/button-group.css) :
  dans une barre, les boutons sont transparents et monochromes, et partagent la
  surface de la barre. « Trajets » montrait une pastille grise et « Suivre »
  une pastille bleue posées sur le verre — deux surfaces empilées.
- Le bouton de recentrage vit dans `.leaflet-bar`
  ([`components/map-overlay.css`](../src/styles/components/map-overlay.css)),
  comme le zoom. Lui donner aussi du verre donnait une gélule dans une boîte
  carrée, et deux flous l'un sur l'autre.
  [`components/floating-action.css`](../src/styles/components/floating-action.css)
  documente la même règle pour les boutons enfants d'un groupe déjà en verre
  (`.button-compact`, `#cancel-carte-button`) : ils n'ont pas leur propre
  surface, volontairement.

## Les jetons, en trois paliers

C'est le palier qui manquait entièrement en septembre : la couleur était
systématisée, rien d'autre ne l'était. [L'ADR 0011](adr/0011-design-system-css-natif.md)
enregistre la décision et la mesure ; en résumé, la règle qui gouverne tout est
**un palier ne référence que celui au-dessus de lui** :

| Palier         | Fichier                                                          | Contenu                                                                     |
| -------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A — primitives | [`tokens/primitives.css`](../src/styles/tokens/primitives.css)   | échelles brutes (couleur, espacement, rayons, les onze styles de texte iOS) |
| B — sémantique | [`tokens/semantic.css`](../src/styles/tokens/semantic.css)       | les rôles — couleur en `light-dark()`, matériaux, rayons, cible tactile     |
| C — composant  | [`components/*.css`](../src/styles/components/) (douze fichiers) | déclaré dans le fichier du composant, ne référence que B                    |

`--hit-target` (44 px) vit au palier B parce que plusieurs composants le
lisent — un jeton que deux composants partagent n'est pas un jeton de
composant, c'est la règle qui décide où il vit.

Deux dettes de palier restent ouvertes, documentées et non masquées :
`--radius-pill` (999px) vit au palier A mais trois fichiers de composant le
référencent directement (`badge.css`, `button.css`, `map-overlay.css`) ; et
`button-group.css` déclare `--group-radius`/`--group-padding` qui dupliquent
respectivement `--radius-pill` et une valeur hors échelle — nommées en
exception plutôt que masquées, un témoin les vide et rougit si on les tolère
en silence.

## La couleur

> « Be judicious with your use of color in controls and navigation so they stay
> legible. »
> « Keep the number of prominent buttons to one or two per view. »
> « To emphasize primary actions, apply color to the background rather than to
> symbols or text. »

**Une action teintée par écran**, et c'est celle qui donne son sens à l'écran :
« Suivre » sur l'éditeur, « Nouveau trajet » sur la liste. Tout le reste est
monochrome ou porte le remplissage neutre. Les trois boutons de la barre
d'actions étaient teintés en septembre 2026 : avec « Suivre », quatre aplats
bleus, et plus rien ne disait lequel comptait.

Les actions **destructrices** font exception dans l'autre sens : le rouge est
dans le libellé, jamais en aplat sous lui — un aplat rouge attire précisément le
pouce qu'on veut voir hésiter.

Enfin, sur le verre les symboles sont monochromes :

> « Symbols and text on these elements follow a monochromatic color scheme,
> becoming darker when the underlying content is light, and lighter when it's
> dark. »

C'est la raison pour laquelle les emoji ont disparu : un emoji est une image en
couleurs, il ne sait pas s'inverser. Le jeu de symboles
([`src/shared/Icons.html`](../src/shared/Icons.html)) ne porte aucune couleur —
tout est en `currentColor`, lu depuis le jeton `--icon-stroke` de
[`components/button.css`](../src/styles/components/button.css).

**Question restée ouverte**, à trancher par une tâche munie de sa propre
vérification de contraste : `tokens/semantic.css` documente en commentaire un
écart entre les teintes historiques de l'application (`--color-warning`,
`--color-success-text`) et celles que publie la HIG — les deux valeurs sont
écrites, l'arbitrage ne l'est pas.

## La typographie

L'échelle est celle d'iOS, au corps par défaut, exprimée en fraction du corps de
texte pour suivre la taille dynamique — les onze triplets complets sont
déclarés dans [`tokens/primitives.css`](../src/styles/tokens/primitives.css)
et consommés par les onze classes de
[`components/text.css`](../src/styles/components/text.css) :

| Classe              | Corps (fraction du défaut) | Où                                           |
| ------------------- | -------------------------- | -------------------------------------------- |
| `.text-large-title` | 2rem                       | le très grand titre                          |
| `.text-title-1`     | 1.647rem                   | un titre de premier niveau                   |
| `.text-title-2`     | 1.294rem                   | le grand titre d'un écran                    |
| `.text-title-3`     | 1.176rem                   | un titre de section                          |
| `.text-headline`    | 1rem, graisse 600          | le titre d'une **barre**, le nom d'un trajet |
| `.text-body`        | 1rem                       | le texte courant                             |
| `.text-callout`     | 0.941rem                   | un texte d'accompagnement                    |
| `.text-subheadline` | 0.882rem                   | l'aide, le compte des pages                  |
| `.text-footnote`    | 0.765rem                   | les lignes d'état, les libellés serrés       |
| `.text-caption-1`   | 0.706rem                   | le numéro d'un point                         |
| `.text-caption-2`   | 0.647rem                   | le numéro d'une page                         |

Headline ne diffère de Body **que par la graisse** : c'est le geste de
hiérarchie le moins coûteux d'Apple, et le bon sur une interface dense. Un
titre de barre qui prend Title 2 Bold écrase tout et se tronque — « Paris →
Bordeaux » tombait à « Paris → Bordea… » sur 390 px, en septembre 2026.

La racine porte `font: -apple-system-body`
([`base/elements.css`](../src/styles/base/elements.css)), seul crochet que le
web offre sur la taille dynamique d'iOS : WebKit y résout la taille réellement
choisie dans les réglages, de 14 à 53 px, et tous les `rem` suivent.

**Un style est un triplet — taille, interligne, approche — jamais une part.**
C'était le défaut le plus répandu de l'ancienne feuille, et il survit à trois
endroits, documentés et assumés : `.trajet-name`/`.trajet-details`
([`components/row.css`](../src/styles/components/row.css)) et `.help`
([`components/panel.css`](../src/styles/components/panel.css)) portent chacun
un triplet complet mais **en jeton de composant**, hors de `text.css`, faute
d'avoir pu composer la classe correspondante dans les gabarits HTML qui les
utilisent — le hook TDD du dépôt a refusé cette migration à plusieurs reprises,
et l'incrément a été coupé plutôt que contourné.

## Les formes

Un contrôle est une **gélule** (`--radius-pill`, 999px). Une section est
arrondie à `--radius-section` (22 px). Un rayon **intérieur** ne s'écrit pas :
il se calcule depuis celui qui le contient, moins le rembourrage qui les
sépare — `calc(var(--group-radius) - var(--group-padding))` dans
`button-group.css`, `calc(var(--radius-section) - var(--ecart-interne))` dans
`map-overlay.css`.

> « Consider aligning the shape of controls with other rounded elements
> throughout the interface. »

Et toute cible tactile fait au moins **44 × 44 px** (`--hit-target`, palier
sémantique). Quand la taille visible porte l'information — la pastille d'un
point sur un schéma dense (`--badge-size`,
[`components/badge.css`](../src/styles/components/badge.css)) —, c'est la
cible qu'on agrandit, pas le dessin ; les contrôles de la carte, eux, gardent
délibérément 34 px, au-dessus du plancher absolu de 28 px que fixe la HIG,
parce que des contrôles à 44 px feraient déborder leur colonne.

## Ce que les réglages retirent

Trois réglages système changent le verre, et aucun ne se contente d'un
demi-geste — le mécanisme complet vit dans
[`components/surface.css`](../src/styles/components/surface.css) :

- **Transparence réduite** et **contraste renforcé** : le flou est coupé — les
  **deux** propriétés, préfixée comprise. Rendre la surface opaque ne suffit pas,
  le flou ne part pas tout seul.
- **Mouvement réduit** : les transitions cèdent, **pas** le défilement
  automatique — il _est_ la fonction de l'application
  ([`base/elements.css`](../src/styles/base/elements.css)).

iOS ne publie toujours pas `prefers-reduced-transparency` : la requête ne couvre
donc pas la plateforme où le verre est le plus visible. C'est pourquoi le
contraste renforcé partage la même liste :
`@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)`.

## Les pièges de moteur, tous mesurés

Ceux-là ne se devinent pas, et chacun a coûté un défaut visible en septembre
2026 :

1. **`-webkit-backdrop-filter` doit précéder `backdrop-filter`**, avec la même
   valeur. Un iPhone sous iOS 16 ou 17 ne lit que la préfixée.
2. **Pas de `var()` dans un `backdrop-filter`** : WebKit l'ignore. `--surface-blur`
   (`components/surface.css`) documente le plafond (20 px) en commentaire, mais
   la valeur elle-même reste écrite en clair dans les deux déclarations.
3. **Le fond opaque de repli et le verre sont deux blocs `@supports`
   mutuellement exclusifs, dans la même couche `components`.** Le repli
   opaque a longtemps été écrit sans condition, en confiance que sa position
   plus loin dans le fichier suffirait à le faire gagner sur un moteur
   partiel — ce qui tenait tant que tout vivait dans une seule couche. Depuis
   que le verre vit dans `@layer components`, une déclaration inconditionnelle
   ailleurs dans une couche déclarée **après** (`screens`) l'emporterait
   toujours, même sur un moteur qui sait faire le flou : le repli doit donc
   être son propre `@supports not`, pas une règle « par défaut ». La
   retraction d'accessibilité (transparence réduite, contraste renforcé) vient
   en dernier dans le fichier, pour gagner la spécificité égale contre
   celui des deux blocs qui s'est appliqué.
4. **Un conteneur de carte doit ouvrir son contexte d'empilement** (`z-index: 0`
   sur `#carte-container`,
   [`components/map-overlay.css`](../src/styles/components/map-overlay.css)).
   Les panneaux de Leaflet portent `z-index: 400` : sans cela ils remontent dans
   le contexte du parent et recouvrent tout. Le formulaire de saisie a été
   **intégralement invisible** pour cette raison, en septembre 2026.
5. **`leaflet.css` entre par `@import url(…) layer(vendor);`**
   ([`src/styles/index.css`](../src/styles/index.css)), la couche la plus basse
   de `@layer vendor, reset, tokens, base, components, screens;` — n'importe
   quelle déclaration de composant l'emporte désormais sur Leaflet quelle que
   soit sa spécificité. C'est ce qui a fait disparaître les 16 `!important` de
   réconciliation que l'ancien ordre du bundle imposait : avant l'introduction
   des couches, `leaflet.css` arrivait après la feuille de l'application et
   aucune spécificité ne pouvait plus le rattraper.
6. **Aucun filtre sur un ancêtre du verre** : il en annulerait le flou. Les
   tuiles sont donc assourdies sur `.leaflet-tile-pane`, jamais sur le
   conteneur.
7. **`viewport-fit=cover`** conditionne l'existence des `env(safe-area-inset-*)` :
   sans lui, ces fonctions valent `0px` et une barre tombe sous l'encoche.

## Les témoins

Trois familles de tests répondent à trois questions différentes, aucune ne
remplace les autres :

- **Les invariants sur la source**
  ([`src/styles/styles.test.ts`](../src/styles/styles.test.ts)) relisent la
  **source** des feuilles — jsdom n'applique aucune feuille externe, et un
  navigateur ne dirait rien d'une règle simplement absente. Ils affirment des
  **invariants**, pas des présences : aucune couleur écrite en clair hors des
  jetons, aucune taille de texte hors des onze styles d'iOS, aucun rayon
  inventé, tout jeton de couleur doublé en apparence sombre, un seul fichier
  déclarant `backdrop-filter`, la règle des paliers.
- **La géométrie mesurée**, en e2e — la hauteur des deux barres, la taille des
  pastilles, `intérieur = extérieur − rembourrage`, aucune cible sous 44 px,
  aucune surface en verre imbriquée dans une autre.
- **La régression visuelle**
  ([`e2e/visuel.spec.ts`](../e2e/visuel.spec.ts)) — six vues × trois
  apparences × cinq moteurs. Les références doivent être générées sous Linux
  (la CI compare sur `ubuntu-latest`, et Playwright suffixe ses fichiers par
  plateforme) : elles ne sont, à ce jour, pas encore committées.

**Un invariant qui ne garde rien est pire qu'absent** : il se lit comme une
protection sans en être une. Douze témoins de ce système sont passés à
l'état vert sans plus rien vérifier avant d'être corrigés — un commentaire
cité en prose, un nom de jeton lu à la place de sa valeur, une liste
manuscrite indexant un fichier disparu, entre autres mécanismes. [L'ADR 0011](adr/0011-design-system-css-natif.md#5-ce-que-le-chantier-a-coûté-et-trouvé)
les détaille et en tire la règle : sonder un témoin en mutant ce qu'il garde,
jamais en relisant sa formule.
