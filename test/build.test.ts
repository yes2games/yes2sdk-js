// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addDeclarationExtensions } from "../scripts/declaration-extensions";

describe("addDeclarationExtensions (published .d.ts must work under node16/nodenext)", () => {
    it("adds .js to relative specifiers in from, import() and side-effect imports", () => {
        const input = [
            'export { ads, AdRuntime } from "./ads";',
            "export type * from '../types/yes2sdk';",
            'import type { X } from "./lifecycle";',
            'type T = import("./sdk").RuntimeLogger;',
            'import "./global";',
        ].join("\n");
        expect(addDeclarationExtensions(input)).toBe(
            [
                'export { ads, AdRuntime } from "./ads.js";',
                "export type * from '../types/yes2sdk.js';",
                'import type { X } from "./lifecycle.js";',
                'type T = import("./sdk.js").RuntimeLogger;',
                'import "./global.js";',
            ].join("\n")
        );
    });

    it("leaves package specifiers and existing extensions alone", () => {
        const input = 'import type { A } from "three";\nexport * from "./x.js";\nimport d from "./data.json";';
        expect(addDeclarationExtensions(input)).toBe(input);
    });
});
