/**
 * Build what the package ships:
 *   dist/index.js, dist/phaser.js, dist/three.js  runtime layer (ESM, one shared ad latch)
 *   dist/yes2-runtime.js                          same, as a classic <script> (window.Yes2Runtime)
 *   dist/*.d.ts                                   its declarations
 *   mock/dist/yes2sdk-mock.js                     mock as a self-installing classic <script>
 *   mock/dist/index.js + *.d.ts                   mock as an ES module
 * and copy the mock and runtime scripts into templates/vanilla-js/ (git-ignored there).
 */

import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addDeclarationExtensions } from "./declaration-extensions.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSC = join(ROOT, "node_modules", "typescript", "bin", "tsc");

/** The Core version the committed types were generated from. */
function coreVersion(): string {
    const header = readFileSync(join(ROOT, "types", "yes2sdk.d.ts"), "utf8").slice(0, 400);
    return /Core v(\S+?) by/.exec(header)?.[1] ?? "0.0.0";
}

function tsc(project: string): void {
    execFileSync(process.execPath, [TSC, "-p", join(ROOT, project)], { stdio: "inherit" });
}

function fixDeclarations(dir: string): void {
    for (const name of readdirSync(dir)) {
        if (name.endsWith(".d.ts")) {
            const file = join(dir, name);
            writeFileSync(file, addDeclarationExtensions(readFileSync(file, "utf8")));
        }
    }
}

async function buildRuntime(): Promise<void> {
    const out = join(ROOT, "dist");
    rmSync(out, { recursive: true, force: true });
    await build({
        entryPoints: ["index", "phaser", "three"].map((name) => join(ROOT, "src", `${name}.ts`)),
        outdir: out,
        bundle: true,
        splitting: true, // one shared chunk, so every entry uses the same ad latch
        format: "esm",
        target: "es2020",
        chunkNames: "chunks/[name]-[hash]",
        banner: { js: "/* @yes2sdk/js runtime. MIT License. Does not contain the Yes2SDK. */" },
        logLevel: "warning",
    });
    await build({
        entryPoints: [join(ROOT, "src", "global.ts")],
        outfile: join(out, "yes2-runtime.js"),
        bundle: true,
        format: "iife",
        target: "es2017",
        banner: { js: "/* @yes2sdk/js runtime (window.Yes2Runtime). MIT License. Does not contain the Yes2SDK. */" },
        logLevel: "warning",
    });
    tsc("tsconfig.runtime.json");
    fixDeclarations(out);
}

async function buildMock(): Promise<void> {
    const out = join(ROOT, "mock", "dist");
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const version = `${coreVersion()}-mock`;
    const shared = {
        bundle: true,
        define: { __YES2SDK_MOCK_VERSION__: JSON.stringify(version) },
        banner: { js: `/* @yes2sdk/js mock ${version}: local development only. MIT License. */` },
        logLevel: "warning" as const,
    };
    await build({ ...shared, entryPoints: [join(ROOT, "mock", "src", "iife.ts")], outfile: join(out, "yes2sdk-mock.js"), format: "iife", target: "es2017" });
    await build({ ...shared, entryPoints: [join(ROOT, "mock", "src", "index.ts")], outfile: join(out, "index.js"), format: "esm", target: "es2020" });
    tsc("mock/tsconfig.build.json");
    fixDeclarations(out);
    const vanilla = join(ROOT, "templates", "vanilla-js");
    if (existsSync(vanilla)) {
        copyFileSync(join(out, "yes2sdk-mock.js"), join(vanilla, "yes2sdk-mock.js"));
        copyFileSync(join(ROOT, "dist", "yes2-runtime.js"), join(vanilla, "yes2-runtime.js"));
    }
    console.log(`[build] runtime -> dist, mock ${version} -> mock/dist`);
}

async function main(): Promise<void> {
    await buildRuntime();
    await buildMock();
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error: unknown) => {
        console.error(error);
        process.exit(1);
    });
}
