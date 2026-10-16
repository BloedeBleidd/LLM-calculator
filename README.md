# LLM Calculator

A static browser calculator for comparing local LLM decode configurations: model storage, memory/compute limits, layer splitting, PCIe transfers and capacity-limited CPU offload.

**[Open calculator](https://llm-calculator.piotrzmudadev.com/)** · [Calculation methodology](docs/METHODOLOGY.md) · [Cloudflare deployment](docs/DEPLOYMENT.md)

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
- Model architecture presets, weight-format profiles and independent, editable example machines.
- Full-attention KV cache sizing from layers, KV heads, head dimension, context and precision, with explicit GB/GiB conversion.
- A 2K–128K context sensitivity table using the current machine and weights, without changing the active settings.
- Per-device weight/cache placement, reservations and remaining usable memory.
- Downloadable Markdown reports containing estimates, memory placement, limitations and reproducible JSON inputs.

An estimate is not a measured benchmark. The model assumes uniform contiguous layer blocks and single-session decode. It does not simulate tensor parallelism, prompt prefill, engine-specific device ordering, runtime overhead or shared-link contention. The [methodology](docs/METHODOLOGY.md) gives equations, units, optimizer assumptions and primary references.

## Use and share

Open `index.html` directly, or serve the repository as a static site. Keep `src/` alongside the HTML; there is no build step, runtime dependency, API key or external script.

All capacity and bandwidth inputs use **decimal GB**, with **1000 MB = 1 GB**. Set each GPU's VRAM to zero to disable that slot. Enter RAM available to CPU model layers after other host allocations. Include weight-format overhead in bytes per parameter and runtime allocations in the memory reservations.

“Save current” adds a named snapshot to the comparison table. “Load” restores its full configuration. “Reset defaults” resets current inputs and keeps comparisons. “Export JSON” saves the current inputs; “Import JSON” validates the complete versioned file before changing any setting. Imported configuration files are limited to 64 KiB.

“Share configuration” places the numeric settings in the URL fragment and copies a link when clipboard access is available. A selectable link is shown as a fallback. Editing the settings clears the old link; share again to capture the new configuration. Links and JSON exports contain configuration inputs, not saved scenario names. Browser storage is optional; estimation, import/export and sharing remain available when storage is blocked. No analytics or external service is used by the calculator.

Model presets replace model inputs and apply a KV cache calculated at the planner's context and precision; hardware is kept. Hardware profiles replace all four GPU slots, PCIe links, transfer mode and CPU/RAM inputs; model settings are kept. Llama presets use Meta's published architectures and rounded parameter counts. Other architecture examples and all hardware profiles are illustrative, not a product catalog or benchmark dataset. Quantized weight profiles include a stated example storage allowance; exact formats vary.

The context planner previews one fully occupied sequence. “Apply cache to calculator” explicitly replaces both KV storage and effective reads; later manual edits remain possible. The sweep is a separate what-if analysis. Its head counts, context and precision are helper inputs, not part of schema-v1 configuration links or exports; the resulting applied storage and read values are included. Cache scales, padding, sliding-window/latent/hybrid attention and batched throughput are outside this helper's model.

## Develop and verify

Node.js 24 is recommended. Development dependencies provide tests, formatting and Cloudflare tooling; the browser runtime has no dependencies:

```sh
npm ci --ignore-scripts
npm test
npm run format:check
npm run build
npx playwright install chromium
npm run test:browser
npm run dev
```

The development server binds to `127.0.0.1:8795`. The browser suite uses the built assets through local Wrangler, including response headers, redirects, real 404 responses and excluded private files. It covers desktop/mobile, direct file opening, input validation, finite RAM capacity, configuration round trips, sharing, storage failures, comparisons, presets, cache planning, reports and the guide. Unit tests check hand-calculated timing, cache sizes, conservation of memory, capacity boundaries and the optimizer against independent exhaustive enumeration. GitHub Actions runs both suites and checks formatting and the production build.

`src/engine.js` contains the independently testable math and configuration schema; `src/app.js` contains the interface and browser state. `src/planner.js` contains cache sizing, presets, context sweeps, memory budgets and report generation; `src/workbench.js` connects them to the interface. The site is hosted as a separate Cloudflare Worker on its custom subdomain. The public GitHub repository contains the source and README; production hosting does not use GitHub Pages.

## Issues and contributions

Include the exported JSON configuration, browser/OS, inference engine if relevant, expected behaviour and the observed result. For calculation changes, update the methodology and add an independent numerical or boundary test. Keep the runtime dependency-free and preserve static hosting and direct-file use.

Licensed under [Apache License 2.0](LICENSE).
