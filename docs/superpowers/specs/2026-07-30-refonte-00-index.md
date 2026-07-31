# Refonte « frontières et cas d'usage » — index des lots

Issue de la revue d'architecture du 2026-07-29 (8 angles de relecture, chaque
constat passé devant un relecteur adverse : 39 soumis, 3 réfutés, 12 requalifiés).

**Diagnostic d'ensemble** : l'hexagone tient, le domaine est sain. Tous les
défauts sérieux sont dans la même bande — **entre les écrans et les ports**,
là où le projet n'a pas de couche.

## Les six lots

| Lot                                                                          | Périmètre de fichiers (strict)                                                                        | Vague |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----- |
| [01 — Domaine trajets](2026-07-30-refonte-01-domaine-trajets.md)             | `src/trajets/domain/**`, `src/commun/tableau.ts`                                                      | 1     |
| [02 — Suivi : port, politique, adapters](2026-07-30-refonte-02-suivi.md)     | `src/suivi/{domain,ports,adapters}/**`                                                                | 1     |
| [03 — Persistance et sérialisation](2026-07-30-refonte-03-persistance.md)    | `src/trajets/{adapters,serialisation,ports}/**`                                                       | 1     |
| [04 — Carte](2026-07-30-refonte-04-carte.md)                                 | `src/carte/**`                                                                                        | 1     |
| [05 — Écrans, navigation, composition root](2026-07-30-refonte-05-ecrans.md) | `src/*/ui/**`, `src/navigation.ts`, `src/main.ts`, `src/commun/dom.ts`, `index.html`, `src/style.css` | 2     |
| [06 — Tests de bout en bout](2026-07-30-refonte-06-e2e.md)                   | `e2e/**`                                                                                              | 3     |

Les quatre lots de la vague 1 ont des périmètres **disjoints** : ils travaillent
dans le même répertoire sans risque de conflit. Le lot 05 est seul dans sa vague
parce qu'il consomme les contrats produits par les quatre premiers et répare
tous les appelants.

## Règles communes à tous les lots

Non négociables (voir [AGENTS.md](../../../AGENTS.md) et les
[ADR](../../adr/README.md)) :

- **Langue française** partout : identifiants, commentaires, chaînes d'interface,
  noms de tests. Vocabulaire du [glossaire](../../GLOSSAIRE.md) uniquement.
- **Aucun framework UI**, aucun conteneur d'injection, aucune dépendance nouvelle
  (ADR 0001). DOM natif.
- **Aucun `!`, aucun `as` de forme** (ADR 0002). Utiliser `elementA`, `requete`,
  ou valider un `unknown` par un prédicat de type.
- **Ne jamais désactiver une règle de lint.** Corriger le code.
- **Tests BDD par l'état** : nommés `Étant donné / Quand / Alors`, pas de `vi.fn`,
  pas de `toHaveBeenCalled`, fakes écrits à la main, assertions sur les valeurs.
- **Le comportement observable ne change pas**, sauf là où une spec dit
  explicitement qu'un bug est corrigé.

Discipline de lot :

- **Ne toucher aucun fichier hors du périmètre.** Une erreur constatée ailleurs
  se signale dans le rapport final, elle ne se corrige pas.
- **Ne pas lancer `pnpm quality`** : entre les vagues, le typecheck global est
  volontairement rouge. Lancer uniquement `pnpm exec vitest run <ses fichiers>`.
- **Parallel change pour tout renommage** d'une chose utilisée hors périmètre :
  le nouveau nom à côté de l'ancien, l'ancien délégant au nouveau et marqué
  `@deprecated à supprimer par le lot 05`.

## Hors périmètre, à arbitrer plus tard

`crypto.randomUUID()` est appelé depuis le domaine (`src/trajets/domain/ids.ts:11,15,19`),
ce qui fait dépendre le domaine d'une API de plateforme absente en contexte non
sécurisé. Les trois remèdes possibles (identifiant fourni par l'appelant, couture
injectable, ou tolérance documentée dans un ADR) changent beaucoup de signatures
ou introduisent un état global : cela demande une décision humaine, pas un
correctif automatique.
