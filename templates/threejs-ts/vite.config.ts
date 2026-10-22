import { defineConfig } from "vite";

// base "./" keeps every asset URL relative. Platforms serve games from a
// sub-path, so root-absolute URLs ("/assets/x.js") 404 and fail the dashboard's
// relative-path check.
export default defineConfig({
    base: "./",
    build: {
        outDir: "dist",
        emptyOutDir: true,
        // Keep assets as files next to index.html so dist/ is zip-ready as-is.
        assetsInlineLimit: 0,
        // three alone is ~700 kB minified.
        chunkSizeWarningLimit: 1500,
    },
});
