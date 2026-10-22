/**
 * Generate `types/yes2sdk.d.ts` — the PUBLIC type surface of `window.Yes2SDK` —
 * from the private Core SDK source.
 *
 * Usage:
 *   node scripts/generate-types.ts           # write types/yes2sdk.d.ts
 *   node scripts/generate-types.ts --check   # exit 1 if the committed file is stale
 *
 * Core location: `../Core` relative to this repo, override with YES2SDK_CORE_DIR.
 * To read a git ref of Core instead of its working tree (e.g. when the local
 * checkout is behind), set YES2SDK_CORE_REF=origin/main: the ref's `src/` and
 * `package.json` are extracted to a temp dir with `git archive`; Core's working
 * tree is not touched.
 *
 * Why a custom generator instead of dts-bundle-generator / api-extractor:
 * those tools bundle declarations as they are, so `CoreAPI` would come out as a
 * class whose module getters return classes extending `BaseAPI<TStrategy>`,
 * dragging `Logger`, every `*Strategy` interface and the protected plumbing into
 * a public file. Here we walk the type graph from `CoreAPI` ourselves:
 *   - classes become interfaces holding only public, non-`_`, non-`@internal`
 *     members (inherited ones included), so no private/protected detail leaks;
 *   - only declarations actually reachable from that surface are copied;
 *   - type aliases built on runtime values (`typeof ErrorCode[...]`) are
 *     expanded to literal unions, because those values do not exist on
 *     `window.Yes2SDK` (the UMD exposes the default export only);
 *   - anything we cannot classify fails the run instead of leaking silently.
 * The output is then scanned for leak patterns (URLs, internal names).
 */

import ts from "typescript";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_CHECKOUT = resolve(process.env.YES2SDK_CORE_DIR ?? join(REPO_ROOT, "..", "Core"));
const CORE_REF = process.env.YES2SDK_CORE_REF;

/** Extract `ref` of the Core repo into a temp dir (src + package.json, node_modules linked). */
function extractCoreRef(ref: string): string {
    const dir = mkdtempSync(join(tmpdir(), "yes2sdk-core-"));
    process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
    const tarFile = join(dir, "core.tar");
    execFileSync("git", ["-C", CORE_CHECKOUT, "archive", "--format=tar", "-o", tarFile, ref, "src", "package.json"]);
    execFileSync("tar", ["-x", "-f", tarFile, "-C", dir]);
    if (existsSync(join(CORE_CHECKOUT, "node_modules"))) {
        symlinkSync(join(CORE_CHECKOUT, "node_modules"), join(dir, "node_modules"));
    }
    return dir;
}

const CORE_DIR = CORE_REF !== undefined && CORE_REF !== "" ? extractCoreRef(CORE_REF) : CORE_CHECKOUT;
const CORE_SRC = join(CORE_DIR, "src");
const OUT_FILE = join(REPO_ROOT, "types", "yes2sdk.d.ts");
const CHECK_ONLY = process.argv.includes("--check");

/** Name of the Core facade class and the public interface it becomes. */
const ROOT_CLASS = "CoreAPI";
const ROOT_INTERFACE = "Yes2SDK";

/**
 * Types games need even though no CoreAPI signature names them: errors are
 * thrown as plain `ErrorMessage` objects, so callers need the shape to catch.
 */
const EXTRA_ROOTS: readonly string[] = ["ErrorMessage", "ErrorCodeType", "AdsConfig"];

/** Patterns that must never appear in the public file. */
const LEAK_PATTERNS: readonly RegExp[] = [
    /https?:\/\//i,
    /\bDIContainer\b/,
    /\bServiceKey\b/,
    /\bBaseAPI\b/,
    /\bLogger\b/,
    /\b\w+Strategy\b/,
    /@yes2sdk\/core/,
    /jslib/i,
    /\bUnity\b/,
    /DllImport/,
    /\bC#/,
    /GameplaySession/,
    /strateg(y|ies)/i,
    /MAX_GAME_CONTEXT_LENGTH/,
];

/**
 * Public fields whose NAME matches a leak pattern but are part of a platform
 * contract (e.g. the update payload's delivery `strategy`). Removed before the
 * leak scan only; they stay in the output.
 */
const LEAK_ALLOWLIST: readonly RegExp[] = [/^\s*strategy\?: "IMMEDIATE" \| "LAST" \| "IMMEDIATE_CLEAR";$/m];

/**
 * Rewrites applied to every doc paragraph (lines joined with single spaces).
 * Core's comments are written for SDK maintainers; these turn the parts that
 * describe internals (strategies, engine bridges, private constants) into
 * statements about observable behaviour. If Core's wording changes, the leak
 * scan fails the run and points at the paragraph to add a rule for.
 */
const DOC_REWRITES: ReadonlyArray<readonly [RegExp, string]> = [
    [/^Check if the module has a strategy set\.$/, "Whether this module is connected to a platform implementation (true once `initializeAsync` has finished)."],
    [/^@returns True if a strategy is available\.$/, "@returns True once the module is ready."],
    [
        /^@remarks Unity jslib bridge method\. Returns true if the strategy reports ad blocking, or false if no strategy is available \(assumes no blocking\)\.$/,
        "@remarks Returns false before initialization or when the platform cannot tell (assumes no blocking).",
    ],
    [/^@remarks Unity jslib bridge compatibility — accepts JSON string from C# DllImport\.$/, "@remarks Accepts a JSON string for engine wrappers that cannot pass objects."],
    [/^@remarks Unity jslib bridge alias\. /, "@remarks Engine-wrapper compatibility alias. "],
    [/ — matches Unity jslib bridge naming\./, " (engine-wrapper compatibility alias)."],
    [
        /^@remarks Delegates to the shared GameplaySession so the platform gameplay signal fires through the single idempotent guard\..*$/,
        "@remarks Idempotent: repeated calls are ignored. `analytics.logLevelStart()` shares the same gameplay state, so calling both never signals the platform twice.",
    ],
    [
        /^@remarks Delegates to the shared GameplaySession \(single idempotent guard\)\..*$/,
        "@remarks Idempotent: repeated calls are ignored. `analytics.logLevelEnd()` shares the same gameplay state.",
    ],
    [/\(or `noFill` when the strategy failed\)/g, "(or `noFill` when the ad request failed)"],
    [/\bthe platform strategy\b/g, "the platform"],
    [/\bplatform strategy\b/g, "platform"],
    [/If no strategy is set yet, returns true/g, "Before initialization it returns true"],
    [/, or a strategy that does not implement flushing\)/g, ", or a platform without batched writes)"],
    [/\{@link BannersStrategy\.getBannerStatusAsync\}/g, "{@link BannersAPI.getBannerStatusAsync}"],
    [/\{@link MAX_GAME_CONTEXT_LENGTH\} \((\d+)\)/g, "$1"],
    [/^@see ErrorCode$/, "@see ErrorCodeType"],
    [/^Strategy for notification\.$/, "How the platform should deliver the update."],
];

const DOC_WIDTH = 100;

/**
 * Split prose into unbreakable atoms: a `code span` or `{@link ...}` stays on
 * one line even when it contains spaces.
 */
function atoms(text: string): string[] {
    const result: string[] = [];
    let pending = "";
    for (const word of text.split(" ")) {
        pending = pending === "" ? word : `${pending} ${word}`;
        const openTicks = (pending.match(/`/g) ?? []).length % 2 === 1;
        const openLink = pending.lastIndexOf("{@") > pending.lastIndexOf("}");
        if (!openTicks && !openLink) {
            result.push(pending);
            pending = "";
        }
    }
    if (pending !== "") {
        result.push(pending);
    }
    return result;
}

/** Word-wrap one paragraph to DOC_WIDTH including the comment prefix. */
function wrap(text: string, prefix: string): string[] {
    const out: string[] = [];
    let line = "";
    for (const word of atoms(text)) {
        if (line !== "" && prefix.length + line.length + 1 + word.length > DOC_WIDTH) {
            out.push(prefix + line);
            line = word;
        } else {
            line = line === "" ? word : `${line} ${word}`;
        }
    }
    if (line !== "") {
        out.push(prefix + line);
    }
    return out;
}

/**
 * Normalise a JSDoc block: re-flow prose paragraphs, apply DOC_REWRITES to each,
 * keep fenced code verbatim. `indent` is the block's leading whitespace.
 */
function sanitizeDoc(block: string, indent: string): string {
    const inner = block
        .replace(/^\/\*\*/, "")
        .replace(/\*\/$/, "")
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*\* ?/, "").replace(/\s+$/, ""));
    const prefix = `${indent} * `;
    const out: string[] = [];
    let para: string[] = [];
    let inFence = false;
    const flush = (): void => {
        if (para.length === 0) {
            return;
        }
        // "localStorage-" + "backed" across a line break is one hyphenated word.
        let text = para
            .reduce((acc, l) => (acc === "" ? l : /[A-Za-z]-$/.test(acc) ? acc + l : `${acc} ${l}`), "")
            .replace(/\s+/g, " ")
            .trim();
        for (const [re, replacement] of DOC_REWRITES) {
            text = text.replace(re, replacement);
        }
        out.push(...wrap(text, prefix));
        para = [];
    };
    for (const raw of inner) {
        const line = raw.trim() === "" && !inFence ? "" : raw;
        if (line.trimStart().startsWith("```")) {
            flush();
            inFence = !inFence;
            out.push(prefix + line);
            continue;
        }
        if (inFence) {
            out.push(line === "" ? `${indent} *` : prefix + line);
            continue;
        }
        if (line === "") {
            flush();
            if (out.length > 0 && out[out.length - 1] !== `${indent} *`) {
                out.push(`${indent} *`);
            }
            continue;
        }
        if (/^\s*(@\w+|[-*] |\d+\. )/.test(line)) {
            flush();
        }
        para.push(line.trim());
    }
    flush();
    while (out.length > 0 && out[out.length - 1] === `${indent} *`) {
        out.pop();
    }
    return [`/**`, ...out, `${indent} */`].join("\n");
}

function sanitizeAllDocs(source: string): string {
    return source.replace(/^([ \t]*)\/\*\*[\s\S]*?\*\//gm, (block: string, indent: string) =>
        indent + sanitizeDoc(block.slice(indent.length), indent)
    );
}

/** Hand-written doc comment for the root interface (Core's mentions the private npm package). */
const ROOT_DOC = `/**
 * The Yes2SDK runtime, available as \`window.Yes2SDK\` (or bare \`Yes2SDK\`).
 *
 * @remarks
 * Games never bundle the real SDK. Write against this interface, use the
 * \`@yes2games/js\` mock during local development, and upload a plain build to the
 * Yes2Games Dashboard, which injects the real SDK for each target platform.
 *
 * @example
 * \`\`\`ts
 * await Yes2SDK.initializeAsync();
 * Yes2SDK.setLoadingProgress(100);
 * await Yes2SDK.startGameAsync();
 * await Yes2SDK.ads.showInterstitial("level-complete", {
 *     beforeAd: pauseGame,
 *     afterAd: resumeGame,
 * });
 * \`\`\`
 */`;

const HANDWRITTEN_TAIL = `
/**
 * Alias for the error shape the SDK rejects/throws with. SDK errors are plain
 * objects, not \`Error\` instances: check \`code\` rather than using \`instanceof\`.
 *
 * @example
 * \`\`\`ts
 * try {
 *     await Yes2SDK.leaderboard.setScoreAsync("main", 100);
 * } catch (e) {
 *     const err = e as Yes2SDKError;
 *     if (err.code === "FEATURE_NOT_SUPPORTED") { ... }
 * }
 * \`\`\`
 */
export type Yes2SDKError = ErrorMessage;

/**
 * Configuration the Yes2Games Dashboard injects as \`window.__yes2sdkConfig\`
 * when it bundles a build for a platform.
 *
 * @remarks
 * Read-only from the game's point of view: never set it yourself. Its presence
 * means the page is a dashboard-bundled build running the real SDK.
 */
export interface Yes2SDKInjectedConfig {
    /** Platform-side game identifier. */
    readonly gameId?: string;
    /** The studio's own build version (not the SDK version). */
    readonly version?: string;
    /** Platform this bundle was built for. */
    readonly platform?: string;
    /** Version of the injected SDK. Mirrors \`window.Yes2SDK.version\`. */
    readonly sdkVersion?: string;
    /** Whether verbose SDK logging is enabled. */
    readonly debug?: boolean;
    /** Designed orientation the bundle is letterboxed to. */
    readonly orientation?: "portrait" | "landscape" | "both";
    /** Auto-ads configuration. */
    readonly ads?: AdsConfig;
    /** Other dashboard-owned fields. Do not depend on them. */
    readonly [key: string]: unknown;
}

declare global {
    interface Window {
        /** The Yes2SDK runtime (injected by the dashboard, or the local mock). */
        Yes2SDK: ${ROOT_INTERFACE};
        /** Present only in dashboard-bundled builds. */
        __yes2sdkConfig?: Yes2SDKInjectedConfig;
    }

    /** The Yes2SDK runtime (injected by the dashboard, or the local mock). */
    const Yes2SDK: ${ROOT_INTERFACE};
}
`;

interface Emitted {
    readonly name: string;
    readonly text: string;
}

function fail(message: string): never {
    console.error(`[generate-types] ${message}`);
    process.exit(1);
}

function isInCoreSrc(node: ts.Node): boolean {
    const file = resolve(node.getSourceFile().fileName);
    return file.startsWith(CORE_SRC + sep);
}

function where(node: ts.Node): string {
    const sf = node.getSourceFile();
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    return `${relative(CORE_DIR, sf.fileName)}:${line + 1}`;
}

function readCoreVersion(): string {
    const pkgPath = join(CORE_DIR, "package.json");
    if (!existsSync(pkgPath)) {
        fail(`Core not found at ${CORE_DIR} (set YES2SDK_CORE_DIR)`);
    }
    const pkg: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (typeof pkg !== "object" || pkg === null || !("version" in pkg) || typeof pkg.version !== "string") {
        fail(`${pkgPath} has no version`);
    }
    return pkg.version;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
    return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);
}

function isInternal(node: ts.Node): boolean {
    return ts.getJSDocTags(node).some((tag) => tag.tagName.text === "internal");
}

/** Re-indented JSDoc block attached to `node`, or "" when none. */
function jsDocText(node: ts.Node, indent: string): string {
    const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
    const doc = docs[docs.length - 1];
    if (doc === undefined) {
        return "";
    }
    const lines = doc
        .getText()
        .split(/\r?\n/)
        .map((line, i) => {
            const trimmed = line.trim();
            if (i === 0) {
                return indent + trimmed;
            }
            return indent + " " + trimmed;
        });
    return lines.join("\n") + "\n";
}

/** Strip `export` / `export default` / `declare` from a copied declaration. */
function stripExport(text: string): string {
    return text.replace(/^export\s+(default\s+)?/, "").replace(/^declare\s+/, "");
}

class Generator {
    private readonly checker: ts.TypeChecker;
    private readonly emitted = new Map<string, Emitted>();
    private readonly owners = new Map<string, ts.Node>();
    private readonly queue: ts.Declaration[] = [];

    constructor(program: ts.Program) {
        this.checker = program.getTypeChecker();
    }

    run(root: ts.ClassDeclaration, extraRoots: ts.Declaration[]): string {
        this.claim(ROOT_INTERFACE, root);
        this.emitted.set(ROOT_INTERFACE, {
            name: ROOT_INTERFACE,
            text: ROOT_DOC + "\nexport " + this.classAsInterface(root, ROOT_INTERFACE) + "\n",
        });
        for (const decl of extraRoots) {
            this.enqueue(decl);
        }
        while (this.queue.length > 0) {
            const decl = this.queue.shift();
            if (decl !== undefined) {
                this.emitDeclaration(decl);
            }
        }
        return [...this.emitted.values()].map((e) => e.text).join("\n");
    }

    /** Record that `name` is produced by `node`; two different sources for one name is fatal. */
    private claim(name: string, node: ts.Node): boolean {
        const owner = this.owners.get(name);
        if (owner === undefined) {
            this.owners.set(name, node);
            return true;
        }
        if (owner === node) {
            return false;
        }
        fail(`name collision: "${name}" declared at ${where(owner)} and ${where(node)}`);
    }

    private enqueue(decl: ts.Declaration): void {
        const name = this.declName(decl);
        if (name === ROOT_CLASS) {
            fail(`${where(decl)} references ${ROOT_CLASS}; map it to ${ROOT_INTERFACE} in the generator`);
        }
        if (this.claim(name, decl)) {
            this.queue.push(decl);
        }
    }

    private declName(decl: ts.Declaration): string {
        const name = ts.getNameOfDeclaration(decl);
        if (name === undefined || !ts.isIdentifier(name)) {
            fail(`unnamed declaration at ${where(decl)}`);
        }
        return name.text;
    }

    private emitDeclaration(decl: ts.Declaration): void {
        const name = this.declName(decl);
        let text: string;
        if (ts.isClassDeclaration(decl)) {
            text = this.classAsInterface(decl, name);
        } else if (ts.isInterfaceDeclaration(decl)) {
            this.collectRefs(decl);
            text = stripExport(decl.getText());
        } else if (ts.isTypeAliasDeclaration(decl)) {
            text = this.typeAlias(decl);
        } else {
            fail(
                `${where(decl)}: "${name}" is a ${ts.SyntaxKind[decl.kind]}; only classes, interfaces ` +
                    `and type aliases can be part of the public surface`
            );
        }
        this.emitted.set(name, { name, text: jsDocText(decl, "") + "export " + text + "\n" });
    }

    private typeAlias(decl: ts.TypeAliasDeclaration): string {
        let usesValue = false;
        const visit = (n: ts.Node): void => {
            if (ts.isTypeQueryNode(n)) {
                usesValue = true;
            }
            ts.forEachChild(n, visit);
        };
        visit(decl.type);
        if (!usesValue) {
            this.collectRefs(decl);
            return stripExport(decl.getText());
        }
        // Built on a runtime value that games cannot reach: expand it.
        const type = this.checker.getTypeAtLocation(decl.name);
        const expanded = this.checker.typeToString(
            type,
            undefined,
            ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias
        );
        if (/\btypeof\b/.test(expanded)) {
            fail(`${where(decl)}: could not expand "${decl.name.text}" (${expanded})`);
        }
        const members = expanded.split(" | ");
        if (members.length > 1 && expanded.length > 80) {
            return `type ${decl.name.text} =\n${members.map((m) => `    | ${m}`).join("\n")};`;
        }
        return `type ${decl.name.text} = ${expanded};`;
    }

    /** All public members of `cls` and its base classes, as an interface body. */
    private classAsInterface(cls: ts.ClassDeclaration, name: string): string {
        const lines: string[] = [];
        const seen = new Set<string>();
        for (const c of this.classChain(cls)) {
            for (const member of c.members) {
                const text = this.memberText(member, c);
                if (text === null) {
                    continue;
                }
                const key = member.name !== undefined ? member.name.getText() : "";
                if (seen.has(key) && !ts.isMethodDeclaration(member)) {
                    continue;
                }
                // Overloads of one method all come from the same class; a base
                // implementation is shadowed by the derived one.
                if (seen.has(key) && c !== cls && ts.isMethodDeclaration(member)) {
                    continue;
                }
                seen.add(key);
                lines.push(text);
            }
        }
        const typeParams = cls.typeParameters ? `<${cls.typeParameters.map((t) => t.getText()).join(", ")}>` : "";
        return `interface ${name}${typeParams} {\n${lines.join("\n")}}`;
    }

    private classChain(cls: ts.ClassDeclaration): ts.ClassDeclaration[] {
        const chain: ts.ClassDeclaration[] = [cls];
        let current: ts.ClassDeclaration | undefined = cls;
        while (current !== undefined) {
            const ext: ts.HeritageClause | undefined = current.heritageClauses?.find(
                (h) => h.token === ts.SyntaxKind.ExtendsKeyword
            );
            const expr: ts.Expression | undefined = ext?.types[0]?.expression;
            if (expr === undefined) {
                break;
            }
            const decl: ts.ClassDeclaration | undefined = this.resolveDeclarations(expr).find(ts.isClassDeclaration);
            if (decl === undefined || !isInCoreSrc(decl)) {
                fail(`${where(current)}: base class ${expr.getText()} is not a Core class`);
            }
            chain.push(decl);
            current = decl;
        }
        return chain;
    }

    private memberText(member: ts.ClassElement, owner: ts.ClassDeclaration): string | null {
        if (
            ts.isConstructorDeclaration(member) ||
            ts.isClassStaticBlockDeclaration(member) ||
            ts.isSemicolonClassElement(member) ||
            ts.isIndexSignatureDeclaration(member)
        ) {
            return null;
        }
        if (
            hasModifier(member, ts.SyntaxKind.PrivateKeyword) ||
            hasModifier(member, ts.SyntaxKind.ProtectedKeyword) ||
            hasModifier(member, ts.SyntaxKind.StaticKeyword) ||
            member.name === undefined ||
            !ts.isIdentifier(member.name) ||
            member.name.text.startsWith("_") ||
            isInternal(member)
        ) {
            return null;
        }
        const name = member.name.text;
        const doc = jsDocText(member, "    ");
        if (ts.isGetAccessorDeclaration(member)) {
            const hasSetter = owner.members.some(
                (m) => ts.isSetAccessorDeclaration(m) && m.name.getText() === name && !hasModifier(m, ts.SyntaxKind.PrivateKeyword)
            );
            return `${doc}    ${hasSetter ? "" : "readonly "}${name}: ${this.typeText(member.type, member)};\n`;
        }
        if (ts.isSetAccessorDeclaration(member)) {
            return null; // folded into the getter
        }
        if (ts.isPropertyDeclaration(member)) {
            const ro = hasModifier(member, ts.SyntaxKind.ReadonlyKeyword) ? "readonly " : "";
            const opt = member.questionToken ? "?" : "";
            return `${doc}    ${ro}${name}${opt}: ${this.typeText(member.type, member)};\n`;
        }
        if (ts.isMethodDeclaration(member)) {
            // With overloads, only the bodiless signatures are public.
            const overloads = owner.members.filter(
                (m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && m.name.getText() === name
            );
            if (overloads.length > 1 && member.body !== undefined) {
                return null;
            }
            const tps = member.typeParameters
                ? `<${member.typeParameters
                      .map((t) => {
                          this.collectRefs(t);
                          return t.getText();
                      })
                      .join(", ")}>`
                : "";
            const params = member.parameters.map((p) => this.paramText(p)).join(", ");
            return `${doc}    ${name}${tps}(${params}): ${this.typeText(member.type, member)};\n`;
        }
        fail(`${where(member)}: unsupported class member kind ${ts.SyntaxKind[member.kind]}`);
    }

    private paramText(p: ts.ParameterDeclaration): string {
        const rest = p.dotDotDotToken ? "..." : "";
        const optional = p.questionToken !== undefined || p.initializer !== undefined ? "?" : "";
        return `${rest}${p.name.getText()}${optional}: ${this.typeText(p.type, p)}`;
    }

    /** Source text of an explicit type annotation (Core requires them), collecting its references. */
    private typeText(type: ts.TypeNode | undefined, owner: ts.Node): string {
        if (type === undefined) {
            fail(`${where(owner)}: missing explicit type annotation on a public member`);
        }
        this.collectRefs(type);
        return type.getText();
    }

    /** Enqueue every Core declaration referenced by type syntax inside `node`. */
    private collectRefs(node: ts.Node): void {
        const visit = (n: ts.Node): void => {
            let ident: ts.Node | undefined;
            if (ts.isTypeReferenceNode(n)) {
                ident = n.typeName;
            } else if (ts.isExpressionWithTypeArguments(n)) {
                ident = n.expression;
            } else if (ts.isTypeQueryNode(n)) {
                fail(`${where(n)}: "typeof ${n.exprName.getText()}" in public signature`);
            }
            while (ident !== undefined && ts.isQualifiedName(ident)) {
                ident = ident.left;
            }
            if (ident !== undefined) {
                for (const decl of this.resolveDeclarations(ident)) {
                    if (ts.isTypeParameterDeclaration(decl) || !isInCoreSrc(decl)) {
                        continue;
                    }
                    this.enqueue(decl);
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(node);
    }

    private resolveDeclarations(node: ts.Node): ts.Declaration[] {
        let symbol = this.checker.getSymbolAtLocation(node);
        if (symbol === undefined) {
            return [];
        }
        if (symbol.flags & ts.SymbolFlags.Alias) {
            symbol = this.checker.getAliasedSymbol(symbol);
        }
        return symbol.declarations ?? [];
    }
}

function main(): void {
    const coreVersion = readCoreVersion();
    const entry = join(CORE_SRC, "index.ts");
    const program = ts.createProgram([entry], {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        lib: ["lib.es2020.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
    });

    const coreErrors = ts
        .getPreEmitDiagnostics(program)
        .filter((d) => d.category === ts.DiagnosticCategory.Error && d.file !== undefined && isInCoreSrc(d.file));
    if (coreErrors.length > 0) {
        const host: ts.FormatDiagnosticsHost = {
            getCanonicalFileName: (f) => f,
            getCurrentDirectory: () => CORE_DIR,
            getNewLine: () => "\n",
        };
        fail(`Core does not type-check:\n${ts.formatDiagnostics(coreErrors.slice(0, 20), host)}`);
    }

    const checker = program.getTypeChecker();
    const entryFile = program.getSourceFile(entry);
    const moduleSymbol = entryFile ? checker.getSymbolAtLocation(entryFile) : undefined;
    if (moduleSymbol === undefined) {
        fail(`cannot read exports of ${entry}`);
    }
    const exportsByName = new Map<string, ts.Declaration[]>();
    for (const exp of checker.getExportsOfModule(moduleSymbol)) {
        const target = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
        exportsByName.set(exp.name, target.declarations ?? []);
    }

    const root = exportsByName.get(ROOT_CLASS)?.find(ts.isClassDeclaration);
    if (root === undefined) {
        fail(`${ROOT_CLASS} is not exported from Core's index.ts`);
    }
    const extras = EXTRA_ROOTS.map((name) => {
        const decl = exportsByName
            .get(name)
            ?.find((d) => ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d) || ts.isClassDeclaration(d));
        if (decl === undefined) {
            fail(`extra root "${name}" is not an exported type in Core`);
        }
        return decl;
    });

    const body = new Generator(program).run(root, extras);
    const header =
        `/**\n` +
        ` * Yes2SDK public type declarations.\n` +
        ` *\n` +
        ` * Generated from Yes2SDK Core v${coreVersion} by scripts/generate-types.ts.\n` +
        ` * DO NOT EDIT BY HAND: run \`npm run generate:types\` with Core available.\n` +
        ` */\n\n`;
    const output = header + sanitizeAllDocs(body + HANDWRITTEN_TAIL);

    const scanned = LEAK_ALLOWLIST.reduce((text, re) => text.replace(re, ""), output);
    const leaks = LEAK_PATTERNS.flatMap((re) => {
        const m = re.exec(scanned);
        if (m === null) {
            return [];
        }
        const line = scanned.slice(0, m.index).split("\n").length;
        return [`${re.source} -> "${m[0]}" (output line ~${line})`];
    });
    if (leaks.length > 0) {
        if (process.env.YES2SDK_TYPES_DEBUG_OUT !== undefined) {
            writeFileSync(process.env.YES2SDK_TYPES_DEBUG_OUT, output);
        }
        fail(`output contains implementation detail; tighten the generator:\n  ${leaks.join("\n  ")}`);
    }

    if (CHECK_ONLY) {
        const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : "";
        if (current !== output) {
            fail(`${relative(REPO_ROOT, OUT_FILE)} is out of date with Core v${coreVersion}; run npm run generate:types`);
        }
        console.log(`[generate-types] ${relative(REPO_ROOT, OUT_FILE)} is up to date (Core v${coreVersion})`);
        return;
    }
    writeFileSync(OUT_FILE, output);
    console.log(
        `[generate-types] wrote ${relative(REPO_ROOT, OUT_FILE)} from Core v${coreVersion} ` +
            `(${output.split("\n").length} lines)`
    );
}

main();
