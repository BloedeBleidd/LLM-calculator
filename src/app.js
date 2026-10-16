"use strict";

const $ = (id) => document.getElementById(id);

const engine = window.LLMEngine;
const { PCIe_GBPS: genGB, LANES: lanes, FIELDS } = engine;
const colors = ["blue", "green", "purple", "orange"];
const cfg = [
  {
    section: "1. Your model",
    anchor: "model-settings",
    note: "Enter any Dense or MoE architecture, weight size and cache requirements.",
  },
  { custom: "mode" },
  ...[
    "totalB",
    "activeB",
    "bytesParam",
    "kvGB",
    "kvReadGB",
    "layers",
    "flopParam",
  ].map((id) => ({ id, ...FIELDS[id], moe: id === "activeB" })),
  {
    section: "2. Your GPUs",
    anchor: "hardware-settings",
    note: "Configure each card independently. Set VRAM to 0 to disable a slot.",
  },
  { custom: "gpus" },
  {
    section: "3. CPU, RAM & transfers",
    anchor: "host-settings",
    note: "Usable RAM limits CPU offload. Choose the transfer path supported by your machine.",
  },
  ...["ramGB", "cpuTf", "ramBw", "actMB"].map((id) => ({ id, ...FIELDS[id] })),
  { custom: "p2p" },
  { custom: "hint" },
];

const helpText = {
  totalB:
    "Total parameter count of the model. For dense models this is also close to active parameters per token. Find it in the model card, paper, README or Hugging Face page.",
  activeB:
    "Parameters actually used for one generated token. For dense models this equals total parameters. For MoE models search for active params, experts per token or routed experts.",
  bytesParam:
    "Average bytes used to store one parameter after quantization. FP16/BF16 is about 2, FP8 is about 1, Q8 about 1, Q4 about 0.5, Q3 about 0.375 before metadata overhead.",
  kvGB: "Allocated KV cache capacity in decimal GB. This affects whether the model fits, separately from how much KV data is read per generated token.",
  kvReadGB:
    "Effective KV bytes read per generated token, in decimal GB. Start with the occupied cache size, then calibrate for the attention kernel and cache reuse. Changing this does not change storage capacity.",
  ramGB:
    "RAM available for model layers after reserving memory for the OS, applications and other runtime allocations. Set this to zero to disable CPU offload. Disk swapping is not modeled.",
  layers:
    "Number of transformer blocks. Find num_hidden_layers in config.json or the architecture table in the model documentation.",
  flopParam:
    "Approximate FLOPs per active parameter for one generated token. Use 2 for a simple multiply-add estimate. Increase it if your model or runtime does extra work not captured by active parameters.",
  cpuTf:
    "Sustained CPU compute throughput available to inference, not peak marketing TFLOPS. Measure if possible, otherwise use a conservative value.",
  ramBw:
    "Sustained system memory bandwidth in GB/s. Find it via STREAM, AIDA64, memory benchmarks, or estimate from DDR generation, channels and speed.",
  actMB:
    "Activation tensor size transferred between device blocks per generated token, in decimal MB (1000 MB = 1 GB). This can matter across slow links.",
};

function controlRow(c) {
  return `
    <div class="row ${c.moe ? "moe" : ""}">
      <label for="num-${c.id}">${c.label}</label>
      <input id="range-${c.id}" aria-label="${c.label} slider" type="range" min="${c.min}" max="${c.sliderMax}" step="${c.integer ? 1 : "any"}" value="${c.val}">
      <input id="num-${c.id}" aria-label="${c.label}" class="num" type="number" min="${c.min}" max="${c.max}" step="${c.integer ? 1 : "any"}" value="${c.val}">
    </div>
  `;
}

function gpuNumberRow(id) {
  const c = FIELDS[id];
  return `<div class="row">
      <label for="num-${id}">${c.label}</label>
      <div class="pair">
        <input id="range-${id}" aria-label="${c.label} slider" type="range" min="${c.min}" max="${c.sliderMax}" step="${c.integer ? 1 : "any"}" value="${c.val}">
        <input id="num-${id}" aria-label="${c.label}" class="num" type="number" min="${c.min}" max="${c.max}" step="${c.integer ? 1 : "any"}" value="${c.val}">
      </div>
    </div>`;
}

function gpuCards() {
  const defaults = engine.createDefaultConfig();
  return `
    <div class="gpu-controls">
      ${[1, 2, 3, 4]
        .map((i) => {
          const { generation: gen, lanes: lane } = defaults.pcie[i - 1];
          const color = colors[i - 1];

          return `
  <div class="gpu-card ${color}">
    <h3>GPU ${i}</h3>
    ${gpuNumberRow(`vram${i}`)}
    ${gpuNumberRow(`bw${i}`)}
    ${gpuNumberRow(`tf${i}`)}
            ${gpuNumberRow(`reserve${i}`)}
    <div class="row">
      <label>PCIe / Host Link</label>
      <div class="pcie-grid">
        <select id="gen${i}" aria-label="GPU ${i} PCIe generation">
          ${Object.keys(genGB)
            .map((g) => `<option ${g === gen ? "selected" : ""}>${g}</option>`)
            .join("")}
        </select>
        <select id="lane${i}" aria-label="GPU ${i} PCIe lanes">
          ${lanes.map((l) => `<option value="${l}" ${l === lane ? "selected" : ""}>x${l}</option>`).join("")}
        </select>
      </div>
      <div class="pcie-note" id="pcieNote${i}"></div>
    </div>
  </div>
`;
        })
        .join("")}
    </div>
  `;
}

function renderControls() {
  $("controls").innerHTML = cfg
    .map((c) => {
      if (c.section) {
        return `<div class="section" id="${c.anchor}"><h3>${c.section}</h3><p>${c.note}</p></div>`;
      }

      if (c.custom === "mode") {
        return `
<div class="row wide">
  <label>Model Type</label>
  <div class="toggle" role="group" aria-label="Model type">
    <input type="radio" id="dense" name="mode">
    <label for="dense">Dense</label>
    <input type="radio" id="moe" name="mode" checked>
    <label for="moe">MoE</label>
  </div>
</div>
      `;
      }

      if (c.custom === "gpus") {
        return gpuCards();
      }

      if (c.custom === "p2p") {
        return `
<div class="row wide">
  <label>GPU-GPU Transfer</label>
  <div class="toggle" role="group" aria-label="GPU transfer mode">
    <input type="radio" id="p2p" name="gpuTransfer" checked>
    <label for="p2p">Direct P2P</label>
    <input type="radio" id="host" name="gpuTransfer">
    <label for="host">Via Host RAM</label>
  </div>
</div>
      `;
      }

      if (c.custom === "hint") {
        return `
<div class="hint">
  Assumptions: decimal GB, autoregressive single-token decode, contiguous layer blocks, user-entered effective TFLOPS. CPU/RAM executes CPU layers. PCIe is used for activation transfers across device boundaries, not for layers that remain on one device.
</div>
      `;
      }

      return controlRow(c);
    })
    .join("");

  document.querySelectorAll("[id^='range-']").forEach((range) => {
    const id = range.id.replace("range-", "");
    const num = $("num-" + id);

    range.addEventListener("input", () => {
      const value = FIELDS[id].integer
        ? Math.round(range.valueAsNumber)
        : Number(range.valueAsNumber.toFixed(3));
      num.value = Math.max(FIELDS[id].min, value);
      range.value = num.value;
      calc();
    });

    num.addEventListener("input", () => {
      if (num.value !== "" && Number.isFinite(num.valueAsNumber))
        syncRange(id, num.valueAsNumber);
      calc();
    });
  });

  $("controls")
    .querySelectorAll("select,input[type='radio']")
    .forEach((el) => {
      el.addEventListener("change", () => {
        toggleMoE();
        calc();
      });
    });
}

function readConfig() {
  const mode = $("moe").checked ? "moe" : "dense";
  const values = Object.fromEntries(
    Object.keys(FIELDS).map((id) => [id, $("num-" + id).valueAsNumber]),
  );
  // Dense models use every parameter. A hidden, unfinished MoE draft must not block them.
  if (mode === "dense")
    values.activeB = Number.isFinite(values.totalB)
      ? values.totalB
      : FIELDS.activeB.val;
  return {
    version: engine.VERSION,
    mode,
    transfer: $("p2p").checked ? "p2p" : "host",
    values,
    pcie: [1, 2, 3, 4].map((i) => ({
      generation: $("gen" + i).value,
      lanes: Number($("lane" + i).value),
    })),
  };
}

function syncRange(id, value) {
  const range = $("range-" + id),
    definition = FIELDS[id];
  range.max = Math.min(definition.max, Math.max(definition.sliderMax, value));
  range.value = value;
}

function applyConfig(config) {
  for (const [id, value] of Object.entries(config.values)) {
    $("num-" + id).value = value;
    syncRange(id, value);
  }
  $(config.mode).checked = true;
  $(config.transfer).checked = true;
  config.pcie.forEach((link, index) => {
    $("gen" + (index + 1)).value = link.generation;
    $("lane" + (index + 1)).value = link.lanes;
  });
  toggleMoE();
  calc();
}

function fmtMs(seconds) {
  return (seconds * 1000).toFixed(seconds < 0.01 ? 2 : 1) + " ms";
}

function niceMax(x) {
  if (!Number.isFinite(x) || x <= 0) {
    return 1;
  }

  const p = 10 ** Math.floor(Math.log10(x));
  const n = x / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * p;
}

function toggleMoE() {
  document.querySelectorAll(".moe").forEach((el) => {
    el.style.display = $("moe").checked ? "grid" : "none";
  });
}

let activeStep = 0;
let executionTrace = [];

function selectTokenStep(index) {
  if (!executionTrace.length) return;
  activeStep = Math.max(0, Math.min(executionTrace.length - 1, index));
  const step = executionTrace[activeStep];
  $("previousStep").disabled = activeStep === 0;
  $("nextStep").disabled = activeStep === executionTrace.length - 1;
  $("stepPosition").textContent =
    `Step ${activeStep + 1} / ${executionTrace.length} · ${step.kind === "compute" ? step.device : "Activation transfer"}`;
  $("visuals")
    .querySelectorAll("[data-token-step]")
    .forEach((button) => {
      const selected = Number(button.dataset.tokenStep) === activeStep;
      if (selected) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
  $("stepDetail").textContent =
    step.kind === "compute"
      ? `${step.device} processes layers ${step.firstLayer}–${step.lastLayer}. Weights: ${step.weightsGB.toFixed(2)} GB; KV cache: ${step.cacheGB.toFixed(2)} GB; effective reads: ${step.readGB.toFixed(2)} GB/token. ${step.bound} limits this block. Elapsed: ${fmtMs(step.start)} → ${fmtMs(step.end)}.`
      : `${step.activationMB.toFixed(2)} MB of activations passes from ${step.from} to ${step.to}. ${step.path}. Weights and KV cache remain on their owning devices. Estimated transfer: ${fmtMs(step.seconds)}. Elapsed: ${fmtMs(step.start)} → ${fmtMs(step.end)}.`;
  $("layerMap")
    .querySelectorAll("[data-flow-device]")
    .forEach((segment) =>
      segment.classList.toggle(
        "selected",
        step.kind === "compute" && segment.dataset.flowDevice === step.device,
      ),
    );
}

function renderFlow(config, result) {
  executionTrace = window.LLMPlanner.executionSteps(config, result);
  activeStep = Math.min(activeStep, executionTrace.length - 1);
  const blocks = executionTrace.filter((step) => step.kind === "compute");
  $("layerMap").innerHTML = blocks
    .map(
      (step) =>
        `<span class="layer-segment ${step.color}Fill" data-flow-device="${step.device}" style="flex:${step.layers}" title="${step.device}: layers ${step.firstLayer}–${step.lastLayer}">${step.device.replace(" / RAM", "")}<small>${step.firstLayer}–${step.lastLayer}</small></span>`,
    )
    .join("");
  $("layerMap").setAttribute(
    "aria-label",
    blocks
      .map(
        (step) =>
          `${step.device}: layers ${step.firstLayer} to ${step.lastLayer}`,
      )
      .join("; "),
  );
  $("flowSummary").textContent =
    `${config.values.layers} layers in execution order · ${result.storeLayer.toFixed(3)} GB stored per layer · ${fmtMs(result.transferSeconds)} in transfers.`;
  $("visuals").innerHTML = executionTrace
    .map((step, index) =>
      step.kind === "compute"
        ? `<li class="compute-phase ${step.color}"><button type="button" data-token-step="${index}"><span class="phase-number">${index + 1}</span><span class="phase-device">${step.device}<strong>Layers ${step.firstLayer}–${step.lastLayer}</strong></span><span class="phase-memory"><span>${step.weightsGB.toFixed(2)} GB weights + ${step.cacheGB.toFixed(2)} GB KV</span><small>${step.freeGB.toFixed(2)} GB free · ${step.bound} bound</small></span><span class="phase-time">${fmtMs(step.seconds)}<small>compute</small></span></button></li>`
        : `<li class="transfer-phase"><button type="button" data-token-step="${index}"><span class="phase-arrow" aria-hidden="true">↓</span><span>${step.from.replace(" / RAM", "")} → ${step.to.replace(" / RAM", "")}<small>${step.activationMB.toFixed(2)} MB activations · ${step.path}</small></span><span class="phase-time">${fmtMs(step.seconds)}</span></button></li>`,
    )
    .join("");
  selectTokenStep(activeStep);
}

function setBar(el, pct, label) {
  el.style.width = pct + "%";
  el.style.minWidth = pct > 0 ? "8px" : "0";
  el.textContent = label;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", label);
  el.dataset.label = label;
  el.classList.toggle("small", pct < 18);
}

let currentConfig = null;
let sharedConfig = null;
const CURRENT_KEY = "llm-optimizer.config.v1";
const SCENARIOS_KEY = "llm-optimizer.scenarios.v1";
let scenarios = [];

function notify(message) {
  $("workspaceStatus").textContent = message;
}

function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    notify(
      "Browser storage is unavailable. Use Export JSON or Share configuration to keep your settings.",
    );
    return false;
  }
}

function clearMetrics(message) {
  $("topTps").textContent = "—";
  $("topLat").textContent = "—";
  $("topSplit").textContent = "—";
  $("topVram").textContent = message;
  $("topVram").className = "mval red";
  $("subStatus").textContent =
    "An estimate is available after the inputs and capacity are valid.";
  $("visuals").replaceChildren();
  const empty = document.createElement("li");
  empty.className = "flow-empty";
  empty.textContent = message;
  $("visuals").append(empty);
  executionTrace = [];
  $("layerMap").replaceChildren();
  $("layerMap").setAttribute("aria-label", "No feasible placement");
  $("flowSummary").textContent =
    "A complete placement needs valid inputs and enough usable memory.";
  $("stepPosition").textContent = "No token path available";
  $("stepDetail").textContent = "";
  $("previousStep").disabled = true;
  $("nextStep").disabled = true;
  for (const id of ["barOpt", "barSingle"]) setBar($(id), 0, "Unavailable");
  $("axis").replaceChildren();
  $("comparisonGain").textContent = "";
}

function calc() {
  const config = readConfig();
  const errors = engine.validateConfig(config);
  document
    .querySelectorAll("#controls [aria-invalid]")
    .forEach((el) => el.removeAttribute("aria-invalid"));
  const notice = $("calculationNotice");
  notice.hidden = errors.length === 0;
  notice.textContent = errors.map((error) => error.message).join(" ");
  for (const error of errors)
    $("num-" + error.field)?.setAttribute("aria-invalid", "true");
  currentConfig = null;
  for (const id of [
    "saveScenario",
    "shareConfig",
    "exportConfig",
    "exportReport",
    "applyModel",
    "applyHardware",
  ])
    $(id).disabled = errors.length > 0;
  if (errors.length) {
    clearMetrics("CHECK INPUTS");
    window.updateWorkbench?.(null, null);
    return;
  }
  currentConfig = config;
  const result = engine.estimate(config);
  const serialized = engine.serializeConfig(config);
  if (sharedConfig && serialized !== sharedConfig) {
    history.replaceState(null, "", location.pathname + location.search);
    sharedConfig = null;
    $("sharedLink").hidden = true;
  }
  store(CURRENT_KEY, config);
  for (let i = 1; i <= 4; i++) {
    const link = config.pcie[i - 1];
    $("pcieNote" + i).textContent =
      (genGB[link.generation] * link.lanes).toFixed(2) + " GB/s per direction";
  }
  if (!result.feasible) {
    clearMetrics("DOES NOT FIT");
    notice.hidden = false;
    notice.textContent = `The model needs ${result.storedGB.toFixed(2)} GB. Available GPUs and usable RAM can hold ${result.gpuCap + result.cpuCap} of ${config.values.layers} complete layers. Increase usable memory, reduce model/cache size, or change quantization. Layers cannot be split into fractions.`;
    window.updateWorkbench?.(config, result);
    return;
  }
  const opt = result.optimal;
  const tpsSingle = result.baselineTps;
  $("topTps").textContent = result.tps.toFixed(2) + " t/s";
  $("topLat").textContent = fmtMs(opt.total);
  $("topSplit").textContent = opt.used
    .map((d) => `${d.name.replace(" / RAM", "")}: ${d.assigned}`)
    .join(" → ");
  $("topVram").textContent = result.status;
  $("topVram").className =
    "mval " + (result.status === "FULLY IN VRAM" ? "green" : "blueText");
  $("subStatus").textContent =
    `Stored ${result.storedGB.toFixed(2)} GB; reads ${result.activeReadGB.toFixed(2)} GB/token; compute ${result.computeTflopPerToken.toFixed(3)} TFLOP/token; transfers ${fmtMs(result.transferSeconds)}. Single-session decode estimate.`;
  renderFlow(config, result);
  const max = niceMax(Math.max(result.tps, tpsSingle || 0, 1));
  $("barOpt").className = "bar blue";
  setBar($("barOpt"), (100 * result.tps) / max, result.tps.toFixed(2) + " t/s");
  $("barSingle").className = "bar gray";
  setBar(
    $("barSingle"),
    tpsSingle ? (100 * tpsSingle) / max : 0,
    tpsSingle ? tpsSingle.toFixed(2) + " t/s" : "Does not fit",
  );
  $("comparisonGain").textContent = tpsSingle
    ? `${(result.tps / tpsSingle).toFixed(2)}× the best single-GPU/CPU baseline. ${opt.used.length} device block(s).`
    : "The model does not fit any single GPU plus the configured CPU/RAM; multiple GPUs are required.";
  $("axis").innerHTML = Array.from(
    { length: 6 },
    (_, i) =>
      `<span>${((max * i) / 5).toFixed(max < 10 ? 1 : 0)}${i === 5 ? " t/s" : ""}</span>`,
  ).join("");
  window.updateWorkbench?.(config, result);
}

function renderScenarios() {
  const body = $("scenarioRows");
  body.replaceChildren();
  $("scenarioTable").hidden = scenarios.length === 0;
  $("emptyScenarios").hidden = scenarios.length > 0;
  scenarios.forEach((scenario, index) => {
    const result = engine.estimate(scenario.config);
    const row = document.createElement("tr");
    const values = [
      scenario.name,
      result.tps === null ? "Does not fit" : result.tps.toFixed(2) + " t/s",
      result.optimal ? fmtMs(result.optimal.total) : "—",
      result.storedGB.toFixed(2) + " GB",
      result.optimal
        ? result.optimal.used
            .map((d) => `${d.name.replace(" / RAM", "")}: ${d.assigned}`)
            .join(" → ")
        : "—",
    ];
    values.forEach((value, column) => {
      const cell = document.createElement(column === 0 ? "th" : "td");
      if (column === 0) cell.scope = "row";
      cell.textContent = value;
      row.append(cell);
    });
    const actions = document.createElement("td");
    for (const [label, action] of [
      [
        "Load",
        () => {
          applyConfig(scenario.config);
          notify(`Loaded ${scenario.name}.`);
        },
      ],
      [
        "Remove",
        () => {
          scenarios.splice(index, 1);
          store(SCENARIOS_KEY, scenarios);
          renderScenarios();
        },
      ],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-label", `${label} ${scenario.name}`);
      button.addEventListener("click", action);
      actions.append(button);
    }
    row.append(actions);
    body.append(row);
  });
}

function initWorkspace() {
  let initial = engine.createDefaultConfig();
  let message =
    "Valid settings are saved in this browser. Shared links contain configuration values only.";
  try {
    const saved = localStorage.getItem(CURRENT_KEY);
    if (saved) initial = engine.parseConfig(saved);
  } catch {
    message =
      "Saved settings could not be read. Defaults loaded; JSON import and sharing remain available.";
  }
  try {
    const saved = JSON.parse(localStorage.getItem(SCENARIOS_KEY) || "[]");
    if (!Array.isArray(saved) || saved.length > 6)
      throw new Error("Invalid saved comparisons");
    scenarios = saved.map((item) => {
      if (
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 60
      )
        throw new Error("Invalid scenario name");
      return {
        name: item.name,
        config: engine.parseConfig(JSON.stringify(item.config)),
      };
    });
  } catch {
    scenarios = [];
    message =
      "Saved comparisons could not be read. Your current configuration can still be exported.";
  }
  if (location.hash.startsWith("#config=")) {
    try {
      initial = engine.parseConfig(decodeURIComponent(location.hash.slice(8)));
      sharedConfig = engine.serializeConfig(initial);
      message =
        "Shared configuration loaded. Editing it clears the shared link until you share again.";
    } catch {
      message =
        "The shared configuration is invalid or unsupported. Previous settings were kept.";
    }
  }
  applyConfig(initial);
  renderScenarios();
  notify(message);
  window.addEventListener("hashchange", () => {
    if (!location.hash.startsWith("#config=")) return;
    try {
      const config = engine.parseConfig(
        decodeURIComponent(location.hash.slice(8)),
      );
      sharedConfig = engine.serializeConfig(config);
      applyConfig(config);
      notify("Shared configuration loaded.");
    } catch {
      notify(
        "The shared configuration is invalid. Current settings were kept.",
      );
    }
  });
  $("saveScenario").addEventListener("click", () => {
    if (!currentConfig) return;
    if (scenarios.length >= 6) {
      notify("Six comparisons are saved. Remove one before adding another.");
      return;
    }
    const name =
      $("scenarioName").value.trim() || `Scenario ${scenarios.length + 1}`;
    scenarios.push({
      name,
      config: engine.parseConfig(engine.serializeConfig(currentConfig)),
    });
    const persisted = store(SCENARIOS_KEY, scenarios);
    renderScenarios();
    $("scenarioName").value = "";
    notify(
      persisted
        ? `Saved ${name}.`
        : `Added ${name} for this session. Browser storage is unavailable; export configurations to keep them.`,
    );
  });
  $("exportConfig").addEventListener("click", () => {
    if (!currentConfig) return;
    const blob = new Blob([JSON.stringify(currentConfig, null, 2) + "\n"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "llm-configuration.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Configuration exported as JSON.");
  });
  $("importConfig").addEventListener("click", () => $("configFile").click());
  $("configFile").addEventListener("change", async () => {
    const file = $("configFile").files[0];
    if (!file) return;
    try {
      if (file.size > 65536)
        throw new Error("Configuration must be smaller than 64 KiB.");
      const config = engine.parseConfig(await file.text());
      applyConfig(config);
      notify("Configuration imported.");
    } catch (error) {
      notify(`Import failed: ${error.message} Current settings were kept.`);
    } finally {
      $("configFile").value = "";
    }
  });
  $("shareConfig").addEventListener("click", async () => {
    if (!currentConfig) return;
    sharedConfig = engine.serializeConfig(currentConfig);
    const url = new URL(location.href);
    url.hash = "config=" + encodeURIComponent(sharedConfig);
    history.replaceState(null, "", url);
    const field = $("sharedLink");
    field.value = url.href;
    field.hidden = false;
    try {
      await navigator.clipboard.writeText(url.href);
      notify("Configuration link copied.");
    } catch {
      field.focus();
      field.select();
      notify(
        "Copy the selected configuration link. Clipboard access is unavailable.",
      );
    }
  });
  $("resetConfig").addEventListener("click", () => {
    sharedConfig = null;
    if (location.hash.startsWith("#config="))
      history.replaceState(null, "", location.pathname + location.search);
    $("sharedLink").hidden = true;
    applyConfig(engine.createDefaultConfig());
    notify("Default settings restored. Saved comparisons are kept.");
  });
}

function attachHelp(id, text) {
  const label = document.querySelector(`label[for="num-${id}"]`);

  if (!label || label.dataset.help) {
    return;
  }

  label.dataset.help = "1";
  label.insertAdjacentHTML(
    "beforeend",
    `<span class="fieldHelp" tabindex="0">?</span><span class="fieldTip">${text}</span>`,
  );

  ["range-" + id, "num-" + id].forEach((x) => {
    const el = $(x);

    if (el) {
      el.title = text;
    }
  });
}

function enhanceHelp() {
  Object.entries(helpText).forEach(([id, text]) => attachHelp(id, text));

  for (let i = 1; i <= 4; i++) {
    attachHelp(
      "vram" + i,
      "GPU memory capacity. Find it in the GPU spec sheet or tools such as GPU-Z, nvidia-smi, ROCm SMI or your operating system.",
    );
    attachHelp(
      "bw" + i,
      "GPU memory bandwidth in GB/s. Find it in the GPU vendor specification. This is the main limit for bandwidth-bound decode.",
    );
    attachHelp(
      "reserve" + i,
      "VRAM reserved for display, runtime buffers and other allocations on this GPU. This is subtracted before complete layers are placed.",
    );
    attachHelp(
      "tf" + i,
      "Sustained effective TFLOPS for this inference workload. The spec sheet gives peak TFLOPS, but real effective TFLOPS is usually lower. Calibrate with benchmarks if possible.",
    );

    const card = $("gen" + i)?.closest(".row");

    if (card) {
      const label = card.querySelector("label");

      if (label && !label.dataset.help) {
        const text =
          "PCIe generation and lane width of this GPU slot. Check motherboard manual, BIOS, GPU-Z, lspci or nvidia-smi topo. The calculator converts this to one-direction GB/s.";
        label.dataset.help = "1";
        label.insertAdjacentHTML(
          "beforeend",
          `<span class="fieldHelp" tabindex="0">?</span><span class="fieldTip">${text}</span>`,
        );
        $("gen" + i).title = text;
        $("lane" + i).title = text;
      }
    }
  }

  document.querySelectorAll(".row.wide > label").forEach((label) => {
    if (label.dataset.help) {
      return;
    }

    if (label.textContent.includes("Model Type")) {
      label.dataset.help = "1";
      label.insertAdjacentHTML(
        "beforeend",
        `<span class="fieldHelp" tabindex="0">?</span><span class="fieldTip">Dense means all parameters are active per token. MoE means total parameters define storage, while active parameters define most compute and active weight reads.</span>`,
      );
    }

    if (label.textContent.includes("GPU-GPU Transfer")) {
      label.dataset.help = "1";
      label.insertAdjacentHTML(
        "beforeend",
        `<span class="fieldHelp" tabindex="0">?</span><span class="fieldTip">Direct P2P assumes GPUs can transfer activations directly. Via Host RAM models GPU to RAM to GPU transfers and is usually slower.</span>`,
      );
    }
  });
}

function initGuide() {
  const modal = $("guideModal");
  const open = $("openGuide");
  const close = $("closeGuide");
  let lastFocus = null;

  if (!modal || !open || !close) {
    return;
  }

  function openModal() {
    lastFocus = document.activeElement;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.querySelector(".dashboard").inert = true;
    document.body.style.overflow = "hidden";
    close.focus();
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.querySelector(".dashboard").inert = false;
    document.body.style.overflow = "";

    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus();
    }
  }

  function focusableElements() {
    return [
      ...modal.querySelectorAll(
        "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
      ),
    ].filter((el) => !el.disabled && el.offsetParent !== null);
  }

  modal.querySelectorAll(".guide-nav a").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      document
        .querySelector(link.getAttribute("href"))
        ?.scrollIntoView({ block: "start" });
    }),
  );
  open.addEventListener("click", openModal);
  close.addEventListener("click", closeModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!modal.classList.contains("open")) {
      return;
    }

    if (event.key === "Escape") {
      closeModal();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = focusableElements();

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

$("previousStep").addEventListener("click", () =>
  selectTokenStep(activeStep - 1),
);
$("nextStep").addEventListener("click", () => selectTokenStep(activeStep + 1));
$("visuals").addEventListener("click", (event) => {
  const button = event.target.closest("[data-token-step]");
  if (button) selectTokenStep(Number(button.dataset.tokenStep));
});
renderControls();
enhanceHelp();
initGuide();
toggleMoE();
initWorkspace();
