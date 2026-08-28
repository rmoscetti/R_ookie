import { spawn } from "node:child_process"
import {
  existsSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs"
import path from "node:path"

export const OUTPUT_HEAD_CHARS = 60_000
export const OUTPUT_TAIL_CHARS = 40_000
export const OUTPUT_LIMIT_CHARS = OUTPUT_HEAD_CHARS + OUTPUT_TAIL_CHARS

export type RRunResult = {
  exitCode: number
  signal: string | null
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
}

function isFile(candidate: string): boolean {
  try {
    return existsSync(candidate) && statSync(candidate).isFile()
  } catch {
    return false
  }
}

function cleanPathEntry(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function findOnPath(): string | null {
  const executable = process.platform === "win32" ? "Rscript.exe" : "Rscript"
  const pathValue = process.env.PATH ?? ""

  for (const entry of pathValue.split(path.delimiter)) {
    const directory = cleanPathEntry(entry)
    if (!directory) continue
    const candidate = path.join(directory, executable)
    if (isFile(candidate)) return candidate
  }

  return null
}

function findFromRHome(): string | null {
  const rHome = process.env.R_HOME?.trim()
  if (!rHome) return null

  const executable = process.platform === "win32" ? "Rscript.exe" : "Rscript"
  const candidates = [
    path.join(rHome, "bin", executable),
    path.join(rHome, "bin", "x64", executable),
  ]

  return candidates.find(isFile) ?? null
}

function parseVersionFromName(value: string): number[] {
  const match = value.match(/(\d+(?:\.\d+){1,3})/)
  if (!match) return []
  return match[1].split(".").map((part) => Number.parseInt(part, 10))
}

function compareVersionNamesDescending(a: string, b: string): number {
  const av = parseVersionFromName(a)
  const bv = parseVersionFromName(b)
  const length = Math.max(av.length, bv.length)

  for (let i = 0; i < length; i += 1) {
    const left = av[i] ?? 0
    const right = bv[i] ?? 0
    if (left !== right) return right - left
  }

  return b.localeCompare(a)
}

function directoriesUnder(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

function findWindowsStandardInstall(): string | null {
  const roots = [
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "R") : null,
    process.env["ProgramFiles(x86)"]
      ? path.join(process.env["ProgramFiles(x86)"] as string, "R")
      : null,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Programs", "R")
      : null,
  ].filter((value): value is string => Boolean(value))

  const candidates: string[] = []

  for (const root of [...new Set(roots)]) {
    const installDirs = directoriesUnder(root)
      .filter((name) => /^R-\d/i.test(name))
      .sort(compareVersionNamesDescending)

    for (const installDir of installDirs) {
      const base = path.join(root, installDir)
      for (const relative of ["bin/Rscript.exe", "bin/x64/Rscript.exe"]) {
        const candidate = path.join(base, ...relative.split("/"))
        if (isFile(candidate)) candidates.push(candidate)
      }
    }
  }

  return candidates[0] ?? null
}

function findPosixStandardInstall(): string | null {
  const fixedCandidates =
    process.platform === "darwin"
      ? [
          "/Library/Frameworks/R.framework/Resources/bin/Rscript",
          "/opt/homebrew/bin/Rscript",
          "/usr/local/bin/Rscript",
          "/usr/bin/Rscript",
        ]
      : [
          "/usr/bin/Rscript",
          "/usr/local/bin/Rscript",
          "/usr/lib/R/bin/Rscript",
          "/snap/bin/Rscript",
        ]

  const fixed = fixedCandidates.find(isFile)
  if (fixed) return fixed

  if (process.platform === "linux") {
    const optRoot = "/opt/R"
    const versions = directoriesUnder(optRoot).sort(compareVersionNamesDescending)
    for (const version of versions) {
      const candidate = path.join(optRoot, version, "bin", "Rscript")
      if (isFile(candidate)) return candidate
    }
  }

  return null
}

export function discoverRscript(): string {
  const fromHome = findFromRHome()
  if (fromHome) return fromHome

  const fromPath = findOnPath()
  if (fromPath) return fromPath

  const standard =
    process.platform === "win32"
      ? findWindowsStandardInstall()
      : findPosixStandardInstall()

  if (standard) return standard

  throw new Error(
    "Rscript was not found. Install R and expose it through R_HOME, PATH, or a standard R installation location for this operating system.",
  )
}

export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  )
}

export function resolveProjectRScript(
  input: string,
  directory: string,
  worktree: string,
): string {
  const candidate = path.isAbsolute(input) ? input : path.resolve(directory, input)

  const absoluteRoot = path.resolve(worktree)
  if (!isInside(absoluteRoot, candidate)) {
    throw new Error("R execution is restricted to .R files inside the current project worktree.")
  }

  if (!isFile(candidate)) {
    throw new Error(`R script does not exist or is not a file: ${input}`)
  }

  if (path.extname(candidate).toLowerCase() !== ".r") {
    throw new Error(`The file passed for R execution must have a .R extension: ${input}`)
  }

  const realCandidate = realpathSync(candidate)
  const realRoot = realpathSync(worktree)

  if (!isInside(realRoot, realCandidate)) {
    throw new Error("R execution is restricted to .R files inside the current project worktree.")
  }

  return realCandidate
}

export function getCleanExit(result: RRunResult): "yes" | "no" {
  return result.exitCode === 0 && result.signal === null ? "yes" : "no"
}

export function getStdoutState(stdout: string): "EMPTY" | "NULL_LIKE" | "PRESENT" {
  const trimmed = stdout.trim()
  if (trimmed.length === 0) return "EMPTY"
  if (trimmed === "NULL") return "NULL_LIKE"
  return "PRESENT"
}

class BoundedCollector {
  private head = ""
  private tail = ""
  private total = 0

  constructor(
    private readonly headLimit: number,
    private readonly tailLimit: number,
  ) {}

  push(chunk: string): void {
    if (!chunk) return
    this.total += chunk.length
    if (this.head.length < this.headLimit) {
      const need = this.headLimit - this.head.length
      if (chunk.length <= need) {
        this.head += chunk
      } else {
        this.head += chunk.slice(0, need)
        const rem = chunk.slice(need)
        this.tail = (this.tail + rem).slice(-this.tailLimit)
      }
    } else {
      this.tail = (this.tail + chunk).slice(-this.tailLimit)
    }
  }

  result(): { text: string; truncated: boolean } {
    const limit = this.headLimit + this.tailLimit
    const truncated = this.total > limit
    if (!truncated) {
      return { text: this.head + this.tail, truncated: false }
    }
    const marker = `\n...[output truncated: ${this.total} chars; showing first ${this.headLimit} and last ${this.tailLimit} chars]...\n`
    return { text: this.head + marker + this.tail, truncated: true }
  }
}

export async function executeR(
  executable: string,
  script: string,
  scriptArgs: string[],
  cwd: string,
): Promise<RRunResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, ["--vanilla", script, ...scriptArgs], {
      cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
    })

    const outCollector = new BoundedCollector(OUTPUT_HEAD_CHARS, OUTPUT_TAIL_CHARS)
    const errCollector = new BoundedCollector(OUTPUT_HEAD_CHARS, OUTPUT_TAIL_CHARS)

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")

    child.stdout.on("data", (chunk: string) => {
      outCollector.push(chunk)
    })

    child.stderr.on("data", (chunk: string) => {
      errCollector.push(chunk)
    })

    child.once("error", reject)
    child.once("close", (code, signal) => {
      const out = outCollector.result()
      const err = errCollector.result()
      resolve({
        exitCode: code ?? -1,
        signal,
        stdout: out.text,
        stderr: err.text,
        stdoutTruncated: out.truncated,
        stderrTruncated: err.truncated,
      })
    })
  })
}

export async function runProjectRScript(
  file: string,
  scriptArgs: string[],
  directory: string,
  worktree: string,
): Promise<{ script: string; rscript: string; result: RRunResult }> {
  const script = resolveProjectRScript(file, directory, worktree)
  const rscript = discoverRscript()
  const result = await executeR(rscript, script, scriptArgs, directory)
  return { script, rscript, result }
}

export function formatRRunResult(
  result: RRunResult,
  script: string,
  worktree: string,
): string {
  const relativeScript = path.relative(worktree, script) || path.basename(script)
  const status = result.exitCode === 0 ? "SUCCESS" : "EXECUTION_ERROR"
  const cleanExit = getCleanExit(result)
  const stdoutState = getStdoutState(result.stdout)
  const outputTruncated = result.stdoutTruncated || result.stderrTruncated ? "yes" : "no"

  return [
    `STATUS: ${status}`,
    `EXIT_CODE: ${result.exitCode}`,
    `CLEAN_EXIT: ${cleanExit}`,
    `STDOUT_STATE: ${stdoutState}`,
    `OUTPUT_TRUNCATED: ${outputTruncated}`,
    `PLATFORM: ${process.platform}`,
    `SCRIPT: ${relativeScript}`,
    ...(result.signal ? [`SIGNAL: ${result.signal}`] : []),
    "STDOUT:",
    result.stdout || "(empty)",
    "STDERR:",
    result.stderr || "(empty)",
  ].join("\n")
}
