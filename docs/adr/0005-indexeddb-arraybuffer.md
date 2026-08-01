# ADR 0005 — Persistance IndexedDB, images en `ArrayBuffer`

- **Statut** : Acceptée (2026-07-10)

## Contexte

Une PWA hors ligne doit persister les trajets localement, images comprises
(plusieurs Mo). Le storage doit survivre à la fermeture de l'app et rester
fiable sur tous les navigateurs cibles, y compris d'anciens Safari.

## Décision

Persistance dans **IndexedDB** via la bibliothèque `idb`
(`src/trajets/adapters/IdbTrajetRepository.ts`).

- Les images sont stockées en **`ArrayBuffer`**, pas en `Blob` : le clonage de
  `Blob` dans IndexedDB a longtemps été fragile sur Safari ; le buffer brut
  passe partout. Conversion `Blob ↔ ArrayBuffer` à la frontière de l'adapter.
- La sauvegarde de l'agrégat se fait en **une seule transaction** ; seules les
  **nouvelles** images sont réécrites (les tampons sont préparés _avant_
  d'ouvrir la transaction, car attendre une promesse étrangère la fermerait).

## Conséquences

- ➕ Robuste multi-navigateurs ; sauvegarde atomique ; pas de réécriture inutile.
- ➖ Conversion `ArrayBuffer` ↔ `Blob` à gérer aux bords (rehydratation, export).
- ➖ Casts d'ID brandés à la frontière de persistance (`… as TrajetId`), tolérés
  ici car frontière de typage nominal (cf. [0002](0002-lint-type-aware-strict.md)).
