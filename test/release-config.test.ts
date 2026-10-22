// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyReleaseConfig } from "../scripts/verify-release-config";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function fixture(config: object, manifest: string, version: string): string {
    const dir = mkdtempSync(join(tmpdir(), "yes2sdk-js-release-"));
    dirs.push(dir);
    writeFileSync(join(dir, "release-please-config.json"), JSON.stringify(config));
    writeFileSync(join(dir, ".release-please-manifest.json"), JSON.stringify({ ".": manifest }));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version }));
    return dir;
}

const good = {
    "include-component-in-tag": false,
    "skip-github-release": false,
    packages: { ".": { "release-type": "node", "changelog-path": "CHANGELOG.md" } },
};

describe("verify-release-config", () => {
    it("accepts the committed shape, before and after the first release", () => {
        expect(verifyReleaseConfig(fixture(good, "0.0.0", "0.1.0"))).toEqual([]);
        expect(verifyReleaseConfig(fixture(good, "0.2.0", "0.2.0"))).toEqual([]);
    });

    it("rejects the stuck state: a component key with componentless tags", () => {
        const bad = { ...good, packages: { ".": { ...good.packages["."], "package-name": "@yes2sdk/js" } } };
        expect(verifyReleaseConfig(fixture(bad, "0.0.0", "0.1.0")).join("\n")).toMatch(/package-name is set/);
    });

    it("rejects skip-github-release true (nothing else tags here), draft, and drifting versions", () => {
        expect(verifyReleaseConfig(fixture({ ...good, "skip-github-release": true }, "0.0.0", "0.1.0")).join("\n")).toMatch(
            /skip-github-release/
        );
        expect(verifyReleaseConfig(fixture({ ...good, draft: true }, "0.0.0", "0.1.0")).join("\n")).toMatch(/draft/);
        expect(verifyReleaseConfig(fixture(good, "0.1.0", "0.2.0")).join("\n")).toMatch(/move together/);
        expect(verifyReleaseConfig(fixture(good, "0.1.0", "0.2.0-beta.1")).join("\n")).toMatch(/strict X\.Y\.Z/);
    });
});
