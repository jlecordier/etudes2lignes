# Index de la documentation

Le point d'entrée : où trouver quoi. Les docs humaines sont en **français** ; les
guides destinés aux IA/agents sont en **anglais**. Dans le code, le français
nomme le métier et l'anglais la technique
([ADR 0007](adr/0007-langue-du-code-metier-francais-technique-anglais.md)).

## Comprendre le produit

- [README](../README.md) — ce que fait l'app, comment préparer un trajet,
  limitations assumées.

## Comprendre le code

- [ARCHITECTURE](ARCHITECTURE.md) — hexagone + screaming, table des ports/adapters,
  domaine (DDD), l'algorithme géo → défilement, pièges plateforme.
- [GLOSSAIRE](GLOSSAIRE.md) — langage ubiquitaire (métier, architecture, plateforme)
  et le [lexique](GLOSSAIRE.md#lexique) qui tranche français/anglais mot à mot.
- [EXIGENCES](EXIGENCES.md) — exigences par capacité, reliées aux tests qui les vérifient.
- [adr/](adr/README.md) — décisions d'architecture (le « pourquoi »).

## Opérer

- [DEPLOIEMENT](DEPLOIEMENT.md) — déploiement sur GitHub Pages, pas à pas.

## Pour les IA / agents (anglais)

- [../AGENTS.md](../AGENTS.md) — guide agent canonique.
- [../CLAUDE.md](../CLAUDE.md) — spécificités Claude Code (MCP).
- [../llms.txt](../llms.txt) — index façon [llmstxt.org](https://llmstxt.org).

## Historique

- [Spécification d'origine](superpowers/specs/2026-07-10-suivi-schema-ligne-design.md).
