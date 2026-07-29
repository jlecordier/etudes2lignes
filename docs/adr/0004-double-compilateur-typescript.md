# ADR 0004 — Double compilateur TypeScript (`tsc` natif + `tsc6`)

- **Statut** : Acceptée (2026-07-28)

## Contexte

Le projet veut un typecheck/build rapide (compilateur natif TS 7) tout en
gardant `typescript-eslint`, qui s'appuie sur l'API du compilateur TypeScript 6.

## Décision

Deux paquets TypeScript coexistent (alias dans `package.json`) :

- `typescript` → `@typescript/typescript6` — fournit le binaire **`tsc6`**, et
  c'est lui que consomme `typescript-eslint` pour l'analyse type-aware ;
- `@typescript/native` → `typescript@7` — fournit le binaire **`tsc`**, utilisé
  par les scripts `typecheck` (`tsc --noEmit`) et `build`.

## Conséquences

- ➕ Typecheck/build sur le compilateur natif rapide ; lint cohérent avec TS 6.
- ➖ **Piège** : `@typescript/native` n'est _importé_ nulle part (il ne fournit
  qu'un binaire). fallow le signale « inutilisé » et `fallow fix` voudrait le
  retirer — **ce qui casse `tsc`** (le binaire disparaît). On l'a vécu.
    - Parade : `@typescript/native` est dans `ignoreDependencies` de
      `.fallowrc.jsonc`. **Ne jamais le retirer.**
- ➖ Deux compilateurs à garder alignés en version.

> Si un jour un seul compilateur suffit, basculer les scripts sur `tsc6` et
> supprimer `@typescript/native` (et son `ignoreDependencies`) — ré-évaluer alors.
