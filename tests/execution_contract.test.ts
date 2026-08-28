// Deterministic acceptance/regression suite for Execution Contract v2
// Run with: deno run --allow-all --sloppy-imports --node-modules-dir=auto tests/execution_contract.test.ts

import rExec from "../.opencode/tools/r_exec.ts";
import rHelp from "../.opencode/tools/r_help.ts";
import rSearchHelp from "../.opencode/tools/r_search_help.ts";
import {
  discoverRscript,
  OUTPUT_LIMIT_CHARS,
  runProjectRScript,
} from "../.opencode/lib/r_runtime.ts";
import { spawn } from "node:child_process";

import * as fs from "node:fs";
import * as path from "node:path";

const worktree = path.resolve(".");
const directory = worktree;

// sandbox roots under temp/
const sandboxRoot = path.join(worktree, "temp", "acceptance-sandbox");
const sandboxAlt = path.join(worktree, "temp", "acceptance-sandbox-alt");
const rProgrammerTemp = path.join(worktree, "temp", "r-programmer");

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}
function cleanSandbox() {
  try { fs.rmSync(sandboxRoot, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(sandboxAlt, { recursive: true, force: true }); } catch {}
  ensureDir(path.join(sandboxRoot, "wiki"));
  ensureDir(path.join(sandboxAlt, "wiki"));
  ensureDir(path.join(worktree, "temp"));
  ensureDir(rProgrammerTemp);
}
cleanSandbox();

type TestResult = { id: number; name: string; status: "PASS" | "FAIL"; evidence: string };

const results: TestResult[] = [];

function countTempRFiles(): number {
  try {
    return fs.readdirSync(rProgrammerTemp).filter(f => f.endsWith(".R")).length;
  } catch { return 0; }
}

function logTest(id: number, name: string, pass: boolean, evidence: string) {
  results.push({ id, name, status: pass ? "PASS" : "FAIL", evidence: evidence.slice(0, 800) });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${id}. ${name}\n  Evidence: ${evidence.slice(0, 400)}\n`);
}

async function runAll() {
  console.log("=== Execution Contract v2 Acceptance Suite ===");
  console.log(`Worktree: ${worktree}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`Sandbox: ${sandboxRoot}`);
  console.log(`OUTPUT_LIMIT: ${OUTPUT_LIMIT_CHARS}`);

  const exec = async (args: unknown, session: string) => {
    return await (rExec as unknown as { execute: (a: unknown, c: unknown) => Promise<string> }).execute(args as never, { worktree, directory, sessionID: session } as never);
  };
  const help = async (args: unknown, session: string) => {
    return await (rHelp as unknown as { execute: (a: unknown, c: unknown) => Promise<string> }).execute(args as never, { worktree, directory, sessionID: session } as never);
  };
  const search = async (args: unknown, session: string) => {
    return await (rSearchHelp as unknown as { execute: (a: unknown, c: unknown) => Promise<string> }).execute(args as never, { worktree, directory, sessionID: session } as never);
  };

  // Helper to perform search before help/exec
  const doSearch = async (topic: string, pkg: string, sandbox: string, sess: string) => {
    const res = await search({ query: topic, package: pkg, project_root: sandbox }, sess);
    return res;
  };

  // 1. help_topics = []
  {
    const before = countTempRFiles();
    let res = "";
    let threw = false;
    try {
      res = await exec({ help_topics: [], code: "cat('hi')", script_args: [], project_root: sandboxRoot }, "sess-1-" + Date.now());
    } catch (e) { threw = true; res = String(e); }
    const after = countTempRFiles();
    const pass = !threw && res.includes("SCRIPT_EXECUTED: no") && res.includes("STATUS: ERROR") && before === after;
    logTest(1, "help_topics = []", pass, res);
  }

  // 2. help_topics = ["t.test"]
  {
    const before = countTempRFiles();
    let res = ""; let threw = false;
    try { res = await exec({ help_topics: ["t.test"] as unknown as never, code: "cat('hi')", script_args: [], project_root: sandboxRoot }, "sess-2-" + Date.now()); } catch (e) { threw = true; res = String(e); }
    const after = countTempRFiles();
    const pass = !threw && res.includes("SCRIPT_EXECUTED: no") && res.includes("INPUT_VALIDATION") && before === after;
    logTest(2, 'help_topics = ["t.test"] (string not object)', pass, res);
  }

  // 3. help_topics = [null]
  {
    const before = countTempRFiles();
    let res = ""; let threw = false;
    try { res = await exec({ help_topics: [null] as unknown as never, code: "cat('hi')", script_args: [], project_root: sandboxRoot }, "sess-3-" + Date.now()); } catch (e) { threw = true; res = String(e); }
    const after = countTempRFiles();
    const pass = !threw && res.includes("SCRIPT_EXECUTED: no") && before === after;
    logTest(3, "help_topics = [null]", pass, res);
  }

  // 4. help_topics = [{}]
  {
    const before = countTempRFiles();
    let res = ""; let threw = false;
    try { res = await exec({ help_topics: [{}] as unknown as never, code: "cat('hi')", script_args: [], project_root: sandboxRoot }, "sess-4-" + Date.now()); } catch (e) { threw = true; res = String(e); }
    const after = countTempRFiles();
    const pass = !threw && res.includes("SCRIPT_EXECUTED: no") && before === after;
    logTest(4, "help_topics = [{}]", pass, res);
  }

  // 5. empty topic
  {
    const before = countTempRFiles();
    let res = ""; let threw = false;
    try { res = await exec({ help_topics: [{ topic: "" }], code: "cat('hi')", script_args: [], project_root: sandboxRoot }, "sess-5-" + Date.now()); } catch (e) { threw = true; res = String(e); }
    const after = countTempRFiles();
    const pass = !threw && res.includes("SCRIPT_EXECUTED: no") && before === after;
    logTest(5, "empty topic", pass, res);
  }

  // 6. whitespace-only topic
  {
    const before = countTempRFiles();
    let res = ""; let threw = false;
    try { res = await exec({ help_topics: [{ topic: "   " }], code: "cat('hi')", script_args: [], project_root: sandboxRoot }, "sess-6-" + Date.now()); } catch (e) { threw = true; res = String(e); }
    const after = countTempRFiles();
    const pass = !threw && res.includes("SCRIPT_EXECUTED: no") && before === after;
    logTest(6, "whitespace-only topic", pass, res);
  }

  // 7. non-string package
  {
    const before = countTempRFiles();
    let res = ""; let threw = false;
    try { res = await exec({ help_topics: [{ topic: "median", package: 123 as unknown as string }], code: "cat('hi')", script_args: [], project_root: sandboxRoot }, "sess-7-" + Date.now()); } catch (e) { threw = true; res = String(e); }
    const after = countTempRFiles();
    const pass = !threw && res.includes("SCRIPT_EXECUTED: no") && res.includes("package must be a string") && before === after;
    logTest(7, "non-string package", pass, res);
  }

  // 8. new valid topic -> HELP_REQUIRED and no R execution (with search)
  let sess8 = "sess-8-" + Date.now();
  let topic8 = "median";
  cleanSandbox();
  {
    await doSearch(topic8, "stats", sandboxRoot, sess8);
    const code = "writeLines('SHOULD_NOT_EXIST', file.path(tempdir(), 'acceptance_should_not_run.txt'))\ncat('SHOULD_NOT_RUN\\n')";
    const before = countTempRFiles();
    const res = await exec({ help_topics: [{ topic: topic8, package: "stats" }], code, script_args: [], project_root: sandboxRoot }, sess8);
    const after = countTempRFiles();
    const pass = res.includes("STATUS: HELP_REQUIRED") && res.includes("SCRIPT_EXECUTED: no") && !res.includes("SHOULD_NOT_RUN") && before === after;
    logTest(8, "new valid topic -> HELP_REQUIRED and no R execution", pass, res);
  }

  // 9. second valid call -> help gate passes and R executes
  {
    await help({ topic: topic8, package: "stats", project_root: sandboxRoot }, sess8);
    const res = await exec({ help_topics: [{ topic: topic8, package: "stats" }], code: "cat('SECOND_PASS_OK\\n')", script_args: [], project_root: sandboxRoot }, sess8);
    const pass = res.includes("HELP_GATE: PASSED") && res.includes("SCRIPT_EXECUTED: yes") && res.includes("SECOND_PASS_OK");
    logTest(9, "second valid call -> help gate passes and R executes", pass, res);
  }

  // 10. package omitted -> AUTO rejected for exec (discovery only)
  {
    const sess = "sess-10-" + Date.now();
    cleanSandbox();
    await doSearch("t.test", "stats", sandboxAlt, sess);
    let first = await exec({ help_topics: [{ topic: "t.test" }], code: "cat('AUTO_TEST\\n')", script_args: [], project_root: sandboxAlt }, sess);
    const firstPass = first.includes("STATUS: ERROR") && first.includes("INPUT_VALIDATION") && first.includes("explicit package");
    const helpRes = await help({ topic: "t.test", package: "stats", project_root: sandboxAlt }, sess);
    const helpOk = helpRes.includes("STATUS: READY");
    let second = await exec({ help_topics: [{ topic: "t.test", package: "stats" }], code: "cat('AUTO_RESOLVED_OK\\n')", script_args: [], project_root: sandboxAlt }, sess);
    const secondPass = second.includes("HELP_GATE: PASSED") && second.includes("SCRIPT_EXECUTED: yes") && second.includes("HELP_TOPICS: stats::t.test") && second.includes("AUTO_RESOLVED_OK");
    const pass = firstPass && helpOk && secondPass;
    logTest(10, "package omitted -> AUTO rejected for exec, explicit succeeds", pass, `first:${first.slice(0,400)}\nhelp:${helpRes.slice(0,300)}\nsecond:${second.slice(0,400)}`);
  }

  // 11. explicit package -> correct package/topic works
  {
    const sess = "sess-11-" + Date.now();
    cleanSandbox();
    await doSearch("t.test", "stats", sandboxRoot, sess);
    let first = await exec({ help_topics: [{ topic: "t.test", package: "stats" }], code: "cat('EXPLICIT_PKG\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const firstPass = first.includes("STATUS: HELP_REQUIRED") && first.includes("SCRIPT_EXECUTED: no") && first.includes("TOPIC: t.test") && first.includes("PACKAGE: stats");
    await help({ topic: "t.test", package: "stats", project_root: sandboxRoot }, sess);
    let second = await exec({ help_topics: [{ topic: "t.test", package: "stats" }], code: "cat('EXPLICIT_OK\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const secondPass = second.includes("HELP_GATE: PASSED") && second.includes("SCRIPT_EXECUTED: yes") && second.includes("HELP_TOPICS: stats::t.test") && second.includes("EXPLICIT_OK") && second.includes("STATUS: SUCCESS") && second.includes("CLEAN_EXIT: yes");
    const pass = firstPass && secondPass;
    logTest(11, "explicit package -> correct package/topic works", pass, `first:${first.slice(0,300)}\nsecond:${second.slice(0,500)}`);
  }

  // 12. successful R script -> CLEAN_EXIT yes
  {
    const sess = "sess-12-" + Date.now();
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "cat('CLEAN_EXIT_TEST\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("CLEAN_EXIT: yes") && res.includes("EXIT_CODE: 0") && res.includes("STATUS: SUCCESS");
    logTest(12, "successful R script -> CLEAN_EXIT yes", pass, res);
  }

  // 13. R runtime error -> CLEAN_EXIT no / execution error
  {
    const sess = "sess-13-" + Date.now();
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "stop('intentional runtime error')", script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("CLEAN_EXIT: no") && (res.includes("STATUS: EXECUTION_ERROR") || res.includes("STATUS: ERROR")) && res.includes("intentional runtime error");
    logTest(13, "R runtime error -> CLEAN_EXIT no", pass, res);
  }

  // 14. empty stdout -> STDOUT_STATE EMPTY
  {
    const sess = "sess-14-" + Date.now();
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "x <- 1", script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("STDOUT_STATE: EMPTY") && res.includes("CLEAN_EXIT: yes");
    logTest(14, "empty stdout -> STDOUT_STATE EMPTY", pass, res);
  }

  // 15. explicit printed NULL -> STDOUT_STATE NULL_LIKE
  {
    const sess = "sess-15-" + Date.now();
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "print(NULL)", script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("STDOUT_STATE: NULL_LIKE");
    logTest(15, "explicit printed NULL -> STDOUT_STATE NULL_LIKE", pass, res);
  }

  // 16. ordinary stdout -> STDOUT_STATE PRESENT
  {
    const sess = "sess-16-" + Date.now();
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "cat('hello world\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("STDOUT_STATE: PRESENT") && res.includes("hello world");
    logTest(16, "ordinary stdout -> STDOUT_STATE PRESENT", pass, res);
  }

  // 17. warning without fatal error -> successful execution with warning preserved
  {
    const sess = "sess-17-" + Date.now();
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "warning('my warning'); cat('after warning\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("CLEAN_EXIT: yes") && res.includes("STATUS: SUCCESS") && (res.includes("my warning") || res.includes("Warning")) && res.includes("after warning");
    logTest(17, "warning without fatal error -> successful with warning preserved", pass, res);
  }

  // 18. oversized stdout with true head/tail
  {
    const sess = "sess-18-" + Date.now();
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const code = `cat("BEGIN_STDOUT_SENTINEL\\n"); cat(paste(rep("X", 80000), collapse="")); cat("MIDDLE_STDOUT_SENTINEL"); cat(paste(rep("Y", 70000), collapse="")); cat("\\nEND_STDOUT_SENTINEL\\n")`;
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code, script_args: [], project_root: sandboxRoot }, sess);
    const stdoutSection = res.split("STDOUT:")[1]?.split("STDERR:")[0] ?? "";
    const hasBegin = stdoutSection.includes("BEGIN_STDOUT_SENTINEL");
    const hasEnd = stdoutSection.includes("END_STDOUT_SENTINEL");
    const hasMiddle = stdoutSection.includes("MIDDLE_STDOUT_SENTINEL");
    const hasMarker = stdoutSection.includes("output truncated") && stdoutSection.includes("showing first");
    const truncated = res.includes("OUTPUT_TRUNCATED: yes");
    const executed = res.includes("SCRIPT_EXECUTED: yes") && res.includes("CLEAN_EXIT: yes");
    const bounded = stdoutSection.length <= OUTPUT_LIMIT_CHARS + 200;
    const pass = hasBegin && hasEnd && !hasMiddle && hasMarker && truncated && executed && bounded;
    logTest(18, "oversized stdout -> true head/tail retained", pass, `bounded:${stdoutSection.length}<=${OUTPUT_LIMIT_CHARS+200} ${res.slice(0, 1200)}`);
  }

  // 32. oversized stderr with true head/tail
  {
    const sess = "sess-32-" + Date.now();
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const code = `cat("BEGIN_STDERR_SENTINEL\\n", file=stderr()); cat(paste(rep("A", 80000), collapse=""), file=stderr()); cat("MIDDLE_STDERR_SENTINEL", file=stderr()); cat(paste(rep("B", 70000), collapse=""), file=stderr()); cat("\\nEND_STDERR_SENTINEL\\n", file=stderr())`;
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code, script_args: [], project_root: sandboxRoot }, sess);
    const stdoutSection = res.split("STDOUT:")[1]?.split("STDERR:")[0] ?? "";
    const stderrSection = res.split("STDERR:")[1] ?? "";
    const hasBegin = stderrSection.includes("BEGIN_STDERR_SENTINEL");
    const hasEnd = stderrSection.includes("END_STDERR_SENTINEL");
    const hasMiddle = stderrSection.includes("MIDDLE_STDERR_SENTINEL");
    const hasMarker = stderrSection.includes("output truncated") && stderrSection.includes("showing first");
    const truncated = res.includes("OUTPUT_TRUNCATED: yes");
    const executed = res.includes("SCRIPT_EXECUTED: yes") && res.includes("CLEAN_EXIT: yes");
    const notInStdout = !stdoutSection.includes("BEGIN_STDERR_SENTINEL");
    const bounded = stderrSection.length <= OUTPUT_LIMIT_CHARS + 200;
    const pass = hasBegin && hasEnd && !hasMiddle && hasMarker && truncated && executed && notInStdout && bounded;
    logTest(32, "oversized stderr -> true head/tail retained", pass, `bounded:${stderrSection.length}<=${OUTPUT_LIMIT_CHARS+200} ${res.slice(0, 1200)}`);
  }

  // 19. code= mode
  {
    const sess = "sess-19-" + Date.now();
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "cat('CODE_MODE_OK\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("CODE_MODE_OK") && res.includes("SCRIPT_EXECUTED: yes");
    logTest(19, "code= mode", pass, res);
  }

  // 20. file= mode for existing in-worktree .R file
  {
    const sess = "sess-20-" + Date.now();
    const fileRel = "temp/acceptance-file-mode.R";
    const fileAbs = path.join(worktree, fileRel);
    ensureDir(path.dirname(fileAbs));
    fs.writeFileSync(fileAbs, "cat('FILE_MODE_OK\\n')", "utf8");
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], file: fileRel, script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("FILE_MODE_OK") && res.includes("SCRIPT_EXECUTED: yes") && res.includes("acceptance-file-mode.R");
    logTest(20, "file= mode for existing in-worktree .R file", pass, res);
  }

  // 21. both code and file -> controlled argument error
  {
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "cat('hi\\n')", file: "temp/acceptance-file-mode.R", script_args: [], project_root: sandboxRoot }, "sess-21-" + Date.now());
    const pass = res.includes("SCRIPT_EXECUTED: no") && res.includes("exactly one of file or code");
    logTest(21, "both code and file -> controlled argument error", pass, res);
  }

  // 22. neither code nor file -> controlled argument error
  {
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], script_args: [], project_root: sandboxRoot } as never, "sess-22-" + Date.now());
    const pass = res.includes("SCRIPT_EXECUTED: no") && res.includes("exactly one of file or code");
    logTest(22, "neither code nor file -> controlled argument error", pass, res);
  }

  // 23. blank code -> controlled argument error
  {
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "   ", script_args: [], project_root: sandboxRoot }, "sess-23-" + Date.now());
    const pass = res.includes("SCRIPT_EXECUTED: no") && res.includes("cannot be empty");
    logTest(23, "blank code -> controlled argument error", pass, res);
  }

  // 24. file outside allowed worktree -> rejected
  {
    const sess = "sess-24-" + Date.now();
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const outsidePath = path.join(path.dirname(worktree), `outside_test_${Date.now()}.R`);
    const beforeExists = fs.existsSync(outsidePath);
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], file: outsidePath, script_args: [], project_root: sandboxRoot }, sess);
    const afterExists = fs.existsSync(outsidePath);
    const pass = !beforeExists && !afterExists && res.includes("SCRIPT_EXECUTED: no") && res.includes("PHASE: FILE_VALIDATION") && (res.includes("inside the current project worktree") || res.includes("restricted"));
    logTest(24, "file outside allowed worktree -> rejected", pass, res);
  }

  // 25. script arguments reach R correctly
  {
    const sess = "sess-25-" + Date.now();
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const code = "args <- commandArgs(trailingOnly=TRUE); cat(paste(args, collapse=','), '\\n')";
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code, script_args: ["hello", "world123"], project_root: sandboxRoot }, sess);
    const pass = res.includes("hello,world123");
    logTest(25, "script arguments reach R correctly", pass, res);
  }

  // 26. R runtime discovery still works
  {
    let rscriptPath = "";
    let pass = false;
    let evidence = "";
    try {
      rscriptPath = discoverRscript();
      pass = fs.existsSync(rscriptPath) && (rscriptPath.toLowerCase().includes("rscript"));
      evidence = `discovered: ${rscriptPath} exists:${fs.existsSync(rscriptPath)}`;
    } catch (e) {
      evidence = String(e);
      pass = false;
    }
    logTest(26, "R runtime discovery still works", pass, evidence);
  }

  // 27. behavioral --vanilla startup isolation
  {
    const sandbox = path.join(worktree, "temp", "vanilla-sandbox");
    const rprofilePath = path.join(sandbox, ".Rprofile");
    const renvironPath = path.join(sandbox, ".Renviron");
    const testRel = path.join("temp", "vanilla-sandbox", "test_vanilla.R");
    const testAbs = path.join(worktree, testRel);
    let pass = false;
    let evidence = "";
    const origRProfile = process.env.R_PROFILE_USER;
    const origREnviron = process.env.R_ENVIRON_USER;
    try {
      try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch {}
      fs.mkdirSync(sandbox, { recursive: true });
      fs.writeFileSync(rprofilePath, `Sys.setenv(OPENCODE_RPROFILE_SENTINEL="LOADED")\n`, "utf8");
      fs.writeFileSync(renvironPath, `OPENCODE_RENVIRON_SENTINEL=LOADED\n`, "utf8");
      fs.writeFileSync(testAbs, `cat(Sys.getenv("OPENCODE_RPROFILE_SENTINEL", unset="NOT_LOADED"), "\\n")\ncat(Sys.getenv("OPENCODE_RENVIRON_SENTINEL", unset="NOT_LOADED"), "\\n")\ncat("MARKER_OK\\n")\n`, "utf8");

      const rscript = discoverRscript();
      process.env.R_PROFILE_USER = rprofilePath;
      process.env.R_ENVIRON_USER = renvironPath;

      const control = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
        const child = spawn(rscript, [testAbs], { cwd: worktree, env: process.env, shell: false });
        let out = ""; let err = "";
        child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
        child.stdout.on("data", (c: string) => out += c);
        child.stderr.on("data", (c: string) => err += c);
        child.once("error", reject);
        child.once("close", (code) => resolve({ stdout: out, stderr: err, code: code ?? -1 }));
      });
      const controlLines = control.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const controlOk = control.code === 0 && controlLines.includes("LOADED") && !controlLines.includes("NOT_LOADED") && controlLines.includes("MARKER_OK") && controlLines.filter(l => l === "LOADED").length >= 2;

      const { result: prod } = await runProjectRScript(testRel, [], worktree, worktree);
      const prodLines = prod.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const prodOk = prod.exitCode === 0 && prodLines.includes("MARKER_OK") && prodLines.includes("NOT_LOADED") && !prodLines.includes("LOADED") && prod.stdoutTruncated === false && prod.stderrTruncated === false;

      pass = controlOk && prodOk;
      evidence = `control:${control.stdout.trim().slice(0,120)} code:${control.code} | prod:${prod.stdout.trim().slice(0,120)} exit:${prod.exitCode} truncated:${prod.stdoutTruncated}/${prod.stderrTruncated}`;
    } catch (e) {
      evidence = String(e);
      pass = false;
    } finally {
      if (origRProfile === undefined) delete process.env.R_PROFILE_USER; else process.env.R_PROFILE_USER = origRProfile;
      if (origREnviron === undefined) delete process.env.R_ENVIRON_USER; else process.env.R_ENVIRON_USER = origREnviron;
      try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch {}
    }
    logTest(27, "behavioral --vanilla startup isolation", pass, evidence);
  }

  // 28. no shell is used by launcher
  {
    const content = fs.readFileSync(path.join(worktree, ".opencode", "lib", "r_runtime.ts"), "utf8");
    const hasShellFalse = content.includes("shell: false");
    const hasShellTrue = content.includes("shell: true");
    const hasRscriptE = content.includes("Rscript -e") || content.includes("R -e");
    const pass = hasShellFalse && !hasShellTrue && !hasRscriptE;
    logTest(28, "no shell is used by launcher", pass, `shell:false=${hasShellFalse} shell:true=${hasShellTrue} Rscript -e=${hasRscriptE}`);
  }

  // 29. cache/help behavior does not regress
  {
    const sess = "sess-29-" + Date.now();
    cleanSandbox();
    await doSearch("median", "stats", sandboxRoot, sess);
    const helpRes = await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const helpPass = helpRes.includes("STATUS: READY") && helpRes.includes("CACHE_STATUS");
    const cacheFile = path.join(sandboxRoot, "wiki", "r-help", "stats", "median.md");
    const cacheExists = fs.existsSync(cacheFile);
    const helpRes2 = await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const hitPass = helpRes2.includes("CACHE_HIT");
    const sess2 = "sess-29b-" + Date.now();
    await doSearch("aov", "stats", sandboxRoot, sess2);
    const execFirst = await exec({ help_topics: [{ topic: "aov", package: "stats" }], code: "cat('pre\\n')", script_args: [], project_root: sandboxRoot }, sess2);
    const execGate = execFirst.includes("STATUS: HELP_REQUIRED");
    const pass = helpPass && cacheExists && hitPass && execGate;
    logTest(29, "cache/help behavior does not regress", pass, `help1:${helpRes.slice(0,300)}\ncacheExists:${cacheExists}\nhelp2:${helpRes2.slice(0,300)}\nexecGate:${execFirst.slice(0,300)}`);
  }

  // 30. wiki indexes/cache files are not corrupted
  {
    const mainIndex = path.join(sandboxRoot, "wiki", "r-help", "index.md");
    const pkgIndex = path.join(sandboxRoot, "wiki", "r-help", "stats", "index.md");
    let pass = false;
    let evidence = "";
    try {
      const mainExists = fs.existsSync(mainIndex);
      const pkgExists = fs.existsSync(pkgIndex);
      let mainContent = mainExists ? fs.readFileSync(mainIndex, "utf8") : "";
      let pkgContent = pkgExists ? fs.readFileSync(pkgIndex, "utf8") : "";
      const mainHasTable = mainContent.includes("| Package |") || mainContent.includes("Local R help cache");
      const pkgHasTable = pkgContent.includes("| Topic |") || pkgContent.includes("local help cache");
      const lines = pkgContent.split("\n").filter(l => l.startsWith("| `"));
      const seen = new Set<string>();
      let dup = false;
      for (const line of lines) {
        if (seen.has(line)) dup = true;
        seen.add(line);
      }
      evidence = `mainExists:${mainExists} pkgExists:${pkgExists} mainHasTable:${mainHasTable} pkgHasTable:${pkgHasTable} dup:${dup} lines:${lines.length}`;
      pass = mainExists && pkgExists && mainHasTable && pkgHasTable && !dup;
    } catch (e) {
      evidence = String(e);
    }
    logTest(30, "wiki indexes/cache files are not corrupted", pass, evidence);
  }

  // 31. package: null must be rejected structurally
  {
    const before = countTempRFiles();
    let res = ""; let threw = false;
    try { res = await exec({ help_topics: [{ topic: "median", package: null as unknown as string }], code: "cat('hi')", script_args: [], project_root: sandboxRoot }, "sess-31-" + Date.now()); } catch (e) { threw = true; res = String(e); }
    const after = countTempRFiles();
    const pass = !threw && res.includes("STATUS: ERROR") && res.includes("PHASE: INPUT_VALIDATION") && res.includes("SCRIPT_EXECUTED: no") && res.includes("package must be a string") && before === after;
    logTest(31, "package: null rejected", pass, res);
  }

  // 33. execution without search is blocked
  {
    const sess = "sess-33-" + Date.now();
    cleanSandbox();
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "cat('SHOULD_NOT_EXEC\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("STATUS: ERROR") && res.includes("Local documentation search required") && res.includes("SCRIPT_EXECUTED: no") && !res.includes("SHOULD_NOT_EXEC");
    logTest(33, "execution without search is blocked", pass, res);
  }

  // 34. search alone insufficient for execution
  {
    const sess = "sess-34-" + Date.now();
    cleanSandbox();
    await doSearch("median", "stats", sandboxRoot, sess);
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "cat('AFTER_SEARCH_ONLY\\n')", script_args: [], project_root: sandboxRoot }, sess);
    // Search alone should still require help: first exec after search should be HELP_REQUIRED, not PASSED
    const pass = res.includes("STATUS: HELP_REQUIRED") && res.includes("SCRIPT_EXECUTED: no");
    logTest(34, "search alone insufficient for execution", pass, res);
  }

  // 35. search + help permits execution
  {
    const sess = "sess-35-" + Date.now();
    cleanSandbox();
    await doSearch("median", "stats", sandboxRoot, sess);
    const helpRes = await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const helpOk = helpRes.includes("STATUS: READY");
    const execRes = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "cat('SEARCH_HELP_EXEC_OK\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const execOk = execRes.includes("HELP_GATE: PASSED") && execRes.includes("SEARCH_HELP_EXEC_OK");
    const pass = helpOk && execOk;
    logTest(35, "search + help permits execution", pass, `help:${helpRes.slice(0,200)} exec:${execRes.slice(0,400)}`);
  }

  // 36. failed search does not mark
  {
    const sess = "sess-36-" + Date.now();
    cleanSandbox();
    const searchRes = await search({ query: "nonexistent_xyz_12345", package: "stats", project_root: sandboxRoot }, sess);
    const isNoMatches = searchRes.includes("NO_MATCHES") || searchRes.includes("MATCH_COUNT: 0");
    // Try help for median after failed search for unrelated query – should still require search for median
    const helpRes = await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    const helpBlocked = helpRes.includes("Local documentation search required");
    const pass = isNoMatches && helpBlocked;
    logTest(36, "failed search does not mark", pass, `search:${searchRes.slice(0,300)} help:${helpRes.slice(0,300)}`);
  }

  // 37. search query text does not validate unreturned topic
  {
    const sess = "sess-37-" + Date.now();
    cleanSandbox();
    const searchRes = await search({ query: "student", package: "stats", project_root: sandboxRoot }, sess);
    const hasSearch = searchRes.includes("MATCHES") && searchRes.includes("t.test");
    // "student" was query text, not returned topic; help for it should be blocked by search gate
    const helpRes = await help({ topic: "student", package: "stats", project_root: sandboxRoot }, sess);
    const helpBlocked = helpRes.includes("Local documentation search required");
    const execRes = await exec({ help_topics: [{ topic: "student", package: "stats" }], code: "cat('hi\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const execBlocked = execRes.includes("Local documentation search required");
    const pass = hasSearch && helpBlocked && execBlocked;
    logTest(37, "search query text does not validate unreturned topic", pass, `search:${searchRes.slice(0,300)} help:${helpRes.slice(0,300)} exec:${execRes.slice(0,300)}`);
  }

  // 38. search for one topic cannot validate different topic
  {
    const sess = "sess-38-" + Date.now();
    cleanSandbox();
    await doSearch("median", "stats", sandboxRoot, sess);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sess);
    // Try exec with different topic aov without search for aov
    const res = await exec({ help_topics: [{ topic: "aov", package: "stats" }], code: "cat('DIFFERENT_TOPIC\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("Local documentation search required") && res.includes("aov") && !res.includes("DIFFERENT_TOPIC");
    logTest(38, "search for one topic cannot validate different topic", pass, res);
  }

  // 39. stale validation does not leak across sessions
  {
    const sessA = "sess-39A-" + Date.now();
    const sessB = "sess-39B-" + Date.now();
    cleanSandbox();
    await doSearch("median", "stats", sandboxRoot, sessA);
    await help({ topic: "median", package: "stats", project_root: sandboxRoot }, sessA);
    await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "cat('LEAK_A\\n')", script_args: [], project_root: sandboxRoot }, sessA);
    // New session B should not have median validated
    const resB = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "cat('LEAK_B\\n')", script_args: [], project_root: sandboxRoot }, sessB);
    const pass = resB.includes("Local documentation search required") && !resB.includes("LEAK_B");
    logTest(39, "stale validation does not leak across sessions", pass, resB);
  }

  // 40. SCRIPT_EXECUTED: no never success
  {
    const sess = "sess-40-" + Date.now();
    cleanSandbox();
    const res = await exec({ help_topics: [{ topic: "median", package: "stats" }], code: "cat('NO_EXEC\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("SCRIPT_EXECUTED: no") && !res.includes("HELP_GATE: PASSED") && !res.includes("STATUS: SUCCESS") && res.includes("Local documentation search required");
    logTest(40, "SCRIPT_EXECUTED: no never success", pass, res);
  }

  // 41. AUTO package discovery returns package+topic identities
  {
    const sess = "sess-41-" + Date.now();
    cleanSandbox();
    const res = await search({ query: "mean", package: "AUTO", project_root: sandboxRoot }, sess);
    const hasBaseMean = res.includes("base::mean") || (res.includes("base") && res.includes("mean"));
    const hasMatches = res.includes("MATCHES") && res.includes("mean");
    const pass = hasBaseMean && hasMatches;
    logTest(41, "AUTO discovery returns package+topic", pass, res.slice(0, 500));
  }

  // 42. same topic in different packages does not cross-validate
  {
    const sess = "sess-42-" + Date.now();
    cleanSandbox();
    await doSearch("filter", "stats", sandboxRoot, sess);
    await help({ topic: "filter", package: "stats", project_root: sandboxRoot }, sess);
    // Try help for same topic but different package dplyr without search for dplyr::filter
    const helpOther = await help({ topic: "filter", package: "dplyr", project_root: sandboxRoot }, sess);
    const blocked = helpOther.includes("Local documentation search required");
    const execOther = await exec({ help_topics: [{ topic: "filter", package: "dplyr" }], code: "cat('CROSS\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const execBlocked = execOther.includes("Local documentation search required") || execOther.includes("HELP_REQUIRED");
    const pass = blocked && execBlocked;
    logTest(42, "same topic different package does not cross-validate", pass, `helpOther:${helpOther.slice(0,300)} exec:${execOther.slice(0,300)}`);
  }

  // 43. r_help with AUTO rejected
  {
    const sess = "sess-43-" + Date.now();
    cleanSandbox();
    await doSearch("mean", "AUTO", sandboxRoot, sess);
    const res = await help({ topic: "mean", package: "AUTO", project_root: sandboxRoot }, sess);
    const pass = res.includes("STATUS: ERROR") && res.includes("INPUT_VALIDATION") && res.includes("explicit package");
    logTest(43, "r_help with AUTO rejected", pass, res);
  }

  // 44. r_help with omitted package rejected
  {
    const sess = "sess-44-" + Date.now();
    cleanSandbox();
    await doSearch("mean", "AUTO", sandboxRoot, sess);
    const res = await help({ topic: "mean", project_root: sandboxRoot } as any, sess);
    const pass = res.includes("STATUS: ERROR") && res.includes("INPUT_VALIDATION") && res.includes("explicit package");
    logTest(44, "r_help with omitted package rejected", pass, res);
  }

  // 45. r_exec with AUTO rejected
  {
    const sess = "sess-45-" + Date.now();
    cleanSandbox();
    await doSearch("mean", "AUTO", sandboxRoot, sess);
    await help({ topic: "mean", package: "base", project_root: sandboxRoot }, sess);
    const res = await exec({ help_topics: [{ topic: "mean", package: "AUTO" }], code: "cat('hi\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("STATUS: ERROR") && res.includes("INPUT_VALIDATION") && res.includes("explicit package");
    logTest(45, "r_exec with AUTO rejected", pass, res);
  }

  // 46. r_exec with omitted package rejected
  {
    const sess = "sess-46-" + Date.now();
    cleanSandbox();
    await doSearch("mean", "AUTO", sandboxRoot, sess);
    await help({ topic: "mean", package: "base", project_root: sandboxRoot }, sess);
    const res = await exec({ help_topics: [{ topic: "mean" }], code: "cat('hi\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const pass = res.includes("STATUS: ERROR") && res.includes("INPUT_VALIDATION") && res.includes("explicit package");
    logTest(46, "r_exec with omitted package rejected", pass, res);
  }

  // 47. AUTO discovery followed by explicit correct package::topic succeeds
  {
    const sess = "sess-47-" + Date.now();
    cleanSandbox();
    const searchRes = await search({ query: "mean", package: "AUTO", project_root: sandboxRoot }, sess);
    const hasBaseMean = searchRes.includes("base::mean");
    const helpRes = await help({ topic: "mean", package: "base", project_root: sandboxRoot }, sess);
    const helpOk = helpRes.includes("STATUS: READY");
    const execRes = await exec({ help_topics: [{ topic: "mean", package: "base" }], code: "cat(mean(c(1,2,3))\\n)", script_args: [], project_root: sandboxRoot }, sess);
    const execOk = execRes.includes("HELP_GATE: PASSED") && execRes.includes("2");
    const pass = hasBaseMean && helpOk && execOk;
    logTest(47, "AUTO discovery followed by explicit correct succeeds", pass, `search:${searchRes.slice(0,300)}\nhelp:${helpRes.slice(0,200)}\nexec:${execRes.slice(0,300)}`);
  }

  // 48. AUTO discovery followed by wrong package blocked
  {
    const sess = "sess-48-" + Date.now();
    cleanSandbox();
    await doSearch("mean", "AUTO", sandboxRoot, sess);
    // Try help for same topic but wrong package that was not the discovered one (mean is base, try stats)
    const helpRes = await help({ topic: "mean", package: "stats", project_root: sandboxRoot }, sess);
    const helpBlocked = helpRes.includes("Local documentation search required");
    const execRes = await exec({ help_topics: [{ topic: "mean", package: "stats" }], code: "cat('hi\\n')", script_args: [], project_root: sandboxRoot }, sess);
    const execBlocked = execRes.includes("Local documentation search required") || execRes.includes("HELP_REQUIRED");
    const pass = helpBlocked && execBlocked;
    logTest(48, "AUTO discovery followed by wrong package blocked", pass, `help:${helpRes.slice(0,300)} exec:${execRes.slice(0,300)}`);
  }

  console.log("\n=== SUMMARY ===");
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  console.table(results.map(r => ({ Test: `${r.id}. ${r.name}`, Status: r.status, Evidence: r.evidence.slice(0, 200) })));
  console.log(`\nTotal: ${results.length}, Passed: ${passed}, Failed: ${failed}`);

  if (failed > 0) {
    console.error(`\nSUITE FAILED: ${failed} test(s) failed`);
    Deno.exit(1);
  } else {
    console.log("\nSUITE PASSED");
    Deno.exit(0);
  }
}

await runAll();
