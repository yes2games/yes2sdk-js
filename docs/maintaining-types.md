# Maintaining the types (Yes2Games maintainers)

`types/yes2sdk.d.ts` is generated from the private Core SDK source and **committed**. Public
CI and external contributors cannot access Core, so they never regenerate it.

```sh
# Core checked out next to this repo as ../Core (the default), or point at it:
YES2SDK_CORE_DIR=/path/to/core npm run generate:types
# Read a git ref of Core instead of its working tree (Core's checkout is not touched):
YES2SDK_CORE_REF=origin/main npm run generate:types
YES2SDK_CORE_REF=origin/main npm run check:types   # fails if the committed file is stale
npm run typecheck     # the mock must still satisfy the new interface
```

The file header records the Core version it was generated from. The mock's `version`
string is derived from that header.

## How the generator works (`scripts/generate-types.ts`)

It uses the TypeScript compiler API directly on Core's `src/` instead of a declaration
bundler, for one reason: Core's facade is a class (`CoreAPI`) whose module getters return
classes extending an internal base class. Off-the-shelf bundlers (dts-bundle-generator,
api-extractor) emit those classes as they are, pulling the internal plumbing into the
public file. The generator instead:

1. Builds a program from `Core/src/index.ts` and refuses to continue if Core does not
   type-check.
2. Converts `CoreAPI` into `interface Yes2SDK`, and every reachable class into an
   interface, keeping only public members that are not `@internal` and whose names do not
   start with `_`. Inherited public members are included.
3. Walks every type reference from those signatures and copies only the reachable Core
   interfaces and type aliases. Aliases built on runtime constants (for example
   `typeof ErrorCode[...]`) are expanded into literal unions, because those constants do
   not exist on `window.Yes2SDK`.
4. Adds a few roots that no signature references (`ErrorMessage`, `ErrorCodeType`,
   `AdsConfig`), plus hand-written `Yes2SDKError`, `Yes2SDKInjectedConfig` and the
   `window.Yes2SDK` / `Yes2SDK` globals.
5. Normalises doc comments and rewrites the parts that describe internals (see
   `DOC_REWRITES`).
6. Scans the output for leak patterns (URLs, internal class names, engine-bridge notes)
   and **fails** on any match. When Core's comments change, the failure tells you which
   rewrite rule to add.

Anything it cannot classify (a public signature referencing a function, enum or variable)
is a hard error, not a silent leak.
