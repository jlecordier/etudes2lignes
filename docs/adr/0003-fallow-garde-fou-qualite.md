# ADR 0003 — fallow comme garde-fou qualité

- **Statut** : Acceptée (2026-07-28)

## Contexte

Le durcissement des types/lint ne couvre pas le **code mort**, la
**duplication** ni la **complexité**. On voulait un filet automatique, à la fois
côté développeur et en CI, sans alourdir le workflow.

## Décision

Adopter [**fallow**](https://fallow.tools) (dépendance de dev épinglée).

- **Config** : `.fallowrc.jsonc` (entrées + `ignoreDependencies`).
- **Pre-commit** (`.husky/pre-commit`) : `fallow fix --yes` nettoie automatiquement
  exports/dépendances inutilisés, puis `lint-staged` + `typecheck` + `test`.
- **CI** :
    - `deploy.yml` (job `tests`) exécute `pnpm exec fallow audit` — **bloque le
      déploiement** si de nouveaux problèmes apparaissent ;
    - `fallow.yml` (push + PR) publie le rapport (**SARIF** → Code Scanning, +
      résumé du run) et gate les PR.
- **MCP** : `.mcp.json` expose `fallow-mcp` aux agents.
- On utilise le **CLI épinglé** (`pnpm exec fallow …`), pas l'action externe :
  reproductible via le lockfile.

`fallow audit` est en **`gate: new-only`** : il ne bloque que sur les problèmes
_introduits_. Les problèmes hérités sont signalés sans casser le build.

## Conséquences

- ➕ Hygiène automatique (code mort/dupes/complexité) sans effort manuel.
- ➖ **Faux positifs hexagonaux** : fallow voit les méthodes d'adapters (appelées
  via les ports) comme « membres de classe inutilisés ». Inoffensif : `fix` n'y
  touche pas, et `audit --gate new-only` les exclut (hérités).
- ➖ Piège dépendance : voir [0004](0004-double-compilateur-typescript.md) — `fallow`
  croyait `@typescript/native` inutilisé, d'où `ignoreDependencies`.
