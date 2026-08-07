# Architecture

## Vue d'ensemble : hexagone + screaming architecture

Le premier niveau de `src/` crie le métier, pas la technique :

```
src/
  trajets/   — gérer les trajets, leurs images et leurs points géo-référencés
  suivi/     — faire défiler le document selon la position
  carte/     — choisir une coordonnée sur une carte de France
  main.ts    — composition root (le seul fichier qui connaît les adapters concrets)
```

Chaque capacité est un petit hexagone : `domain/` (logique pure), `ports/`
(interfaces définies par le métier), `adapters/` (implémentations en bordure),
`ui/` (les écrans — des **custom elements natifs**, adapters entrants).

**Règle de dépendance** : `domain` ne dépend de rien ; `ports` ne dépendent que
du domaine ; `adapters` et `ui` dépendent des ports et du domaine ; seul
`main.ts` instancie les adapters et les injecte (à la main, sans framework).

```
        UI (écrans DOM)                    adapters entrants
              │
              ▼
   ┌──────────────────────┐
   │        domain        │   Trajet, value objects, projection géo→scroll
   │  (pur, zéro import   │
   │   plateforme)        │
   └──────────────────────┘
              ▲
              │ ports (interfaces TypeScript)
              │
   IdbTrajetRepository · GeolocationPositionSource · SimulationPositionSource
   LeafletCoordonneeSelector · BrowserScreenWakeLock     adapters sortants
```

## Les ports et leurs adapters

| Port                 | Contrat                                                                                                       | Adapters                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `TrajetRepository`   | `listSummaries` / `load` / `save` (atomique) / `delete` ; **rejette** si la base est illisible                | `IdbTrajetRepository` (IndexedDB via idb)                                             |
| `PositionSource`     | `events$` — s'abonner démarre, se désabonner arrête ; commence par un état                                    | `GeolocationPositionSource` (GPS)                                                     |
| `PositionSimulator`  | un `PositionSource` pilotable : `simulate(position)` + `lastPosition`                                         | `SimulationPositionSource` (position choisie à la main)                               |
| `ScreenWakeLock`     | `held$` — l'écran reste allumé tant que l'abonnement dure ; best effort                                       | `BrowserScreenWakeLock` (wake lock)                                                   |
| `Foreground`         | `returnToForeground$` — les réveils, page effectivement visible                                               | `BrowserForeground` (visibilitychange, pageshow, focus)                               |
| `CoordonneeSelector` | `choose(initial, reperes) → Coordonnee \| null`                                                               | `LeafletCoordonneeSelector` (Leaflet + OSM, plein écran)                              |
| `CarteDesPoints`     | `mount(container)` / `unmount()` puis `show(points, onMove)` / `chooseCoordonnee(initial)` / `cancelChoice()` | `LeafletCarteDesPoints` (carte intégrée à l'éditeur, marqueurs numérotés déplaçables) |

**Pourquoi la carte se monte et se démonte** : l'écran d'édition est fabriqué et
détruit à chaque ouverture, donc son conteneur est un élément neuf à chaque fois.
Une carte Leaflet mémorisée d'une visite à l'autre resterait accrochée au
conteneur précédent, et la deuxième ouverture n'afficherait plus rien
([ADR 0008](adr/0008-interface-en-custom-elements-natifs.md)).

Les deux cartes honorent la coordonnée de départ : déplacer un point rouvre la
carte là où il se trouve, quelle que soit la taille de l'écran.

## L'interface : des custom elements natifs

Détail et arbitrages : [ADR 0008](adr/0008-interface-en-custom-elements-natifs.md).
En résumé, ce qu'il faut savoir pour travailler dedans :

| Élément                  | Où                                 | Rôle                                                   |
| ------------------------ | ---------------------------------- | ------------------------------------------------------ |
| `<trajets-list-screen>`  | `trajets/ui/TrajetsListScreen.ts`  | écran d'accueil                                        |
| `<trajet-editor-screen>` | `trajets/ui/TrajetEditorScreen.ts` | écran d'édition                                        |
| `<suivi-screen>`         | `suivi/ui/SuiviScreen.ts`          | écran de suivi                                         |
| `<trajet-row>`           | `trajets/ui/TrajetRow.ts`          | une ligne de la liste                                  |
| `<image-frame>`          | `trajets/ui/ImageFrame.ts`         | une page et son habillage d'édition                    |
| `<point-marker>`         | `trajets/ui/PointMarker.ts`        | le repère d'un point sur sa page                       |
| `<point-row>`            | `trajets/ui/PointRow.ts`           | une ligne de la liste des points                       |
| `<schema-page>`          | `shared/SchemaPage.ts`             | une page affichée, **propriétaire de son URL d'objet** |

- **Un écran se fabrique, s'attache, se détache.** `createXScreen(dependencies)`
  rend un élément déjà configuré ; `goToScreen` le monte dans `<main id="app">`,
  ce qui détache le précédent. Le détachement avorte un `AbortSignal` : les
  écouteurs partent, et le rangement (sources arrêtées, verrou relâché, carte
  démontée) y est branché. Il n'y a **aucun appel de sortie** à ne pas oublier.
- **Le gabarit est du HTML**, dans un `.html` à côté du `.ts`, importé en `?raw`.
- **Données en entrée, intentions en sortie** : une feuille reçoit des propriétés
  et émet des `CustomEvent` qui remontent (`trajets/ui/intents.ts` les déclare) ;
  l'écran écoute une fois sur sa racine et décide. Une feuille ne touche ni
  l'agrégat ni un port.
- **Le cycle de vie ne se prend que là où il y a une ressource à rendre.**
  `<schema-page>` monte son image à l'attachement et libère son URL au
  détachement ; les autres feuilles se construisent à la fabrique.
- **Le rendu reste explicite** (`render()`), mais ne rase plus : une page
  inchangée garde son élément, donc son décodage — trente mégaoctets par page.

**Un état mesuré, jamais une phrase** : `onStatus` transporte un `SourceStatus`
du domaine (mètres, millisecondes) et c'est `suivi/domain/presentation.ts` qui
rédige. Sans cela, la politique métier (« un fix à plus de 3 km est
inutilisable ») vivait dans un adapter sortant — invisible au second adapter, et
intestable sans navigateur.

**La simulation est un simple second adapter de `PositionSource`** : l'écran de
suivi ne fait aucune différence entre le GPS réel et une position simulée. Le
mode test de l'application tombe gratuitement de l'architecture.

### Ajouter un adapter

Exemple : rejouer une trace GPX enregistrée. Créer
`src/suivi/adapters/GpxPositionSource.ts` qui implémente `PositionSource`
(émettre les points de la trace au rythme voulu), puis l'injecter dans
`main.ts` à la place (ou en plus) de la source réelle. Rien d'autre ne change.

## Le domaine (DDD)

- **Value objects** (validés à la construction, immuables) : `Coordonnee`
  (lat ∈ [−90, 90], lon ∈ [−180, 180]), `FractionVerticale` (∈ [0, 1] ; 0 = haut
  de l'image), `NomDeTrajet` (non vide), identifiants typés (`TrajetId`,
  `ImageId`, `PointId`).
- **Agrégat `Trajet`** (racine) : images ordonnées + points, méthodes
  d'intention (`addImage`, `moveImageForwardInVoyage`, `addPoint`,
  `movePointOnCarte`…), pas de setters. Les déplacements d'image sont
  nommés dans le langage du **voyage**, jamais dans celui de l'écran : la pile
  s'affichant à l'envers du voyage, un nom spatial (« monter ») désignerait
  l'opération inverse selon qu'on parle du document ou de l'affichage.
- **Requêtes portées par la racine** plutôt que refaites par les appelants :
  `imagesInReadingOrder`, `pointsOfImage`,
  `numberedPointsInOrdreDuVoyage` — le numéro d'un point est un concept
  visible par l'utilisateur, il n'a qu'un seul producteur.
- **Invariants protégés par l'agrégat** :
    - un point référence toujours une image du trajet ;
    - supprimer une image supprime ses points (la cascade est une règle du
      domaine, pas un détail de base de données) ;
    - l'ordre du voyage des points est **calculé** (image croissante, puis
      fraction décroissante — les pages se lisent de bas en haut), jamais stocké.

## Sérialisation (`trajets/serialization/trajetJson.ts`)

Fonctions pures d'export/import d'un trajet en JSON autonome : le fichier
contient tout (nom, images encodées en base64, points). Les points désignent
leur image par son **index dans le fichier**, jamais par identifiant ; à
l'import, les identifiants sont régénérés, ce qui crée toujours un nouveau
trajet (deux imports du même fichier = deux trajets distincts). L'enveloppe
porte `application` + `version` pour rejeter proprement un fichier étranger ou
une version future, avec des messages destinés à l'utilisateur. C'est le
domaine qui reconstruit l'agrégat, donc ses invariants (un point vise une
image présente) valident aussi les fichiers importés.

## L'algorithme géo → scroll (`suivi/domain/projection.ts`)

Fonctions pures, testées exhaustivement avec des coordonnées réelles :

1. Les points (ordre voyage) deviennent des étapes `{coordonnee, offset px}`.
   Les offsets sont **relus à chaque position** (jamais mis en cache) : gratuit
   toutes les ~10 s et insensible aux rotations d'écran.
2. La position est projetée sur chaque segment (plan local équirectangulaire,
   suffisant à l'échelle France) ; le segment le plus proche gagne, avec :
    - **garde-fou segment de longueur nulle** (deux points posés au même lieu,
      ex. le PK répété de part et d'autre d'une jonction de pages) — sinon
      division par zéro ;
    - **adhérence anti-oscillation** : parmi les segments quasi ex æquo
      (< 200 m d'écart), on retient celui dont la cible de défilement bouge le
      moins — indispensable quand la ligne repasse près d'elle-même ou que des
      points partagent le même lieu.
      Les pages étant empilées première-du-voyage en bas, le document se déroule
      d'un seul tenant et les offsets décroissent au fil du voyage ; l'algorithme
      ne suppose toutefois aucune monotonie.
3. Seuil « hors trajet » **adaptatif** : `max(5 km, 20 % de la longueur du
segment)` — entre deux points éloignés, la corde s'écarte de la vraie ligne.
4. La cible est interpolée entre les offsets des deux étapes, puis placée aux
   trois quarts de l'écran, bornée aux limites du document.

## Démarche de test (BDD, par l'état)

- Comportements spécifiés **avant** le code, nommés Étant donné / Quand / Alors.
- **Tests par l'état, jamais par les interactions** : pas de `vi.fn`, pas de
  `toHaveBeenCalled`. Les fakes sont écrits à la main et injectés (fausse
  géolocalisation, horloge contrôlée, scheduler manuel, fake-indexeddb) ; les
  assertions portent sur les valeurs produites.
- Le domaine se teste pur ; les adapters avec leurs fakes ; les écrans et le
  service worker en E2E Playwright (Chromium, WebKit, Firefox + viewports
  iPhone/Pixel), contre le **build de production** (`pnpm preview`).
- **Un garde-fou sans témoin n'est pas protégé.** `pnpm mutation` abîme le code
  un endroit à la fois et relance les tests : un mutant qui survit désigne une
  ligne que rien n'éprouve — ce que la couverture, elle, ne dit jamais. C'est
  ainsi qu'on a découvert que trois correctifs de la refonte n'avaient aucun
  témoin : désactiver le garde-fou du segment dégénéré laissait la suite
  entièrement verte, alors qu'un trajet dont les deux seuls points partagent un
  lieu produit alors une cible `NaN`, donc une page collée en haut du document
  pendant tout le voyage.
- Les survivants se **jugent**, ils ne se font pas taire : certains sont
  équivalents (le `typeof` qu'exige le compilateur, une borne de boucle sans
  effet observable), d'autres portent sur une garde que les invariants rendent
  inatteignable — conservée parce que `!` est banni. Ces cas-là sont commentés
  sur place. Ajouter une assertion pour éteindre un mutant fabrique un test
  creux : c'est le contraire du but. Hors du gate, car trop lent
  ([ADR 0006](adr/0006-tests-de-mutation-stryker.md)).
- Ce qui reste manuel : le vrai GPS dans un vrai train, et les comportements
  PWA propres à iOS (permission redemandée à chaque session, wake lock fiable
  seulement depuis iOS 18.4).

## Pièges plateforme encodés dans le code

- `GeolocationPositionSource` : `watchPosition` throttlé (pas de
  `getCurrentPosition` en boucle) ; les fixes approximatifs (cellule, Wi-Fi,
  vitres athermiques d'un train) sont utilisés jusqu'à 3 km d'incertitude, et
  au-delà l'état dit « Position approximative (± X km) » plutôt que « perdu » ;
  erreurs passagères ignorées, puisqu'on ne s'alarme que d'un silence (tunnels) ;
  réouverture du watch (throttlée) au retour au premier plan (page gelée par
  iOS/Android) ; chien de garde « dernière position il y a X min », dont l'âge
  est celui qu'un `timer` relancé à chaque fix a lui-même compté
  ([ADR 0009](adr/0009-flux-du-temps-en-rxjs.md)).
- `BrowserScreenWakeLock` : wake lock dans un try/catch, ré-acquis à chaque
  retour au premier plan (le système le libère quand la page est masquée) ;
  `exhaustMap` fait qu'un même retour, annoncé par trois événements, n'en
  demande qu'un.
- Images : `width`/`height` réservés avant tout décodage (offsets stables),
  `loading="lazy"` (une page décodée ≈ 35 Mo de mémoire), object URLs révoquées.
- IndexedDB : blobs stockés en `ArrayBuffer` (clonage de Blob fragile sur
  d'anciens Safari), sauvegarde de l'agrégat en une transaction, seules les
  nouvelles images sont réécrites.
