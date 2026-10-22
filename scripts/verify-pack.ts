/**
 * Check what `npm pack` would publish, without publishing anything:
 *   - every target in package.json "exports" (and "types") is in the tarball;
 *   - nothing outside the runtime, the mock, the types and the docs files is: no tests,
 *     templates, scripts, e2e, sources or config.
 * Run after `npm run build:lib` (`npm ci` does it through `prepare`).
 *
 * Usage: node scripts/verify-pack.ts
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED = [/^dist\//, /^mock\/dist\//, /^types\/yes2sdk\.d\.ts$/, /^(package\.json|README\.md|CHANGELOG\.md|LICENSE)$/];

type ExportTarget = string | { [condition: string]: ExportTarget };

function targets(entry: ExportTarget): string[] {
    return typeof entry === "string" ? [entry] : Object.values(entry).flatMap(targets);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// Some npm versions (10.x, Node 22) still run `prepare` here, and its log lines reach stdout
// ahead of the JSON. Parse from the line where the JSON array starts.
const output = execFileSync(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: ROOT, encoding: "utf8" });
const jsonStart = output.search(/^\[\s*$/m);
if (jsonStart === -1) {
    console.error(`[verify-pack] npm pack printed no JSON:\n${output}`);
    process.exit(1);
}
const report = JSON.parse(output.slice(jsonStart)) as Array<{ files: Array<{ path: string }> }>;
const files = new Set((report[0]?.files ?? []).map((f) => f.path));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { exports: Record<string, ExportTarget>; types: string };

const problems: string[] = [];
for (const path of files) {
    if (!ALLOWED.some((re) => re.test(path))) {
        problems.push(`unexpected file in the package: ${path}`);
    }
}
for (const target of [pkg.types, ...Object.values(pkg.exports).flatMap(targets)]) {
    const path = target.replace(/^\.\//, "");
    if (!files.has(path)) {
        problems.push(`exports/types target missing from the package: ${target}`);
    }
}
if (problems.length > 0) {
    console.error(`[verify-pack] ${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
}
console.log(`[verify-pack] OK: ${files.size} files, every export present, no tests/templates/scripts`);
