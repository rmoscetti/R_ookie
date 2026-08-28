import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import {
  resolveCacheProjectRoot,
  validateHelp,
} from "../lib/r_help_core"

export default tool({
  description:
    "Read and validate exact version-matched documentation for an exact package+topic discovered via r_search_help. Requires prior successful r_search_help that returned this package+topic. Updates the hierarchical local help cache, returns a compact excerpt, and marks the topic HELP_READ for the current session. Local installed help is authoritative for API details; after reading, discard unsupported memory assumptions and prefer the simplest documented usage.",
  args: {
    topic: tool.schema
      .string()
      .describe("Exact R help topic or function name. Function-style input such as t.test() is accepted."),
    package: tool.schema
      .string()
      .optional()
      .describe("Exact package as returned by r_search_help for this topic. Must be the explicit package::topic discovered via search; AUTO or omitted is rejected for validation."),
    project_root: tool.schema
      .string()
      .optional()
      .describe("Optional cache project root inside the current worktree. Omit during normal R-Programmer use. Deterministic tests may set a sandbox root containing wiki/."),
  },
  async execute(args, context) {
    const pkgRaw = args.package?.trim()
    if (!pkgRaw || pkgRaw.toUpperCase() === "AUTO") {
      return [
        "STATUS: ERROR",
        "PHASE: INPUT_VALIDATION",
        "SCRIPT_EXECUTED: no",
        `TOPIC: ${args.topic?.trim() ?? ""}`,
        `PACKAGE: ${pkgRaw || "AUTO"}`,
        "MESSAGE: r_help requires explicit package. Use the exact package::topic discovered via r_search_help (e.g., base::mean), not AUTO or omitted.",
      ].join("\n")
    }
    const worktree = context.worktree || context.directory
    const projectRoot = resolveCacheProjectRoot(
      args.project_root,
      context.directory,
      worktree,
    )
    const result = await validateHelp(
      { topic: args.topic, package: args.package },
      projectRoot,
      context.directory,
      worktree,
      context.sessionID,
    )

    if (!result.ok) {
      return [
        "STATUS: ERROR",
        "PHASE: HELP_VALIDATION",
        `TOPIC: ${result.requestedTopic}`,
        `PACKAGE: ${result.requestedPackage}`,
        `EXIT_CODE: ${result.exitCode}`,
        "STDOUT:",
        result.stdout || "(empty)",
        "STDERR:",
        result.stderr || "(empty)",
      ].join("\n")
    }

    const relativeCache = path.relative(worktree, result.cacheFile!) || result.cacheFile!
    return [
      "STATUS: READY",
      `CACHE_STATUS: ${result.cacheStatus}`,
      `TOPIC: ${result.topic}`,
      `PACKAGE: ${result.package}`,
      `CACHE_FILE: ${relativeCache}`,
      "DOCUMENTATION:",
      result.digest || "(no documentation excerpt available)",
      ...(result.stderr.trim() ? ["R_STDERR:", result.stderr] : []),
    ].join("\n")
  },
})
