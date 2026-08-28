# Local R help

This wiki contains only documentation extracted from the locally installed R environment.

The project tools `r_help` and `r_exec` validate and cache exact installed help pages under `wiki/r-help/`. `r_search_help` discovers documented topics inside an installed package. The underlying deterministic extraction/search engine is kept in `.opencode/skills/r-help-cache/`, but the student-facing agent does not need to load that skill directly.

The cache uses progressive disclosure:

1. [`r-help/index.md`](r-help/index.md) is a compact catalogue of cached packages with package titles and descriptions.
2. Each package directory contains an `index.md` describing cached functions or help topics for that package.
3. Each topic page contains the full version-matched local R help text.

Generated pages document R and package software behavior. They do not provide statistical, methodological, or scientific interpretation.
