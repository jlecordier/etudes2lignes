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
- **French spelling is complete, and the apostrophe is ASCII.** Every accent and
  diacritic is written out — never `etat` for `état`, never `precision` for
  `précision`. The one deliberate exception is the apostrophe: `'`, never the
  typographic `’`, everywhere — prose, UI strings, test titles, CSS, HTML.
  It was a tacit convention until a review round was spent arguing about it, so
  it is written here now.
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

## Liquid Glass — what you may not break

The interface follows Apple's Liquid Glass. The reasoning, the citations and the
measurements are in **[docs/LIQUID-GLASS.md](docs/LIQUID-GLASS.md)** (French,
human-facing); what follows is the operative part.

**Platform floor: Safari 16.4 / iOS 16.4**, and it binds the whole sheet — not
only the glass. Two independent things put it there, and they are not equally
negotiable.

The material's half is irreducible. The glass tint derives from the page's own
background via a relative colour (`rgb(from var(--…) r g b / …%)`), because two
hand-written values had already drifted apart once; a relative colour's origin
is a `var()`, resolved only at run time, so no build target downlevels it —
measured, at `safari 16.0` as at `safari 16.4`, lightningcss emits it verbatim.
Below 16.4 the `@supports` fallback documented below applies: an opaque fill,
not a crash.

The layout's half is an artefact of the build, and it is the reason this floor
is not the material's alone. The sheets are written `@media (min-width: 900px)`,
but the bundler re-emits `@media (width >= 900px)` — range syntax, itself 16.4 —
so below that the large-screen rules are dropped entirely, and the two-column
editor with them. Measured on the built CSS, not deduced. Setting an explicit
`css.lightningcss.targets` of Safari 16.0 restores `min-width` and costs the
colours nothing; it is a deliberate trade the repo has not taken, because it
would also pin every other lowering decision Vite currently makes on its own.
Do not write range syntax by hand — `stylelint --fix` once rewrote `min-width`
into it, which is how this floor was raised without anyone deciding to.

**The one rule everything else descends from:** there are two layers. The
_content_ layer — schema pages, map, list rows, overview, point markers — is
never glass. The _functional_ layer — bars, floating controls, map controls —
is glass and floats above it. Apple states the corollary in as many words:
"Don't use Liquid Glass in the content layer."

**Everything below the floor is governed by one rule: a tier references only
the tier above it.** Three tiers, each its own file(s), each owning what the
old flat `src/style.css` left unowned ([ADR 0011](docs/adr/0011-design-system-css-natif.md)):

- **A — primitives** (`src/styles/tokens/primitives.css`): raw scales, no
  meaning — colour ramps, the spacing/radius scales, the eleven iOS text
  styles as complete triplets. References nothing.
- **B — semantic** (`src/styles/tokens/semantic.css`): roles. References only
  A. Every colour is `light-dark()`, once — the two hand-written dark blocks
  that used to drift apart are gone. `--hit-target` (44 px) lives here: a
  token two components share is not a component token.
- **C — component** (`src/styles/components/*.css`, twelve files — eleven
  components plus `text.css`): declared in the component's own file,
  references only B.

Stylelint enforces part of this mechanically
(`stylelint-declaration-strict-value`, `stylelint-value-no-unknown-custom-properties`)
but not all of it — it doesn't know shorthands, and it never inspects what a
`var()` resolves to. The gap is closed by structural invariants in
`src/styles/styles.test.ts`, verified by ADR 0011.

- **One file writes the glass, and it is the one that names it.**
  `src/styles/components/surface.css` is the sole declarer of `backdrop-filter`;
  [`src/styles/styles.test.ts`](src/styles/styles.test.ts) fails the moment a
  second sheet declares one. Eight rules used to redeclare it, and each was a
  chance to forget the `-webkit-` twin, the blur ceiling or the accessibility
  retraction — two had already forgotten. `.surface` (and its
  `.surface-regular`/`.surface-thick` modifiers) is that one shared
  declaration; a functional component enters it by having its own selector
  listed alongside `.surface` in that file's `@supports` block, rather than
  redeclaring the property.
- **A repeated surface gets the tint without the blur.** `.button-group-image`
  exists once per page, `.button-group-point` once per point; the measured
  mobile ceiling is three to five simultaneous blurs. Legibility is what those
  needed, and a fill gives it for free.
- **Never nest glass in glass**, and put the surface on the group rather than on
  each button. A button inside a bar is transparent and monochrome.
- **One tinted action per screen** — the one that gives the screen its purpose.
  Destructive actions are a red _label_, never a red fill.
- **Symbols are monochrome `currentColor`**, never emoji: an emoji cannot invert
  with the material. The set is `src/shared/Icons.html`; `IconName` is a closed
  union, and a `<use href="#i-…">` in a template is checked by `icons.test.ts`.
- **Text uses the iOS scale only** (eleven styles, `.text-*` in
  `src/styles/components/text.css`, expressed as fractions of the body size).
  A bar title is Headline — 17 pt semibold — not a content title. Two open
  debts: `--radius-pill` (tier A) is referenced directly by three component
  files instead of a tier-B token; three complete typographic triplets
  (`.trajet-name`/`.trajet-details`, `.help`) live as component tokens outside
  `text.css` because composing the `.text-*` class into their templates was
  repeatedly refused by the TDD gate for lack of a failing test — the
  increment was cut rather than routed around.
- **Radii are `999px` (`--radius-pill`), `0`, or a `--radius-*`/`--rayon-*`
  token**; an inner radius is `calc()`-derived from its container, never a
  second constant.
- **Every colour token needs its dark counterpart.** A token added to `:root`
  after the dark block was written silently stays light — that is how a floating
  button became a white disc bearing a white symbol. This is now structurally
  impossible for a tier-B token (`light-dark()` forces both branches at
  declaration site); `--color-warning` and `--color-success-text` still carry
  a documented, undecided choice between their historical value and Apple's
  published one.

Six engine traps, each of which has already cost a visible defect here. They are
not deducible; do not rediscover them:

1. `-webkit-backdrop-filter` precedes `backdrop-filter`, byte-identical value.
2. **No `var()` inside a `backdrop-filter`** — WebKit ignores the declaration.
3. The glass rule and its no-support fallback are two mutually exclusive
   `@supports` blocks in the same `components` layer, not "fallback first,
   unconditionally." A later-declared layer (`screens`) always beats an
   earlier one regardless of specificity, so an unconditional fallback there
   would beat the glass rule even on an engine that supports it — the
   fallback has to be its own `@supports not`. The accessibility retraction
   (reduced transparency / more contrast) comes last in source order, to win
   the specificity tie against whichever of the two applied.
4. A Leaflet container needs `z-index: 0` to open its own stacking context, or
   its panes (`z-index: 400`) escape and cover whatever you put above them.
5. `leaflet.css` enters via `@import … layer(vendor);` — the lowest layer —
   so no component rule needs `!important` to beat it any more, regardless of
   specificity; that import is what made the 16 Leaflet-reconciliation
   `!important`s disappear.
6. No `filter` on an ancestor of a glass element; it cancels the blur.

## The TDD gate is enforced, not encouraged

[`probity.config.ts`](probity.config.ts) puts `enforceTdd` on **every write
under `src/`** — and that means every write, not every source file you think of
as code. A stylesheet and an HTML template are gated exactly like a `.ts`. Each
write is judged by an AI against one question: _which failing test, observed in
this session, is this the minimal fix for?_

The rules below are not restatements of the config. They are what a session
spent colliding with it actually costs, and each one names its measurement.

- **One `it` per contract.** A bundled `it` asserting several unrelated things
  makes the rule **inapplicable by construction**: every partial write "does not
  turn the assertion green", and the write that satisfies all of it is
  "over-implementation". Measured: one bundled `it` of six assertions cost five
  refusals, two of them mutually contradictory — "vastly exceeds the minimum"
  and "does not even make the observed failing assertion pass", about the same
  file. The fault was the test's shape, not the gate's.
- **A write that only _adds_ a test always passes** — that is what `fastPath:
true` buys. **Modifying an existing test does not.** So to change a contract:
  add the new `it`, watch it fail, implement, and only then drop the obsolete
  assertion, as part of the green step.
- **Every write must be self-consistent.** A write introducing `var(--x)`,
  `createIcon(…)` or `this.carte` without also introducing its declaration is
  refused — and rightly so. Measured: that single check caught five CSS custom
  properties that were referenced and never defined, plus three undeclared
  identifiers. For CSS it has a corollary: **a token and its first consumer go in
  the same write**, because nothing else in the toolchain notices a
  `var(--ghost)`.
- **Sequence a deletion so that every intermediate state compiles and passes.**
  Removing a control spans a `.ts` and its `.html`: take the **usages** out first,
  while `query('#id')` still finds its element, then the declaration, then the
  markup. Cutting the markup first makes `query` throw and turns 27 unrelated
  tests red — and the gate will then refuse both halves of the repair, because
  neither alone restores a working file.
- **For CSS, assert an invariant, not a presence.** `.icon { fill: none }` is a
  tautology: it can only fail if someone deletes the very line it describes. What
  earns its keep is a statement about the **whole file** — no `font-size` outside
  iOS's eleven text styles, no literal colour outside the token block, every
  `backdrop-filter` doubled by its `-webkit-` twin, the accessibility retraction
  after the `@supports` that it retracts. Those fail on a future edit made in
  good faith, and they legitimately demand a whole block in one write.
  [`src/styles/styles.test.ts`](src/styles/styles.test.ts) holds both kinds;
  prefer the second.
- **Do not edit `probity.config.ts`.** Its two deviations from the defaults are
  annotated as "décidés par l'auteur du dépôt — pas par l'agent que la règle
  contraint". Widening the gate to make your own increment fit is exactly what
  that line forbids.

Known gap, stated so nobody rediscovers it: **no tool here catches an undefined
CSS custom property.** `tsc` covers TypeScript, ESLint the style, `fallow` dead
code — `var(--jeton-fantôme)` passes them all silently. The gate finds it by
accident, which is not the same as being covered.

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

## Habit Hooks

When `habit-hooks` is available, run it before calling work complete, and read
the output. It is neither noise to skip nor a task list to transcribe.

Its scope and its silences are already argued in
[`.habit-hooks/config.toml`](.habit-hooks/config.toml), each with the measurement
that settled it: `.stryker-tmp/` is excluded because grading deliberately broken
code says nothing about the code, and `non-essential-comment` is off because
comments here carry the _why_ on purpose — the same standard the Git section
states for commit messages — so counting them buried the findings worth reading.
Don't widen the globs: adding `**/*.css` and `**/*.html` once took that one
sensor from 2 249 findings to over 100 000.

What earns a task is what **this change** introduced. Most of the standing
inventory — oversized files, duplicated blocks — predates your branch and is
deliberate, so a task per reported line manufactures exactly the noise the tool
exists to prevent. Act on the delta; say in the branch's record what you left
standing and why. Nothing gets dropped in silence.

## More docs

Full map: [`docs/INDEX.md`](docs/INDEX.md) · Architecture:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Glossary:
[`docs/GLOSSAIRE.md`](docs/GLOSSAIRE.md) · Requirements↔tests:
[`docs/EXIGENCES.md`](docs/EXIGENCES.md) · Decisions:
[`docs/adr/`](docs/adr/README.md) · Deployment:
[`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).
