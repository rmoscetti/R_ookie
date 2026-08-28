# R_ookie

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="images/logo.png">
    <img src="images/logo.png" alt="R_ookie logo" width="300">
  </picture>
</p>

<p align="center">
  <strong>Tiny LLMs, smarter with R help.</strong>
</p>

R_ookie is an [OpenCode](https://opencode.ai/) R-programming assistant designed to make small local LLMs more reliable.

Instead of relying only on what the model remembers about R, R_ookie searches the documentation available in the local R installation, reads the relevant help page, and executes generated R code before reporting the result.

## How it works

```text
R request
    ↓
search local R help
    ↓
read the relevant documentation
    ↓
generate R code
    ↓
execute it locally
    ↓
report verified output
```

In practice, the agent follows this workflow:

```text
r_search_help → r_help → r_exec
```

Local R documentation is treated as the reference for package APIs and function usage. The model's internal knowledge is treated as a starting point, not as the authoritative source.

`r_search_help` is used to discover the exact installed `package::topic`. The corresponding documentation is then read explicitly with `r_help` before code relying on that API is executed with `r_exec`.

This makes the workflow dependent on the R environment actually installed on the machine rather than on documentation or package versions that may differ from it.

## Scope

R_ookie is an **R programming assistant**.

It can help generate, debug, and execute R code while checking the APIs provided by the locally installed R environment.

It is not intended to:

- validate statistical methodology;
- choose the appropriate statistical analysis;
- interpret statistical significance or scientific results;
- replace domain expertise.

Those decisions remain the responsibility of the user.

## Requirements

- [OpenCode](https://opencode.ai/)
- a local R installation
- an LLM supported by OpenCode

R_ookie is designed especially for use with small local LLMs, but it does not depend on a specific model.

Deno is required only for developers or maintainers who want to run the deterministic test suite.

## Installation

See [INSTALL.md](INSTALL.md).

## Validation

The `v0.1.0` public tree passes the deterministic acceptance suite:

```text
48/48 PASS
```

The suite verifies the R help discovery, explicit help-reading and local execution contract used by the R-programmer agent.

## Version

**0.1.0**

## License

R_ookie is released under the [Apache License 2.0](LICENSE).
