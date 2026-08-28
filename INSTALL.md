# R Programmer - help-gated OpenCode package

## Purpose

This project provides an R-programming agent whose executable code is grounded in the documentation of the R installation and packages actually present on the machine.

The user-facing workflow is deliberately small:

```text
r_search_help  -> discover a documented package topic when its name is unknown
r_help         -> validate/read a known installed help topic
r_exec         -> execute an R script only after central help topics are session-validated
```

## Installation

Extract this archive directly into the OpenCode project root so that the project contains:

```text
.opencode/
  agents/
  lib/
  skills/
  tools/
wiki/
temp/
```

Restart OpenCode after replacing `.opencode/tools/` so the custom tools are reloaded.

No additional R, Python, PowerShell, Node, or shell dependency is introduced by the project beyond OpenCode's own custom-tool runtime and the local R installation itself.

## Custom tools

### `r_help`

Validates an exact help topic against the installed R/package version, updates the hierarchical cache, returns a compact documentation excerpt, and records the topic as validated for the current OpenCode session.

Normal use omits `project_root`. Deterministic tests may point it to a sandbox under `temp/` (e.g. `temp/acceptance-sandbox/`).

### `r_search_help`

Searches one explicit installed package when the capability is known but the documented function/topic name is not.

### `r_exec`

This is the only R execution tool available to `r-programmer`.

Every call must include at least one central help topic. If one is not yet validated in the current session, `r_exec` performs the local help validation, returns the documentation, and deliberately reports:

```text
STATUS: HELP_REQUIRED
SCRIPT_EXECUTED: no
```

The agent must review the documentation and call `r_exec` again. Only a subsequent call after validation can return:

```text
HELP_GATE: PASSED
SCRIPT_EXECUTED: yes
```

A prior explicit `r_help` call satisfies the gate for that topic in the same session.

R discovery is implemented without model-generated shell commands. The current runtime checks `R_HOME`, `PATH`, and standard installation locations for Windows, Linux, and macOS. Runtime compatibility is only established on operating systems that are actually tested.

## Local help cache

```text
wiki/r-help/index.md
wiki/r-help/<package>/index.md
wiki/r-help/<package>/<topic>.md
```

The main index stays package-level. Package indexes describe cached topics. Full topic pages preserve the installed documentation and version metadata.

Session validation state is stored below:

```text
temp/r-programmer/.help-sessions/
```

It is operational state, not documentation. A new OpenCode session must validate central topics again.

## Agent roles

`r-programmer` is the student-facing R programmer. It cannot use shell execution, web search, or the skill loader. It can use only the three user-facing R tools for documentation and execution.

## Validation

Run the deterministic acceptance suite (Deno is required only for developers/maintainers who manually run this suite and is not required for normal R-Programmer use):

```text
deno run --allow-all --sloppy-imports --node-modules-dir=auto tests/execution_contract.test.ts
```

It exercises the full execution contract (help gate, isolated `Rscript --vanilla` execution, output limiting, `CLEAN_EXIT`/`STDOUT_STATE`/`OUTPUT_TRUNCATED`, file/worktree guards, cache integrity, and platform handling) and reports PASS/FAIL per case. Use a sandbox `project_root` under `temp/` for cache isolation during testing. No additional validator agent is required.
