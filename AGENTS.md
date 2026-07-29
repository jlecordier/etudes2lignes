# AGENTS.md

Operational guide for AI agents (and new contributors) working on
**Etudes2Lignes** — an offline-first PWA that auto-scrolls a railway
line-diagram (imported page images) to follow the user's live GPS position.

This is the **canonical** agent guide. The human-facing documentation is in
**French** under `docs/` (map: [`docs/INDEX.md`](docs/INDEX.md)); this file
points into it instead of duplicating it. Claude Code specifics live in
[`CLAUDE.md`](CLAUDE.md).

## TL;DR

- **Stack**: TypeScript · Vite · **vanilla DOM (no UI framework)** · Leaflet ·
  IndexedDB (`idb`) · `vite-plugin-pwa`. Package manager: **pnpm**.
- **Architecture**: hexagonal + screaming — `src/<capability>/{domain,ports,adapters,ui}`.
- **Language**: everything is **French** — identifiers, comments, commit
  messages, UI strings, docs. Keep it French.
- **Quality bar is strict** and enforced by pre-commit + CI. Do not lower it.

## Commands

| Intent                        | Command                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Dev server                    | `pnpm dev`                                                                     |
| Unit tests (Vitest)           | `pnpm test` — watch: `pnpm test:watch`                                         |
| End-to-end tests (Playwright) | `pnpm test:e2e`                                                                |
| Type-check (TS 7 native)      | `pnpm typecheck`                                                               |
| Lint (type-aware, strict)     | `pnpm lint` — autofix: `pnpm lint:fix`                                         |
| Format (Prettier)             | `pnpm format`                                                                  |
| Production build → `dist/`    | `pnpm build`                                                                   |
| Serve the built PWA           | `pnpm preview` (required to exercise the service worker)                       |
| Dead-code / quality report    | `pnpm fallow` — autofix: `pnpm fallow:fix` — CI gate: `pnpm exec fallow audit` |
| **All gates at once**         | `pnpm quality` (typecheck + lint + test + fallow audit)                        |

## Architecture rules (hard constraints)

- **Dependency rule**: `domain` depends on nothing; `ports` on the domain only;
  `adapters`/`ui` on ports + domain; **only `src/main.ts`** (composition root)
  instantiates concrete adapters and injects them by hand (no DI framework).
- The first level of `src/` names the **business** (`trajets/`, `suivi/`,
  `carte/`), not the tech.
- `ui/` screens are **inbound adapters** (native DOM). No UI framework — ever
  (see [ADR 0001](docs/adr/0001-hexagone-sans-framework.md)).
- Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Vocabulary:
  [`docs/GLOSSAIRE.md`](docs/GLOSSAIRE.md).

## Conventions

- **French ubiquitous language** everywhere — use the terms in
  [`docs/GLOSSAIRE.md`](docs/GLOSSAIRE.md), and only those.
- **No non-null assertions (`!`), no shape `as`** — they hide upstream typing
  problems ([ADR 0002](docs/adr/0002-lint-type-aware-strict.md)). Instead:
    - indexed access → `elementA(tableau, i)` (`src/commun/tableau.ts`);
    - DOM lookup → `requete('#id', HTMLXxxElement)` (`src/commun/dom.ts`) — it
      **verifies the element type via `instanceof`**;
    - browser APIs typed as always-present but actually optional
      (`navigator.wakeLock/geolocation/storage`) → annotate an optional local,
      don't cast;
    - external JSON → `unknown` then runtime validation.
- **Never disable a lint rule to dodge a finding** — fix the code. If a rule is
  genuinely wrong, prove it and relax it _with a documented justification_.
- **Tests: BDD, by state.** Behaviour is specified before the code, named
  `Étant donné / Quand / Alors`. **No `vi.fn`, no `toHaveBeenCalled`** —
  hand-written fakes injected (fake geolocation, controlled clock, manual
  scheduler, `fake-indexeddb`); assert on produced **values**.
- Value objects validate at construction and are immutable; the `Trajet`
  aggregate exposes **intent methods**, no setters; invariants live in the
  aggregate.
- Prettier for formatting; ESLint runs `strictTypeChecked` +
  `stylisticTypeChecked` and must report **0**.

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
