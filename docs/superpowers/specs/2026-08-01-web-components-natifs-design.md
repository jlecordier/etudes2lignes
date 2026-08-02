# Web components natifs — conception

Les écrans et les fragments d'interface deviennent des **custom elements**. Le
navigateur reprend à sa charge le cycle de vie que les écrans tiennent
aujourd'hui à la main, et les gabarits redeviennent du HTML.

## Constat

L'interface est en DOM natif ([ADR 0001](../../adr/0001-hexagone-sans-framework.md)),
et c'est bien ; mais elle réimplémente trois mécanismes que la plateforme sait
faire, chacun à sa façon, dans chaque écran.

| Ce qui est écrit à la main                                                             | Où                                                                    | Ce que la plateforme offre         |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| `displayToken`, incrémenté à l'affichage **et** à la sortie, relu après chaque `await` | `TrajetEditorScreen.ts:59`, `SuiviScreen.ts:63`                       | `this.isConnected`                 |
| `leaveScreen()` / `quitter()` : arrêter les sources, relâcher le verrou, vider la pile | `TrajetEditorScreen.ts:88`, `SuiviScreen.ts:114`                      | `disconnectedCallback()`           |
| La propriété des URL d'objet, et le moment de les révoquer                             | `shared/pageStack.ts` en entier — 101 lignes dont 20 de justification | `connected`/`disconnectedCallback` |
| Les écouteurs jamais retirés — `wheel` sur `window`, `resize` de Leaflet               | `SuiviScreen.ts:93`, `LeafletCarteDesPoints.ts:91`                    | `AbortController` + `{ signal }`   |
| ~150 lignes de `document.createElement` décrivant une structure figée                  | `imageFrame`, `pointMarker`, `pointRow`, `trajetRow`, `errorRow`      | `<template>`                       |

Le symptôme le plus coûteux est le troisième. L'en-tête de `pageStack.ts`
raconte une bataille perdue puis regagnée — qui possède l'URL, pourquoi la
révoquer sans retirer le `<img>` ne libère rien, qu'une page décodée pèse une
trentaine de mégaoctets. Cette connaissance est aujourd'hui portée par une `Map`
et une convention. Elle peut être portée par l'attachement de l'élément au
document, que le navigateur garantit.

Deux effets de bord du même constat :

- **Aucun fichier `ui/` n'a de test.** Les écrans ne se vérifient qu'en e2e
  Playwright, parce qu'ils sont des closures soudées à `index.html` par
  `query('#id')`. Un écran fabriqué par `document.createElement` se teste en
  jsdom avec les fakes qui existent déjà.
- **`render()` rase et reconstruit tout.** Renommer un trajet, déplacer un point,
  supprimer une page : chaque écriture révoque toutes les URL et recrée tous les
  `<img>`, donc redécode le schéma entier. Sur un livret de six pages, c'est
  ~200 Mo redécodés pour un déplacement de marqueur.

## Décision

**Les écrans et les fragments d'interface sont des custom elements natifs, en
light DOM par défaut, fabriqués et détruits par la navigation.**

Trois conséquences qui définissent le reste :

1. **La fabrique reste la porte.** `main.ts` continue d'appeler
   `createTrajetEditorScreen(dependencies)` ; la fabrique rend désormais un
   `HTMLElement` au lieu d'un objet `{ show }`. Le composition root ne change
   pas de forme, et rien n'est jamais construit par le parseur HTML.
2. **Naviguer, c'est attacher et détacher.** `goTo` remplace l'enfant de
   `<main id="app">`. `disconnectedCallback` remplace `leaveScreen`,
   `stack.destroy()` et `displayToken`.
3. **Le gabarit est du HTML, dans un fichier `.html`**, importé en `?raw` et
   cloné. Pas de chaîne de gabarit dans le TypeScript, pas de dépendance à
   `index.html`.

Ce n'est pas un framework : ce sont quatre API de la plateforme (custom
elements, `<template>`, shadow DOM, `AbortController`). [ADR 0001](../../adr/0001-hexagone-sans-framework.md)
reste vraie mot pour mot — le rendu reste **explicite**, il n'y a ni réactivité,
ni observateur, ni cycle de rendu.

### Le style retenu : « HTML web components »

Le shadow DOM n'est pris que là où il ne coûte rien : **un seul élément**,
`<schema-page>`, dont l'intérieur est un `<img>` et rien d'autre. Tous les
autres vivent en light DOM et restent habillés par `src/style.css`.

C'est le style dit _HTML web components_ : le custom element enrichit du balisage
existant au lieu de le remplacer. Ici il achète trois choses concrètes :

- la CSS ne bouge pas — `.image-frame` devient le sélecteur d'élément
  `image-frame`, un renommage mécanique, sans réécriture de règle ;
- les sélecteurs e2e (`getByRole`, `.image-area`, `#input-images`) restent vrais
  sans dépendre de la traversée des shadow roots ;
- la carte Leaflet reste un enfant ordinaire du document (voir plus bas — elle
  ne survit pas au shadow DOM).

## Alternatives écartées

**Shadow DOM partout, la carte servie par un `<slot>`.** Techniquement correct
et c'est la réponse canonique au problème Leaflet. Mais il faut alors répartir
413 lignes de `style.css` entre sept gabarits, sans aucun test de régression
visuelle pour le prouver, et dupliquer les styles de bouton dans chaque gabarit
qui contient un bouton (les classes globales ne traversent pas). Beaucoup de
risque pour une encapsulation dont rien ici ne manque : l'application est un
document unique, pas une bibliothèque distribuée. À reprendre le jour où un
élément est extrait pour être réutilisé ailleurs.

**Garder les écrans en closures et ne convertir que les feuilles.** Réglait le
câblage impératif et les 30 Mo, mais laissait `displayToken`, `leaveScreen` et
l'absence de test unitaire d'écran exactement où ils sont — deux des quatre
objectifs.

**Constructeur à arguments** (`new TrajetEditorScreenElement(dependencies)`).
Compile — `CustomElementConstructor` est typé `new (...params: any[])` — et
marche tant que l'élément n'est ni écrit dans du HTML, ni cloné. Mais le champ
serait typé `Dependencies` alors qu'il vaudrait `undefined` sur le chemin du
parseur : exactement le mensonge de typage que l'[ADR 0002](../../adr/0002-lint-type-aware-strict.md)
proscrit. On garde `Dependencies | null` et une garde qui lève.

**`:state()` au lieu de `classList.toggle('placement-active')`.** Baseline
depuis mai 2024, et sémantiquement juste — un état interne que la CSS lit et que
personne ne peut écraser en touchant `className`. Écarté : **jsdom 29.1.1 rend
un `ElementInternals` sans `states`**, donc `internals.states.add(…)` lève, donc
tout test unitaire de l'élément plante. À reprendre quand jsdom suivra.

**Feuilles de style constructibles** (`adoptedStyleSheets`). Même raison :
`undefined` sur `ShadowRoot` en jsdom 29.1.1. Le seul élément à shadow DOM porte
son `<style>` dans son gabarit.

**Declarative Shadow DOM dans `index.html`.** Devient _Baseline widely
available_ le 20 août 2026, mais ne sert que si l'élément est présent dans le
HTML initial — or aucun ne l'est, ils sont tous fabriqués. Et jsdom ne le parse
pas.

**Registres scopés et `moveBefore()`.** Les registres manquent à Firefox (retenus
dans Interop 2026) ; `moveBefore` manque à Safari, et l'application vise
l'iPad. À revoir dans six à douze mois — `moveBefore` supprimerait la garde
décrite en _Réconciliation_ ci-dessous.

**`createButton` en `<action-button>`.** Aucun gain : la fabrique actuelle est
courte, testée, et impose déjà `ariaLabel`. Un custom element autour d'un
`<button>` ajouterait la délégation de focus et un nom accessible à
re-exposer, pour rien. `shared/elements.ts` ne bouge pas.

## Conception

### Les familles d'éléments

La règle de dépendance de l'hexagone décide de l'emplacement, comme pour le
reste : un élément qui ne connaît pas le domaine est partagé, un élément qui le
connaît appartient à sa capacité.

| Élément                  | Fichier                                | Connaît           | DOM    |
| ------------------------ | -------------------------------------- | ----------------- | ------ |
| `<schema-page>`          | `src/shared/SchemaPage.ts`             | `DisplayablePage` | shadow |
| `<image-frame>`          | `src/trajets/ui/ImageFrame.ts`         | `ImageDeTrajet`   | light  |
| `<point-marker>`         | `src/trajets/ui/PointMarker.ts`        | `Point`           | light  |
| `<point-row>`            | `src/trajets/ui/PointRow.ts`           | `Point`           | light  |
| `<trajet-row>`           | `src/trajets/ui/TrajetRow.ts`          | `TrajetSummary`   | light  |
| `<trajets-list-screen>`  | `src/trajets/ui/TrajetsListScreen.ts`  | ports + domaine   | light  |
| `<trajet-editor-screen>` | `src/trajets/ui/TrajetEditorScreen.ts` | ports + domaine   | light  |
| `<suivi-screen>`         | `src/suivi/ui/SuiviScreen.ts`          | ports + domaine   | light  |

`<schema-page>` est dans `shared/` pour la même raison que `pageStack.ts` y
était : elle déclare sa propre `DisplayablePage`, à laquelle `ImageDeTrajet`
s'assigne structurellement. Les deux écrans l'utilisent, aucun domaine n'est
requis.

**Nommage.** Les noms suivent l'[ADR 0007](../../adr/0007-langue-du-code-metier-francais-technique-anglais.md)
mot à mot, ordre anglais : `schema` et `page` sont au lexique métier, `frame`,
`marker`, `row`, `screen` sont au tableau des traductions retenues. L'accent de
`schéma` tombe dans le nom de balise, comme il tombe déjà dans `.image-frame`.
`<image-frame>` reprend le mot déjà écrit dans la CSS et les e2e plutôt que d'en
introduire un second pour le même objet ; unifier `image` et `page` dans tout le
dépôt est un autre chantier, qui n'appartient pas à celui-ci.

### Données en entrée, intentions en sortie

Une feuille reçoit ses **données par propriété** et émet ses **intentions par
`CustomEvent`** qui remonte (`bubbles: true`). Elle n'appelle jamais l'agrégat
ni un port : l'écran écoute et décide.

```ts
// src/trajets/ui/TrajetRow.ts
export interface TrajetRowIntent { readonly summary: TrajetSummary }

const frame = createTrajetRow(summary);       // <trajet-row>
// l'écran écoute une fois, sur son propre conteneur :
liste.addEventListener('delete-trajet', (event) => { … }, { signal });
```

Événements : `open-trajet`, `rename-trajet`, `export-trajet`, `delete-trajet`,
`delete-image`, `move-image` (`{ direction: 'forward' | 'backward' }`, les deux
mots des méthodes de l'agrégat), `delete-point`,
`move-point-on-image`, `move-point-on-carte`, `click-page` (`{ clientY }`),
`right-click-page`. Verbe anglais, complément français quand il est au lexique.

Le typage passe par l'augmentation de `HTMLElementEventMap` dans le module de
l'élément, pour que l'écouteur reçoive un `CustomEvent<…>` sans cast.

### L'injection : la fabrique reste la porte

```ts
class TrajetEditorScreenElement extends HTMLElement {
    #dependencies: TrajetEditorDependencies | null = null;
    #abort: AbortController | null = null;

    set dependencies(value: TrajetEditorDependencies) { this.#dependencies = value; }

    connectedCallback(): void {
        const dependencies = requireConfiguration(this.#dependencies, this);
        const abort = new AbortController();
        this.#abort = abort;
        this.replaceChildren(gabarit());
        …câblage, chaque addEventListener recevant { signal: abort.signal }…
        dependencies.run(charger(), 'l’ouverture du trajet');
    }

    disconnectedCallback(): void {
        this.#abort?.abort();
        this.#abort = null;
    }
}
customElements.define('trajet-editor-screen', TrajetEditorScreenElement);

export function createTrajetEditorScreen(
    dependencies: TrajetEditorDependencies,
): HTMLElement {
    const element = new TrajetEditorScreenElement();
    element.dependencies = dependencies;
    return element;
}
```

L'élément n'est jamais attaché sans ses dépendances, parce que la fabrique est
le seul moyen d'en obtenir un et qu'elle les pose avant de rendre l'élément.
`requireConfiguration` (`src/shared/dom.ts`, aux côtés de `query`) est donc une
**garde inatteignable** au sens du glossaire : conservée uniquement parce que
`!` est banni, elle survivra aux tests de mutation, et c'est commenté sur place.
Elle a la même forme que `requireElementAt` et `requireDefined`.

`query('#points-list', HTMLOListElement, this)` fonctionne tel quel : `query`
accepte déjà une racine, et vérifie le type par `instanceof` — y compris pour
nos propres classes (`query('schema-page', SchemaPageElement, root)`), ce qui
supprime le besoin d'un cast à la relecture du DOM.

### Le cycle de vie

`connectedCallback` monte, `disconnectedCallback` démonte. Ce que ça remplace,
écran par écran :

| Aujourd'hui                                       | Demain                                         |
| ------------------------------------------------- | ---------------------------------------------- |
| `displayToken` relu après chaque `await`          | `if (!this.isConnected) return;`               |
| `stack.destroy()`                                 | rien — les `<schema-page>` filles se détachent |
| `realSource.stop()`, `simulation.stop()`          | dans `disconnectedCallback`                    |
| `screenWakeLock.release()`                        | dans `disconnectedCallback`                    |
| écouteur `wheel` sur `window`, jamais retiré      | `{ signal }`                                   |
| `screen.hidden` testé dans `switchToManualScroll` | `this.isConnected`                             |

`navigation.ts` se réduit à :

```ts
/** Un seul écran à la fois : attacher le nouveau détache l'ancien. */
export function goTo(screen: HTMLElement): void {
    query('#app', HTMLElement).replaceChildren(screen);
}
```

`ScreenName` et `showScreen` disparaissent, et avec eux le couplage par chaîne
entre l'union TypeScript et les `id` de `index.html` que le fichier documentait
comme un risque. La superposition de carte (`#screen-carte`) reste un frère
statique de `<main id="app">`, hors du remplacement — elle l'était déjà
conceptuellement, elle l'est désormais structurellement.

`index.html` passe de 118 à ~35 lignes : le `<main>`, la superposition de carte,
le script.

### Les gabarits

Un fichier `.html` par élément, à côté de son `.ts`, importé en `?raw` :

```ts
import html from './TrajetEditorScreen.html?raw';
import { createTemplate } from '../../shared/template';

let template: HTMLTemplateElement | null = null;
function gabarit(): Node {
    template ??= createTemplate(html);
    return template.content.cloneNode(true);
}
```

Le `?raw` est typé par `vite/client`, déjà dans `tsconfig.json` — aucun `as`.
Le gabarit est compilé une fois par module et cloné ensuite. La compilation est
**paresseuse** : un `document.createElement` au chargement du module casserait
tout test tournant hors jsdom.

Prettier formate déjà `*.html` (`lint-staged`), et l'éditeur colore le fichier —
deux choses qu'une chaîne de gabarit dans le TypeScript ne donne pas.

### `<schema-page>` : la propriété des 30 Mo

Le seul élément à shadow DOM, et le cœur du gain.

```ts
class SchemaPageElement extends HTMLElement {
    #page: DisplayablePage | null = null;
    #urls: ObjectUrls = browserUrls;   // injectable : jsdom n'a pas createObjectURL
    #url: string | null = null;

    connectedCallback(): void {
        const page = requireConfiguration(this.#page, this);
        const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        this.#url = this.#urls.create(page.blob);
        root.replaceChildren(gabarit());        // <style>:host{display:block}</style><img>
        …src, alt, width, height, loading="lazy", decoding="async"…
    }

    disconnectedCallback(): void {
        // Un déplacement dans le DOM détache puis rattache dans la même tâche :
        // révoquer tout de suite tuerait une page qui n'a fait que bouger.
        queueMicrotask(() => { if (!this.isConnected) { …révoquer… } });
    }
}
```

Deux points non négociables :

- **`:host { display: block }`.** Un custom element est `inline` par défaut ;
  `SuiviScreen.voyageEtapes` mesure `getBoundingClientRect()` sur la page pour
  calculer les offsets. Un hôte inline rendrait des offsets faux, donc un
  défilement faux — le cœur métier de l'application.
- **La révocation différée.** C'est la garde que `moveBefore()` rendra inutile
  le jour où Safari l'implémentera ; la raison est écrite sur place, avec le nom
  de l'API qui la remplacera.

`shared/pageStack.ts` et son test disparaissent. `stack.pageElement(id)` devient
une requête typée sur le DOM ; `ObjectUrls` migre dans `SchemaPage.ts`.

### Ce que la carte impose

`LeafletCarteDesPoints` prend un `containerId` et fait `L.map(this.containerId)`
une fois, en mémorisant la carte (`LeafletCarteDesPoints.ts:86`). Si l'écran
d'édition est détruit puis recréé, le conteneur est un **nouvel** élément et la
carte mémorisée pointe sur un détaché : la carte devient blanche à la deuxième
ouverture. C'est le seul endroit où la décision casse quelque chose, et il faut
le traiter dans le même lot.

Le port `CarteDesPoints` gagne donc son cycle de vie :

```ts
mount(container: HTMLElement): void;   // appelé par connectedCallback
unmount(): void;                       // appelé par disconnectedCallback
```

`LeafletCarteDesPoints` perd son `containerId` (donc `main.ts` l'instancie sans
argument), monte sur l'élément qu'on lui donne et, à `unmount`, appelle
`carte.remove()` de Leaflet. Au passage, l'écouteur `resize` posé à
l'initialisation (`LeafletCarteDesPoints.ts:91`) reçoit enfin son `{ signal }` :
c'est une fuite existante, que la conversion révèle et corrige.

`LeafletCoordonneeSelector` n'est pas concerné : il interroge la superposition
`#screen-carte`, qui reste statique.

### Réconciliation

`render()` cesse de raser. Les `<schema-page>` sont identifiées par leur page :
un rendu ne recrée que celles qui manquent, ne retire que celles qui sont
parties, et laisse les autres en place — donc décodées, donc sans coût.

C'est un lot séparé, prouvé par son propre test (compter les créations et
révocations d'URL au fil d'une suite d'opérations), parce que c'est le seul
endroit où une erreur se paie en mémoire plutôt qu'en affichage.

## Ce que jsdom autorise

Mesuré sur jsdom 29.1.1, la version du dépôt. Ce tableau justifie plusieurs
décisions ci-dessus ; le refaire après une montée de version dit tout de suite
ce qui se débloque.

| Capacité                                                                 | jsdom 29.1.1   |
| ------------------------------------------------------------------------ | -------------- |
| `customElements.define`, `connected`/`disconnectedCallback`, reconnexion | ✅             |
| `addEventListener(…, { signal })`                                        | ✅             |
| `attachShadow`, `<template>`, `cloneNode`                                | ✅             |
| `attachInternals().states` (`:state()`)                                  | ❌ absent      |
| `adoptedStyleSheets`                                                     | ❌ `undefined` |
| Declarative Shadow DOM au parsing                                        | ❌             |
| `URL.createObjectURL`                                                    | ❌ `undefined` |
| `moveBefore`                                                             | ❌             |

## Lots

Chaque lot est gardé par ses tests et laisse le dépôt vert. L'ordre va du plus
isolé au plus emmêlé.

**Lot 1 — `<schema-page>` remplace `pageStack`.**
L'élément, son gabarit, `createTemplate` (`shared/template.ts` — « gabarit »
n'étant pas au lexique, le nom passe à l'anglais), `requireConfiguration`. Les deux écrans
créent des `<schema-page>` au lieu d'appeler `stack.render`. `pageStack.ts` et
son test sont supprimés. Aucun écran n'est encore un élément.
_Preuve_ : tests unitaires jsdom sur la vie de l'URL (créée à l'attachement,
révoquée au détachement, **non** révoquée sur un déplacement, recréée à la
reconnexion) + `e2e/suivi` et `e2e/editeur` inchangés et verts.

**Lot 2 — `<suivi-screen>`, et `goTo` prend un élément.**
Le plus petit écran (264 lignes) et celui qui a la fuite d'écouteur. `goTo`
accepte un élément ; les deux écrans encore en closures gardent le chemin
`hidden` par une branche transitoire, explicitement datée pour le lot 4.
_Preuve_ : premier test unitaire d'écran — sources de position fakes, faux
premier plan, faux verrou ; attacher, pousser une position, lire le défilement
demandé ; détacher, pousser une position, vérifier que plus rien ne bouge.

**Lot 3 — `<trajet-editor-screen>`, `<image-frame>`, `<point-marker>`,
`<point-row>`, et le cycle de vie de la carte.**
Le gros morceau : 552 lignes qui doivent tomber sous 300. Inclut `mount`/
`unmount` sur `CarteDesPoints` et le `{ signal }` sur le `resize` de Leaflet.
_Preuve_ : tests unitaires de chaque feuille (données en entrée → DOM produit ;
geste → événement émis) ; test d'écran sur le chemin d'écriture
(`applyToTrajetAndSave` : échec du dépôt ⇒ resynchronisation) ; `e2e/editeur`,
`e2e/points`, `e2e/carte-editeur` verts, **et** une deuxième ouverture de
l'éditeur dans le même parcours, qui prouve la carte remontée.

**Lot 4 — `<trajets-list-screen>`, `<trajet-row>`, suppression de
l'échafaudage.**
La branche `hidden` de `goTo`, `ScreenName`, `showScreen` et les `<section>` de
`index.html` disparaissent.
_Preuve_ : test d'écran sur la liste, dont le chemin d'erreur (`errorRow`) que
rien ne couvre aujourd'hui ; `e2e/import-export` et `e2e/horsligne` verts.

**Lot 5 — Réconciliation des pages.**
_Preuve_ : un test qui compte créations et révocations d'URL sur une suite
d'opérations (ajouter un point, renommer, supprimer une page) et n'en tolère
aucune sur les pages inchangées.

**Lot 6 — Documentation.**
Un ADR 0008 « Interface en custom elements natifs » ; `AGENTS.md`
(la ligne « écrans = adapters entrants en DOM natif » gagne « custom elements ») ;
`docs/ARCHITECTURE.md` (la section UI, et le port `CarteDesPoints` qui gagne
deux méthodes) ; `docs/GLOSSAIRE.md` (les noms d'éléments et les noms
d'événements) ; `docs/EXIGENCES.md` si un comportement nouveau apparaît.

## Tests

La démarche ne change pas : BDD par l'état, fakes écrits à la main, aucune
assertion sur des appels ([ADR 0006](../../adr/0006-tests-de-mutation-stryker.md)).
Ce que la conversion **ajoute**, c'est un niveau qui n'existait pas.

Un test d'écran a la forme suivante, et n'a besoin d'aucun échafaudage nouveau :

```ts
// @vitest-environment jsdom
const element = createSuiviScreen({ repository: fakeRepository, realSource: fakeSource, … });
document.body.append(element);          // ⇒ connectedCallback
fakeSource.emettre(uneCoordonnee);
expect(defilementsDemandes).toEqual([…]);
element.remove();                       // ⇒ disconnectedCallback
fakeSource.emettre(uneAutreCoordonnee);
expect(defilementsDemandes).toHaveLength(1);   // le démontage a bien coupé
```

Les fakes existent déjà pour la plupart (`fakeForeground.ts`,
`SimulationPositionSource`, `fake-indexeddb`). Manquent : un faux
`CoordonneeSelector`, un faux `CarteDesPoints`, un faux `ScreenWakeLock`, un faux
`ObjectUrls` (celui de `pageStack.test.ts`, qui déménage).

Les e2e ne changent pas de contenu. Ils changent de rôle : ils cessent d'être le
**seul** témoin des écrans pour redevenir ce qu'ils sont — la preuve que le tout
marche dans un vrai navigateur.

`pnpm mutation` est relancé après le lot 3 et le lot 5 sur `shared/` et
`trajets/`, pour vérifier que les nouveaux tests d'écran tuent réellement des
mutants et ne se contentent pas de faire monter la couverture.

## Vérification

1. `pnpm quality` à chaque lot.
2. `pnpm test:e2e` complet aux lots 3 et 4 — c'est là que les sélecteurs
   risquent quelque chose. Les cinq navigateurs, pas seulement Chromium.
3. Contrôle visuel au MCP Playwright après le lot 3 : importer les pages de
   `pmpbxenjpeg/`, poser deux points, sortir vers la liste, **rouvrir** l'éditeur
   — c'est la seconde ouverture qui prouve le remontage de la carte. Deux
   géométries : 1280 (grand écran, carte intégrée) et iPhone (carte plein écran).
4. Après le lot 5, mesurer : un déplacement de marqueur ne doit produire aucune
   création d'URL d'objet.

## Risques

**Le lot 3 est gros.** 552 lignes réparties entre quatre fichiers, plus un port
qui change. C'est le lot où l'on peut casser sans s'en apercevoir, parce que
l'éditeur est aussi l'écran le moins couvert. Atténuation : les feuilles
d'abord, chacune avec son test, l'écran ensuite ; et le parcours de contrôle
visuel ci-dessus, qui vise précisément ce que les e2e ne regardent pas (la
deuxième ouverture).

**Le `display` de chaque élément.** Cinq éléments passent en light DOM et
héritent de `display: inline`. Les règles CSS existantes ciblaient des `div`,
`li`, `ol`. Chaque renommage de sélecteur doit poser le `display` explicitement.
Un oubli se voit à l'œil, pas au test — d'où le contrôle visuel.

**Playwright et les shadow roots.** Un seul élément a un shadow root, et les
sélecteurs e2e ne visent rien à l'intérieur. Le risque est faible, mais il se
vérifie au lot 1 en lançant la suite complète, pas en le supposant.
