# CLAUDE.md

The project's agent guidance lives in **[AGENTS.md](AGENTS.md)** — read it
first. It covers the stack, architecture rules, conventions, commands, and
toolchain gotchas. This file only adds **Claude Code specifics**.

## MCP servers

- Project-scoped [`.mcp.json`](.mcp.json) declares **fallow** (`fallow-mcp`).
  Prefer its tools (`audit`, `analyze`, `trace_export`, `guard`,
  `get_blast_radius`, …) over re-deriving dead code / impact by hand.
- `context7` (up-to-date library docs) and `playwright` MCP servers come from the
  user's global config, not this repo.

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
