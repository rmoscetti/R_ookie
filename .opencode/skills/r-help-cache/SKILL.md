---
name: r-help-cache
description: Deterministic local R documentation engine used by the project custom tools. Extracts version-matched installed R help, searches documented topics inside installed packages, and maintains the hierarchical local help cache. Normal R-Programmer sessions should use r_help, r_search_help, and r_exec instead of loading this skill directly.
---

# R Help Cache Engine

This skill contains the deterministic R scripts behind the user-facing OpenCode tools.

Normal `r-programmer` sessions do not need to load this skill. The custom tools call its scripts directly:

- `r_help` -> `scripts/cache_help.R`
- `r_search_help` -> `scripts/search_help.R`
- `r_exec` -> `scripts/cache_help.R` as a mandatory execution gate when a central topic has not yet been validated in the current session

# Cache layout

```text
wiki/r-help/index.md
wiki/r-help/<package>/index.md
wiki/r-help/<package>/<topic>.md
```

The main index is package-level and includes installed package title, description, and cached-topic count. Package indexes contain documented topics, official help titles, short descriptions, and links to full cached pages. Topic pages contain version metadata and the complete local help text.

# `cache_help.R`

Usage at the R-script level:

```text
cache_help.R <topic> [package|AUTO] [project_root]
```

It normalizes `topic()` to `topic`, resolves an unambiguous exact topic when `AUTO` is used, records R and package versions, regenerates both index levels, and returns `CREATED`, `UPDATED`, or `CACHE_HIT`.

The custom tools own invocation. Do not expose R executable discovery or shell syntax to the model.

# `search_help.R`

Usage at the R-script level:

```text
search_help.R <query|ALL> <package>
```

The package must be explicit and installed. Multi-word queries are tokenized and documented matches are ranked deterministically. `ALL` lists documented topics as a bounded fallback.

# Invariants

- Extract documentation only from the locally installed R environment.
- Do not use web content as a substitute for installed package documentation.
- Do not manually edit generated files under `wiki/r-help/`.
- Reuse a cached page only when stored R and package versions match the current installation.
- Keep statistical, methodological, and scientific interpretation outside this engine.
- Keep R discovery and process execution in the OpenCode TypeScript runtime layer, not in these R scripts.
