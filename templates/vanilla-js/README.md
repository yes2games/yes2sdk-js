# Yes2SDK template: vanilla JavaScript (no build step)

`index.html` + `main.js` + `style.css`. There is nothing to compile.

- **Run locally:** `npm run dev` from this folder (Vite used as a static server), or serve the
  folder with any static server (`python3 -m http.server`).
- **Runtime:** `yes2-runtime.js` is the `@yes2games/js` runtime layer (`window.Yes2Runtime`): the
  ad latch and watchdog, pause/mute hooks and loading-progress de-duplication. It is part of
  your game and ships in your zip.
- **Mock:** `yes2sdk-mock.js` is the local-development mock.
- Both files are copied here by `npm install` / `npm run build:lib` at the repo root. If you
  copied this template elsewhere, take them from `dist/yes2-runtime.js` and
  `mock/dist/yes2sdk-mock.js` (or from the `@yes2games/js` npm package).
- **Types:** `// @ts-check` in `main.js` plus `jsconfig.json` give editor autocompletion and
  errors. `npm run typecheck` runs the same checks.
- **Upload:** zip the folder's contents (`index.html` at the top of the zip). The mock can
  stay: when the dashboard bundles your game it removes the `yes2sdk-mock.js` tag, deletes the
  file and injects the real SDK. Do not add SDK `<script>` tags yourself.
- **Canvas:** the `<canvas>` carries `data-yes2-canvas`: mark your game canvas so the
  dashboard captures the right one.
