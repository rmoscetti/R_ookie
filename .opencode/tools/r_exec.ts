import { tool } from "@opencode-ai/plugin"
import { mkdirSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import type { HelpRequest } from "../lib/r_help_core"
import {
  isHelpValidated,
  isSearchValidated,
  resolveCacheProjectRoot,
} from "../lib/r_help_core"
import {
  formatRRunResult,
  resolveProjectRScript,
  runProjectRScript,
} from "../lib/r_runtime"

const helpTopicSchema = tool.schema.object({
  topic: tool.schema
    .string()
    .describe("Exact central R help topic or function name used by the script."),
  package: tool.schema
    .string()
    .optional()
    .describe("Installed package name. Must be the explicit package for the topic as returned by r_search_help; AUTO or omitted is rejected."),
})

function uniqueRequests(requests: HelpRequest[]): HelpRequest[] {
  const seen = new Set<string>()
  const output: HelpRequest[] = []

  for (const request of requests) {
    const topic = request.topic.trim().replace(/\s*\(\s*\)\s*$/, "")
    const packageValue = request.package?.trim() || "AUTO"
    const key = `${topic}\u001f${packageValue}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push({ topic, package: packageValue })
  }

  return output
}

export default tool({
  description: [
    "Execute a user-facing R script only after its central R APIs have been discovered and validated. Required sequence: r_search_help (find documented package+topic) → r_help (read exact help) → r_exec (execute). r_exec never itself searches or reads help.",
    "Supply at least one central help topic. r_exec requires prior successful r_search_help and r_help for each topic in the current session; otherwise it returns SEARCH_REQUIRED or HELP_REQUIRED and does not execute.",
    "This is the only R execution tool available to R-Programmer. Use exactly one of file (existing .R file) or code (direct R code to be materialized under temp/r-programmer/).",
    "",
    "Execution model: isolated R process != sandboxed R process. Each call spawns a fresh `Rscript --vanilla <script> <args...>` with no shell, deterministic working directory, no .RData, no profile initialization, and no shared global environment. The process is isolated for reproducibility but NOT sandboxed against arbitrary R code — do not build blacklist scanners. Generated R code must not, unless explicitly required and permitted by the task: invoke shell commands (system, system2, shell), install software/R packages, access the network, or perform destructive filesystem operations.",
    "",
    "Caller reaction guidance:",
    "- SEARCH_REQUIRED / HELP_REQUIRED -> perform the missing r_search_help / r_help step, read documentation, discard unsupported assumptions, revise code, then call r_exec again. HELP_REQUIRED from r_exec never includes documentation; docs come only from r_help.",
    "- CLEAN_EXIT: no (STATUS: EXECUTION_ERROR) -> do not present the result as verified; identify the actual failing R expression/error; correct that error; execute again.",
    "- CLEAN_EXIT: yes with STDOUT_STATE EMPTY or NULL_LIKE -> do not automatically assume the requested result was produced; inspect the code, expected object/result and documentation before reporting success.",
    "- EXIT_CODE 0 does NOT mean the analytical result requested by the user was successfully produced. The tool only reports execution evidence.",
    "Do not impose an arbitrary fixed retry count.",
  ].join("\n"),
  args: {
    file: tool.schema
      .string()
      .optional()
      .describe("Path to an existing .R file inside the current project. Use exactly one of file or code."),
    code: tool.schema
      .string()
      .optional()
      .describe("Direct R code to execute. Will be written to a generated .R file under temp/r-programmer/. Use exactly one of file or code."),
    help_topics: tool.schema
      .array(helpTopicSchema)
      .min(1)
      .describe("One or more central R help topics whose documented API the script relies on. Include central functions only, not every trivial helper."),
    script_args: tool.schema
      .array(tool.schema.string())
      .describe("Arguments passed to the R script. Use an empty array when none are needed."),
    project_root: tool.schema
      .string()
      .optional()
      .describe("Optional cache project root inside the current worktree. Omit during normal R-Programmer use. Deterministic tests may set a sandbox root containing wiki/."),
  },
  async execute(args, context) {
    if (!Array.isArray(args.help_topics) || args.help_topics.length === 0) {
      return [
        "STATUS: ERROR",
        "PHASE: HELP_VALIDATION",
        "SCRIPT_EXECUTED: no",
        "MESSAGE: r_exec requires at least one central help topic. Provide help_topics with one or more entries.",
      ].join("\n")
    }

    const hasFile = typeof args.file === "string"
    const hasCode = typeof args.code === "string"

    if (hasFile && hasCode) {
      return [
        "STATUS: ERROR",
        "PHASE: ARG_VALIDATION",
        "SCRIPT_EXECUTED: no",
        "MESSAGE: r_exec accepts exactly one of file or code. Provide only one.",
      ].join("\n")
    }

    if (!hasFile && !hasCode) {
      return [
        "STATUS: ERROR",
        "PHASE: ARG_VALIDATION",
        "SCRIPT_EXECUTED: no",
        "MESSAGE: r_exec requires exactly one of file or code. Provide file for existing scripts or code for direct execution.",
      ].join("\n")
    }

    if (hasCode && (args.code as string).trim().length === 0) {
      return [
        "STATUS: ERROR",
        "PHASE: ARG_VALIDATION",
        "SCRIPT_EXECUTED: no",
        "MESSAGE: r_exec code cannot be empty or whitespace only.",
      ].join("\n")
    }

    if (hasFile && (args.file as string).trim().length === 0) {
      return [
        "STATUS: ERROR",
        "PHASE: ARG_VALIDATION",
        "SCRIPT_EXECUTED: no",
        "MESSAGE: r_exec file cannot be empty.",
      ].join("\n")
    }

    for (let i = 0; i < (args.help_topics as unknown as unknown[]).length; i++) {
      const entry = (args.help_topics as unknown as unknown[])[i] as Record<string, unknown>
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        return [
          "STATUS: ERROR",
          "PHASE: INPUT_VALIDATION",
          "SCRIPT_EXECUTED: no",
          `MESSAGE: help_topics[${i}] must be an object with a topic string.`,
        ].join("\n")
      }
      const topicValue = (entry as { topic?: unknown }).topic
      if (typeof topicValue !== "string") {
        return [
          "STATUS: ERROR",
          "PHASE: INPUT_VALIDATION",
          "SCRIPT_EXECUTED: no",
          `MESSAGE: help_topics[${i}].topic must be a non-empty string.`,
        ].join("\n")
      }
      if (topicValue.trim().length === 0) {
        return [
          "STATUS: ERROR",
          "PHASE: INPUT_VALIDATION",
          "SCRIPT_EXECUTED: no",
          `MESSAGE: help_topics[${i}].topic must be a non-empty string.`,
        ].join("\n")
      }
      const pkg = (entry as { package?: unknown }).package
      if (pkg === undefined || pkg === null || typeof pkg !== "string" || (pkg as string).trim() === "" || (pkg as string).trim().toUpperCase() === "AUTO") {
        return [
          "STATUS: ERROR",
          "PHASE: INPUT_VALIDATION",
          "SCRIPT_EXECUTED: no",
          `MESSAGE: help_topics[${i}].package must be a string (explicit package required, e.g., "base" for mean). AUTO or omitted package is not allowed for r_exec. Use the exact package::topic discovered via r_search_help.`,
        ].join("\n")
      }
    }

    const worktree = context.worktree || context.directory
    const projectRoot = resolveCacheProjectRoot(
      args.project_root,
      context.directory,
      worktree,
    )
    const requests = uniqueRequests(args.help_topics as HelpRequest[])

    const notSearched = requests.filter(
      (r) => !isSearchValidated(projectRoot, context.sessionID, r.topic, r.package),
    )
    if (notSearched.length > 0) {
      const req = notSearched[0]
      const topic = req.topic.trim().replace(/\s*\(\s*\)\s*$/, "")
      const pkg = req.package?.trim() || "AUTO"
      return [
        "STATUS: ERROR",
        "PHASE: HELP_VALIDATION",
        "SCRIPT_EXECUTED: no",
        `TOPIC: ${topic}`,
        `PACKAGE: ${pkg}`,
        "MESSAGE: Local documentation search required before help validation for this topic. Call r_search_help for the relevant package and verify the returned documented topic before r_help. Then call r_help before r_exec. r_exec does not itself search or read help.",
      ].join("\n")
    }

    const notHelpRead = requests.filter(
      (request) => !isHelpValidated(projectRoot, context.sessionID, request),
    )
    if (notHelpRead.length > 0) {
      const req = notHelpRead[0]
      const topic = req.topic.trim().replace(/\s*\(\s*\)\s*$/, "")
      const pkg = req.package?.trim() || "AUTO"
      return [
        "STATUS: HELP_REQUIRED",
        "SCRIPT_EXECUTED: no",
        `TOPIC: ${topic}`,
        `PACKAGE: ${pkg}`,
        "MESSAGE: Help not yet read for this exact package + topic. Call r_help for this topic after successful r_search_help before r_exec. r_exec does not itself read help.",
      ].join("\n")
    }

    let script: string
    if (hasFile) {
      try {
        script = resolveProjectRScript(args.file as string, context.directory, worktree)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return [
          "STATUS: ERROR",
          "PHASE: FILE_VALIDATION",
          "SCRIPT_EXECUTED: no",
          `MESSAGE: ${message}`,
        ].join("\n")
      }
    } else {
      const dir = path.join(worktree, "temp", "r-programmer")
      try {
        mkdirSync(dir, { recursive: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return [
          "STATUS: ERROR",
          "PHASE: FILE_GENERATION",
          "SCRIPT_EXECUTED: no",
          `MESSAGE: Failed to create temp directory: ${message}`,
        ].join("\n")
      }
      const fileName = `r_exec_${Date.now()}_${randomUUID()}.R`
      const filePath = path.join(dir, fileName)
      try {
        writeFileSync(filePath, args.code as string, "utf8")
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return [
          "STATUS: ERROR",
          "PHASE: FILE_GENERATION",
          "SCRIPT_EXECUTED: no",
          `MESSAGE: Failed to write generated R script: ${message}`,
        ].join("\n")
      }
      try {
        script = resolveProjectRScript(filePath, context.directory, worktree)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return [
          "STATUS: ERROR",
          "PHASE: FILE_VALIDATION",
          "SCRIPT_EXECUTED: no",
          `MESSAGE: ${message}`,
        ].join("\n")
      }
    }

    const scriptArgs = Array.isArray(args.script_args) ? args.script_args : []
    const { result } = await runProjectRScript(
      script,
      scriptArgs,
      context.directory,
      worktree,
    )
    const validated = requests
      .map((request) => `${request.package || "AUTO"}::${request.topic}`)
      .join(", ")

    return [
      "HELP_GATE: PASSED",
      `HELP_TOPICS: ${validated}`,
      "SCRIPT_EXECUTED: yes",
      formatRRunResult(result, script, worktree),
    ].join("\n")
  },
})
