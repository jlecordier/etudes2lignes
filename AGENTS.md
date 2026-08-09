# AGENTS.md

Operational guide for AI agents (and new contributors) working on
**Etudes2Lignes** — an offline-first PWA that auto-scrolls a railway
line-diagram (imported page images) to follow the user's live GPS position.

This is the **canonical** agent guide. The human-facing documentation is in
**French** under `docs/` (map: [`docs/INDEX.md`](docs/INDEX.md)); this file
points into it instead of duplicating it. Claude Code specifics live in
[`CLAUDE.md`](CLAUDE.md).

## TL;DR

- **Stack**: TypeScript · Vite · **vanilla DOM (no UI framework)** · RxJS ·
  Leaflet · IndexedDB (`idb`) · `vite-plugin-pwa`. Package manager: **pnpm**.
- **Architecture**: hexagonal + screaming — `src/<capability>/{domain,ports,adapters,ui}`.
- **Language**: **French names the business, English names the plumbing.** An
  identifier is translated **word by word**: a word stays French if it is in the
  glossary's [Lexique](docs/GLOSSAIRE.md#lexique), goes to English otherwise
  ([ADR 0007](docs/adr/0007-langue-du-code-metier-francais-technique-anglais.md)).
  Prose, UI strings, commit messages and docs stay **French**.
- **Quality bar is strict** and enforced by pre-commit + CI. Do not lower it.

## Commands

| Intent                           | Command                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| Dev server                       | `pnpm dev`                                                                                          |
| Unit tests (Vitest)              | `pnpm test` — watch: `pnpm test:watch`                                                              |
| End-to-end tests (Playwright)    | `pnpm test:e2e`                                                                                     |
| Type-check (TS 7 native)         | `pnpm typecheck`                                                                                    |
| Lint (type-aware, strict)        | `pnpm lint` — autofix: `pnpm lint:fix`                                                              |
| Format (Prettier)                | `pnpm format`                                                                                       |
| Production build → `dist/`       | `pnpm build`                                                                                        |
| Serve the built PWA              | `pnpm preview` (required to exercise the service worker)                                            |
| Dead-code / quality report       | `pnpm fallow` — autofix: `pnpm fallow:fix` — CI gate: `pnpm exec fallow audit`                      |
| Mutation tests (slow, on demand) | `pnpm mutation` — **not** part of the gate ([ADR 0006](docs/adr/0006-tests-de-mutation-stryker.md)) |
| **All gates at once**            | `pnpm quality` (typecheck + lint + test + fallow audit)                                             |

A ready-made environment for all of the above lives in
[`.devcontainer/`](.devcontainer/) — Node and pnpm inside one container, so the
commands run there rather than on your machine. It is the only supported path on
native Windows. It installs the Playwright browsers at create time, so
`pnpm test:e2e` and `pnpm icons` run there too. See
[CLAUDE.md](CLAUDE.md#isolation).

## Architecture rules (hard constraints)

- **Dependency rule**: `domain` depends on nothing; `ports` on the domain only;
  `adapters`/`ui` on ports + domain; **only `src/main.ts`** (composition root)
  instantiates concrete adapters and injects them by hand (no DI framework).
- The first level of `src/` names the **business** (`trajets/`, `suivi/`,
  `carte/`), not the tech.
- `ui/` screens are **inbound adapters** built as **native custom elements**
  ([ADR 0008](docs/adr/0008-interface-en-custom-elements-natifs.md)). No UI
  framework — ever (see [ADR 0001](docs/adr/0001-hexagone-sans-framework.md)):
  custom elements, `<template>`, shadow DOM and `AbortController` are platform
  APIs, and rendering stays explicit.
    - A screen is **created, attached, detached**. `createXScreen(deps)` returns
      a configured element; `goToScreen` mounts it into `<main id="app">`, which
      detaches the previous one. Detaching aborts an `AbortSignal` — listeners
      go, and teardown hangs off it. **There is no exit method to remember.**
    - Markup lives in a `.html` file next to its `.ts`, imported with `?raw`.
    - Leaves take **data as properties** and emit **intents as `CustomEvent`s**
      (declared in `src/trajets/ui/intents.ts`); the screen listens once on its
      root. A leaf never touches the aggregate or a port.
    - Take the lifecycle only where a resource must be released — `<schema-page>`
      owns its object URL; other leaves are built by their factory.
- Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Vocabulary:
  [`docs/GLOSSAIRE.md`](docs/GLOSSAIRE.md).

## Conventions

- **French ubiquitous language for the domain** — use the terms in
  [`docs/GLOSSAIRE.md`](docs/GLOSSAIRE.md), and only those. Everything with no
  business counterpart is English, word by word (ADR 0007): `createQueue`, not
  `creerFileDAttente`; but `pointMarker`, because `point` is in the glossary.
  Three things stay French whatever happens — prose (comments, JSDoc, BDD test
  titles), the e2e scenario steps, and **persisted keys** (IndexedDB
  stores/indexes, v1 JSON keys, `localStorage`), which are user data, not
  identifiers.
- **No non-null assertions (`!`), no shape `as`** — they hide upstream typing
  problems ([ADR 0002](docs/adr/0002-lint-type-aware-strict.md)). Instead:
    - indexed access → `requireElementAt(array, i)` (`src/shared/array.ts`);
    - DOM lookup → `query('#id', HTMLXxxElement)` (`src/shared/dom.ts`) — it
      **verifies the element type via `instanceof`**;
    - browser APIs typed as always-present but actually optional
      (`navigator.wakeLock/geolocation/storage`) → annotate an optional local,
      don't cast;
    - external JSON → `unknown` then runtime validation.
- **Never disable a lint rule to dodge a finding** — fix the code. If a rule is
  genuinely wrong, prove it and relax it _with a documented justification_.
- **Time is a stream, not a timestamp** ([ADR 0009](docs/adr/0009-flux-du-temps-en-rxjs.md)).
  Cadence, freshness and concurrency are named operators (`throttleTime`,
  `switchMap`, `concatMap`, `exhaustMap`), never fields holding instants that
  something later subtracts. **Subscribing starts, unsubscribing stops**: ports
  that deliver values over time expose an `Observable`, and every screen
  `subscribe` hangs off its `takeUntil(parti$)` — a stream nobody subscribes to
  does nothing, and says nothing about it.
- **Tests: BDD, by state.** Behaviour is specified before the code, named
  `Étant donné / Quand / Alors`. **No `vi.fn`, no `toHaveBeenCalled`** —
  hand-written fakes injected (fake geolocation, `fake-indexeddb`) and RxJS's
  `TestScheduler` for virtual time; assert on produced **values**.
- **A guard with no witness is not protected.** Before claiming a fix is covered,
  break it on purpose and watch the test fail — `pnpm mutation` does this in bulk
  over `domain`/`adapters`/`shared` ([ADR 0006](docs/adr/0006-tests-de-mutation-stryker.md)),
  but structural regressions still need doing it by hand. Never add an assertion
  merely to silence a surviving mutant.
- Value objects validate at construction and are immutable; the `Trajet`
  aggregate exposes **intent methods**, no setters; invariants live in the
  aggregate.
- Prettier for formatting; ESLint runs `strictTypeChecked` +
  `stylisticTypeChecked` and must report **0**.

## Git

- **Linear history, always.** `main` only ever moves forward:
  `git merge --ff-only`. No merge commits, no squash that erases the steps of a
  branch. If the branch has fallen behind, **rebase it onto `main` first**, then
  fast-forward — never merge `main` into the branch to catch up.
- Anything beyond a one-line fix goes on a branch, then fast-forwards `main`
  onto it. `git log --oneline` must read as one straight line of intent.
- **Rename with `git mv`**, not delete-then-create: git only detects a rename
  when the content survives, and a detected rename is what keeps `--follow` and
  `git blame` working across the move.
- **Commit messages in French**, like the docs and the UI. Say _why_: the
  pre-commit hook already proves _what_ compiles and passes, so the message is
  the only place the reason gets recorded.

Make the rule executable rather than remembered — these are local settings, so
each clone needs them once:

```sh
git config merge.ff only         # un merge non fast-forward échoue au lieu de bifurquer
git config pull.rebase true      # se remettre à jour sans fabriquer de merge commit
git config rebase.autoStash true # rebaser sans avoir à ranger le travail en cours
git config merge.autoStash true  # idem : ff-only échoue aussi sur un arbre sale
git config fetch.prune true      # oublier les branches distantes déjà supprimées
```

**`pull.rebase = true`, surtout pas `merges`.** La variante `merges` passe
`--rebase-merges`, dont la doc dit que « the local merge commits **are
included** in the rebase » : elle _préserve_ les merge commits au lieu de les
aplatir. Tant qu'il n'y en a aucun les deux se valent, mais le jour où l'un
apparaît — pull fait avant que la config soit posée, merge depuis l'interface
GitHub —, `true` le remet à plat et `merges` le protège. `true` répare la règle
tout seul ; `merges` la sabote poliment.

`autoStash` a un coût à connaître : si la ré-application du stash conflicte
après un rebase réussi, c'est à toi de trancher. Le stash n'est pas perdu pour
autant — `git stash list` le retrouve.

## Toolchain gotchas (read before touching config)

- **Two TypeScript compilers** ([ADR 0004](docs/adr/0004-double-compilateur-typescript.md)):
  `tsc` (used by `typecheck`/`build`) comes from `@typescript/native`; `tsc6`
  feeds `typescript-eslint`. **Never remove `@typescript/native`** — it is
  bin-only, so fallow flags it as "unused", but removing it breaks `tsc`. It is
  kept in `ignoreDependencies` of `.fallowrc.jsonc`.
- **Pre-commit** (`.husky/pre-commit`) runs `fallow fix --yes` → `git add -u` →
  `lint-staged` → `typecheck` → `test`. Committing therefore re-validates
  everything (and may auto-remove unused exports/deps).
- **fallow false positives**: adapter methods called through their port look
  like "unused class members" to fallow. They are **not** unused — don't delete
  them ([ADR 0003](docs/adr/0003-fallow-garde-fou-qualite.md)).

## Adding an adapter

Implement the port, then inject it in `src/main.ts` — nothing else changes. Worked
example (replaying a GPX trace) in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#ajouter-un-adapter).

## Before you call a change done

1. `pnpm quality` must be green (typecheck + lint + test + fallow audit).
2. For UI/behaviour changes, run the relevant `pnpm test:e2e`.
3. New behaviour ⇒ a BDD test first; new requirement ⇒ a row in
   [`docs/EXIGENCES.md`](docs/EXIGENCES.md).

## More docs

Full map: [`docs/INDEX.md`](docs/INDEX.md) · Architecture:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Glossary:
[`docs/GLOSSAIRE.md`](docs/GLOSSAIRE.md) · Requirements↔tests:
[`docs/EXIGENCES.md`](docs/EXIGENCES.md) · Decisions:
[`docs/adr/`](docs/adr/README.md) · Deployment:
[`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).
