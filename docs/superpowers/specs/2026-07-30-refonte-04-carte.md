# Lot 04 — Carte

**Périmètre strict** : `src/carte/**` (adapters et ports). **Rien d'autre.**

Règles communes : [index](2026-07-30-refonte-00-index.md#règles-communes-à-tous-les-lots).

## Constat général

Deux adapters Leaflet coexistent — la carte intégrée à l'éditeur et la carte
plein écran — et refont chacun le même travail avec des valeurs divergentes. Un
correctif de bibliothèque est appliqué par effet de bord d'import. Et les deux
ports offrent deux interfaces différentes pour le même besoin, ce qui produit un
comportement différent selon la taille de l'écran.

Ce lot peut **changer les signatures des ports**, donc casser
`src/trajets/ui/EditeurTrajetScreen.ts` et `src/suivi/ui/SuiviScreen.ts`. C'est
attendu : ne pas y toucher, le lot 05 les répare.

## Correctifs

### 1. Le correctif d'icônes ne doit plus être un effet de bord d'import

`LeafletSelecteurDeCoordonnee.ts:15-16` mute `L.Icon.Default.prototype` **au
chargement du module** — donc l'ordre des imports décide du comportement, et
`LeafletCarteDesPoints` hérite d'un correctif qu'il ne demande pas. La ligne 15
contient de surcroît un `as` de forme.

Déplacer la configuration dans une fonction nommée et idempotente
(`configurerLeaflet()`), appelée explicitement par les deux adapters au moment où
ils créent leur carte. Remplacer le cast par
`Reflect.deleteProperty(L.Icon.Default.prototype, '_getIconUrl')`.

### 2. Une seule conversion `Coordonnee` ↔ `L.LatLng`

`evenement.latlng.wrap()` suivi de `Coordonnee.creer(lat, lng)` est réécrit à
**cinq** endroits (`LeafletCarteDesPoints.ts:89-90`, `:111-112` ;
`LeafletSelecteurDeCoordonnee.ts:82-83`, `:105-107`, `:132-133`), et la
conversion inverse `[latitude, longitude]` à six. Un oubli de `.wrap()` produit
une longitude hors `[-180, 180]` et fait lever `Coordonnee.creer` depuis un
gestionnaire d'événement Leaflet, sans filet.

Créer un module interne à la capacité (par exemple
`src/carte/adapters/conversion.ts`) avec `versCoordonnee(latLng: L.LatLng): Coordonnee`
(qui applique `.wrap()`) et `versLatLng(coordonnee: Coordonnee): [number, number]`.
Les deux adapters l'utilisent partout.

### 3. Un seul recadrage sur un ensemble de points

`LeafletCarteDesPoints.recadrer` (`:117-127`) et le recadrage de
`LeafletSelecteurDeCoordonnee.choisir` (`:59-67`) font la même chose avec des
valeurs **divergentes** : `padding: [30, 30], maxZoom: 13` contre
`padding: [40, 40], maxZoom: 12`. Rien ne justifie l'écart, vraisemblablement
accidentel.

Extraire un `recadrerSurLesPoints(carte, points)` partagé, avec des valeurs
uniques et un repli sur `VUE_FRANCE` quand la liste est vide. Choisir l'un des
deux jeux de valeurs et le documenter d'une ligne.

### 4. `VUE_FRANCE` sans `as`

`coucheOsm.ts:16` fait `centre: [46.6, 2.4] as [number, number]`. Remplacer par
une annotation :
`export const VUE_FRANCE: { centre: [number, number]; zoom: number } = { … }`.

### 5. La saisie manuelle valide ses champs sur place

`placerDepuisLaSaisie` (`LeafletSelecteurDeCoordonnee.ts:111-126`) passe deux
`Number.parseFloat` de champs que `effacerLaSelection` (`:149-155`) vient de
vider directement à `Coordonnee.creer`, puis relaie « Latitude invalide : NaN » —
un message technique du domaine — comme consigne d'utilisation.

Valider les deux champs sur place (nombres finis) et rédiger une consigne
utilisable : « Saisissez une latitude et une longitude valides. » N'introduire
aucune hiérarchie d'erreurs.

### 6. Aligner les deux contrats de choix de coordonnée

`SelecteurDeCoordonnee.choisir(coordonneeInitiale, reperes?)`
(`SelecteurDeCoordonneePort.ts:15`) et `CarteDesPoints.choisirUneCoordonnee()`
(`CarteDesPointsPort.ts:29`) répondent au **même** besoin avec deux interfaces
différentes : le second ignore l'initiale et les repères. Comme l'éditeur choisit
l'un ou l'autre selon la largeur de l'écran (`EditeurTrajetScreen.ts:174`),
déplacer un point sur grand écran **ne recentre pas** la carte sur sa position
actuelle, contrairement au mobile.

Donner à `CarteDesPoints.choisirUneCoordonnee(coordonneeInitiale: Coordonnee | null)`
la même capacité : quand une initiale est fournie, centrer la carte dessus avant
d'armer le clic (les repères, eux, y sont déjà affichés en permanence par
`afficher`). Mettre à jour la documentation du contrat dans le port.

- Étant donné un point existant, quand j'arme le choix d'une coordonnée avec sa
  position, alors la carte est centrée sur elle.

### 7. Un choix armé doit pouvoir être abandonné proprement

`choisirUneCoordonnee` (`:58-64`) arme une promesse résolue par un clic ; rien ne
garantit qu'elle soit résolue si l'écran change. `annulerLeChoix` existe et le
contrat le documente : vérifier par un test qu'un choix armé puis annulé résout
bien `null` et n'arme rien en double.

## Définition de terminé

- `pnpm exec vitest run src/carte` est vert (créer les tests manquants ; Leaflet
  demande `jsdom`, comme `GeolocationPositionSource.test.ts` le fait déjà).
- Zéro `as` de forme dans le périmètre.
- Aucun fichier hors périmètre modifié.
- Rapport final : les signatures de ports modifiées et la consigne exacte de
  migration pour les deux écrans (le lot 05 s'en sert).
