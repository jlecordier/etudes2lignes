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
- [../CLAUDE.md](../CLAUDE.md) — spécificités Claude Code : les serveurs
  MCP, les skills de votre propre configuration, et lesquelles contredisent
  l'[ADR 0001](adr/0001-hexagone-sans-framework.md).
- [../llms.txt](../llms.txt) — index façon [llmstxt.org](https://llmstxt.org).

Le dépôt n'attend aucune skill — il en documente quelques-unes, dont certaines
qu'il conseille de ne pas suivre. Rien de tout cela n'est requis pour le
construire :
`pnpm quality` ne mentionne aucun agent. Ce qui voyage avec un clone et ce qui
n'y entre jamais sont tranchés par l'[ADR 0010](adr/0010-outillage-des-agents.md).

## Historique

[`superpowers/`](superpowers/) garde les documents écrits **avant** le code : des
conceptions dans `specs/`, un plan d'exécution dans `plans/`, du 2026-07-10 au
2026-08-06. Le dossier porte le nom du plugin dont il a repris le
chemin par défaut ([ADR 0010](adr/0010-outillage-des-agents.md)).

Ces documents sont **datés, pas maintenus** : ils disent une intention à leur
date et ne suivent pas le code. Certains portent l'annotation de leur propre
péremption. Ce qui fait foi, c'est l'ADR quand il y en a un, le reste de `docs/`
sinon.

- [Spécification d'origine](superpowers/specs/2026-07-10-suivi-schema-ligne-design.md)
  — celle qui a ouvert le projet.
- [Refonte du 2026-07-30](superpowers/specs/2026-07-30-refonte-00-index.md) — les
  lots issus d'une revue d'architecture, chantier achevé.
