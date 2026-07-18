import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(resolve(root, "test-automation.config.json"), "utf8"));
const args = process.argv.slice(2);
const option = name => args.includes(name);
const optionValue = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const target = optionValue("--target") || process.env.TEST_TARGET_URL || "";
const startedAt = new Date();
const checks = [];

function record(name, passed, details = {}) {
  checks.push({ name, passed, ...details });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${details.summary ? `: ${details.summary}` : ""}`);
}

function filesUnder(directory) {
  const result = [];
  if (!existsSync(directory)) return result;
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    if (statSync(path).isDirectory()) result.push(...filesUnder(path));
    else result.push(path);
  }
  return result;
}

function designCases() {
  const text = readFileSync(resolve(root, config.designDocument), "utf8");
  const rows = [...text.matchAll(/^\|\s*([A-Z]+-\d+)\s*\|\s*(P[0-2])\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/gm)];
  return rows.map(match => ({ id: match[1], priority: match[2], description: match[3].trim(), expected: match[4].trim(), automation: match[5].trim() }));
}

function validateTraceability(cases) {
  const history = JSON.parse(readFileSync(resolve(root, config.prHistory), "utf8"));
  const knownPrs = new Set(history.map(item => item.number));
  const mappedPrs = new Set(config.regressionGroups.flatMap(group => group.pullRequests));
  const missingPrs = [...knownPrs].filter(number => !mappedPrs.has(number));
  const missingFiles = config.regressionGroups.flatMap(group => group.testFiles).filter(path => !existsSync(resolve(root, path)));
  const counts = Object.fromEntries(["P0", "P1", "P2"].map(priority => [priority, cases.filter(item => item.priority === priority).length]));
  record("design-and-pr-traceability", cases.length > 0 && missingPrs.length === 0 && missingFiles.length === 0, {
    summary: `${cases.length} design cases; ${mappedPrs.size}/${knownPrs.size} PRs mapped`,
    designCases: counts,
    missingPrs,
    missingFiles,
    regressionGroups: config.regressionGroups
  });
}

function runSyntaxChecks() {
  const files = [resolve(root, "apps"), resolve(root, "packages"), resolve(root, "scripts")]
    .flatMap(filesUnder)
    .filter(path => path.endsWith(".mjs"));
  const failures = [];
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) failures.push({ file: relative(root, file), error: result.stderr.trim() });
  }
  record("javascript-syntax", failures.length === 0, { summary: `${files.length} files checked`, failures });
}

function runNodeTests() {
  const testFiles = filesUnder(resolve(root, "apps/backend/test")).filter(path => path.endsWith(".test.mjs"));
  const result = spawnSync(process.execPath, ["--test", ...testFiles], { cwd: root, encoding: "utf8" });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  process.stdout.write(output);
  const tests = Number(/ℹ tests (\d+)/.exec(output)?.[1] || /# tests (\d+)/.exec(output)?.[1] || 0);
  record("node-test-suite", result.status === 0, { summary: `${tests || "all"} tests`, exitCode: result.status, output: output.slice(-12000) });
}

function validateRegressionContracts() {
  const style = readFileSync(resolve(root, "apps/frontend/style.css"), "utf8");
  const app = readFileSync(resolve(root, "apps/frontend/src/app.mjs"), "utf8");
  const routes = readFileSync(resolve(root, "apps/backend/src/features/interviews/routes.mjs"), "utf8");
  const contracts = [
    ["mobile-login-breakpoint", /@media \(max-width: 480px\)/.test(style) && /\.login-copy h1/.test(style)],
    ["global-command-gate", /createCommandGate/.test(app)],
    ["initial-question-lock", /initialQuestionLocks/.test(routes)],
    ["answer-idempotency", /clientRequestId/.test(routes) && /answerLocks/.test(routes)],
    ["history-pagination", /listSessionPage/.test(routes)]
  ];
  const failures = contracts.filter(([, passed]) => !passed).map(([name]) => name);
  record("pr-regression-contracts", failures.length === 0, { summary: `${contracts.length - failures.length}/${contracts.length} contracts`, failures });
}

async function runSmokeTests(baseUrl) {
  const base = baseUrl.replace(/\/$/, "");
  const smoke = async (name, path, expected, validate = () => true) => {
    try {
      const response = await fetch(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
      const text = await response.text();
      const passed = response.status === expected && validate(response, text);
      record(`smoke-${name}`, passed, { summary: `${response.status} ${path}`, expected, body: text.slice(0, 1000) });
    } catch (error) {
      record(`smoke-${name}`, false, { summary: error.message });
    }
  };
  await smoke("health", "/api/v1/health", 200, (_response, body) => JSON.parse(body).status === "ok");
  await smoke("unauthorized", "/api/v1/auth/me", 401);
  await smoke("api-not-found", "/api/v1/does-not-exist", 404, (response) => response.headers.get("content-type")?.includes("application/json"));
  await smoke("frontend", "/", 200, (response, body) => response.headers.get("content-type")?.includes("text/html") && body.includes("id=\"app\""));
}

function writeReport(cases) {
  const finishedAt = new Date();
  const report = {
    passed: checks.every(check => check.passed),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    target: target || null,
    designCaseCount: cases.length,
    checks
  };
  const directory = resolve(root, config.resultDirectory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "test-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    "# Automated test report", "",
    `- Result: ${report.passed ? "PASS" : "FAIL"}`,
    `- Design cases: ${cases.length}`,
    `- Duration: ${report.durationMs} ms`,
    `- Target: ${report.target || "local checks only"}`, "",
    "| Check | Result | Summary |", "|---|---|---|",
    ...checks.map(check => `| ${check.name} | ${check.passed ? "PASS" : "FAIL"} | ${(check.summary || "").replaceAll("|", "\\|")} |`)
  ];
  writeFileSync(resolve(directory, "test-report.md"), `${lines.join("\n")}\n`);
  return report;
}

const cases = designCases();
validateTraceability(cases);
if (!option("--skip-syntax")) runSyntaxChecks();
if (!option("--skip-tests")) runNodeTests();
validateRegressionContracts();
if (target) await runSmokeTests(target);
const report = writeReport(cases);
process.exitCode = report.passed ? 0 : 1;
