# Glossaire — langage ubiquitaire

Les termes ci-dessous sont ceux du code (noms de classes, de méthodes, de
variables). Ils sont **en français** parce qu'ils nomment le métier — et c'est
la seule raison. Le code qui ne dit rien du métier est **en anglais**
([ADR 0007](adr/0007-langue-du-code-metier-francais-technique-anglais.md)).

Utiliser ce vocabulaire — et lui seul — dans le code, les tests, les commits et
les discussions. La section [Lexique](#lexique) trace la frontière : la liste
close des mots français réputés métier, et la traduction retenue pour les mots
techniques récurrents.

## Métier

| Terme                             | Définition                                                                                                                                                                     | Dans le code                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **Trajet**                        | Agrégat racine : un voyage documenté par des images ordonnées et des points géo-référencés. Protège ses invariants.                                                            | `src/trajets/domain/Trajet.ts`                                      |
| **Image (de trajet)**             | Une page du schéma de ligne (image importée). Les images sont **ordonnées** : la première = début du voyage.                                                                   | `ImageDeTrajet`                                                     |
| **Point**                         | Un repère géo-référencé : une hauteur sur une image ↔ une coordonnée réelle.                                                                                                   | `Point`                                                             |
| **Coordonnée**                    | Value object lat/lon validé (`lat ∈ [−90, 90]`, `lon ∈ [−180, 180]`), immuable.                                                                                                | `src/trajets/domain/Coordonnee.ts`                                  |
| **Fraction verticale**            | Value object `∈ [0, 1]` : hauteur relative sur une image (`0` = haut, `1` = bas).                                                                                              | `FractionVerticale`                                                 |
| **Nom de trajet**                 | Value object : chaîne non vide.                                                                                                                                                | `NomDeTrajet`                                                       |
| **Identifiants**                  | Types brandés (`TrajetId`, `ImageId`, `PointId`), forgés dans un seul endroit.                                                                                                 | `src/trajets/domain/ids.ts`                                         |
| **Ordre du voyage**               | Ordre **calculé** des points (image croissante, puis fraction décroissante — les pages se lisent de bas en haut). Jamais stocké.                                               | `Trajet.pointsInOrdreDuVoyage()`                                    |
| **Ordre de lecture**              | Ordre d'affichage de la pile : l'inverse de l'ordre du voyage, les pages se lisant de bas en haut. C'est aussi l'ordre dans lequel l'import lit la sélection de l'explorateur. | `Trajet.imagesInReadingOrder()`, `Trajet.addImagesInReadingOrder()` |
| **Étape du voyage**               | Un point projeté dans le référentiel du document affiché : `{ coordonnee, offset }`.                                                                                           | `EtapeDuVoyage`                                                     |
| **Offset**                        | Position verticale (px) d'une étape depuis le haut du document. **Relu à chaque position**, jamais mis en cache.                                                               | `EtapeDuVoyage.offset`                                              |
| **Jonction de pages**             | Endroit où un même lieu apparaît en bas d'une page et en haut de la suivante (segment de longueur nulle).                                                                      | garde-fou dans `projection.ts`                                      |
| **Projection**                    | Projection orthogonale de la position GPS sur un segment du trajet (plan local équirectangulaire).                                                                             | `projectOnSegment`                                                  |
| **Segment**                       | Portion de trajet entre deux étapes consécutives.                                                                                                                              | `projection.ts`                                                     |
| **Adhérence**                     | Anti-oscillation : parmi les segments quasi ex æquo, on retient celui dont la cible bouge le moins par rapport au tick précédent.                                              | `chooseSegment`                                                     |
| **Ancrage précédent**             | Résultat « sur-trajet » du tick précédent, mémorisé pour l'adhérence.                                                                                                          | `AncragePrecedent`                                                  |
| **Seuil hors-trajet (adaptatif)** | `max(5 km, 20 % de la longueur du segment)` — au-delà, on est « hors trajet ».                                                                                                 | `seuilHorsTrajet`                                                   |
| **Cible de défilement**           | Offset visé, placé aux trois quarts hauts de l'écran, borné au document.                                                                                                       | `computeScrollTarget` / `computeScroll`                             |
| **Suivi automatique**             | Le document défile tout seul selon la position. Coupé par un défilement humain ; « Reprendre » le rétablit.                                                                    | `SuiviScreen`                                                       |
| **Simulation**                    | Position fictive choisie à la main pour tester le géoréférencement sans bouger.                                                                                                | `SimulationPositionSource`                                          |

| **Position sur le trajet** | Le segment retenu et l'avancement dessus. Indépendante de tout référentiel de pixels : c'est ce qui permet à l'aperçu et au défilement de désigner le même endroit. | `TrajetPosition` |
| **Aperçu du trajet** | Le voyage entier réduit pour tenir dans une hauteur d'écran, avec une barre à la position. Des vignettes peintes une fois, pas les images une seconde fois. | `OverviewPage`, `ratiosSum` |

| **Numéro de page** | Le rang d'une page dans la pile affichée, compté depuis le haut. L'inverse du rang dans le voyage, qui part du bas. | `Trajet.numberedImagesInReadingOrder` |

## Architecture

| Terme                      | Définition                                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hexagone**               | Un module métier = `domain/` (pur) + `ports/` (interfaces) + `adapters/` (implémentations en bordure) + `ui/` (écrans DOM, adapters entrants).                             |
| **Screaming architecture** | Le premier niveau de `src/` nomme le métier (`trajets/`, `suivi/`, `carte/`), pas la technique.                                                                            |
| **Domaine**                | Logique métier pure : zéro import plateforme, testable sans navigateur.                                                                                                    |
| **Port**                   | Interface TypeScript définie par le métier (ex. `TrajetRepository`, `PositionSource`).                                                                                     |
| **Adapter**                | Implémentation d'un port en bordure (ex. `IdbTrajetRepository`, `GeolocationPositionSource`).                                                                              |
| **Composition root**       | `src/main.ts` : le **seul** fichier qui instancie les adapters concrets et les injecte (à la main, sans framework).                                                        |
| **Règle de dépendance**    | `domain` ne dépend de rien ; `ports` du domaine seul ; `adapters`/`ui` des ports + domaine ; seul `main.ts` connaît le concret.                                            |
| **Écran**                  | Un custom element monté dans `<main id="app">`. L'attacher détache le précédent ; le détachement range tout ([ADR 0008](adr/0008-interface-en-custom-elements-natifs.md)). |
| **Feuille**                | Un fragment d'interface sans port ni domaine : données en entrée (propriétés), intentions en sortie (événements).                                                          |
| **Intention**              | L'événement qu'une feuille émet pour dire ce que l'utilisateur veut. L'écran écoute et décide — la feuille n'agit jamais.                                                  |
| **Gabarit**                | Le balisage d'un élément, dans un `.html` à côté de son `.ts`, importé en `?raw` et cloné.                                                                                 |

## Tests

| Terme                   | Définition                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Test par l'état**     | On agit, puis on assère sur les **valeurs produites** — jamais sur les appels reçus. Pas de `vi.fn`, pas de `toHaveBeenCalled`.                                       |
| **Fake**                | Doublure écrite à la main et injectée (fausse géolocalisation, horloge contrôlée, cadenceur manuel, faux premier plan). Observable par son état, pas par des espions. |
| **Suite de contrat**    | Batterie de tests d'un **port**, rejouée contre chacun de ses adapters, pour les empêcher de diverger.                                                                |
| **Test de mutation**    | Abîmer le code un endroit à la fois et relancer les tests (`pnpm mutation`). Répond à « ce test protège-t-il vraiment cette règle ? ».                                |
| **Mutant survivant**    | Modification du code que la suite ne détecte pas : le signe qu'une ligne n'a pas de témoin.                                                                           |
| **Mutant équivalent**   | Mutation qui ne change **aucun** comportement observable : impossible à tuer, et ce n'est pas un défaut. On l'explique en commentaire.                                |
| **Garde inatteignable** | Garde que les invariants rendent impossible à déclencher, conservée seulement parce que `!` est banni. Survivra toujours aux tests de mutation.                       |

## Plateforme

| Terme                  | Définition                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **PWA**                | Application web installable, ici **entièrement hors ligne** après une première visite.                              |
| **Service worker**     | Cache l'app pour le hors ligne (via `vite-plugin-pwa` / Workbox). Nécessite le build de production pour être testé. |
| **IndexedDB**          | Stockage local persistant des trajets (via la bibliothèque `idb`). Les images y sont en `ArrayBuffer`.              |
| **Wake lock**          | Verrou navigateur qui garde l'écran allumé pendant le suivi (best effort).                                          |
| **Tuiles OSM**         | Fonds de carte OpenStreetMap chargés par Leaflet ; celles déjà affichées restent dispo hors ligne.                  |
| **Import/export JSON** | Fichier autonome (nom + images base64 + points) pour transférer un trajet d'un appareil à l'autre sans réseau.      |

## Lexique

La règle de nommage se décide **mot à mot** : chaque mot d'un identifiant reste
français s'il figure ci-dessous, passe à l'anglais sinon
([ADR 0007](adr/0007-langue-du-code-metier-francais-technique-anglais.md)).
Un mot absent de ce lexique est technique par défaut.

### Mots français — le métier

Liste **close**. Y ajouter un mot, c'est étendre le langage ubiquitaire : ça se
discute, ça ne se décide pas en écrivant un identifiant.

`trajet` · `image` · `page` · `schéma` · `point` · `repère` · `coordonnée` ·
`latitude` · `longitude` · `fraction` · `verticale` · `voyage` · `étape` ·
`offset` · `jonction` · `segment` · `projection` · `adhérence` · `ancrage` ·
`seuil` · `suivi` · `simulation` · `carte` ·
`géoréférencé`

### Mots à double vie

Le même mot est métier ou technique **selon son référent**. C'est la seule
partie du lexique qui demande de réfléchir ; en cas de doute, demander de quoi
le nom parle, pas comment il s'écrit.

| Mot         | Métier — reste français                                       | Technique — passe à l'anglais                                                        |
| ----------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `ligne`     | la ligne ferroviaire, dans « schéma de ligne »                | une **rangée** de liste (`.ligne-trajet` → `.trajet-row`)                            |
| `nom`       | `NomDeTrajet`, `ImageDeTrajet.nom`, `PageAAfficher.nom`       | nom de fichier, d'écran, de propriété lue par réflexion → `name`                     |
| `ordre`     | l'ordre du voyage (`ordreVoyageDesPoints`)                    | un ordre de tri quelconque → `order`                                                 |
| `précision` | `precisionDuFix`, `imprecisionMetres` — la qualité du fix     | la valeur `coords.accuracy` rendue par l'API → `accuracy` ⚠️ faux ami de métrologie  |
| `état`      | les étiquettes d'état (`'attente'`, `'hors-trajet'`…) restent | le **discriminant** d'union → `kind` ; l'élément DOM qui l'affiche → `statusElement` |
| `pile`      | jamais                                                        | toujours → `stack` (mais `PileDePages` → `PageStack` : « page » survit)              |

### Mots techniques récurrents — traduction retenue

Une entrée ici ferme la discussion : on n'invente pas un synonyme au coup par
coup. C'est ce qui empêche le dépôt d'avoir trois mots pour un concept.

| Français                    | Anglais               | Français                 | Anglais                |
| --------------------------- | --------------------- | ------------------------ | ---------------------- |
| `aide`                      | `help`                | `intitulé` (nom access.) | `ariaLabel`            |
| `aperçu`                    | `overview`            | `bascule`, `basculer`    | `toggle`               |
| `peindre`                   | `paint`               |                          |                        |
| `banc`, `bancDEssai`        | `testBed`             | `lancer`, `lanceur`      | `run`, `runner`        |
| `bandeau`                   | `banner`              | `largeur` / `hauteur`    | `width` / `height`     |
| `barre`                     | `bar`                 | `liste`                  | `list`                 |
| `borner`                    | `clamp`               | `maintenir`/`relâcher`   | `acquire`/`release`    |
| `bouton`                    | `button`              | `marqueur`               | `marker`               |
| `cadenceur`                 | `scheduler`           | `mesure` (e2e)           | `requireDefined`       |
| `cadre` (mesure)            | `rect`                | `navigateur`             | `browser`              |
| `cadre` (conteneur)         | `frame`               | `nombre`                 | `number`               |
| `champ` (formulaire)        | `input`               | `octets`                 | `bytes`                |
| `champ` (propriété d'objet) | `field`               | `premier plan`           | `foreground`           |
| `charger` / `sauvegarder`   | `load` / `save`       | `rendre`                 | `render`               |
| `télécharger`               | `download`            | `libellé` (visible)      | `label`                |
| `pictogramme`               | `icon`                |                          |                        |
| `clé`                       | `key`                 | `requête` / `sélecteur`  | `query` / `selector`   |
| `colonne`                   | `column`              | `résultat`               | `result`               |
| `conteneur`                 | `container`           | `secondaire`/`flottant`  | `secondary`/`floating` |
| `créer`                     | `create`              | `stockage`               | `storage`              |
| `démarrer` / `arrêter`      | `start` / `stop`      | `supprimer`              | `delete`               |
| `données`                   | `data`                | `surveillance`           | `watch`                |
| `écran`                     | `screen`              | `tableau`                | `array`                |
| `écran allumé`              | `wake lock`           | `taille`                 | `size`                 |
| `élément à` (accès indexé)  | `requireElementAt` ⚠️ | `texte`                  | `text`                 |
| `enregistrement`            | `record`              | `travail`                | `task`                 |
| `en-tête`                   | `header`              | `valeur`                 | `value`                |
| `erreur`                    | `error`               | `verrou`                 | `lock`                 |
| `événement`                 | `event`               | `vide`                   | `empty`                |
| `fichier`                   | `file`                | `zone`                   | `area`                 |
| `file d'attente`            | `queue`               |                          |                        |

**L'ordre des mots suit l'anglais**, pas le français : le qualifiant passe devant
le nom qu'il qualifie. Le mot métier garde sa forme française à sa nouvelle
place.

```
marqueur-point   ->  point-marker        barre-actions  ->  action-bar
cadre-image      ->  image-frame         liste-trajets  ->  trajets-list
etat-suivi       ->  suivi-status        bandeau-consigne -> hint-banner
```

⚠️ **`requireElementAt`, surtout pas `elementAt`.** `Array.prototype.at()` existe
sur la cible ES2022 : il accepte les indices négatifs et rend `undefined` hors
bornes, là où notre fonction **lève** — y compris pour `-1`. Le préfixe
`require` dit la garde ; `elementAt` inviterait l'usage que l'[ADR 0002](adr/0002-lint-type-aware-strict.md)
cherche à interdire.

### Ce qui reste français quoi qu'il arrive

- **La prose** : commentaires, JSDoc, titres de tests `Étant donné / Quand /
Alors`, et toute chaîne visible par l'utilisateur.
- **Les pas de scénario e2e** (`ouvrirUnTrajetVierge`, `ajouterUnPoint`,
  `cliquerSurLImage`) : c'est le scénario prolongé en code. L'échafaudage
  technique du même fichier, lui, suit la règle.
- **Les clés persistées** : magasins et index IndexedDB, clés du JSON v1, clé
  `localStorage`. Ce sont des données déjà écrites sur les appareils, pas des
  identifiants — la correspondance avec le nom TypeScript anglais est explicite
  à la frontière de l'adapter.
