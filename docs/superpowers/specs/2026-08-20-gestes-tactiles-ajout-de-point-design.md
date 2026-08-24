# Gestes tactiles pour ajouter un point — conception

Poser un point demande deux temps au doigt et un seul à la souris. Le clic droit
place un point là où il vise et enchaîne sur le choix de la coordonnée
(`ImageFrame.ts`, écouteur `contextmenu`) ; au tactile il faut d'abord appuyer sur
« Ajouter un point », puis toucher l'image. L'asymétrie est ancienne et assumée —
`TrajetEditorScreen.html` dit du bouton flottant qu'il est « indispensable au
tactile, où le clic droit n'existe pas ».

Elle cesse d'être nécessaire. **Un appui long sur l'image, ou un tap à deux
doigts, pose un point directement** — et l'appui long laisse ensuite ajuster la
hauteur avant de lâcher. Pour que ces gestes soient à nous, les gestes natifs qui
les occupent — pincement pour zoomer, appui long pour sélectionner — sont
neutralisés dans toute l'application.

Le sujet est vierge : aucune spec, aucun plan, aucun ADR ne l'avait envisagé ni
écarté.

## Ce que le natif ne donne pas

Deux prémisses vérifiées avant de décider quoi que ce soit, parce qu'elles
décident tout le reste.

**Safari iOS n'émet plus `contextmenu` sur appui long depuis iOS 13.** Ce n'est
pas affaire de `-webkit-touch-callout` : l'événement ne part pas, callout
désactivé ou non. Android Chrome, lui, l'émet. Le natif couvre donc une
plateforme sur deux, et celle qui manque est justement celle pour laquelle
`playwright.config.ts` déclare un projet `iphone`.

**Aucun événement standard ne décrit un tap à deux doigts.** Le seul événement
multi-doigts « tout fait » du web est `GestureEvent` de WebKit (`gesturestart`,
`gesturechange`, `gestureend`) — non standard, Safari seulement — et il décrit un
**pincement** : il porte `scale` et `rotation`, pas un tap. Tout le reste
s'assemble depuis Touch ou Pointer Events, que MDN qualifie de « relatively
low-level ».

Reconnaître les gestes nous-mêmes n'est donc pas un choix de style : c'est la
seule voie portable. Et le natif ne donnerait de toute façon pas la chronologie
retenue ici — `contextmenu` part **une fois**, à l'instant que l'OS décide, sans
phase d'armement, donc ni fantôme ni ajustement.

`GestureEvent` garde un rôle, mais l'inverse de celui espéré : c'est sur lui qu'on
fait `preventDefault` pour tuer le pincement sur iOS, où `user-scalable=no` est
ignoré depuis iOS 10.

## Décision

### Le blocage : toute l'application, une seule règle

`index.html` — le viewport gagne `maximum-scale=1, user-scalable=no`. Honoré par
Android Chrome, ignoré par Safari iOS ; posé quand même, c'est la ligne qui règle
Android proprement.

`src/style.css` :

```css
body {
    /* Le défilement reste, le pincement et le double-tap-zoom partent. Surtout
       pas `none` : la pile se lit au doigt, et `none` tuerait ce geste-là. */
    touch-action: pan-x pan-y;
    -webkit-user-select: none;
    user-select: none;
    /* Safari iOS seulement ; no-op sur tout le reste. */
    -webkit-touch-callout: none;
}

/* La seule exception, et elle suffit : le renommage d'un trajet passe par un
   `prompt()` natif, donc hors de portée du CSS. Les seuls vrais champs sont
   latitude et longitude, et corriger un chiffre fautif demande de le
   sélectionner. */
input {
    -webkit-user-select: text;
    user-select: text;
}
```

Une seule règle suffit parce que les propriétés en jeu ne se comportent pas
pareil, et il faut les deux comportements :

- `user-select` et `-webkit-touch-callout` **s'héritent**, donc elles franchissent
  la frontière du shadow DOM et atteignent l'`<img>` de `<schema-page>` sans
  qu'on écrive une ligne dans `SchemaPage.html`.
- `touch-action` **ne s'hérite pas** — mais le navigateur intersecte les valeurs
  de l'élément _et de ses ancêtres_ jusqu'au conteneur défilant, donc `body`
  gouverne quand même.

La carte n'a pas à être exemptée : `leaflet.css` pose ses propres `touch-action`
et `user-select` sur ses conteneurs, et arrive après dans le bundle — ce que
`style.css` note déjà à propos de la pastille partagée.

Le prix est accepté : plus de pincement pour agrandir une cote fine, et les
textes (nom de trajet, nom de page, phrase d'aide) ne se sélectionnent plus.

### Le pincement sur iOS

```ts
// src/shared/pinchZoom.ts
declare global {
    interface WindowEventMap {
        gesturestart: Event;
    }
}
```

Une **déclaration**, pas un cast : on ne déclare que ce qu'on emploie — `Event`,
qui porte `preventDefault` — sans fabriquer une forme de `GestureEvent` qu'on
n'aurait pas vérifiée. C'est le procédé qu'`intents.ts` applique déjà à
`HTMLElementEventMap`, et l'ADR 0002 bannit l'autre.

Un `addEventListener` nu, pas un flux : il n'y a ici ni cadence, ni fraîcheur, ni
concurrence — les trois choses dont parle l'ADR 0009 — et l'écouteur vit tant que
la page vit. Appelé une fois depuis `main.ts`, à côté d'`enableOfflineMode()` :
c'est de la coquille, pas d'un écran.

### Un reconnaisseur de gestes, frère du glisser

```ts
// src/trajets/ui/addPointOnStack.ts
export function addsOnStack(stack: HTMLElement): Observable<PageAimIntent>;
```

Il possède les **trois** routes vers « un point ici, tout de suite » — clic droit,
appui long, tap à deux doigts — et le trait fantôme. L'écran s'y abonne une fois,
comme au glisser :

```ts
addsOnStack(pagesContainer)
    .pipe(takeUntil(parti$))
    .subscribe((aim) => {
        run(onDirectAdd(aim), "l'ajout du point");
    });
```

**Pourquoi la pile et non le cadre.** `render()` reconstruit tous les
`<image-frame>` à chaque écriture (`replaceChildren` ; seule la `<schema-page>`
est reprise, pour ne pas redécoder 30 Mo). Un geste est un flux **avec état** :
le mettre dans la fabrique du cadre, ce serait N machines à états recréées à
chaque rendu, avec des abonnements orphelins à chaque fois — ou un
`disconnectedCallback` sur une feuille, que l'AGENTS.md réserve à ce qui détient
une ressource. `#images-stack`, lui, vit le temps de l'écran : c'est déjà pour
cette raison que `dragsOnStack(pagesContainer)` s'abonne une seule fois.

**Pourquoi le clic droit déménage.** Sur Android, le natif s'ajoute au nôtre :
un seul appui long émettrait `contextmenu` **pendant** que le doigt est encore
posé, et sans arbitrage le même geste poserait deux points. Un arbitrage veut un
seul propriétaire. `right-click-page` disparaît donc d'`intents.ts` : comme
`dragsOnStack`, un reconnaisseur de gestes n'est pas une feuille — il n'annonce
pas par `CustomEvent`, il rend un flux.

Le ciblage du clic droit est reproduit **au bit près** : la page est résolue par
`event.target.closest('.image-area')`, pas par géométrie. Un clic droit sur la
barre d'une page garde donc son menu natif comme aujourd'hui, et un clic droit
sur une pastille ajoute un point comme aujourd'hui.

### Un geste, un point

L'invariant qui gouverne la machine. Il n'y a pas deux flux parallèles mais **un
seul reconnaisseur**, entré au premier doigt, qui se résout ensuite en appui long
ou en tap à deux doigts.

Un `pointerdown` ouvre un geste s'il satisfait trois conditions :

- `pointerType !== 'mouse'` — donc `'touch'` et `'pen'`. Un stylet tient un appui
  long naturellement ; la souris a le clic droit.
- `event.target instanceof SchemaPageElement` — « l'image nue ». Le shadow DOM
  **retarge** l'événement, donc un doigt posé sur l'`<img>` a pour cible l'hôte
  `<schema-page>` : ce seul `instanceof` exclut la pastille, les trois boutons
  flottants et la barre de la page, sans énumérer d'exclusions. Le numéro de page
  est `pointer-events: none`, donc le doigt le traverse et atteint la page —
  exactement ce que `style.css` avait décidé pour qu'il ne vole pas un placement.
- **aucun autre pointeur tactile déjà posé sur la pile.** Sans quoi un second
  doigt posé pendant qu'un premier glisse une pastille armerait un appui long à
  côté du glisser.

Cette dernière condition oblige à tenir un ensemble des pointeurs tactiles actifs
sur toute la pile, alimenté par tous les `pointerdown` / `pointerup` /
`pointercancel`, y compris ceux qui visent une pastille. Cet état unique sert
**deux** fois, et c'est sa seule justification : l'entrée ci-dessus, et
l'arbitrage du `contextmenu`. Il vit dans le `defer` qui enveloppe le module, pour
la raison déjà écrite dans `dragPointOnStack.ts` — un second abonné aurait le
sien.

```ts
const abandons$ = merge(derives$, cancels$); // le doigt part, ou le système reprend
const sorties$ = merge(abandons$, releases$); // + il se relève avant l'heure

const appuiLong$ = timer(LONG_PRESS_DELAY).pipe(
    takeUntil(sorties$),
    map(() => start.y),
);
const deuxDoigts$ = secondDoigt$.pipe(map((second) => milieu(start.y, second.clientY)));

return race(appuiLong$, deuxDoigts$).pipe(
    tap(() => {
        vibrer();
    }),
    // Armé : le fantôme suit le doigt, et le point ne naît qu'au relâchement —
    // donc la carte ne s'ouvre jamais sous un doigt encore posé.
    switchMap((y) => suivreLeDoigt(y)),
    takeUntil(abandons$),
    finalize(() => {
        retirerFantome();
    }),
);
```

`race` rend l'invariant vrai sans qu'on y pense : la branche qui émet la première
désabonne l'autre. Un second doigt à 300 ms fait gagner les deux doigts et annule
le minuteur ; 500 ms écoulées font gagner l'appui long, et un doigt qui arrive
ensuite ne compte plus **pour ce geste**. Et `exhaustMap` au-dessus, comme pour le
glisser : un geste en cours n'en démarre pas un autre.

Trois détails qui ne se devinent pas :

- **`sorties$` avant l'armement, `abandons$` après.** Avant, un relâchement tue le
  geste — c'était un tap, et il doit atteindre `click-page`. Après, le relâchement
  est justement ce qu'on attend ; seules la dérive et l'annulation tuent encore.
- **Le relâchement de _l'un des deux_ doigts** termine un tap à deux doigts, pas
  seulement celui du premier. C'est le prédicat `fromSameFinger` du glisser,
  généralisé à l'ensemble des pointeurs du geste.
- **Les sorties s'écoutent sur `documentElement`**, pas sur la pile, pour la
  raison déjà mesurée et écrite dans `dragPointOnStack.ts` : sans capture, rien ne
  garantit qu'un relâchement hors de la pile retarge la pile — et un flux qui ne
  se termine jamais laisserait l'`exhaustMap` souscrit pour de bon.

### L'armement ouvre un ajustement

Une fois armé, **un appui long est exactement le glisser d'un point qui n'existe
pas encore.**

- le fantôme **suit le doigt**, pages voisines comprises ;
- la dérive ne tue plus rien : c'est devenu la fonction du geste. `SLOP` ne garde
  plus que la fenêtre **avant** l'armement ;
- `pointercancel` tue toujours, et retire le fantôme ;
- le relâchement pose le point là où le fantôme se trouve ;
- **aucune page sous le doigt** (l'interstice entre deux pages, ou hors de la
  pile) → le fantôme garde sa dernière position valable, et c'est elle qui est
  enregistrée. C'est la règle que `dragPointOnStack.ts` a déjà tranchée : « un
  geste abouti ne doit pas se perdre ».

Le tap à deux doigts suit la même règle : le fantôme suit le **milieu** des deux
doigts jusqu'à ce que l'un se lève. Uniforme, oui, mais ce n'est **un seul chemin
de code** qu'à condition d'énoncer la visée comme « le milieu des doigts du
geste » — qui, pour un doigt seul, est ce doigt. L'ajustement retient alors la
dernière hauteur connue de **chaque** doigt du geste, et non un seul `y`.

Ce prix-là n'est pas négociable, et c'est la tâche 6 qui l'a mesuré : un suivi qui
ne connaît que le doigt d'origine ramène la visée sur lui au premier
`pointermove`, et deux doigts posés sur du verre en émettent toujours. Le point
tomberait donc là où est un doigt, pas au milieu — vert en jsdom, faux sur
l'appareil.

### Empêcher le navigateur de défiler pendant l'ajustement

C'est le seul vrai obstacle. `touch-action: pan-x pan-y` autorise le pan, donc au
premier mouvement d'après-armement le navigateur prendrait la main et émettrait
`pointercancel` : le geste mourrait exactement quand on commence à ajuster.

**Un `touchmove` non passif sur `#images-stack`**, posé pour la vie du module, qui
ne fait rien tant que le geste n'est pas armé et qui appelle `preventDefault()`
dès qu'il l'est.

Deux contraintes mesurées dictent cette forme, et non une autre :

- **sur la pile, pas sur le document** : Chrome force `passive: true` pour
  `touchstart` et `touchmove` sur `window`, `document`, `documentElement` et
  `body`, et un `preventDefault` y serait ignoré. `documentElement` fait bien
  partie de la liste, et c'est le membre qui compte ici : c'est lui que le geste
  écoute pour les pointeurs ;
- **posé d'avance, pas à l'armement** : `cancelable` bascule à `false` dès qu'un
  défilement est en cours, et le navigateur décide au `touchstart` s'il peut
  défiler sans consulter le fil principal.

Le prix, dit franchement : la pile devient une région tactile non passive, donc un
défilement amorcé sur le schéma attend notre gestionnaire au lieu de partir sur le
compositeur. Ce gestionnaire lit un booléen et rend la main — c'est le minimum
possible, et c'est le prix que paient déjà toutes les applications de carte ou de
dessin, Leaflet compris sur son propre conteneur. **Accepté sans réserve** : la
performance du défilement n'est pas un point de contrôle de ce travail.

Les deux autres issues, pour mémoire : `touch-action: none` sur la page du schéma
supprimerait le défilement au doigt sur ce qui occupe presque tout l'écran ; ne
rien faire réduirait l'ajustement aux quelques pixels de tolérance que le
navigateur accorde, autant dire à rien.

### Deux constantes, et pourquoi elles diffèrent de l'existant

`LONG_PRESS_DELAY = 500` — la valeur qu'Android et iOS emploient pour leur propre
appui long. S'en écarter ferait sentir le geste étranger à l'appareil.

`SLOP = 10`, et **pas** les 3 px de `DRAG_THRESHOLD` : ce seuil-là est serré parce
qu'il ne compare qu'un écart **vertical**, et son commentaire dit que l'asymétrie
est délibérée — c'est elle qui laisse un doigt s'échapper à l'horizontale. Ici les
deux axes comptent, puisqu'un doigt qui part de côté ne tient pas un appui, et un
doigt posé sur du verre tremble plus qu'une souris tenue. 10 px est l'ordre de
grandeur du _touch slop_ d'Android (8 dp).

### L'arbitrage du `contextmenu`

```
contextmenu sur la pile
  → area = event.target.closest('.image-area')
  → area === null : on ne fait rien du tout (menu natif conservé, comme aujourd'hui)
  → sinon : preventDefault(), puis émettre seulement si aucun pointeur tactile n'est actif
```

Sur Android, le natif arrive **pendant** que le doigt est encore posé : le garde
est alors exact, sans minuteur ni fenêtre de temps. C'est une **prémisse à
mesurer**, pas un fait acquis — le plan doit prouver sur le projet e2e `android`
qu'un appui long produit exactement **un** point. Si l'ordre s'avère inverse, le
remède est le jumeau de `swallowNextClick`, qui existe déjà avec son raisonnement
sur le désarmement par l'interaction suivante plutôt que par un délai.

### Le trait fantôme

Un `<div class="point-ghost">` posé dans la `.image-area` visée, à `top: X%`,
changeant de zone en cours de geste comme `placeMarker` déplace le repère, et
retiré par le `finalize` — donc dans **tous** les cas, succès comme annulation :
un trait mort resté sur la page serait pire que pas de fantôme du tout.

Le pointillé rouge devient un sélecteur commun, pour que le fantôme et le vrai
repère ne divergent jamais :

```css
point-marker,
.point-ghost {
    display: block;
    position: absolute;
    left: 0;
    right: 0;
    border-top: var(--point-line-thickness) dashed #dc2626;
    pointer-events: none;
}
```

C'est le procédé que la feuille applique déjà à la pastille partagée entre le
schéma et la carte : « les sélecteurs de la carte viennent la chercher ici plutôt
que d'entretenir un sosie ».

**Aucune atténuation** — pas d'`opacity`, même rouge, même pointillé. Le fantôme
sert à _lire une hauteur_ ; l'affaiblir la rendrait moins lisible, et ce qui le
distingue d'un vrai repère est déjà franc : ni pastille, ni boutons.

**Pas de `setPointerCapture`.** Les mouvements s'écoutent sur `documentElement`,
et le tactile capture implicitement le pointeur sur sa cible initiale ; la capture
explicite du glisser existe pour retargeter le clic de compatibilité qui viserait
la pastille, ce qui ne nous concerne pas.

**La vibration** ne dit pas « ça a marché » mais « vous pouvez bouger
maintenant ». Elle passe par un optionnel annoté, jamais un cast :
`navigator.vibrate` est typé comme toujours présent mais absent de Safari iOS —
mot pour mot le procédé que `main.ts` applique à `navigator.storage`. Sur iPhone
c'est donc le fantôme seul qui le dit, d'où l'intérêt de l'avoir gardé franc.

### Ce qui bouge dans l'existant

| Fichier                                | Ce qui change                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `index.html`                           | viewport : `maximum-scale=1, user-scalable=no`                                     |
| `src/style.css`                        | le blocage sur `body`, l'exception `input`, le sélecteur commun du pointillé       |
| `src/main.ts`                          | un appel à `blockPinchZoom(window)`                                                |
| `src/shared/pinchZoom.ts`              | **nouveau**                                                                        |
| `src/trajets/ui/pageUnderFinger.ts`    | **nouveau** — `fractionInArea`, `areaUnderFinger`, `placeAt`                       |
| `src/trajets/ui/addPointOnStack.ts`    | **nouveau** — le reconnaisseur                                                     |
| `src/trajets/ui/dragPointOnStack.ts`   | `targetUnderFinger` et `placeMarker` deviennent des appels au module partagé       |
| `src/trajets/ui/ImageFrame.ts`         | perd l'écouteur `contextmenu` ; `fractionFromPosition` part dans le module partagé |
| `src/trajets/ui/intents.ts`            | perd `right-click-page`                                                            |
| `src/trajets/ui/TrajetEditorScreen.ts` | s'abonne au nouveau flux ; `onImageRightClick` devient `onDirectAdd`               |
| `docs/EXIGENCES.md`                    | GR-22 à GR-25                                                                      |

`areaUnderFinger` est extraite parce que l'ajustement traverse les pages, ce dont
le geste sans ajustement n'aurait pas eu besoin. Les deux modules **ne sont pas
unifiés** pour autant : la moitié est commune (résoudre la page sous le doigt,
placer, garder la dernière position valable), l'autre non — cible d'entrée,
condition d'armement, élément déplacé, écriture au relâchement, et ce qu'une
annulation restaure (le glisser rend son origine au repère, nous supprimons le
fantôme). Deux fonctions partagées, pas un moteur de gestes.

Les noms `addPointOnStack` / `addsOnStack` / `pageUnderFinger` sont ceux d'un
renommage d'une ligne s'ils déplaisent. « Placement » est délibérément évité :
l'écran l'emploie déjà pour le mode en **deux** temps (`PlacementMode`,
`#placement-hint`, `.placement-active`).

## Comportements conservés, et dits pour qu'on ne les croie pas neufs

- Une visée pendant un mode de placement **abandonne le mode et ajoute** : c'est
  ce que le clic droit fait aujourd'hui (`onImageRightClick` appelle
  `changeMode(null)` puis ajoute). Parité assumée, pas décision neuve.
- Un clic droit sur une pastille ajoute un point ; le garde `button !== 0` du
  glisser continue d'empêcher qu'un clic droit qui dérive fasse les deux.
- Aucun nouveau chemin d'erreur : les trois routes aboutissent à
  `addPointAtFraction`, déjà enveloppé par `run(…, "l'ajout du point")`.

Et un garde que je **n'ajoute pas** : un `swallowNextClick` préventif sur l'appui
long. Le `click` de compatibilité atteindrait `.image-area` → `click-page` →
`onImageClick`, qui **retourne immédiatement** quand `placementMode` est `null` —
et `onDirectAdd` vient de le remettre à `null`. Les deux cas sont inoffensifs.
Reste une inconnue réelle : `chooseCoordonnee` ouvre la carte plein écran **dans
la même tâche** que le relâchement (un corps `async` s'exécute jusqu'au premier
`await`, et `choose()` est appelé avant), donc si le navigateur ciblait le clic
par un nouveau test de survol plutôt que par la cible du toucher, il tomberait sur
la carte. Ajouter le garde « au cas où » serait un garde sans témoin, ce
qu'AGENTS.md interdit : le plan mesure, et n'ajoute que si ça casse.

## Tests

### Unitaires — `addPointOnStack.test.ts`

jsdom et `TestScheduler` pour le temps virtuel (ADR 0009), avec le
`FauxPointerEvent` de `dragPointOnStack.test.ts` étendu d'un `pointerType`.

**Appui long** — (1) immobile 500 ms puis relevé → une visée à la hauteur du
doigt ; (2) relevé avant 500 ms → rien, c'était un tap et il doit atteindre
`click-page` ; (3) dérivé de plus de 10 px avant 500 ms → rien ; (4)
`pointercancel` avant 500 ms → rien ; (5) armé, dérivé de 200 px, relevé → la
visée est à la **nouvelle** hauteur ; (6) armé puis passé sur la page voisine → la
visée nomme l'**autre** `imageId` ; (7) armé puis relâché dans l'interstice → la
dernière position valable, pas rien ; (8) armé puis `pointercancel` → rien, et
fantôme retiré ; (9) doigt sur une pastille immobile 500 ms → rien ; (10) souris
immobile 500 ms → rien.

**Deux doigts** — (11) deux doigts sur la même page, l'un se relève → visée à
mi-hauteur ; (12) deux doigts sur deux pages → rien ; (13) appui long armé puis
second doigt → **une seule** visée, à mi-hauteur ; (14) un doigt déjà sur une
pastille, un second sur l'image nue → rien.

**Clic droit** — (15) sur l'image → une visée, et `defaultPrevented` ; (16) sur la
barre d'une page → rien, et **pas** `defaultPrevented` ; (17) `contextmenu`
pendant qu'un pointeur tactile est actif → `defaultPrevented` mais **aucune**
visée : le cas Android.

**Défilement** — (18) `touchmove` avant l'armement → **pas** `defaultPrevented` ;
(19) après l'armement → `defaultPrevented`. Ce sont les deux seuls témoins du
mécanisme non passif.

### `pinchZoom.test.ts`

Un `gesturestart` dispatché → `defaultPrevented`. Le fichier dit ce que ce test
est : le témoin du **câblage**, pas du navigateur.

### `TrajetEditorScreen.test.ts`

La visée aboutit à un point au bon `imageId` et à la bonne fraction — le scénario
du clic droit existe et change de porte d'entrée. Plus le cas qui manquait : une
visée pendant un mode de placement abandonne le mode et ajoute.

### e2e — ce que le vrai navigateur apporte en plus, et rien d'autre

1. **Le blocage, mesuré** : `touch-action` calculé sur `body`, `user-select`
   calculé sur l'`<img>` **à l'intérieur du shadow root** — la seule preuve
   possible de l'héritage à travers la frontière — et `user-select` sur
   `#latitude-input`. Sur les cinq projets, iPhone et Pixel compris.
2. **La couture complète** : un appui long synthétique → un `point-marker` de plus
   à la hauteur attendue, la carte ouverte, la donnée écrite.
3. **Un point par geste sur `android`** : le scénario qui met la prémisse du
   `contextmenu` à l'épreuve.

`pnpm mutation` après coup sur le module — des seuils et un minuteur, exactement
là où un survivant apprend quelque chose (ADR 0006), et sans ajouter d'assertion
pour en faire taire un.

## Ce qui ne sera pas prouvé

Écrit ici pour qu'on ne le découvre pas plus tard :

- **Le tap à deux doigts par un vrai geste.** Playwright n'a aucune API
  multi-touch : `touchscreen.tap` est mono-doigt, et la voie documentée passe par
  un `dispatchEvent('touchstart', { touches: [...] })` dont la doc précise
  qu'`isTrusted` n'est pas posé. Témoins : unitaire et e2e synthétique.
  Vérification réelle : un appareil.
- **La disparition du pincement sur iOS.** Le WebKit de Playwright n'est pas
  Safari iOS et ne connaît pas `GestureEvent`.
- **Le confort du défilement** sous l'écouteur non passif. Tranché sans réserve,
  donc pas un point de contrôle — mais aucun test ne le regarde.
- **La suppression du callout iOS.** `-webkit-touch-callout` n'a jamais existé
  que sur Safari iOS/iPadOS, et un [signalement ouvert sur iOS
  26.1](https://developer.apple.com/forums/thread/808606) dit qu'il ne supprime
  plus le menu, sans réponse à ce jour. Le `user-select: none` posé partout retire
  le cas texte, qui est celui du signalement ; la cible du geste est un `<img>`.

## Exigences

À la suite de GR-21, section Géoréférencement de `docs/EXIGENCES.md` :

| ID    | Exigence                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GR-22 | Zoom et sélection natifs neutralisés dans toute l'application ; les champs de saisie restent sélectionnables ; la carte garde son pincement |
| GR-23 | Un appui long sur l'image arme un repère fantôme, que le doigt déplace jusqu'au relâchement, où le point se crée                            |
| GR-24 | Un tap à deux doigts sur une même page crée un point à mi-hauteur entre les deux doigts                                                     |
| GR-25 | Un seul geste ne crée jamais plus d'un point, `contextmenu` natif d'Android compris                                                         |
