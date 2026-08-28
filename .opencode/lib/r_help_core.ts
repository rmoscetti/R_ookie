import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { runProjectRScript } from "./r_runtime"

const HELP_DIGEST_MAX_CHARS = 30_000
const DETAIL_MAX_CHARS = 8_000

export type HelpRequest = {
  topic: string
  package?: string
}

export type HelpResult = {
  ok: boolean
  requestedTopic: string
  requestedPackage: string
  topic?: string
  package?: string
  cacheStatus?: string
  cacheFile?: string
  packageIndex?: string
  mainIndex?: string
  digest?: string
  stdout: string
  stderr: string
  exitCode: number
}

type ValidationRecord = {
  topic: string
  package: string
  cacheFile: string
  validatedAt: string
}

type SearchRecord = {
  package: string
  query: string
  topics: string[]
  validatedAt: string
}

type ValidationState = {
  sessionID: string
  records: ValidationRecord[]
  searches: SearchRecord[]
}

function isDirectory(candidate: string): boolean {
  try {
    return existsSync(candidate) && statSync(candidate).isDirectory()
  } catch {
    return false
  }
}

export function normalizeTopic(input: string): string {
  const topic = input.trim().replace(/\s*\(\s*\)\s*$/, "")
  if (!topic) throw new Error("Help topic is empty after normalization.")
  return topic
}

export function normalizePackage(input?: string): string {
  const value = input?.trim()
  return value ? value : "AUTO"
}

export function resolveCacheProjectRoot(
  requested: string | undefined,
  directory: string,
  worktree: string,
): string {
  const realWorktree = realpathSync(worktree)
  const candidate = requested?.trim()
    ? path.resolve(realWorktree, requested.trim())
    : realWorktree

  if (!isDirectory(candidate)) {
    throw new Error(`Cache project root does not exist or is not a directory: ${requested ?? worktree}`)
  }

  const realCandidate = realpathSync(candidate)
  const relative = path.relative(realWorktree, realCandidate)
  const inside =
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))

  if (!inside) {
    throw new Error("Cache project root must be inside the current project worktree.")
  }

  if (!isDirectory(path.join(realCandidate, "wiki"))) {
    throw new Error("Cache project root must contain a wiki/ directory.")
  }

  return realCandidate
}

function parseKeyValue(stdout: string, key: string): string | undefined {
  const prefix = `${key}: `
  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith(prefix))
  return line?.slice(prefix.length).trim()
}

function trimTo(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n[documentation excerpt truncated]\n`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractSection(lines: string[], name: string): string {
  const heading = new RegExp(`^\\s*${escapeRegExp(name)}\\s*:\\s*$`, "i")
  const genericHeading = /^\s*[A-Za-z][A-Za-z0-9 /().,'_-]{1,80}:\s*$/
  const start = lines.findIndex((line) => heading.test(line))
  if (start < 0) return ""

  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (genericHeading.test(lines[i])) {
      end = i
      break
    }
  }

  return lines.slice(start, end).join("\n").trim()
}

export function helpDigestFromCache(cacheFile: string): string {
  const markdown = readFileSync(cacheFile, "utf8")
  const marker = "## Local help text"
  const markerPos = markdown.indexOf(marker)
  const metadata = markdown.slice(0, markerPos >= 0 ? markerPos : Math.min(markdown.length, 4000)).trim()
  let helpText = markerPos >= 0 ? markdown.slice(markerPos + marker.length) : markdown
  helpText = helpText
    .replace(/^\s*````text\s*/i, "")
    .replace(/\s*````\s*$/i, "")
    .trim()

  const lines = helpText.split(/\r?\n/)
  const sections = ["Description", "Usage", "Arguments", "Value", "Warning", "Warnings", "Note", "Details"]
    .map((name) => {
      const section = extractSection(lines, name)
      if (!section) return ""
      return name.toLowerCase() === "details" ? trimTo(section, DETAIL_MAX_CHARS) : section
    })
    .filter(Boolean)

  const body = sections.length > 0 ? sections.join("\n\n") : trimTo(helpText, HELP_DIGEST_MAX_CHARS)
  return trimTo(`${metadata}\n\n## Documentation excerpt\n\n${body}`, HELP_DIGEST_MAX_CHARS)
}

function sessionFile(projectRoot: string, sessionID: string): string {
  const digest = createHash("sha256").update(sessionID).digest("hex").slice(0, 24)
  const directory = path.join(projectRoot, "temp", "r-programmer", ".help-sessions")
  mkdirSync(directory, { recursive: true })
  return path.join(directory, `${digest}.json`)
}

function readState(projectRoot: string, sessionID: string): ValidationState {
  const file = sessionFile(projectRoot, sessionID)
  if (!existsSync(file)) return { sessionID, records: [], searches: [] }

  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as ValidationState
    if (parsed.sessionID !== sessionID || !Array.isArray(parsed.records)) {
      return { sessionID, records: [], searches: [] }
    }
    if (!Array.isArray((parsed as unknown as Record<string, unknown>).searches)) {
      (parsed as unknown as { searches: SearchRecord[] }).searches = []
    }
    return { sessionID, records: parsed.records, searches: (parsed as unknown as { searches: SearchRecord[] }).searches ?? [] }
  } catch {
    return { sessionID, records: [], searches: [] }
  }
}

function writeState(projectRoot: string, state: ValidationState): void {
  const file = sessionFile(projectRoot, state.sessionID)
  // Ensure searches is always an array for backward compatibility
  const toWrite: ValidationState = {
    sessionID: state.sessionID,
    records: state.records,
    searches: state.searches ?? [],
  }
  writeFileSync(file, `${JSON.stringify(toWrite, null, 2)}\n`, "utf8")
}

export function parseSearchPackageTopics(stdout: string): { package: string; topic: string }[] {
  const out: { package: string; topic: string }[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^MATCH:\s*([^\s|]+)\s*\|/)
    if (m) {
      const raw = m[1].trim()
      let pkg = ""
      let topic = raw
      if (raw.includes("::")) {
        const parts = raw.split("::")
        pkg = parts[0].trim()
        topic = parts.slice(1).join("::").trim()
      }
      topic = topic.replace(/\s*\(\s*\)\s*$/, "")
      if (topic) out.push({ package: pkg, topic: normalizeTopic(topic) })
    }
  }
  // dedupe by package::topic
  const seen = new Set<string>()
  const uniq: typeof out = []
  for (const e of out) {
    const key = `${e.package}::${e.topic}`
    if (!seen.has(key)) {
      seen.add(key)
      uniq.push(e)
    }
  }
  return uniq
}

export function isSearchValidated(
  projectRoot: string,
  sessionID: string,
  topic: string,
  packageValue?: string,
): boolean {
  const normalizedTopic = normalizeTopic(topic)
  const normalizedPkg = normalizePackage(packageValue)
  // AUTO is discovery-only; never validated as exact package::topic
  if (normalizedPkg.toUpperCase() === "AUTO") return false
  const state = readState(projectRoot, sessionID)
  if (!state.searches || state.searches.length === 0) return false
  const desiredKey = `${normalizedPkg}::${normalizedTopic}`
  for (const rec of state.searches) {
    for (const t of rec.topics) {
      if (t.includes("::")) {
        if (t === desiredKey) return true
      } else if (t === normalizedTopic && rec.package === normalizedPkg) {
        return true
      }
    }
  }
  return false
}

export function markSearched(
  projectRoot: string,
  sessionID: string,
  packageValue: string,
  query: string,
  topics: string[],
): void {
  if (topics.length === 0) return
  const normalizedTopics = [...new Set(
    topics.map((t) => {
      if (t.includes("::")) {
        const [pkg, tp] = t.split("::")
        return `${pkg.trim()}::${normalizeTopic(tp)}`
      }
      return normalizeTopic(t)
    }).filter(Boolean),
  )]
  if (normalizedTopics.length === 0) return
  const state = readState(projectRoot, sessionID)
  // Avoid duplicate identical search records
  state.searches = state.searches.filter(
    (r) => !(r.package === packageValue && r.query === query && JSON.stringify(r.topics) === JSON.stringify(normalizedTopics)),
  )
  state.searches.push({
    package: packageValue,
    query,
    topics: normalizedTopics,
    validatedAt: new Date().toISOString(),
  })
  // Keep only recent searches to bound file size
  if (state.searches.length > 20) state.searches = state.searches.slice(-20)
  writeState(projectRoot, state)
}

export function isHelpValidated(
  projectRoot: string,
  sessionID: string,
  request: HelpRequest,
): boolean {
  const topic = normalizeTopic(request.topic)
  const packageValue = normalizePackage(request.package)
  if (packageValue.toUpperCase() === "AUTO") return false
  const state = readState(projectRoot, sessionID)

  return state.records.some((record) => {
    if (record.topic !== topic) return false
    return record.package === packageValue
  })
}

function markValidated(
  projectRoot: string,
  sessionID: string,
  topic: string,
  packageValue: string,
  cacheFile: string,
): void {
  const state = readState(projectRoot, sessionID)
  state.records = state.records.filter(
    (record) => !(record.topic === topic && record.package === packageValue),
  )
  state.records.push({
    topic,
    package: packageValue,
    cacheFile,
    validatedAt: new Date().toISOString(),
  })
  writeState(projectRoot, state)
}

export async function validateHelp(
  request: HelpRequest,
  projectRoot: string,
  directory: string,
  worktree: string,
  sessionID: string,
): Promise<HelpResult> {
  const requestedTopic = normalizeTopic(request.topic)
  const requestedPackage = normalizePackage(request.package)
  // Search-before-help enforcement: topic must have been returned by a prior successful r_search_help, unless already validated
  if (!isHelpValidated(projectRoot, sessionID, request) && !isSearchValidated(projectRoot, sessionID, requestedTopic, requestedPackage)) {
    return {
      ok: false,
      requestedTopic,
      requestedPackage,
      stdout: "",
      stderr: `Local documentation search required before help validation for '${requestedTopic}'. Call r_search_help for the relevant package (or the package containing '${requestedTopic}') and verify the returned documented topic before r_help. Internal knowledge is not authoritative; the installed help is.`,
      exitCode: -1,
    }
  }
  const script = path.join(worktree, ".opencode", "skills", "r-help-cache", "scripts", "cache_help.R")
  const { result } = await runProjectRScript(
    script,
    [requestedTopic, requestedPackage, projectRoot],
    directory,
    worktree,
  )

  if (result.exitCode !== 0) {
    return {
      ok: false,
      requestedTopic,
      requestedPackage,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    }
  }

  const cacheStatus = parseKeyValue(result.stdout, "STATUS")
  const topic = parseKeyValue(result.stdout, "TOPIC")
  const packageValue = parseKeyValue(result.stdout, "PACKAGE")
  const cacheFile = parseKeyValue(result.stdout, "FILE")
  const packageIndex = parseKeyValue(result.stdout, "PACKAGE_INDEX")
  const mainIndex = parseKeyValue(result.stdout, "MAIN_INDEX")

  if (!cacheStatus || !topic || !packageValue || !cacheFile || !existsSync(cacheFile)) {
    return {
      ok: false,
      requestedTopic,
      requestedPackage,
      stdout: result.stdout,
      stderr: result.stderr || "cache_help.R completed without the expected metadata output.",
      exitCode: result.exitCode,
    }
  }

  const realCacheFile = realpathSync(cacheFile)
  const realProjectRoot = realpathSync(projectRoot)
  const relative = path.relative(realProjectRoot, realCacheFile)
  const inside =
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))

  if (!inside) {
    return {
      ok: false,
      requestedTopic,
      requestedPackage,
      stdout: result.stdout,
      stderr: "cache_help.R returned a cache file outside the selected project root.",
      exitCode: -1,
    }
  }

  const digest = helpDigestFromCache(realCacheFile)
  markValidated(projectRoot, sessionID, topic, packageValue, realCacheFile)

  return {
    ok: true,
    requestedTopic,
    requestedPackage,
    topic,
    package: packageValue,
    cacheStatus,
    cacheFile: realCacheFile,
    packageIndex,
    mainIndex,
    digest,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  }
}

export async function searchHelp(
  query: string,
  packageValue: string,
  directory: string,
  worktree: string,
) {
  const cleanQuery = query.trim()
  const cleanPackage = (packageValue?.trim() || "AUTO").trim() || "AUTO"
  if (!cleanQuery) throw new Error("Help search query cannot be empty.")
  // AUTO is allowed for discovery; explicit package validated by R script

  const script = path.join(worktree, ".opencode", "skills", "r-help-cache", "scripts", "search_help.R")
  return await runProjectRScript(script, [cleanQuery, cleanPackage], directory, worktree)
}
