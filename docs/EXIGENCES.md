# Exigences & traçabilité

Les exigences sont formulées une ligne chacune et **reliées aux tests qui les
vérifient**. Les tests sont les critères d'acceptation exécutables : ils sont
nommés en BDD (`Étant donné / Quand / Alors`) et testés **par l'état** (voir
[ARCHITECTURE.md](ARCHITECTURE.md#démarche-de-test-bdd-par-létat)). Le
comportement côté utilisateur est décrit dans le [README](../README.md) ; ici on
liste le _quoi_ vérifiable et le _où c'est prouvé_.

Légende : `U` = test unitaire (Vitest), `E` = test de bout en bout (Playwright).

## Trajets

| #    | Exigence                                                                | Vérifié par                                 |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------- |
| TR-1 | Créer, renommer, supprimer un trajet                                    | `E e2e/trajets.spec.ts`                     |
| TR-2 | Un nom de trajet est non vide (sinon rejet)                             | `U NomDeTrajet.test.ts`                     |
| TR-3 | Les images sont ordonnées et réordonnables (▲/▼)                        | `U Trajet.test.ts`, `E e2e/editeur.spec.ts` |
| TR-4 | Charger restitue nom, images (ordre, dimensions, contenu) et points     | `U IdbTrajetRepository.test.ts`             |
| TR-5 | Un identifiant inconnu au chargement rend `null`                        | `U IdbTrajetRepository.test.ts`             |
| TR-6 | Les résumés sont rendus du plus ancien au plus récent, avec les comptes | `U IdbTrajetRepository.test.ts`             |

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
| SU-7  | La cible est placée aux trois quarts hauts, bornée au document                  | `U projection.test.ts` (`calculerDefilement`)                   |
| SU-8  | Message d'état lisible selon le résultat (attente/approx./perdu/hors-trajet)    | `U presentation.test.ts`, `U GeolocationPositionSource.test.ts` |
| SU-9  | Défilement humain coupe le suivi auto ; « Reprendre » le rétablit               | `E e2e/suivi.spec.ts`                                           |
| SU-10 | Fix approximatif toléré jusqu'à 3 km, en-deçà du seuil « hors trajet »          | `U precisionDuFix.test.ts`                                      |
| SU-11 | Erreurs passagères tolérées tant que le dernier fix est frais (tunnels)         | `U GeolocationPositionSource.test.ts`                           |
| SU-12 | « Permission refusée » n'est pas recouvert par le chien de garde                | `U GeolocationPositionSource.test.ts`                           |
| SU-13 | Une source arrêtée puis redémarrée ne traîne ni throttle ni silence hérités     | `U GeolocationPositionSource.test.ts`                           |
| SU-14 | Un seul verrou d'écran à la fois, et aucun laissé allumé après « relâcher »     | `U NavigateurEcranAllume.test.ts`                               |

## Simulation

| #    | Exigence                                                           | Vérifié par                                                 |
| ---- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| SI-1 | Une position simulée pilote le suivi comme le GPS réel (même port) | `U SimulationPositionSource.test.ts`, `E e2e/suivi.spec.ts` |
| SI-2 | Choisir la position sur la carte (repères du trajet visibles)      | `E e2e/suivi.spec.ts`                                       |

## Import / export

| #    | Exigence                                                                    | Vérifié par                                           |
| ---- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| IE-1 | Export → fichier JSON autonome (nom, images base64, points par index)       | `U trajetJson.test.ts`, `E e2e/import-export.spec.ts` |
| IE-2 | Aller-retour fidèle, y compris une image binaire réelle (octets 0–255)      | `U trajetJson.test.ts`                                |
| IE-3 | Import régénère les identifiants → toujours un nouveau trajet               | `U trajetJson.test.ts`, `E e2e/import-export.spec.ts` |
| IE-4 | Fichier étranger / version inconnue / incohérent → rejet avec message clair | `U trajetJson.test.ts`                                |

## Hors ligne (PWA)

| #    | Exigence                                                                 | Vérifié par                     |
| ---- | ------------------------------------------------------------------------ | ------------------------------- |
| HL-1 | Après une première visite, l'app fonctionne sans réseau (service worker) | `E e2e/horsligne.spec.ts`       |
| HL-2 | Les données persistent localement entre sessions (IndexedDB)             | `U IdbTrajetRepository.test.ts` |

## Qualité (transverse)

| #    | Exigence                                                                                                                                                                                                                        | Vérifié par                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| QA-1 | Le code typecheck sans erreur                                                                                                                                                                                                   | `pnpm typecheck` (CI)                                                                |
| QA-2 | Lint type-aware strict à zéro (aucun `!`, aucun `as` de forme — les casts de **marque** d'identifiant restent tolérés dans `domain/ids.ts` et à la frontière de persistance, cf. [ADR 0005](adr/0005-indexeddb-arraybuffer.md)) | `pnpm lint` (CI) — cf. [ADR 0002](adr/0002-lint-type-aware-strict.md)                |
| QA-3 | Pas de nouveau code mort / duplication / complexité introduits                                                                                                                                                                  | `pnpm exec fallow audit` (CI) — cf. [ADR 0003](adr/0003-fallow-garde-fou-qualite.md) |
