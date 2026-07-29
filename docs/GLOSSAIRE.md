# Glossaire — langage ubiquitaire

Les termes ci-dessous sont ceux du code (noms de classes, de méthodes, de
variables). Ils sont **en français**, comme tout le projet. Utiliser ce
vocabulaire — et lui seul — dans le code, les tests, les commits et les
discussions.

## Métier

| Terme                             | Définition                                                                                                                        | Dans le code                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Trajet**                        | Agrégat racine : un voyage documenté par des images ordonnées et des points géo-référencés. Protège ses invariants.               | `src/trajets/domain/Trajet.ts`                 |
| **Image (de trajet)**             | Une page du schéma de ligne (image importée). Les images sont **ordonnées** : la première = début du voyage.                      | `ImageDeTrajet`                                |
| **Point**                         | Un repère géo-référencé : une hauteur sur une image ↔ une coordonnée réelle.                                                      | `Point`                                        |
| **Coordonnée**                    | Value object lat/lon validé (`lat ∈ [−90, 90]`, `lon ∈ [−180, 180]`), immuable.                                                   | `src/trajets/domain/Coordonnee.ts`             |
| **Fraction verticale**            | Value object `∈ [0, 1]` : hauteur relative sur une image (`0` = haut, `1` = bas).                                                 | `FractionVerticale`                            |
| **Nom de trajet**                 | Value object : chaîne non vide.                                                                                                   | `NomDeTrajet`                                  |
| **Identifiants**                  | Types brandés (`TrajetId`, `ImageId`, `PointId`), forgés dans un seul endroit.                                                    | `src/trajets/domain/ids.ts`                    |
| **Ordre du voyage**               | Ordre **calculé** des points (image croissante, puis fraction décroissante — les pages se lisent de bas en haut). Jamais stocké.  | `Trajet.ordreVoyageDesPoints()`                |
| **Étape du voyage**               | Un point projeté dans le référentiel du document affiché : `{ coordonnee, offset }`.                                              | `EtapeDuVoyage`                                |
| **Offset**                        | Position verticale (px) d'une étape depuis le haut du document. **Relu à chaque position**, jamais mis en cache.                  | `EtapeDuVoyage.offset`                         |
| **Jonction de pages**             | Endroit où un même lieu apparaît en bas d'une page et en haut de la suivante (segment de longueur nulle).                         | garde-fou dans `projection.ts`                 |
| **Projection**                    | Projection orthogonale de la position GPS sur un segment du trajet (plan local équirectangulaire).                                | `projeterSurSegment`                           |
| **Segment**                       | Portion de trajet entre deux étapes consécutives.                                                                                 | `projection.ts`                                |
| **Adhérence**                     | Anti-oscillation : parmi les segments quasi ex æquo, on retient celui dont la cible bouge le moins par rapport au tick précédent. | `choisirLeSegment`                             |
| **Ancrage précédent**             | Résultat « sur-trajet » du tick précédent, mémorisé pour l'adhérence.                                                             | `AncragePrecedent`                             |
| **Seuil hors-trajet (adaptatif)** | `max(5 km, 20 % de la longueur du segment)` — au-delà, on est « hors trajet ».                                                    | `seuilHorsTrajet`                              |
| **Cible de défilement**           | Offset visé, placé aux trois quarts hauts de l'écran, borné au document.                                                          | `calculerCibleDeScroll` / `calculerDefilement` |
| **Suivi automatique**             | Le document défile tout seul selon la position. Coupé par un défilement humain ; « Reprendre » le rétablit.                       | `SuiviScreen`                                  |
| **Simulation**                    | Position fictive choisie à la main pour tester le géoréférencement sans bouger.                                                   | `SimulationPositionSource`                     |

## Architecture

| Terme                      | Définition                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hexagone**               | Un module métier = `domain/` (pur) + `ports/` (interfaces) + `adapters/` (implémentations en bordure) + `ui/` (écrans DOM, adapters entrants). |
| **Screaming architecture** | Le premier niveau de `src/` nomme le métier (`trajets/`, `suivi/`, `carte/`), pas la technique.                                                |
| **Domaine**                | Logique métier pure : zéro import plateforme, testable sans navigateur.                                                                        |
| **Port**                   | Interface TypeScript définie par le métier (ex. `TrajetRepository`, `PositionSource`).                                                         |
| **Adapter**                | Implémentation d'un port en bordure (ex. `IdbTrajetRepository`, `GeolocationPositionSource`).                                                  |
| **Composition root**       | `src/main.ts` : le **seul** fichier qui instancie les adapters concrets et les injecte (à la main, sans framework).                            |
| **Règle de dépendance**    | `domain` ne dépend de rien ; `ports` du domaine seul ; `adapters`/`ui` des ports + domaine ; seul `main.ts` connaît le concret.                |

## Plateforme

| Terme                  | Définition                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **PWA**                | Application web installable, ici **entièrement hors ligne** après une première visite.                              |
| **Service worker**     | Cache l'app pour le hors ligne (via `vite-plugin-pwa` / Workbox). Nécessite le build de production pour être testé. |
| **IndexedDB**          | Stockage local persistant des trajets (via la bibliothèque `idb`). Les images y sont en `ArrayBuffer`.              |
| **Wake lock**          | Verrou navigateur qui garde l'écran allumé pendant le suivi (best effort).                                          |
| **Tuiles OSM**         | Fonds de carte OpenStreetMap chargés par Leaflet ; celles déjà affichées restent dispo hors ligne.                  |
| **Import/export JSON** | Fichier autonome (nom + images base64 + points) pour transférer un trajet d'un appareil à l'autre sans réseau.      |
