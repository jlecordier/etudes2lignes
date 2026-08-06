# Décisions d'architecture (ADR)

Chaque ADR consigne **une** décision à vrai arbitrage : son contexte, le choix
retenu, ses conséquences. On les garde courts. Une décision remplacée n'est pas
supprimée : elle passe en `Remplacée par …`.

On ne crée un ADR **que** pour une décision non triviale **non déjà expliquée
ailleurs**. Les choix algorithmiques (offsets relus à chaque tick, seuil
adaptatif, adhérence anti-oscillation, simulation = adapter, export par index)
sont documentés dans [`../ARCHITECTURE.md`](../ARCHITECTURE.md) et n'ont pas
d'ADR dédié pour éviter la duplication.

| #                                                                | Décision                                             | Statut   |
| ---------------------------------------------------------------- | ---------------------------------------------------- | -------- |
| [0001](0001-hexagone-sans-framework.md)                          | Hexagone + screaming, sans framework UI              | Acceptée |
| [0002](0002-lint-type-aware-strict.md)                           | Lint type-aware strict ; `!` et `as` bannis          | Acceptée |
| [0003](0003-fallow-garde-fou-qualite.md)                         | fallow comme garde-fou (pre-commit + CI)             | Acceptée |
| [0004](0004-double-compilateur-typescript.md)                    | Double compilateur TypeScript (`tsc` natif + `tsc6`) | Acceptée |
| [0005](0005-indexeddb-arraybuffer.md)                            | Persistance IndexedDB, images en `ArrayBuffer`       | Acceptée |
| [0006](0006-tests-de-mutation-stryker.md)                        | Tests de mutation (Stryker), hors du gate            | Acceptée |
| [0007](0007-langue-du-code-metier-francais-technique-anglais.md) | Langue du code : métier français, technique anglais  | Acceptée |
| [0008](0008-interface-en-custom-elements-natifs.md)              | Interface en custom elements natifs                  | Acceptée |
| [0009](0009-flux-du-temps-en-rxjs.md)                            | Les flux du temps en RxJS                            | Acceptée |
