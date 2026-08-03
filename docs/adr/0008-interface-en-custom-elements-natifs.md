# ADR 0008 — Interface en custom elements natifs

- **Statut** : Acceptée (2026-08-02)
- **Complète** : [ADR 0001](0001-hexagone-sans-framework.md)

## Contexte

Les écrans étaient des closures soudées à `index.html` par `query('#id')`.
Trois mécanismes que la plateforme sait faire y étaient réécrits à la main, un
peu différemment dans chacun :

- un **jeton d'affichage** incrémenté à l'entrée et à la sortie, relu après
  chaque `await`, pour ignorer un chargement devenu périmé ;
- une **méthode de sortie** (`leaveScreen`, `quitter`) qu'il fallait penser à
  appeler pour arrêter les sources, relâcher le verrou d'écran, vider la pile ;
- la **propriété des URL d'objet** des pages, tenue par une `Map` et une
  convention — alors qu'une page de schéma décodée pèse une trentaine de
  mégaoctets, et que la révoquer sans retirer son `<img>` ne libère rien.

Deux écouteurs n'étaient jamais retirés (`wheel` sur `window`, `resize` de
Leaflet), et aucun fichier `ui/` n'avait de test : les écrans ne se vérifiaient
qu'en bout de chaîne, dans un navigateur.

## Décision

**Les écrans et les fragments d'interface sont des custom elements natifs, en
light DOM par défaut, fabriqués et détruits par la navigation.**

- **La fabrique reste la porte.** Le navigateur construit les custom elements
  lui-même : rien ne peut leur être passé par constructeur. La configuration
  arrive par propriété, et la fabrique la pose **avant** de rendre l'élément —
  `connectedCallback` la trouve donc toujours. `defineScreen`
  (`src/shared/screen.ts`) porte ce contrat une fois pour les trois écrans.
- **Naviguer, c'est attacher et détacher.** `goToScreen` remplace l'enfant de
  `<main id="app">`. Le détachement avorte un `AbortSignal` : les écouteurs
  posés avec lui partent, y compris ceux posés sur `window`, et le rangement
  s'y branche.
- **Le gabarit est du HTML**, dans un fichier `.html` à côté de son `.ts`,
  importé en `?raw` et cloné.
- **Données en entrée, intentions en sortie.** Une feuille reçoit ses données par
  propriété et émet des `CustomEvent` qui remontent ; l'écran écoute une fois,
  sur sa racine.

Ce n'est pas un framework : ce sont quatre API de la plateforme (custom
elements, `<template>`, shadow DOM, `AbortController`). L'[ADR 0001](0001-hexagone-sans-framework.md)
reste vraie mot pour mot — le rendu demeure **explicite**, il n'y a ni
réactivité, ni observateur, ni cycle de rendu.

### Le shadow DOM n'est pris que là où il ne coûte rien

Un seul élément en a un : `<schema-page>`, dont l'intérieur est un `<img>` et
rien d'autre. Tous les autres vivent en light DOM et restent habillés par
`src/style.css` — le style dit _HTML web components_.

Encapsuler partout aurait obligé à répartir 413 lignes de feuille de style entre
sept gabarits sans aucun test de régression visuelle pour le prouver, et à
dupliquer les styles de bouton dans chaque gabarit qui en contient (les classes
globales ne traversent pas la frontière). Beaucoup de risque pour une
encapsulation dont rien ici ne manque : l'application est un document unique,
pas une bibliothèque distribuée.

## Conséquences

- ➕ Le cycle de vie est garanti par le navigateur, pas par une discipline. Les
  URL d'objet, les sources de position, le verrou d'écran et les écouteurs se
  libèrent au détachement, sans appel à ne pas oublier.
- ➕ Les écrans se testent en jsdom avec les fakes existants : le dossier `ui/`
  passe de zéro test à vingt-cinq.
- ➕ Le balisage redevient du HTML : plus un seul `document.createElement` dans
  les écrans.
- ➖ Un custom element est `inline` par défaut. Chaque élément doit poser son
  `display` — un oubli se voit à l'œil, pas au test.
- ➖ Un custom element ne peut pas être un `<li>` : les éléments intégrés
  personnalisés (`<li is="…">`) n'arriveront pas, WebKit s'y refuse depuis 2018.
  Les listes portent donc `role="list"` et leurs lignes `role="listitem"`.
- ➖ Le port `CarteDesPoints` gagne `mount`/`unmount` : Leaflet mémorisait sa
  carte au premier usage, et serait resté accroché au conteneur de la visite
  précédente.

## Écartées

- **`:state()`** au lieu d'une classe pour l'état de placement. Baseline depuis
  mai 2024 et sémantiquement juste, mais **jsdom 29.1.1 rend un
  `ElementInternals` sans `states`** : l'appel lève, donc tout test unitaire de
  l'élément plante. À reprendre quand jsdom suivra.
- **Feuilles de style constructibles** (`adoptedStyleSheets`) : `undefined` sur
  `ShadowRoot` en jsdom 29.1.1. Le seul élément à shadow DOM porte son `<style>`
  dans son gabarit.
- **Declarative Shadow DOM** dans `index.html` : ne sert que si l'élément est
  présent dans le HTML initial, or aucun ne l'est — ils sont tous fabriqués.
- **Registres scopés** (manquent à Firefox, retenus dans Interop 2026) et
  **`moveBefore()`** (manque à Safari, et l'application vise l'iPad). À revoir
  dans six à douze mois : `moveBefore` supprimerait la libération différée de
  `<schema-page>`.
- **`createButton` en `<action-button>`** : aucun gain. La fabrique est courte,
  testée, et impose déjà `ariaLabel` ; un custom element autour d'un `<button>`
  n'ajouterait que de la délégation de focus et un nom accessible à ré-exposer.

Conception détaillée :
[`../superpowers/specs/2026-08-01-web-components-natifs-design.md`](../superpowers/specs/2026-08-01-web-components-natifs-design.md).
