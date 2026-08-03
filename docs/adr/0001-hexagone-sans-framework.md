# ADR 0001 — Hexagone + screaming, sans framework UI

- **Statut** : Acceptée (2026-07-10)

## Contexte

PWA de suivi GPS, entièrement hors ligne, développée en solo et destinée à
durer. Deux exigences fortes : une logique métier (projection géo → défilement,
invariants d'un trajet) **testable sans navigateur**, et une **longévité** qui
ne dépende pas des cycles de vie d'un framework front.

## Décision

Architecture **hexagonale** (ports & adapters) avec **screaming architecture** :
le premier niveau de `src/` nomme le métier (`trajets/`, `suivi/`, `carte/`),
pas la technique. Chaque capacité = `domain/` + `ports/` + `adapters/` + `ui/`.

**Aucun framework UI** (pas de React/Vue/Svelte) : les écrans sont des adapters
entrants en DOM natif. L'injection de dépendances est **manuelle**, dans le seul
`src/main.ts` (composition root).

Depuis l'[ADR 0008](0008-interface-en-custom-elements-natifs.md), ce DOM natif
est celui des **custom elements** — quatre API de la plateforme, pas un
framework. La décision ci-dessus reste entière : le rendu demeure explicite.

## Conséquences

- ➕ Domaine pur, testé sans navigateur ni mocks d'interaction.
- ➕ Bundle réduit, zéro « framework churn », dépendances minimales.
- ➕ La simulation, le mode test, l'ajout d'un adapter tombent de l'architecture.
- ➖ Câblage DOM à la main : plus verbeux, discipline requise dans les écrans.
- ➖ Pas de rendu déclaratif : les écrans re-rendent explicitement (`render()`).

Détail vivant : [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
