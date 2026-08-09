# CLAUDE.md

The project's agent guidance lives in **[AGENTS.md](AGENTS.md)** — read it
first. It covers the stack, architecture rules, conventions, commands, and
toolchain gotchas. This file only adds **Claude Code specifics**.

## What this repo expects of an agent

Nothing, to build it. `pnpm quality` mentions no agent, and neither `.github/`
nor `.husky/` contains the string `mcp`, `skill` or `superpowers` — contributing
by hand needs none of what follows.

They are the tooling of _writing_ this repo with an agent, and only one piece of
it travels with a clone. Which piece, and why the line falls there, is
[ADR 0010](docs/adr/0010-outillage-des-agents.md).

## MCP servers

**Only the first one is declared by this repo.**

| Server       | Declared in                            | What it buys here                                                    |
| ------------ | -------------------------------------- | -------------------------------------------------------------------- |
| `fallow`     | [`.mcp.json`](.mcp.json) — **tracked** | the same binary as `pnpm fallow`, opened up as MCP tools             |
| `context7`   | your own user config                   | current docs for RxJS, Leaflet, `idb`, `vite-plugin-pwa`, Playwright |
| `playwright` | your own user config                   | drives a real browser — the only way to _look_ at the PWA            |

**fallow — prefer it to re-deriving anything by hand.** `trace_export` (file +
export name) answers _why_ an export counts as used, which is the direct cure
for the adapter false positives of
[ADR 0003](docs/adr/0003-fallow-garde-fou-qualite.md); `guard` (files) reports
the rules that apply **before** you edit them; `impact_closure` (path) gives what
a change reaches but the diff does not show. Then `inspect_target`,
`find_dupes`, `check_health`, `decision_surface`, `list_suppressions`.

**Only `fix_apply` touches your source** — the one tool annotated
`destructiveHint`, and the only one whose `readOnlyHint` is `false`;
`fix_preview` is its dry-run twin. That is not the same as being the only one
that writes: any analysis materialises a `.fallow/` cache at the root
(self-ignoring), and `analyze`, `check_changed`, `check_health` and `find_dupes`
each drop a file wherever `save_baseline` / `save_regression_baseline` /
`save_snapshot` point — `code_execute` included, since it exposes those same
tools. It refuses the mutating ones (`fix` → `unsupported code mode fallow tool`),
which is not the same as being read-only on disk.

**`get_blast_radius` is not the impact tool here, despite the name.** Called with
no argument it answers, verbatim,
``failed to deserialize parameters: missing field `coverage` ``. It wants a V8 or
Istanbul _runtime_ coverage dump, and this repo produces none — no
`NODE_V8_COVERAGE`, no `coverage-final.json`, anywhere. `check_runtime_coverage`,
`get_hot_paths`, `get_importance` and `get_cleanup_candidates` refuse for the
same reason. The static, free tool that answers the same intent is
**`impact_closure`**; for design tokens it is `get_token_blast_radius`. Both work
with no coverage at all.

**Being tracked is not the same as travelling.** `.mcp.json` is in git, but
approving the server it declares is `enabledMcpjsonServers` in
`.claude/settings.local.json` — gitignored, like every `settings.json` here. A
fresh clone gets the declaration and is asked anyway. (`fallow-mcp` is not an npm
package, by the way: it is one of the binaries the `fallow` dependency ships, so
its version follows `package.json` like any other — a caret range there, and the
lockfile is what actually pins it.)

**The playwright MCP goes where `pnpm test:e2e` cannot.** The Bash sandbox
contains Bash and its children; an MCP server is spawned by Claude Code itself,
so it is not one of them. That asymmetry is why `.playwright-mcp/` (gitignored)
fills up with page snapshots, console logs and screenshots taken on a machine
where a sandboxed Chromium cannot even start. On the host it is therefore the
shortest way to actually _look_ at the app; in the dev container the question
does not arise, since nothing there escapes to a confined host in the first
place.

## Skills

`.claude/skills/` in this repo is **empty, and meant to stay so** — everything
below comes from your own configuration, and none of it is a build prerequisite.

### superpowers — why `docs/superpowers/` exists, and is called that

`/plugin install superpowers@claude-plugins-official` (v6.2.0 here; marketplace
`anthropics/claude-plugins-official`, upstream `obra/superpowers`, MIT). It ships
**skills only — no agents, no slash commands** — plus a `SessionStart` hook that
injects `using-superpowers` into context.

The folder name is **inherited, not imposed**:
`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` is the `brainstorming`
skill's default location and `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` is
`writing-plans`', and both say on the very next line that a user preference
overrides it. This repo took the default.

**The directory is what tells a spec from a plan**, not the `-design` suffix:
`specs/` comes from `brainstorming`, `plans/` from `writing-plans`. The suffix is
part of the spec default but is no reliable marker here — the
`2026-07-30-refonte-*` series does without it. It earns its keep only where a
spec and its plan share a basename.

The chain that produced this repo: `brainstorming` (a design, questions asked one
at a time, and the founding spec records how many it took) → `writing-plans`
(tasks with the code to write, `Run:` /
`Expected:`) → `subagent-driven-development` or `executing-plans` →
`finishing-a-development-branch`. `test-driven-development`,
`systematic-debugging` and `verification-before-completion` hang off it rather
than sit in the line.

Frictions specific to this repo, worth knowing before you start:

- **`using-git-worktrees` works, but only by its first route.** Its step 1a
  prefers a native worktree tool and names `EnterWorktree`, which this harness
  provides and which the Bash sandbox does not confine. Its `git worktree add`
  fallback is what fails: a worktree under the working directory must
  materialise the tracked `.mcp.json`, write-protected by the same deny that
  breaks `pnpm mutation`. The skill's own fallback then applies — work in place.
- `subagent-driven-development` writes its ledger to `.superpowers/sdd/<plan>/`,
  which self-ignores; nothing to add to `.gitignore`.

### The standalone skills, and where some of them fight this repo

| Skill                         | Verdict here                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `playwright-cli`              | the most useful on substance — **and sandbox-blocked**, see below                              |
| `hexagonal-architecture`      | right vocabulary, **layout contradicts [ADR 0001](docs/adr/0001-hexagone-sans-framework.md)**  |
| `modern-architecture-…-skill` | re-litigates a decision already taken; read its own "match the surrounding architecture" rule  |
| `clean-code-skill`            | fine as a smell detector; silent on this repo's own rules, and its only code examples are Java |
| `context7-mcp`                | redundant — the same instruction is already a global rule                                      |
| `find-skills`                 | off-topic for code, and its `npx skills add` step is refused by the sandbox                    |

**`playwright-cli`** (Microsoft, byte-identical to `@playwright/cli`) drives a
browser from the command line by accessibility-tree refs, and its
`references/playwright-tests.md` describes exactly the loop this repo wants:
`npx playwright test --debug=cli`, then `attach` onto the failing test's page.
`run-code` even does `grantPermissions(['geolocation'])`, which a GPS-tracking
PWA needs. But `excludedCommands` lists `pnpm test:e2e*`, `pnpm exec playwright *`
and `pnpm icons*` — **not** `playwright-cli *`. So on macOS it stays confined and
its Chromium cannot start. Reach for `pnpm exec playwright` instead — and know
what you are reaching for: unlike the `git` and `docker` entries, the `pnpm`
ones carry **no mirroring `ask` rule**, so they auto-approve _and_ run
unconfined. Restoring that pairing — for them, and for any `playwright-cli *`
you add — is what the Isolation section below calls the invariant to preserve.

**`hexagonal-architecture` is the one to invoke with your eyes open.** Its
principles are this repo's principles — domain depends on nothing, every external
dependency is a port, ports model capabilities rather than technologies. Its
**structure is not**: it prescribes `src/features/<feature>/application/ports/…`,
an `application` layer, a use-case class between the inbound adapter and the
domain, a `composition/<feature>Container.ts` per feature (even while its own
Core Concepts still demand a _single_, centralized wiring location), English
names throughout its examples, and asserting on port interactions in tests. This
repo has `src/<capability>/{domain,ports,adapters,ui}` — an outline, not a rule:
`suivi` has them all, `carte` only `adapters` and `ports`, `trajets` adds a
`serialization/`, and a flat `src/shared/` sits beside them — with the business
at the first level, no application layer, screens as inbound adapters that reach
ports directly, a **single** composition root in `src/main.ts`, French domain names
([ADR 0007](docs/adr/0007-langue-du-code-metier-francais-technique-anglais.md))
and no spies ([AGENTS.md](AGENTS.md#conventions)). Its "Migration Playbook" would
propose to strangle an architecture that an accepted ADR already settled. Read it
for principles; ignore its layout.

Same caution, milder, for **`modern-architecture-design-patterns-skill`**: its
default is Vertical Slice, and its Hexagonal "Avoid when" list opens on "there is
only one simple UI and one simple database" — half of which fits. Its other
warnings do not: this repo has ports over Geolocation, wake lock, foreground,
IndexedDB and Leaflet, and `PositionSource` carries a real and a simulated
implementation behind a shared contract suite. And the _good fit_ list in that same
section names "testing the application core without frameworks is important",
which is [ADR 0001](docs/adr/0001-hexagone-sans-framework.md)'s own reason for
the hexagon. Its first rule for existing codebases ("match the surrounding
architecture … do not introduce a different style just because it is
theoretically cleaner") is the part that applies.

## Isolation

Two layers, and they answer different questions. Pick by what you need
contained.

|                   | Dev container            | Built-in Bash sandbox      |
| ----------------- | ------------------------ | -------------------------- |
| What is inside    | the whole Claude process | Bash and its children only |
| Edit/Write, hooks | contained                | **not** contained          |
| `fallow` MCP      | contained                | **not** contained          |
| Network egress    | **unrestricted**         | **unrestricted**           |
| `pnpm test:e2e`   | runs inside              | escapes the sandbox to run |
| Platforms         | anywhere Docker runs     | macOS, Linux, WSL2         |
| Native Windows    | yes                      | **no**                     |
| Cost              | Docker, rebuilds         | nothing, already on        |

The Bash sandbox is the everyday default; the container is what you want on
Windows, or when the MCP-and-hooks gap matters.

### Dev container

[`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json) is the
stock recipe from Anthropic's docs — a base image plus the Claude Code feature —
with the additions this repo needs. Open the folder in any editor supporting
the Dev Containers spec and choose _Reopen in Container_.

- **`node_modules` is a named volume, never the host directory.** `esbuild` and
  `rollup` ship platform-specific binaries; the macOS ones would not run on the
  container's Linux.
- **pnpm is pinned to `9.9.0`** because `package.json` declares no
  `packageManager` field, so `corepack` would pick its own version. Add that
  field and the pin can go.
- **`CLAUDE_CONFIG_DIR` points into the `~/.claude` volume**, otherwise
  `~/.claude.json` stays outside it and every rebuild logs you out.
- **The Playwright browsers are installed at create time**, so `pnpm test:e2e`
  and `pnpm icons` run in the container too — not only on the host.

One thing it deliberately does **not** do, so don't assume it: there is no
egress firewall — a session inside can reach any host. A
container without an egress allowlist is not a safe home for
`--dangerously-skip-permissions`. And per Anthropic's own warning, a container
never stops a malicious repository from exfiltrating what it can reach: it
carries your Claude credentials in `~/.claude`. This is for trusted code.

### Bash sandbox

[`.claude/settings.json`](.claude/settings.json) runs every Bash command inside
an OS sandbox — Seatbelt on macOS, bubblewrap on Linux and WSL2 — so the OS, not
a permission prompt, is what keeps a command inside the repo. The settings keys
are the same on all three; only the enforcement engine differs.

**It confines the filesystem, not the network.** Writes land in the working
directory and `$TMPDIR` — plus the pnpm/Playwright caches and `~/.npm` listed in
`filesystem.allowWrite`. Everything else (`~/.zshrc`, `~/.claude`, `/usr/local`)
is refused, including for child processes, and reads of `~/.ssh`, the Claude
credentials and the shell history are denied on top. But `network.allowedDomains`
is **not** a boundary: measured from a sandboxed command, `example.com` — absent
from the list — answers `200`. The list only suppresses prompts. The key that
turns it into a hard deny is `strictAllowlist`, and the docs are explicit that it
"has no effect" in a repository's settings; it is honored only from user, managed
or `--settings` scope. Treat egress as open.

`allowUnsandboxedCommands` is **false**, so `dangerouslyDisableSandbox` is
ignored and a command the sandbox breaks simply fails. The only way out is
`excludedCommands` — and every entry there has a mirroring `permissions.ask`
rule, because an `ask` rule beats an `allow` rule in every mode. That pairing is
the invariant to preserve: **leaving the sandbox always costs a prompt.** Without
it, `Bash(pnpm exec *)` silently auto-approves the very commands that run
unconfined.

- **`git` over SSH cannot work sandboxed.** The proxy hands SSH a
  `ProxyCommand` built on `nc -X 5`, which cannot present the SOCKS credentials
  the proxy requires. The network subcommands run outside the sandbox — which is
  also why denying `~/.ssh` costs nothing.
- **Anything that launches Chromium fails on macOS.** Its `bootstrap_check_in`
  for the Mach port rendezvous server is denied, and `allowMachLookup` does not
  help: Seatbelt separates registering a Mach service from looking one up, and
  only the latter is configurable. That covers `pnpm test:e2e` _and_ `pnpm icons`
  (`scripts/generate-icons.mjs` drives Chromium's canvas). **The e2e exclusion is
  a real hole, and wider than the specs**: `playwright.config.ts` starts
  `pnpm build && pnpm preview`, so `vite.config.ts` and its plugins run
  unconfined too — all files an agent can write. The prompt is what stands
  between that and your system. The dev container closes it: browsers run fine
  under Linux.
- **`pnpm mutation` is excluded for a different reason.** Stryker copies the
  project into `.stryker-tmp/`, and the sandbox denies writes to `**/.mcp.json`
  and `**/.idea/**` _inside_ the working directory, so the copy dies. The same
  deny blocks `git worktree add`, which must materialise the tracked `.mcp.json`.
- **`ps` and `pgrep` are denied** by Seatbelt. To find a stray dev server, use
  `lsof -ti:4173`.

The global profile is switched with `claude-safe` / `claude-sandbox`
(`~/.claude/profils.sh`); `~/.claude/settings.json` is a symlink to whichever
profile is active. A _content-scoped_ `ask` rule such as `Bash(git push *)`
prompts even for a sandboxed command — a bare `Bash` rule does not, being skipped
outside plan mode. That is why the sandbox profile carries no blanket `ask`.

**This file cannot be committed, and that is not an oversight.** The sandbox
denies every confined command write access to a `settings.json` at any scope, so
that a command can never rewrite the rules confining it. Git is confined too —
so as soon as the file is tracked, any `git checkout`, `merge` or `stash` that
must materialise it fails with `unable to unlink '.claude/settings.json'`,
mid-operation. Measured, not assumed: committing it is what made a fast-forward
abort. It is therefore in `.gitignore`.

The consequence is worth stating plainly: **a fresh clone gets none of this
section.** Each machine sets up its own `.claude/settings.json`, and the thing
that actually travels with the repo is [`.devcontainer/`](.devcontainer/). The
same trap applies to any tracked file the sandbox write-protects — `.mcp.json`
is tracked here, which is why `git worktree add` fails.

## Handy

- `pnpm quality` mirrors the CI gate (typecheck + lint + test + fallow audit) —
  run it before claiming a change is done.
- The pre-commit hook auto-runs `fallow fix --yes` then the gates; a commit that
  "does nothing visible" may just be the hook validating.
- `pnpm mutation` (Stryker) answers a question no gate does: _does this test
  actually protect this rule?_ It is deliberately **not** in `pnpm quality` — it
  reruns the suite once per mutant. Reach for it after refactoring a module, and
  **read the survivors** instead of chasing the score: some are equivalent, some
  sit on guards the aggregate's invariants make unreachable. Adding an assertion
  to silence one manufactures a hollow test ([ADR 0006](docs/adr/0006-tests-de-mutation-stryker.md)).

Everything else — stack, hexagonal dependency rule, French ubiquitous language,
the no-`!`/no-`as` rule, testing philosophy, the dual-TypeScript-compiler trap —
is in [AGENTS.md](AGENTS.md) and the French docs it links.
