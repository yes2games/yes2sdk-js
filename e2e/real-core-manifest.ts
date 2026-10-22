/**
 * What scripts/prepare-real-core.ts leaves behind in e2e/.real-core/, and how the real-Core
 * spec tells whether it is there and still matches the current template builds.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REAL_CORE_DIR = join(ROOT, "e2e", ".real-core");
export const REAL_CORE_MANIFEST = join(REAL_CORE_DIR, "manifest.json");

export interface RealCoreManifest {
    coreVersion: string;
    coreCommit: string | null;
    coreSource: string;
    dashboardCommit: string | null;
    platform: string;
    /** Template name -> hash of the artifact the injected copy was made from. */
    templates: Record<string, string>;
}

/** Files in a template folder that are tooling, not part of the upload. */
const TOOLING = new Set(["package.json", "README.md", "jsconfig.json", ".gitignore", "node_modules", "dist"]);

/** The production artifact of a template: dist/ for Vite templates, the folder for vanilla-js. */
export function templateArtifact(root: string, template: string): string {
    return template === "vanilla-js" ? join(root, "templates", template) : join(root, "templates", template, "dist");
}

/** Whether a path inside a template artifact belongs in the upload. */
export function isUploadPath(artifact: string, path: string): boolean {
    const first = relative(artifact, path).split(/[\\/]/)[0] ?? "";
    return first === "" || !TOOLING.has(first);
}

/** sha256 over the relative paths and contents of every upload file under `dir`. */
export function hashDir(dir: string): string {
    const hash = createHash("sha256");
    const walk = (current: string): void => {
        for (const name of readdirSync(current).sort()) {
            const full = join(current, name);
            if (!isUploadPath(dir, full)) {
                continue;
            }
            if (statSync(full).isDirectory()) {
                walk(full);
            } else {
                hash.update(relative(dir, full)).update("\0").update(readFileSync(full)).update("\0");
            }
        }
    };
    walk(dir);
    return hash.digest("hex");
}

export type ManifestStatus =
    | { ok: true; manifest: RealCoreManifest }
    | { ok: false; reason: string };

/** The manifest, or why the real-Core project cannot run. */
export function readRealCoreManifest(template: string): ManifestStatus {
    if (!existsSync(REAL_CORE_MANIFEST)) {
        return {
            ok: false,
            reason:
                "real-Core E2E is opt-in and was not prepared: it needs the private Core and Dashboard " +
                "sources. Run `YES2SDK_CORE_REF=origin/main npm run e2e:prepare-core` (or set " +
                "YES2SDK_CORE_DIST to a Core build), then `npm run test:e2e:core`. See docs/e2e.md.",
        };
    }
    const manifest = JSON.parse(readFileSync(REAL_CORE_MANIFEST, "utf8")) as RealCoreManifest;
    const expected = manifest.templates[template];
    if (expected === undefined) {
        return { ok: false, reason: `e2e/.real-core has no ${template}; re-run npm run e2e:prepare-core` };
    }
    return { ok: true, manifest };
}

/** Throws when the template was rebuilt after the injected copy was made. */
export function assertFresh(manifest: RealCoreManifest, template: string): void {
    const current = hashDir(templateArtifact(ROOT, template));
    if (manifest.templates[template] !== current) {
        throw new Error(
            `e2e/.real-core/${template} was injected from an older build of the template. ` +
                "Re-run npm run e2e:prepare-core after npm run build."
        );
    }
}
