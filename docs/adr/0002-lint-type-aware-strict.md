# ADR 0002 — Lint type-aware strict ; `!` et `as` bannis

- **Statut** : Acceptée (2026-07-28)

## Contexte

Le typage était sain mais ESLint tournait en `recommended` **non type-aware**,
et le code recourait largement aux assertions non-null (`!`) et à quelques
`as`. Or `x!` et `x as T` **masquent** un défaut de typage en amont plutôt que
de le résoudre : ils désactivent silencieusement le vérificateur.

## Décision

ESLint passe en **`strictTypeChecked` + `stylisticTypeChecked`** (analyse basée
sur les types, via `projectService`).

- `@typescript-eslint/no-non-null-assertion` : **error**. Aucun `!`.
- Les `as` de forme sont proscrits. À la place :
    - accès indexé sûr → `elementA(tableau, i)` (`src/commun/tableau.ts`) ;
    - lookup DOM → `requete('#id', HTMLXxxElement)` (`src/commun/dom.ts`), qui
      **vérifie le type par `instanceof`** au lieu de l'asserter ;
    - API du navigateur « toujours présentes » mais réellement optionnelles
      (`navigator.wakeLock/geolocation/storage`) → on annote un local optionnel
      (`const nav: { wakeLock?: WakeLock } = navigator`), pas de cast ;
    - JSON externe → `unknown` puis validation runtime.
- tsconfig durci en parallèle : `noUnusedLocals/Parameters`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, etc.

Trois réglages **assouplis avec justification** (pas des esquives) :
`restrict-template-expressions: { allowNumber: true }` (interpoler un nombre est
sûr), `dot-notation: { allowIndexSignaturePropertyAccess: true }` (compatibilité
avec `noPropertyAccessFromIndexSignature`), et le générique de `requete` satisfait
`no-unnecessary-type-parameters` grâce au constructeur-témoin.

## Conséquences

- ➕ Les types disent la vérité ; les gardes remplacent les assertions aveugles.
- ➕ `requete` **vérifie** l'élément à l'exécution (bug de sélecteur attrapé net).
- ➖ Un peu plus verbeux (gardes explicites, constructeur passé à `requete`).
- **Règle** : ne jamais _désactiver_ une de ces règles pour contourner un
  signalement — corriger le code. Voir [0003](0003-fallow-garde-fou-qualite.md).
