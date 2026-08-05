# Exigences & traçabilité

Les exigences sont formulées une ligne chacune et **reliées aux tests qui les
vérifient**. Les tests sont les critères d'acceptation exécutables : ils sont
nommés en BDD (`Étant donné / Quand / Alors`) et testés **par l'état** (voir
[ARCHITECTURE.md](ARCHITECTURE.md#démarche-de-test-bdd-par-létat)). Le
comportement côté utilisateur est décrit dans le [README](../README.md) ; ici on
liste le _quoi_ vérifiable et le _où c'est prouvé_.

Légende : `U` = test unitaire (Vitest), `E` = test de bout en bout (Playwright).

## Trajets

| #     | Exigence                                                                                   | Vérifié par                                                      |
| ----- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| TR-1  | Créer, renommer, supprimer un trajet                                                       | `E e2e/trajets.spec.ts`                                          |
| TR-2  | Un nom de trajet est non vide (sinon rejet)                                                | `U NomDeTrajet.test.ts`                                          |
| TR-3  | Les images sont ordonnées et réordonnables (▲/▼)                                           | `U Trajet.test.ts`, `E e2e/editeur.spec.ts`                      |
| TR-4  | Charger restitue nom, images (ordre, dimensions, content) et points                        | `U IdbTrajetRepository.test.ts`                                  |
| TR-5  | Un identifiant inconnu au chargement rend `null`                                           | `U IdbTrajetRepository.test.ts`                                  |
| TR-6  | Les résumés sont rendus du plus ancien au plus récent, avec les comptes                    | `U IdbTrajetRepository.test.ts`                                  |
| TR-7  | Un lot importé se lit sous les pages existantes, dans l'ordre de l'explorateur             | `U Trajet.test.ts`, `E e2e/editeur.spec.ts`                      |
| TR-8  | Une liste illisible explique la panne et laisse réessayer, sans message d'accueil trompeur | `U TrajetsListScreen.test.ts`                                    |
| TR-9  | Une écriture refusée fait repartir l'écran de ce qui est réellement stocké                 | `U TrajetEditorScreen.test.ts`                                   |
| TR-10 | Les comptes d'un trajet se lisent en français : pluriel par compte, absence en mots        | `U trajets/domain/presentation.test.ts`, `E e2e/trajets.spec.ts` |

## Géoréférencement

| #    | Exigence                                                                     | Vérifié par                                         |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| GR-1 | Coordonnée validée (`lat ∈ [−90,90]`, `lon ∈ [−180,180]`)                    | `U Coordonnee.test.ts`                              |
| GR-2 | Fraction verticale `∈ [0,1]`                                                 | `U FractionVerticale.test.ts`                       |
| GR-3 | Ajouter un point (image → carte) apparaît en liste et en marqueur            | `E e2e/points.spec.ts`                              |
| GR-4 | Clic droit sur l'image place un point directement puis choisit la coordonnée | `E e2e/points.spec.ts`                              |
| GR-5 | Déplacer un point sur l'image / sur la carte (liste ou bouton flottant)      | `E e2e/points.spec.ts`                              |
| GR-6 | Un point référence toujours une image du trajet (invariant)                  | `U Trajet.test.ts`                                  |
| GR-7 | Supprimer une image supprime ses points (cascade)                            | `U Trajet.test.ts`, `U IdbTrajetRepository.test.ts` |
| GR-8 | Carte intégrée : marqueurs numérotés, déplaçables ; placement responsive     | `E e2e/carte-editeur.spec.ts`                       |

## Suivi

| #     | Exigence                                                                        | Vérifié par                                                     |
| ----- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| SU-1  | Moins de deux points → suivi impossible (état explicite)                        | `U projection.test.ts`, `E e2e/suivi.spec.ts`                   |
| SU-2  | Position sur une étape → cible = offset de l'étape ; entre deux → interpolation | `U projection.test.ts`                                          |
| SU-3  | Avant/après le trajet → cible bornée à la première/dernière étape               | `U projection.test.ts`                                          |
| SU-4  | Seuil « hors trajet » adaptatif `max(5 km, 20 % du segment)`                    | `U projection.test.ts`                                          |
| SU-5  | Segment de longueur nulle (jonction) → pas de division par zéro                 | `U projection.test.ts`                                          |
| SU-6  | Adhérence : le bruit GPS près d'une jonction ne fait pas sauter la page         | `U projection.test.ts`                                          |
| SU-7  | La cible est placée aux trois quarts hauts, bornée au document                  | `U projection.test.ts` (`computeScroll`)                        |
| SU-8  | Message d'état lisible selon le résultat (attente/approx./perdu/hors-trajet)    | `U presentation.test.ts`, `U GeolocationPositionSource.test.ts` |
| SU-9  | Défilement humain coupe le suivi auto ; « Reprendre » le rétablit               | `E e2e/suivi.spec.ts`                                           |
| SU-10 | Fix approximatif toléré jusqu'à 3 km, en-deçà du seuil « hors trajet »          | `U precisionDuFix.test.ts`                                      |
| SU-11 | Erreurs passagères tolérées tant que le dernier fix est frais (tunnels)         | `U GeolocationPositionSource.test.ts`                           |
| SU-12 | « Permission refusée » n'est pas recouvert par le chien de garde                | `U GeolocationPositionSource.test.ts`                           |
| SU-13 | Une source arrêtée puis redémarrée ne traîne ni throttle ni silence hérités     | `U GeolocationPositionSource.test.ts`                           |
| SU-14 | Un seul lock d'écran à la fois, et aucun laissé allumé après « relâcher »       | `U BrowserScreenWakeLock.test.ts`                               |

### Aperçu du trajet

| #     | Exigence                                                                                                                      | Vérifié par                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| SU-15 | Aperçu du trajet entier avec une barre à la position : côte à côte au-dessus de 900 px, en incrustation basculable en dessous | `U SuiviScreen.test.ts`, `E e2e/suivi.spec.ts` |
| SU-16 | L'aperçu tient dans la hauteur disponible, quels que soient le nombre de pages et leurs ratios                                | `U overview.test.ts`, `E e2e/suivi.spec.ts`    |
| SU-17 | Aperçu et défilement désignent le même endroit : une seule décision de projection, réinterpolée par vue                       | `U projection.test.ts`                         |
| SU-18 | La barre ne bouge que « sur trajet », et disparaît quand on quitte la simulation                                              | `E e2e/suivi.spec.ts`                          |

## Simulation

| #    | Exigence                                                           | Vérifié par                                                 |
| ---- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| SI-1 | Une position simulée pilote le suivi comme le GPS réel (même port) | `U SimulationPositionSource.test.ts`, `E e2e/suivi.spec.ts` |
| SI-2 | Choisir la position sur la carte (repères du trajet visibles)      | `E e2e/suivi.spec.ts`                                       |

## Import / export

| #    | Exigence                                                                    | Vérifié par                                                   |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| IE-1 | Export → fichier JSON autonome (nom, images base64, points par index)       | `U trajetJson.test.ts`, `E e2e/import-export.spec.ts`         |
| IE-2 | Aller-retour fidèle, y compris une image binaire réelle (bytes 0–255)       | `U trajetJson.test.ts`                                        |
| IE-3 | Import régénère les identifiants → toujours un nouveau trajet               | `U trajetJson.test.ts`, `E e2e/import-export.spec.ts`         |
| IE-4 | Fichier étranger / version inconnue / incohérent → rejet avec message clair | `U trajetJson.test.ts`                                        |
| IE-5 | Exporter depuis l'éditeur, sans repasser par la liste                       | `U TrajetEditorScreen.test.ts`, `E e2e/import-export.spec.ts` |
| IE-6 | Le nom du fichier est celui du trajet, caractères interdits remplacés       | `U downloadTrajet.test.ts`                                    |

## Hors ligne (PWA)

| #    | Exigence                                                                 | Vérifié par                     |
| ---- | ------------------------------------------------------------------------ | ------------------------------- |
| HL-1 | Après une première visite, l'app fonctionne sans réseau (service worker) | `E e2e/horsligne.spec.ts`       |
| HL-2 | Les données persistent localement entre sessions (IndexedDB)             | `U IdbTrajetRepository.test.ts` |

## Cycle de vie des écrans

Un écran vit le temps de son attachement au document
([ADR 0008](adr/0008-interface-en-custom-elements-natifs.md)). Ces exigences
disent ce que son départ doit avoir rendu.

| #    | Exigence                                                                                        | Vérifié par                                                      |
| ---- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| CV-1 | Quitter le suivi arrête les sources de position et relâche le verrou d'écran                    | `U SuiviScreen.test.ts`                                          |
| CV-2 | Quitter un écran retire ses écouteurs, y compris ceux posés sur `window`                        | `U SuiviScreen.test.ts`                                          |
| CV-3 | Un chargement qui s'achève après la sortie ne monte rien et ne prend aucun verrou               | `U SuiviScreen.test.ts`, `U TrajetEditorScreen.test.ts`          |
| CV-4 | Une page retirée de l'affichage libère son URL d'objet ; un simple déplacement ne la libère pas | `U SchemaPage.test.ts`, `U TrajetEditorScreen.test.ts`           |
| CV-5 | Une page inchangée n'est pas redécodée quand l'écran rend à nouveau                             | `U TrajetEditorScreen.test.ts`                                   |
| CV-6 | Rouvrir l'éditeur remonte sa carte sur le conteneur neuf                                        | `U LeafletCarteDesPoints.test.ts`, `E e2e/carte-editeur.spec.ts` |

| CV-7 | Une vignette d'aperçu relâche la page pleine taille dès qu'elle est peinte, et les pages se peignent une à une | `U OverviewPage.test.ts`, `U SuiviScreen.test.ts` |

## Qualité (transverse)

| #    | Exigence                                                                                                                                                                                                                        | Vérifié par                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| QA-1 | Le code typecheck sans erreur                                                                                                                                                                                                   | `pnpm typecheck` (CI)                                                                                                      |
| QA-2 | Lint type-aware strict à zéro (aucun `!`, aucun `as` de forme — les casts de **marque** d'identifiant restent tolérés dans `domain/ids.ts` et à la frontière de persistance, cf. [ADR 0005](adr/0005-indexeddb-arraybuffer.md)) | `pnpm lint` (CI) — cf. [ADR 0002](adr/0002-lint-type-aware-strict.md)                                                      |
| QA-3 | Pas de nouveau code mort / duplication / complexité introduits                                                                                                                                                                  | `pnpm exec fallow audit` (CI) — cf. [ADR 0003](adr/0003-fallow-garde-fou-qualite.md)                                       |
| QA-4 | Les garde-fous du domaine et des adapters ont un témoin exécutable — hormis les mutants équivalents et les gardes inatteignables, commentés sur place                                                                           | `pnpm mutation` (à la demande, **hors CI**) — cf. [ADR 0006](adr/0006-tests-de-mutation-stryker.md)                        |
| QA-5 | Un bouton qui perd son libellé sous 560 px garde son nom accessible dans `aria-label` — sinon il s'annonce « 🖼️ »                                                                                                               | `U elements.test.ts`, `U TrajetEditorScreen.test.ts`, et toute la suite `E` rejouée sur iPhone 14 / Pixel 7, sous le seuil |
