/**
 * Sanity-check template builds before they are zipped and uploaded:
 *   - dist/index.html exists at the top level of the zip
 *   - index.html has no root-absolute asset URLs ("/assets/x.js"); platforms
 *     serve games from a sub-path, and the dashboard rejects them
 *   - the mock never reaches a production build
 *   - no copy of the real SDK is shipped (the dashboard injects it)
 *   - the game canvas is marked with data-yes2-canvas, so the dashboard captures it
 *
 * Usage: node scripts/verify-builds.ts [distDir ...]
 * Default: every templates/<name>/dist that exists.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MOCK_MARKERS = ["[Yes2SDK] Mock:", "installYes2SDKMock", "__yes2sdkMockOptions"];
const ROOT_ABSOLUTE = /\b(?:src|href)\s*=\s*["']\/(?!\/)[^"']*["']|url\(\s*["']?\/(?!\/)/gi;

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : [full];
    });
}

function defaultDists(): string[] {
    const templates = join(ROOT, "templates");
    return readdirSync(templates)
        .map((name) => join(templates, name, "dist"))
        .filter((dir) => existsSync(dir));
}

function verify(dist: string): string[] {
    const problems: string[] = [];
    const index = join(dist, "index.html");
    if (!existsSync(index)) {
        return [`${relative(ROOT, dist)}: no index.html at the top level`];
    }
    const html = readFileSync(index, "utf8");
    if (!/<canvas\b[^>]*\bdata-yes2-canvas\b/i.test(html)) {
        problems.push(`${relative(ROOT, index)}: no <canvas data-yes2-canvas> (mark the game canvas for the dashboard's capture)`);
    }
    for (const match of html.matchAll(ROOT_ABSOLUTE)) {
        problems.push(`${relative(ROOT, index)}: root-absolute URL ${match[0]}`);
    }
    for (const file of walk(dist)) {
        const name = basename(file);
        if (/^yes2sdk(\.umd|-[a-z]+\.)/.test(name) || name === "yes2sdk-data.js") {
            problems.push(`${relative(ROOT, file)}: SDK file in the build (the dashboard injects it)`);
        }
        if (/\.(js|html|mjs)$/.test(name)) {
            const text = readFileSync(file, "utf8");
            for (const marker of MOCK_MARKERS) {
                if (text.includes(marker)) {
                    problems.push(`${relative(ROOT, file)}: contains the mock ("${marker}")`);
                }
            }
        }
    }
    return problems;
}

const dists = process.argv.length > 2 ? process.argv.slice(2).map((d) => resolve(d)) : defaultDists();
if (dists.length === 0) {
    console.error("[verify-builds] no template dist/ folders found; run npm run build first");
    process.exit(1);
}
const problems = dists.flatMap(verify);
for (const dist of dists) {
    console.log(`[verify-builds] checked ${relative(ROOT, dist)}`);
}
if (problems.length > 0) {
    console.error(problems.map((p) => `  ${p}`).join("\n"));
    process.exit(1);
}
console.log("[verify-builds] OK: relative paths, no mock, no bundled SDK, marked canvas");
