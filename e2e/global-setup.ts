/**
 * Runs once before the suite: fail early, with the fix, when the builds the specs serve are
 * missing, and say plainly when the opt-in real-Core project is going to skip.
 */

import type { FullConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { readRealCoreManifest, templateArtifact } from "./real-core-manifest";
import { TEMPLATES } from "./support";

export default function globalSetup(config: FullConfig): void {
    const root = resolve(config.rootDir, "..");
    const projects = new Set(config.projects.map((project) => project.name));
    const missing = TEMPLATES.filter((template) => !existsSync(join(templateArtifact(root, template), "index.html")));
    if (!existsSync(join(root, "mock", "dist", "yes2sdk-mock.js")) || missing.length > 0) {
        throw new Error(`[e2e] missing builds (${missing.join(", ") || "mock/dist"}); run npm run build first.`);
    }
    if (projects.has("real-core")) {
        const status = readRealCoreManifest(TEMPLATES[0]);
        if (!status.ok) {
            console.log(`[e2e] real-core: skipped. ${status.reason}`);
        } else {
            console.log(
                `[e2e] real-core: Core ${status.manifest.coreVersion}` +
                    `${status.manifest.coreCommit === null ? "" : ` (${status.manifest.coreCommit.slice(0, 12)})`}, platform ${status.manifest.platform}`
            );
        }
    }
}
