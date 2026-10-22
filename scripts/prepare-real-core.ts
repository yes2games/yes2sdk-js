/**
 * Prepare the real-Core E2E builds (maintainers only: needs the private Core and Dashboard
 * sources). For every template it takes the production artifact, runs the Dashboard's own
 * injector over a copy with platform "debug", and writes the result to e2e/.real-core/<t>/,
 * which is what `npm run test:e2e:core` serves. Nothing here is committed (.gitignore).
 *
 * Core, one of:
 *   YES2SDK_CORE_DIST=<dir>   an existing Core build (yes2sdk.umd.js + yes2sdk-*.js chunks)
 *   YES2SDK_CORE_REF=<ref>    build that ref of the Core repo (default: HEAD). It is checked
 *                             out with `git worktree add` into a temp dir, built there with
 *                             `npm ci && npm run build`, and the worktree is removed again,
 *                             so Core's own working tree is never touched.
 *   YES2SDK_CORE_DIR=<dir>    the Core repo (default: ../Core next to this repo).
 * Dashboard:
 *   YES2SDK_DASHBOARD_DIR=<dir>  default ../Dashboard. Only read: its injector
 *                             (api/src/utils/sdk-injector.ts) is bundled with esbuild into
 *                             a temp file and called as-is.
 *
 * Why "debug": it is the platform Core loads for local hosts and the QA Inspector, and the only
 * one that runs without a third-party SDK. The dashboard writes it into
 * window.__yes2sdkConfig.platform, which Core's platform detection reads before any host rule.
 *
 * Run `npm run build` first: the template builds are the input.
 */

import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
    hashDir,
    isUploadPath,
    REAL_CORE_DIR,
    REAL_CORE_MANIFEST,
    templateArtifact,
    type RealCoreManifest,
} from "../e2e/real-core-manifest.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = ["vanilla-js", "vanilla-ts", "phaser-ts", "threejs-ts"] as const;
const PLATFORM = "debug";

const env = (name: string): string | undefined => {
    const value = process.env[name];
    return value === undefined || value === "" ? undefined : value;
};

const CORE_DIR = resolve(env("YES2SDK_CORE_DIR") ?? join(ROOT, "..", "Core"));
const DASHBOARD_DIR = resolve(env("YES2SDK_DASHBOARD_DIR") ?? join(ROOT, "..", "Dashboard"));

function log(message: string): void {
    console.log(`[prepare-real-core] ${message}`);
}

function git(dir: string, ...args: string[]): string {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

interface CoreBuild {
    dist: string;
    version: string;
    commit: string | null;
    source: string;
}

/** Copy only what the injector reads: the UMD, its chunks, and VERSION.txt. */
function copyCoreRuntime(from: string, to: string, version: string): void {
    mkdirSync(to, { recursive: true });
    const files = readdirSync(from).filter((name) => /^yes2sdk[.-].*\.js$/.test(name));
    if (!files.includes("yes2sdk.umd.js") || !files.some((name) => name.startsWith(`yes2sdk-${PLATFORM}.`))) {
        throw new Error(`${from} has no yes2sdk.umd.js or yes2sdk-${PLATFORM}.*.js; is it a Core build?`);
    }
    for (const name of files) {
        cpSync(join(from, name), join(to, name));
    }
    writeFileSync(join(to, "VERSION.txt"), `${version}\n`);
}

function readVersion(dir: string): string {
    const versionFile = join(dir, "VERSION.txt");
    if (existsSync(versionFile)) {
        return readFileSync(versionFile, "utf8").trim();
    }
    const pkg = join(dir, "..", "package.json");
    if (existsSync(pkg)) {
        return (JSON.parse(readFileSync(pkg, "utf8")) as { version: string }).version;
    }
    throw new Error(`cannot tell the Core version of ${dir}: no VERSION.txt and no ../package.json`);
}

function coreFromDist(dist: string, into: string): CoreBuild {
    const version = readVersion(dist);
    const commitFile = join(dist, "COMMIT.txt");
    const commit = existsSync(commitFile) ? readFileSync(commitFile, "utf8").trim() : null;
    copyCoreRuntime(dist, into, version);
    return { dist: into, version, commit, source: `YES2SDK_CORE_DIST=${dist}` };
}

function coreFromRef(ref: string, into: string): CoreBuild {
    if (!existsSync(join(CORE_DIR, ".git"))) {
        throw new Error(`no Core repo at ${CORE_DIR}; set YES2SDK_CORE_DIR (or YES2SDK_CORE_DIST)`);
    }
    const commit = git(CORE_DIR, "rev-parse", "--verify", `${ref}^{commit}`);
    const work = mkdtempSync(join(tmpdir(), "yes2sdk-core-build-"));
    rmSync(work, { recursive: true, force: true }); // git worktree add wants to create it
    log(`building Core ${ref} (${commit.slice(0, 12)}) in a temporary worktree ${work}`);
    git(CORE_DIR, "worktree", "add", "--detach", work, commit);
    try {
        const npm = process.platform === "win32" ? "npm.cmd" : "npm";
        execFileSync(npm, ["ci", "--no-audit", "--no-fund"], { cwd: work, stdio: ["ignore", "ignore", "inherit"] });
        execFileSync(npm, ["run", "build"], { cwd: work, stdio: ["ignore", "ignore", "inherit"] });
        const version = (JSON.parse(readFileSync(join(work, "package.json"), "utf8")) as { version: string }).version;
        copyCoreRuntime(join(work, "dist"), into, version);
        return { dist: into, version, commit, source: `YES2SDK_CORE_REF=${ref}` };
    } finally {
        git(CORE_DIR, "worktree", "remove", "--force", work);
        log("temporary Core worktree removed");
    }
}

type InjectSDK = (
    buildDir: string,
    platform: string,
    gameConfig: { gameId: string; version?: string },
    sdkDistPath: string
) => Promise<{ success: boolean; filesInjected: string[]; error?: string }>;

async function loadInjector(into: string): Promise<InjectSDK> {
    const entry = join(DASHBOARD_DIR, "api", "src", "utils", "sdk-injector.ts");
    if (!existsSync(entry)) {
        throw new Error(`no Dashboard injector at ${entry}; set YES2SDK_DASHBOARD_DIR`);
    }
    const outfile = join(into, "sdk-injector.mjs");
    await build({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "warning" });
    const module = (await import(pathToFileURL(outfile).href)) as { injectSDK?: InjectSDK };
    if (typeof module.injectSDK !== "function") {
        throw new Error(`${entry} no longer exports injectSDK`);
    }
    return module.injectSDK;
}

/** The files a developer would zip: a Vite template's dist/, or the vanilla-js folder minus tooling. */
function copyArtifact(template: string, to: string): void {
    const from = templateArtifact(ROOT, template);
    if (!existsSync(join(from, "index.html"))) {
        throw new Error(`${from}/index.html is missing; run npm run build first`);
    }
    cpSync(from, to, { recursive: true, filter: (path) => isUploadPath(from, path) });
}

async function main(): Promise<void> {
    rmSync(REAL_CORE_DIR, { recursive: true, force: true });
    const work = join(REAL_CORE_DIR, "_work");
    mkdirSync(work, { recursive: true });
    const sdkDist = join(work, "sdk-dist");
    const distEnv = env("YES2SDK_CORE_DIST");
    const ref = env("YES2SDK_CORE_REF") ?? "HEAD";
    const core = distEnv !== undefined ? coreFromDist(resolve(distEnv), sdkDist) : coreFromRef(ref, sdkDist);
    log(`Core ${core.version} from ${core.source}`);

    const injectSDK = await loadInjector(work);
    let dashboardCommit: string | null = null;
    try {
        dashboardCommit = git(DASHBOARD_DIR, "rev-parse", "HEAD");
    } catch {
        dashboardCommit = null;
    }

    const templates: Record<string, string> = {};
    for (const template of TEMPLATES) {
        const out = join(REAL_CORE_DIR, template);
        copyArtifact(template, out);
        const result = await injectSDK(out, PLATFORM, { gameId: `e2e-${template}` }, sdkDist);
        if (!result.success) {
            throw new Error(`injectSDK failed for ${template}: ${result.error ?? "unknown error"}`);
        }
        templates[template] = hashDir(templateArtifact(ROOT, template));
        log(`${template}: injected ${result.filesInjected.join(", ")}`);
    }

    const manifest: RealCoreManifest = {
        coreVersion: core.version,
        coreCommit: core.commit,
        coreSource: core.source,
        dashboardCommit,
        platform: PLATFORM,
        templates,
    };
    writeFileSync(REAL_CORE_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    rmSync(work, { recursive: true, force: true });
    log(`wrote ${REAL_CORE_MANIFEST}; run npm run test:e2e:core`);
}

main().catch((error: unknown) => {
    console.error(`[prepare-real-core] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
