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
