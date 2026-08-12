# Glisser un point sur la pile — conception

Déplacer un point sur son schéma demande aujourd'hui deux gestes en deux temps :
le bouton 🖼️ du repère arme un mode, puis un clic sur l'image dit la nouvelle
hauteur. C'est le seul chemin, et il oblige à viser à l'aveugle — on ne voit où
le point atterrit qu'une fois posé.

Le geste direct manquait : **maintenir la pastille et glisser.**

La carte, elle, l'a depuis toujours — `L.marker(…, { draggable: true })` avec un
clic par-dessus. Le repère du schéma porte le même symbole numéroté ([GR-13](../../EXIGENCES.md))
et, depuis la veille, la même action au clic. Il lui manquait le même glisser.

## Décision

### Le repère suit le doigt, pages comprises

```
┌──────────────────┐        ┌──────────────────┐
│ page 2           │        │ page 2           │
│  ── (3) ●        │        │                  │
│         ╲        │  ───►  │                  │
├──────────┼───────┤        ├──────────────────┤
│ page 1   ╲       │        │ page 1           │
│           ●      │        │  ── (3)          │
└──────────────────┘        └──────────────────┘
   on tire vers le bas         le point a changé de page
```

Le trait et sa pastille se déplacent **réellement** pendant le geste, y compris
d'une page à l'autre : ce qu'on voit avant de lâcher est ce qu'on obtient.
`movePointOnImage(pointId, imageId, fraction)` existe déjà à l'agrégat — c'est ce
que le bouton 🖼️ appelle — et prend justement l'identifiant de l'image. Traverser
les pages ne demande donc rien au domaine.

**Relâcher hors de toute page garde la dernière position survolée.** Un
interstice entre deux pages, ou un doigt qui sort de la pile, ne doit pas annuler
un geste abouti — l'utilisateur a vu le repère à sa place, il l'y attend.

**Le bouton 🖼️ reste.** Il traverse une pile plus haute que l'écran, ce que le
glisser ne sait pas faire sans auto-défilement, et il est le seul chemin au
clavier.

### Clic ou glisser : trois pixels

Seuil de **3 px**, celui du `clickTolerance` de Leaflet. La pastille de la carte
tranche déjà ainsi ; les deux vues se comporteront pareil, ce qui est la raison
d'être du symbole commun.

Le tri se fait tout seul dans le flux : sous le seuil, rien n'est jamais émis, le
flux se termine vide. **La suppression du clic qui suit devient donc « le flux
a-t-il émis ? »**, et l'ordre du DOM le permet — `pointerup` précède toujours
`click`.

Le clic est alors avalé **à la capture, sur la pile** : un écouteur d'un seul
coup, posé le temps du `click` qui suit un glisser abouti, qui appelle
`stopPropagation()`. La phase de capture précédant la cible, l'écouteur de la
pastille n'est jamais atteint — et `PointMarker.ts` n'a donc rien à savoir de
tout ceci. Le module possède le geste **et** sa conséquence sur le clic.

### Où le geste vit

Un glisser qui traverse les pages n'appartient pas au repère : une feuille ne
connaît pas la pile. Le mettre dans `TrajetEditorScreen.ts`, déjà long, y
ajouterait un geste à état.

D'où un module dédié, `src/trajets/ui/dragPointOnStack.ts`, qui expose un
**flux de glissers achevés** ; l'écran s'y abonne comme aux intentions, avec son
`takeUntil(parti$)` :

```ts
/** Un point là où le doigt l'a laissé : de quoi appeler l'agrégat, rien de plus. */
export interface DroppedPoint {
    readonly pointId: PointId;
    readonly imageId: ImageId;
    readonly fraction: FractionVerticale;
}

export function dragsOnStack(stack: HTMLElement): Observable<DroppedPoint>;
```

> `pile` n'apparaît dans aucun de ces deux noms : le glossaire ([Mots à double
> vie](../../GLOSSAIRE.md#mots-à-double-vie)) le classe technique sans
> exception, donc toujours `stack`. `glisser` et `dépose`, eux, sont simplement
> absents du Lexique métier — anglais par défaut, d'où `drag` et `Dropped`.

La forme suit l'[ADR 0009](../../adr/0009-flux-du-temps-en-rxjs.md) — un glisser
_est_ un flux, et sa concurrence se dit par un opérateur nommé :

```ts
eventsOf(stack, 'pointerdown').pipe(
    map(pastilleVisee),
    filter(estDefinie),
    exhaustMap((depart) =>
        eventsOf(stack, 'pointermove').pipe(
            takeUntil(eventsOf(stack, 'pointerup')),
            skipWhile((move) => ecart(move, depart) < SEUIL_DE_GLISSER),
            tap(poserLeRepere),
            takeLast(1),
            map(cibleFinale),
        ),
    ),
);
```

`exhaustMap` et non `switchMap` : un second doigt posé pendant un glisser ne doit
pas en démarrer un autre, il doit être ignoré.

### La capture se pose sur la pile, pas sur la pastille

À chaque mouvement, on cherche la `.image-area` dont le cadre contient le
`clientY` — le X ne compte pas, les pages sont empilées en pleine largeur. Si la
page cible change, le repère est **reposé dedans** (`cible.append(repere)`), puis
`style.top` le place à sa fraction.

Encore faut-il pouvoir **nommer** cette page. `<image-frame>` est aujourd'hui une
classe vide : elle referme son `imageId` dans sa fabrique sans l'exposer. Le
`<schema-page>` qu'elle contient porte bien un `pageId` qui est cet identifiant,
mais typé `string` là où `ImageId` est **marqué** — s'en servir demanderait un
`as`, que l'[ADR 0002](../../adr/0002-lint-type-aware-strict.md) bannit. `<image-frame>`
gagne donc un accesseur `imageId`, exactement comme `<point-marker>` a un
`pointId` et pour la même raison : « pour le retrouver dans la pile ».

C'est ce reparentage qui impose la capture sur la pile : **un élément retiré du
document perd sa capture de pointeur**, et le repère la perdrait au premier
changement de page. Capturer plus haut que ce qu'on déplace n'est pas un détail
d'implémentation, c'est ce qui rend le geste possible.

### Aucune écriture pendant le geste

`render()` fait `replaceChildren` sur la pile : enregistrer en cours de route
arracherait le nœud qu'on est en train de déplacer. L'écriture n'a donc lieu
qu'au relâchement, par le chemin unique existant —
`applyToTrajetAndSave(t => t.movePointOnImage(…))`, que la file sérialise déjà.

Conséquence à connaître : **les numéros ne bougent pas pendant le glisser.** Un
point déplacé change de rang dans le voyage, et ses voisins avec lui ; c'est le
rendu qui suit l'enregistrement qui renumérote. Recalculer l'ordre à chaque
mouvement coûterait cher pour une information qu'on ne lit pas en glissant.

### Ce que la feuille de style ajoute

```css
point-marker .point-number {
    /* Sans quoi le doigt fait défiler la page au lieu de glisser le point. */
    touch-action: none;
}

point-marker .point-number:active {
    cursor: grabbing;
}
```

Le curseur reste `pointer` au survol : la pastille annonce d'abord ce qu'un clic
en fait — ouvrir la carte —, et confirme le glisser au moment où il commence.
C'est un écart assumé avec le marqueur de la carte, qui montre `grab` dès le
survol.

Le mode placement ne demande rien de plus :
`.placement-active .point-number { pointer-events: none }` coupe déjà le clic
**et** le glisser, et le garde d'état couvre le clavier.

## Ce qui bouge

| Fichier                                       | Nature                                      |
| --------------------------------------------- | ------------------------------------------- |
| `src/trajets/ui/dragPointOnStack.ts` + test   | **créé** — le flux de glissers achevés      |
| `src/trajets/ui/TrajetEditorScreen.ts` + test | s'y abonne, enregistre au relâchement       |
| `src/trajets/ui/ImageFrame.ts`                | expose `imageId`, pour nommer la page visée |
| `src/style.css`                               | `touch-action`, `cursor: grabbing`          |
| `e2e/points.spec.ts`                          | le glisser, et le clic qui ne déplace rien  |
| `docs/EXIGENCES.md`                           | une ligne                                   |

`PointMarker.ts` **ne bouge pas** : le clic à supprimer est intercepté à la
capture, avant de l'atteindre. Le repère reste une feuille qui annonce, sans rien
savoir du geste qui le déplace.

Rien au domaine, rien aux ports, rien à la persistance : `movePointOnImage` est
déjà là et fait déjà exactement ça.

## Ce que les tests prouvent

| Fichier                      | Ce qu'il prouve                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dragPointOnStack.test.ts`   | Un mouvement de 2 px n'émet rien ; 40 px émettent la fraction d'arrivée ; passer sur une autre page émet **son** identifiant ; relâcher hors de la pile garde la dernière cible valide ; un second doigt ne démarre pas un second glisser. |
| `TrajetEditorScreen.test.ts` | Un glisser achevé enregistre le déplacement et renumérote ; un clic net ouvre toujours la carte.                                                                                                                                           |
| `e2e/points.spec.ts`         | Sur les cinq navigateurs : glisser le repère change sa hauteur ; un clic net ne le déplace pas.                                                                                                                                            |

**Les cadres sont posés à la main dans les tests unitaires.** `getBoundingClientRect`
rend zéro sous jsdom — le piège qui a déjà mordu une fois sur cette pile, où un
`FractionVerticale.fromHeight(0, 0)` levait. La suite stube déjà `scrollIntoView`
et `URL.createObjectURL` ; les cadres des fausses pages suivent la même voie.

## Écarté

- **L'auto-défilement pendant le glisser**, reporté explicitement. Sans lui, le
  geste ne porte qu'à la distance de l'écran ; c'est le bouton 🖼️ qui traverse la
  pile, et il reste. Le jour où l'auto-défilement arrive, la question des bords
  de page se reposera.
- **Borner la fraction à la page de départ.** Plus simple, mais l'agrégat sait
  déjà changer un point de page, et refuser le geste aurait été refuser ce que le
  domaine offre.
- **Un aperçu fantôme au lieu du direct.** Le repère serait resté en place et une
  ligne l'aurait suivi : deux marques à l'écran, et un saut au relâchement. Le
  déplacement réel évite d'avoir à dessiner puis entretenir cette seconde marque.
- **`cursor: grab` dès le survol**, comme sur la carte. Il aurait effacé
  l'annonce du clic, qui est l'action que le repère venait de gagner.
- **Glisser par le trait** plutôt que par la pastille. Le trait traverse la page
  entière : il volerait les clics de placement sur toute la largeur.
- **Une quatrième poignée dans `.point-actions`.** La conception de la veille a
  déjà écarté un quatrième bouton pour l'action de carte ; l'argument tient.

## Un risque, déjà mesuré une fois

La [conception du 6 août](2026-08-06-supprime-la-liste-des-points-design.md)
consigne que sur l'Android émulé de Playwright, un marqueur déplaçable ne
recevait **aucun** événement au doigt — pas même un `pointerdown` —, là où le
fond de carte les recevait tous. C'était un marqueur Leaflet et non un `<button>`
du document, mais c'est le même émulateur qui jugera le témoin. S'il s'avère
inerte là-bas, on le documentera plutôt que de fabriquer un contournement contre
une bizarrerie d'émulateur.
