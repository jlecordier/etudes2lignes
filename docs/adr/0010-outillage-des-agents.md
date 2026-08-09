# ADR 0010 — L'outillage des agents : déclaré, versionné, ou documenté

- **Statut** : Acceptée (2026-08-08)

## Contexte

Ce dépôt s'écrit en grande partie en dictant à un agent. Cette façon de
travailler a laissé trois traces de natures différentes, et elles ne se
transmettent pas de la même manière.

Un **serveur MCP**, d'abord. [`.mcp.json`](../../.mcp.json) déclare
`fallow-mcp`, qui ouvre le binaire de `pnpm fallow` sous forme d'outils :
pourquoi un export compte comme utilisé, quelles règles s'appliquent à un
fichier avant de l'éditer, ce qu'un changement atteint hors du diff. Le fichier
est suivi par git, donc il voyage.

Un **corpus de conception**, ensuite, dans [`../superpowers/`](../superpowers/) :
des conceptions dans `specs/`, un plan d'exécution dans `plans/`, écrits entre le
2026-07-10 et le 2026-08-06. Plusieurs des commits qui les ajoutent ne
contiennent que le document, et le code suit dans les heures. Ces chemins ne sont
pas un rangement maison : `docs/superpowers/specs/AAAA-MM-JJ-<sujet>-design.md` et
`docs/superpowers/plans/AAAA-MM-JJ-<sujet>.md` sont les chemins par défaut des
skills `brainstorming` et `writing-plans` du plugin `superpowers` — chacune
précise qu'une préférence de l'utilisateur les remplace, donc le dépôt a
**hérité** ce nom plutôt que de le subir.

Une **configuration de machine**, enfin, qui ne laisse aucune trace ici : les
serveurs MCP `context7` et `playwright`, le plugin `superpowers` et quelques
skills autonomes vivent dans `~/.claude`, hors du dépôt et hors de git.

Le piège est que la frontière ne tombe pas où on l'attend, et que la
documentation laissait croire l'inverse.

- `.mcp.json` est suivi, mais son **approbation** ne l'est pas : elle vit dans
  `enabledMcpjsonServers`, au fond de `.claude/settings.local.json`, que le
  `.gitignore` écarte. Un clone frais reçoit la déclaration et se fait quand
  même demander l'autorisation.
- `docs/superpowers/` est suivi, mais rien n'y dit ce que c'est. Un seul de ses
  documents est mis en avant — la spécification d'origine, que `README.md` et
  `docs/INDEX.md` citent sous ce nom et `llms.txt` sous « original design
  specification ». Les autres sont pratiquement invisibles : certains ne sont la
  cible d'aucun lien, les autres ne s'atteignent que depuis un index interne au
  dossier ou depuis une note de bas d'ADR. Le dossier n'a pas de `README`, et le
  mot « superpowers » n'est défini nulle part : sa seule explication est une
  ligne d'en-tête technique dans le plan, adressée aux agents.
- La CI et les hooks, eux, ne dépendent d'aucun de ces outils : `grep` sur
  `.github/` et `.husky/` ne trouve ni `mcp`, ni `skill`, ni `superpowers`.

## Décision

**Trois natures, trois traitements** — et le critère est le même à chaque fois :
est-ce que la chose parle de _ce_ dépôt ?

**Ce qui parle du dépôt, le dépôt le déclare.** `fallow` analyse ce code-ci : sa
déclaration a sa place dans `.mcp.json`, versionnée, avec la contrainte de
version qui va avec ([ADR 0003](0003-fallow-garde-fou-qualite.md)). `context7`
sert la documentation de bibliothèques et `playwright` pilote un navigateur :
aucun des deux ne dit quoi que ce soit de ce projet, il n'y a donc rien à
déclarer pour eux. Le fait que `.mcp.json` soit suivi a un coût déjà payé et
mesuré — le sandbox protège ce fichier en écriture, ce qui fait échouer
`git worktree add` et oblige Stryker à contourner ([CLAUDE.md](../../CLAUDE.md)).

**Ce qui a été écrit avant le code est versionné, et daté.** Une conception
reste dans `docs/superpowers/specs/` même dépassée : on l'annote, on ne la
supprime pas. Celle du 2026-08-05 s'ouvre sur son propre acte de décès, rédigé
le lendemain — « Dépassée le lendemain. La liste des points a été supprimée » —
et sa remplaçante répond « Cette conception remplace celle de la veille ». Ces
documents sont **historiques par construction** : ils disent une intention à
leur date et ne sont pas remis à jour quand le code bouge. Ce qui fait foi,
c'est l'ADR quand il y en a un, la documentation de `docs/` sinon — et cette
répartition n'est pas nouvelle : les décisions se consignent en ADR depuis le
2026-07-31, en parallèle des conceptions, pas à leur suite.

**Le reste est documenté, jamais embarqué.** [`CLAUDE.md`](../../CLAUDE.md) dit
quoi installer, à quoi chaque outil sert _ici_, lequel est bridé par le sandbox
de la machine — et surtout où deux skills d'architecture contredisent
frontalement l'[ADR 0001](0001-hexagone-sans-framework.md). Une skill qui
recommande un layout `features/…/application/ports/` et un container par
« feature » n'est pas neutre dans un dépôt dont le premier niveau de `src/` nomme
le métier et dont un seul `main.ts` compose. Le savoir vaut mieux que le
découvrir dans une revue.

**Et rien de tout cela n'entre dans un gate.** `pnpm quality` reste la seule
définition de « c'est bon », et elle ne mentionne aucun agent. C'est ce qui rend
la règle tenable : on documente un confort de rédaction, pas un péage à
l'entrée.

## Conséquences

- ➕ La question « qu'est-ce qui manque à mon clone ? » a enfin une réponse
  écrite, et elle est courte : l'approbation du serveur `fallow`, et tout ce qui
  vit dans `~/.claude`. Le reste est déjà là.
- ➕ `docs/superpowers/` cesse d'être un dossier au nom énigmatique. Un lecteur
  sait d'où viennent ces documents, ce que `specs/` sépare de `plans/`, et — le
  plus important — qu'ils ne font pas foi.
- ➕ Contribuer à la main reste possible sans rien installer. Le jour où
  quelqu'un clone sans agent, aucune de ces lignes ne le bloque.
- ➖ **Le dépôt porte le nom d'un outil dans son arborescence.** `superpowers`
  n'est pas un terme du glossaire, c'est un plugin ; et son chemin par défaut a
  déjà changé une fois — `docs/plans/` auparavant, déplacé sous
  `docs/superpowers/` par une version majeure du plugin. S'il rebouge, soit
  l'arborescence suit l'outil, soit elle diverge de lui. Aucune autre partie de
  `docs/` n'a ce couplage.
- ➖ **Un corpus qui vieillit sans être maintenu.** Le risque n'est pas que ces
  conceptions soient fausses — elles sont datées — mais qu'on les lise comme la
  documentation courante. L'annotation _a posteriori_ est le seul garde-fou, et
  elle repose sur la discipline.
- ➖ Le plan versionné ment sur son avancement : ses étapes sont restées
  `- [ ]` alors que le travail est fait et se relit commit par commit. L'état
  d'exécution est dans git, pas dans le document — il faut le savoir pour ne pas
  croire le chantier en cours.
- ➖ La documentation de l'outillage périme plus vite que le code qu'elle
  accompagne : versions de plugin, noms d'outils MCP, chemins par défaut. Elle
  est datée pour cette raison, et la seule parade est de la remesurer plutôt que
  de la relire.
