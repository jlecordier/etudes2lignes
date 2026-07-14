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
`ui/` (écrans DOM — les adapters entrants).

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
   LeafletSelecteurDeCoordonnee · NavigateurEcranAllume     adapters sortants
```

## Les ports et leurs adapters

| Port                    | Contrat                                                                            | Adapters                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `TrajetRepository`      | `listerResumes` / `charger` / `sauvegarder` (atomique) / `supprimer`               | `IdbTrajetRepository` (IndexedDB via idb)                                             |
| `PositionSource`        | `demarrer(surPosition, surErreur)` / `arreter()`                                   | `GeolocationPositionSource` (GPS)                                                     |
| `SimulateurDePosition`  | un `PositionSource` pilotable : `simuler(position)` + `dernierePosition`           | `SimulationPositionSource` (position choisie à la main)                               |
| `EcranAllume`           | `maintenir()` / `relacher()`, best effort                                          | `NavigateurEcranAllume` (wake lock)                                                   |
| `SelecteurDeCoordonnee` | `choisir(initiale) → Coordonnee \| null`                                           | `LeafletSelecteurDeCoordonnee` (Leaflet + OSM, plein écran)                           |
| `CarteDesPoints`        | `afficher(points, surDeplacement)` / `choisirUneCoordonnee()` / `annulerLeChoix()` | `LeafletCarteDesPoints` (carte intégrée à l'éditeur, marqueurs numérotés déplaçables) |

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
  d'intention (`ajouterImage`, `monterImage`, `ajouterPoint`,
  `deplacerPointSurCarte`…), pas de setters.
- **Invariants protégés par l'agrégat** :
    - un point référence toujours une image du trajet ;
    - supprimer une image supprime ses points (la cascade est une règle du
      domaine, pas un détail de base de données) ;
    - l'ordre du voyage des points est **calculé** (image croissante, puis
      fraction décroissante — les pages se lisent de bas en haut), jamais stocké.

## Sérialisation (`trajets/serialisation/trajetJson.ts`)

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
  géolocalisation, horloge contrôlée, cadenceur manuel, fake-indexeddb) ; les
  assertions portent sur les valeurs produites.
- Le domaine se teste pur ; les adapters avec leurs fakes ; les écrans et le
  service worker en E2E Playwright (Chromium, WebKit, Firefox + viewports
  iPhone/Pixel), contre le **build de production** (`pnpm preview`).
- Ce qui reste manuel : le vrai GPS dans un vrai train, et les comportements
  PWA propres à iOS (permission redemandée à chaque session, wake lock fiable
  seulement depuis iOS 18.4).

## Pièges plateforme encodés dans le code

- `GeolocationPositionSource` : `watchPosition` throttlé (pas de
  `getCurrentPosition` en boucle) ; les fixes approximatifs (cellule, Wi-Fi,
  vitres athermiques d'un train) sont utilisés jusqu'à 3 km d'incertitude, et
  au-delà l'état dit « Position approximative (± X km) » plutôt que « perdu » ;
  erreurs passagères tolérées tant que le dernier fix est frais (tunnels) ;
  redémarrage du watch (débouncé) au retour au premier plan (page gelée par
  iOS/Android) ; chien de garde « dernière position il y a X min ».
- `NavigateurEcranAllume` : wake lock dans un try/catch, ré-acquis à chaque
  retour au premier plan (le système le libère quand la page est masquée).
- Images : `width`/`height` réservés avant tout décodage (offsets stables),
  `loading="lazy"` (une page décodée ≈ 35 Mo de mémoire), object URLs révoquées.
- IndexedDB : blobs stockés en `ArrayBuffer` (clonage de Blob fragile sur
  d'anciens Safari), sauvegarde de l'agrégat en une transaction, seules les
  nouvelles images sont réécrites.
