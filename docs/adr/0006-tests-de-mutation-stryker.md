# ADR 0006 — Tests de mutation avec Stryker, hors du gate

- **Statut** : accepté
- **Date** : 2026-07-31

## Contexte

Le projet teste par l'état, en BDD, et refuse la couverture comme critère : une
ligne exécutée n'est pas une règle vérifiée. Restait une question sans outil pour
y répondre — **un test protège-t-il vraiment la règle qu'il prétend spécifier ?**

Elle n'est pas théorique. La refonte « frontières et cas d'usage » a livré des
correctifs dont trois n'avaient **aucun témoin exécutable** : on l'a découvert en
abîmant le code à la main et en constatant que la suite restait verte.

- Mettre `MINIMUM_SEGMENT_LENGTH_METRES` à `0` — c'est-à-dire supprimer le
  garde-fou du segment dégénéré — laissait au vert les 69 tests que le module
  `suivi` comptait alors. Or un trajet dont les deux seuls points partagent un
  lieu donne alors une target `NaN`, donc une page collée en haut du document
  pendant tout le voyage.
- Faire ignorer « permission refusée » par le chien de garde : vert aussi.
- Rendre au throttle sa mémoire entre deux sessions : vert aussi.

Ces vérifications ont été faites à la main, une par une. C'est exactement ce
qu'un outil sait faire en série.

## Décision

Ajouter [Stryker](https://stryker-mutator.io) (`pnpm mutation`), avec le runner
Vitest et le vérificateur de types, configuré dans
[`stryker.config.mjs`](../../stryker.config.mjs).

Trois choice de cadrage, tous justifiés dans le file de configuration :

1. **Hors de `pnpm quality`.** Stryker relance la suite une fois par mutant : la
   commande se compte en dizaines de minutes, quand le gate doit rester tenable
   à chaque commit. Elle se lance sur un module qu'on vient de refondre, ou pour
   instruire un doute.
2. **Périmètre restreint à ce qui doit être couvert par des tests unitaires** :
   `domain/`, `adapters/`, `serialization/`, `shared/`. Les écrans DOM se testent
   en Playwright ([ADR 0001](0001-hexagone-sans-framework.md)) et `main.ts` n'est
   que du câblage — les muter produirait un score faux, où des survivants
   attendus noieraient les vrais.
3. **Le score n'est pas une porte.** Le seuil de rupture est volontairement bas :
   l'intérêt est de lire les survivants un par un, pas de défendre un chiffre. Un
   score qu'on cherche à faire monter fabrique des assertions creuses.

## Conséquences

- ➕ Un garde-fou sans témoin devient visible au lieu de reposer sur la vigilance
  du relecteur.
- ➕ La question « ce test sert-il à quelque chose ? » a une réponse mécanique,
  utile en revue comme en refonte.
- ➖ Trois dépendances de développement de plus, et un outil lent qui ne peut pas
  entrer dans le gate.
- ➖ Un mutant survivant n'est pas toujours un défaut : une mutation peut être
  sémantiquement équivalente. Chaque survivant se juge, aucun ne se corrige
  d'office — et surtout jamais par une assertion ajoutée pour faire taire l'outil.
- ➖ **Ce que Stryker ne trouvera pas** : il mute des opérateurs, des littéraux et
  des conditions, pas des structures. Le throttle hérité cité plus haut ne
  s'exprime qu'en déplaçant un input d'un objet de session vers l'instance — hors
  de sa portée. La mutation à la main reste nécessaire pour les régressions
  structurelles, et c'est elle qui a trouvé les plus intéressantes.
- Le vérificateur de types s'appuie sur le paquet `typescript` (TS 6, celui de
  typescript-eslint), pas sur `@typescript/native`
  ([ADR 0004](0004-double-compilateur-typescript.md)) : c'est le first endroit
  où regarder si les mutants échouent tous à la compilation.
