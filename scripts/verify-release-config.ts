/**
 * Release Please contract for this repo, checked in CI (the "Release config" job).
 *
 * Adapted from Core's verify-release-please-config.mjs and the Release Please half of its
 * verify-release-state.mjs. Core's proprietary-policy checks (UNLICENSED, private, no LICENSE,
 * no publish) do not apply: this package is MIT and meant to go public.
 *
 * Asserts:
 *   - release-type "node", include-component-in-tag false, and no `package-name` / `component`
 *     key. With include-component-in-tag false, a component makes Release Please refuse to tag
 *     an already-merged release PR ("PR component: undefined does not match configured
 *     component"), leaving the manifest advanced with no tag behind it, the stuck state Core guards against too.
 *   - skip-github-release false. Core sets it true because its own stable job creates the tag
 *     and the Release. This repo has no such job, so Release Please must tag. With true and
 *     nothing else tagging, the merged release PR keeps "autorelease: pending" and Release
 *     Please refuses to open the next one.
 *   - no `draft` / `force-tag-creation` anywhere.
 *   - package.json version and the manifest are strict X.Y.Z. They are equal, except before
 *     the first release, when the manifest is "0.0.0" (nothing released yet) and the first
 *     release PR takes it to package.json's version.
 *
 * Usage: node scripts/verify-release-config.ts [--root DIR]
 * Exit codes: 0 compliant, 1 violation, 2 usage or I/O error.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STRICT_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const UNRELEASED = "0.0.0";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function usage(message: string): never {
    process.stderr.write(`verify-release-config: ${message}\nusage: node scripts/verify-release-config.ts [--root DIR]\n`);
    process.exit(2);
}

function readJson(path: string): Json {
    try {
        return JSON.parse(readFileSync(path, "utf8")) as Json;
    } catch (error) {
        return usage(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function isObject(value: Json | undefined): value is { [key: string]: Json } {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function enabledAnywhere(node: Json | undefined, key: string): boolean {
    if (Array.isArray(node)) {
        return node.some((child) => enabledAnywhere(child, key));
    }
    if (!isObject(node)) {
        return false;
    }
    return node[key] === true || Object.values(node).some((child) => enabledAnywhere(child, key));
}

function compareSemver(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0) {
            return d;
        }
    }
    return 0;
}

export function verifyReleaseConfig(root: string): string[] {
    const failures: string[] = [];
    const config = readJson(join(root, "release-please-config.json"));
    const manifest = readJson(join(root, ".release-please-manifest.json"));
    const pkg = readJson(join(root, "package.json"));
    if (!isObject(config) || !isObject(manifest) || !isObject(pkg)) {
        return ["release-please-config.json, .release-please-manifest.json and package.json must be JSON objects"];
    }
    const packages = config.packages;
    if (!isObject(packages) || !isObject(packages["."])) {
        return ['release-please-config.json must configure the "." package'];
    }
    const root_ = packages["."];
    const setting = (key: string): Json | undefined => root_[key] ?? config[key];
    const expect = (key: string, wanted: Json, why: string): void => {
        if (setting(key) !== wanted) {
            failures.push(`${key} resolves to ${JSON.stringify(setting(key) ?? null)}; must be ${JSON.stringify(wanted)} (${why})`);
        }
    };
    expect("release-type", "node", "this is an npm package");
    expect("include-component-in-tag", false, "tags are plain vX.Y.Z");
    expect("skip-github-release", false, "no other job creates the tag and Release here");
    for (const key of ["package-name", "component"]) {
        if (config[key] !== undefined || root_[key] !== undefined) {
            failures.push(
                `${key} is set while include-component-in-tag is false: Release Please would refuse to tag the merged ` +
                    "release PR and leave the manifest advanced with no tag, the stuck state Core guards against too"
            );
        }
    }
    for (const key of ["draft", "force-tag-creation"]) {
        if (enabledAnywhere(config, key)) {
            failures.push(`${key} must not be enabled`);
        }
    }
    const version = pkg.version;
    const released = manifest["."];
    if (typeof version !== "string" || !STRICT_SEMVER.test(version)) {
        failures.push(`package.json version must be a strict X.Y.Z, found ${JSON.stringify(version ?? null)}`);
    }
    if (typeof released !== "string" || !STRICT_SEMVER.test(released)) {
        failures.push(`.release-please-manifest.json "." must be a strict X.Y.Z, found ${JSON.stringify(released ?? null)}`);
    }
    if (typeof version === "string" && typeof released === "string" && STRICT_SEMVER.test(version) && STRICT_SEMVER.test(released)) {
        if (released === UNRELEASED) {
            if (compareSemver(version, UNRELEASED) <= 0) {
                failures.push(`before the first release package.json version must be above ${UNRELEASED}, found ${version}`);
            }
        } else if (released !== version) {
            failures.push(`.release-please-manifest.json "." is ${released} but package.json version is ${version}; they move together`);
        }
    }
    return failures;
}

function main(): void {
    const args = process.argv.slice(2);
    let root = process.cwd();
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--root" && args[i + 1] !== undefined) {
            root = args[++i] as string;
        } else {
            usage(`unknown argument: ${String(args[i])}`);
        }
    }
    const failures = verifyReleaseConfig(resolve(root));
    if (failures.length > 0) {
        process.stderr.write(`release config is non-compliant (${failures.length} problem(s)):\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
        process.exit(1);
    }
    process.stdout.write("release config OK: node, plain vX.Y.Z tags, Release Please tags and releases, versions consistent\n");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
