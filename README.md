# LLM Multi-GPU Optimizer

A static browser calculator for comparing local LLM decode configurations: model storage, memory/compute limits, layer splitting, PCIe transfers and capacity-limited CPU offload.

**[Open calculator](https://bloedebleidd.github.io/LLM-calculator/)** · [Calculation methodology](docs/METHODOLOGY.md)

## What it does

- Dense and MoE models, with separate total and active parameter counts.
- Independent KV cache storage and effective read traffic per generated token.
- Up to four GPUs, each with its own VRAM reservation, bandwidth, compute and PCIe link.
- Explicit usable RAM capacity; zero disables CPU offload.
- Complete-layer placement and a clear “Does not fit” result when capacity is insufficient.
- Estimated tokens/second, per-token latency, processing/transfer breakdown and the fastest feasible single-GPU/CPU baseline.
- Six named, browser-local comparison snapshots that restore every input.
- Automatic saving of valid settings, validated JSON import/export, and configuration links that work without an account.
- Keyboard-accessible help, narrow-screen layouts and reduced-motion support.

An estimate is not a measured benchmark. The model assumes uniform contiguous layer blocks and single-session decode. It does not simulate tensor parallelism, prompt prefill, engine-specific device ordering, runtime overhead or shared-link contention. The [methodology](docs/METHODOLOGY.md) gives equations, units, optimizer assumptions and primary references.

## Use and share

Open `index.html` directly, or serve the repository as a static site. Keep `src/` alongside the HTML; there is no build step, runtime dependency, API key or external script.

All capacity and bandwidth inputs use **decimal GB**, with **1000 MB = 1 GB**. Set each GPU's VRAM to zero to disable that slot. Enter RAM available to CPU model layers after other host allocations. Include weight-format overhead in bytes per parameter and runtime allocations in the memory reservations.

“Save current” adds a named snapshot to the comparison table. “Load” restores its full configuration. “Reset defaults” resets current inputs and keeps comparisons. “Export JSON” saves the current inputs; “Import JSON” validates the complete versioned file before changing any setting. Imported configuration files are limited to 64 KiB.

“Share configuration” places the numeric settings in the URL fragment and copies a link when clipboard access is available. A selectable link is shown as a fallback. Editing the settings clears the old link; share again to capture the new configuration. Links and JSON exports contain configuration inputs, not saved scenario names. Browser storage is optional; estimation, import/export and sharing remain available when storage is blocked. No analytics or external service is used by the calculator.

## Develop and verify

Node.js 24 is recommended. Development dependencies are used only for tests:

```sh
npm ci --ignore-scripts
npm test
npx playwright install chromium
npm run test:browser
npm run dev
```

The local server binds to `127.0.0.1:8795`, including a `/LLM-calculator/` prefix to exercise GitHub Pages paths. The browser suite covers desktop/mobile, direct file opening, input validation, finite RAM capacity, configuration round trips, sharing, storage failures, comparisons and the guide. Unit tests check hand-calculated timing, units, capacity boundaries and the optimizer against independent exhaustive enumeration. GitHub Actions runs both suites.

`src/engine.js` contains the independently testable math and configuration schema; `src/app.js` contains the interface and browser state; `src/styles.css` contains presentation. GitHub Pages can serve the repository root directly. `.nojekyll` keeps static assets and Markdown available unchanged.

## Issues and contributions

Include the exported JSON configuration, browser/OS, inference engine if relevant, expected behaviour and the observed result. For calculation changes, update the methodology and add an independent numerical or boundary test. Keep the runtime dependency-free and preserve static hosting and direct-file use.

Licensed under [Apache License 2.0](LICENSE).
