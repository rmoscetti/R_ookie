# R_ookie

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="images/logo.png">
    <img src="images/logo.png" alt="R_ookie logo" width="500">
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
