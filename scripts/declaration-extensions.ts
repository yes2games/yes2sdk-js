/** Post-processing for the declarations scripts/build.ts emits. */

/**
 * Give every relative specifier in the emitted declarations a `.js` extension. tsc keeps them
 * as written (`./ads`), which bundler resolution accepts but `moduleResolution: node16/nodenext`
 * rejects (TS2834), so consumers on those settings could not type-check against the package.
 * `./ads.js` resolves to `./ads.d.ts` under every resolution mode.
 */
export function addDeclarationExtensions(source: string): string {
    return source.replace(
        /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"']+?)\2/g,
        (match: string, lead: string, quote: string, specifier: string): string =>
            /\.(?:js|mjs|cjs|json)$/.test(specifier) ? match : `${lead}${quote}${specifier}.js${quote}`
    );
}
