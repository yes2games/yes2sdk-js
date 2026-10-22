/**
 * Static server for the E2E suite. No dependencies; Playwright starts it as a webServer.
 *
 *   /built/<template>/...  a template's production artifact, run against the mock:
 *                          - Vite templates: templates/<t>/dist, with the mock's classic
 *                            <script src="yes2sdk-mock.js"> added before the first <script>,
 *                            which is what a developer does to try a production build locally
 *                            (Vite builds leave the mock out);
 *                          - vanilla-js: the folder itself, which is its upload as-is.
 *   /real/<template>/...   e2e/.real-core/<template>: the build after the real Dashboard
 *                          injector ran over it (see scripts/prepare-real-core.ts).
 *
 * Usage: node e2e/server.ts [port]   (default 4173, bound to 127.0.0.1)
 */

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] ?? process.env.E2E_STATIC_PORT ?? 4173);
const MOCK_IIFE = join(ROOT, "mock", "dist", "yes2sdk-mock.js");
const VITE_TEMPLATES = new Set(["vanilla-ts", "phaser-ts", "threejs-ts"]);

const TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
};

interface Mount {
    dir: string;
    injectMock: boolean;
}

function mountFor(kind: string, template: string): Mount | null {
    if (!/^[a-z0-9-]+$/.test(template)) {
        return null;
    }
    if (kind === "built") {
        if (template === "vanilla-js") {
            return { dir: join(ROOT, "templates", template), injectMock: false };
        }
        return VITE_TEMPLATES.has(template) ? { dir: join(ROOT, "templates", template, "dist"), injectMock: true } : null;
    }
    if (kind === "real") {
        return { dir: join(ROOT, "e2e", ".real-core", template), injectMock: false };
    }
    return null;
}

/** Add the mock's classic script before the page's first <script>, as a developer would by hand. */
export function addMockTag(html: string): string {
    const tag = '<script src="yes2sdk-mock.js"></script>\n';
    const at = html.search(/<script[\s>]/i);
    return at === -1 ? html.replace(/<\/head>/i, `${tag}</head>`) : html.slice(0, at) + tag + html.slice(at);
}

function send(res: ServerResponse, status: number, body: string): void {
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end(body);
}

function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/favicon.ico") {
        res.writeHead(204).end();
        return;
    }
    const [, kind = "", template = "", ...rest] = url.pathname.split("/");
    const mount = mountFor(kind, template);
    if (mount === null || !existsSync(mount.dir)) {
        send(res, 404, `no mount for ${url.pathname}`);
        return;
    }
    if (rest.length === 0) {
        res.writeHead(301, { location: `/${kind}/${template}/` }).end();
        return;
    }
    const relativePath = decodeURIComponent(rest.join("/")) || "index.html";
    if (mount.injectMock && relativePath === "yes2sdk-mock.js") {
        res.writeHead(200, { "content-type": TYPES[".js"], "cache-control": "no-store" });
        createReadStream(MOCK_IIFE).pipe(res);
        return;
    }
    const file = normalize(join(mount.dir, relativePath));
    if (!file.startsWith(mount.dir + sep) || !existsSync(file) || !statSync(file).isFile()) {
        send(res, 404, `not found: ${url.pathname}`);
        return;
    }
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    if (mount.injectMock && relativePath === "index.html") {
        res.end(addMockTag(readFileSync(file, "utf8")));
        return;
    }
    createReadStream(file).pipe(res);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    createServer(handle).listen(PORT, "127.0.0.1", () => {
        console.log(`[e2e] static server on http://127.0.0.1:${PORT} (/built/<template>/, /real/<template>/)`);
    });
}
