import { tool } from "@opencode-ai/plugin"
import { markSearched, parseSearchPackageTopics, resolveCacheProjectRoot, searchHelp } from "../lib/r_help_core"

export default tool({
  description:
    "Search the locally installed documentation for documented package+topic candidates. For any runnable R task, call this before r_help/r_exec to discover the authoritative local API; do not rely on model memory even if you believe you know the function. Uses the deterministic package help index and returns package+topic+title matches. Use package AUTO for discovery when package is unknown; otherwise use explicit package.",
  args: {
    query: tool.schema
      .string()
      .describe("Capability or documentation search query. Multi-word queries are supported."),
    package: tool.schema
      .string()
      .optional()
      .describe("Package to search, or AUTO for cross-package discovery. When package is unknown, use AUTO or omit package."),
    project_root: tool.schema
      .string()
      .optional()
      .describe("Optional cache project root inside the current worktree. Omit during normal use. Deterministic tests may set a sandbox root containing wiki/."),
  },
  async execute(args, context) {
    const worktree = context.worktree || context.directory
    const projectRoot = resolveCacheProjectRoot(
      (args as { project_root?: string }).project_root,
      context.directory,
      worktree,
    )
    const pkg = (args as { package?: string }).package?.trim() || "AUTO"
    const { result } = await searchHelp(
      args.query,
      pkg,
      context.directory,
      worktree,
    )

    // Record successful search topics for search-before-help enforcement (canonical parser)
    if (result.exitCode === 0) {
      const parsed = parseSearchPackageTopics(result.stdout)
      const topics = parsed.map((p) => (p.package ? `${p.package}::${p.topic}` : p.topic))
      if (topics.length > 0) {
        try {
          markSearched(projectRoot, context.sessionID, pkg, args.query.trim(), topics)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          return [
            "STATUS: ERROR",
            "PHASE: STATE_PERSISTENCE",
            `EXIT_CODE: ${result.exitCode}`,
            `MESSAGE: Search succeeded but failed to persist validation state: ${msg}`,
            "STDOUT:",
            result.stdout || "(empty)",
            "STDERR:",
            result.stderr || "(empty)",
          ].join("\n")
        }
      }
    }

    // Unambiguous semantic status - only MATCHES/NO_MATCHES/ERROR
    let semanticStatus: string
    if (result.exitCode !== 0) {
      semanticStatus = "ERROR"
    } else if (result.stdout.includes("STATUS: MATCHES")) {
      semanticStatus = "MATCHES"
    } else if (result.stdout.includes("STATUS: NO_MATCHES")) {
      semanticStatus = "NO_MATCHES"
    } else {
      return [
        "STATUS: ERROR",
        "PHASE: SEARCH_PROTOCOL",
        `EXIT_CODE: ${result.exitCode}`,
        "MESSAGE: Search completed but did not return a valid MATCHES or NO_MATCHES status. This is a search protocol failure.",
        "STDOUT:",
        result.stdout || "(empty)",
        "STDERR:",
        result.stderr || "(empty)",
      ].join("\n")
    }

    return [
      `STATUS: ${semanticStatus}`,
      `EXIT_CODE: ${result.exitCode}`,
      "STDOUT:",
      result.stdout || "(empty)",
      "STDERR:",
      result.stderr || "(empty)",
    ].join("\n")
  },
})
