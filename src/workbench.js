(function () {
  "use strict";
  const planner = window.LLMPlanner;
  const engine = window.LLMEngine;
  const el = (id) => document.getElementById(id);
  let config = null;
  let cache = null;
  let applyingPreset = false;
  const gb = (value) =>
    value.toLocaleString("en", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " GB";

  function options(id, items) {
    el(id).replaceChildren(
      ...[
        {
          id: "custom",
          name:
            id === "modelPreset"
              ? "Custom model — edit values below"
              : id === "hardwarePreset"
                ? "Custom machine — edit each GPU below"
                : "Custom bytes per parameter",
        },
        ...items,
      ].map((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        return option;
      }),
    );
  }

  function row(body, values) {
    const tr = document.createElement("tr");
    values.forEach((value, index) => {
      const cell = document.createElement(index === 0 ? "th" : "td");
      if (index === 0) cell.scope = "row";
      cell.textContent = value;
      tr.append(cell);
    });
    body.append(tr);
    return tr;
  }

  function readCache() {
    return {
      layers: config?.values.layers,
      kvHeads: el("kvHeads").valueAsNumber,
      headDim: el("headDim").valueAsNumber,
      tokens: el("contextTokens").valueAsNumber,
      bytes: Number(el("cacheBytes").value),
    };
  }

  function renderPlanner() {
    cache = null;
    el("applyCache").disabled = true;
    el("contextRows").replaceChildren();
    el("cacheGB").textContent = "—";
    el("cacheDetail").textContent = "—";
    el("plannerLayers").textContent = config?.values.layers ?? "—";
    if (!config) {
      el("cacheNotice").textContent =
        "Correct the calculator inputs to preview context requirements.";
      el("sweepNotice").textContent =
        "Context estimates need a valid configuration.";
      return;
    }
    try {
      const inputs = readCache();
      cache = planner.kvCache(inputs);
      el("cacheGB").textContent = gb(cache.gb);
      el("cacheDetail").textContent =
        `${cache.gib.toFixed(2)} GiB · ${(cache.bytesPerToken / 1024).toFixed(1)} KiB per token`;
      el("applyCache").disabled = cache.gb > engine.FIELDS.kvGB.max;
      const matches =
        Math.abs(config.values.kvGB - cache.gb) < 1e-7 &&
        Math.abs(config.values.kvReadGB - cache.gb) < 1e-7;
      el("cacheNotice").textContent =
        cache.gb > engine.FIELDS.kvGB.max
          ? "This cache exceeds the calculator's 4096 GB input limit. Reduce context or precision."
          : matches
            ? "This cache is applied to the current calculator inputs."
            : "Preview only. Apply to replace both KV storage and KV reads in the calculator.";
      let fullyGpu = 0;
      for (const point of planner.contextSweep(config, inputs)) {
        const tr = row(el("contextRows"), [
          point.tokens.toLocaleString("en"),
          gb(point.cacheGB),
          gb(point.storedGB),
          point.tps === null ? "—" : point.tps.toFixed(2) + " t/s",
          point.status,
        ]);
        tr.className =
          point.status === "FULLY IN VRAM"
            ? "fits-vram"
            : point.tps === null
              ? "does-not-fit"
              : "uses-cpu";
        if (point.status === "FULLY IN VRAM") fullyGpu = point.tokens;
      }
      el("sweepNotice").textContent = fullyGpu
        ? `Largest sampled context placed entirely on GPU: ${fullyGpu.toLocaleString("en")} tokens. This is a sampled result, not a context-length guarantee.`
        : "No sampled context is placed entirely on GPU. Review usable VRAM, weight storage and CPU offload.";
    } catch (error) {
      cache = null;
      el("cacheNotice").textContent = error.message;
      el("sweepNotice").textContent =
        "Correct the KV architecture to see context estimates.";
    }
  }

  function renderMemory(result) {
    el("memoryRows").replaceChildren();
    if (!config || !result) {
      for (const id of [
        "memoryWeights",
        "memoryCache",
        "memoryGpu",
        "memoryReserved",
      ])
        el(id).textContent = "—";
      el("memorySummary").textContent = "Waiting for valid inputs.";
      return;
    }
    const v = config.values;
    let raw = 0,
      reserved = 0;
    for (let i = 1; i <= 4; i++)
      if (v["vram" + i] > 0) {
        raw += v["vram" + i];
        reserved += v["reserve" + i];
      }
    el("memoryWeights").textContent = gb(result.weightGB);
    el("memoryCache").textContent = gb(v.kvGB);
    el("memoryGpu").textContent = gb(raw - reserved);
    el("memoryReserved").textContent = gb(reserved);
    el("memorySummary").textContent = result.feasible
      ? `${gb(result.storedGB)} placed across ${result.optimal.used.length} device block(s). Free memory is after this placement.`
      : `${gb(result.storedGB)} needed. Capacity: ${result.gpuCap + result.cpuCap} of ${v.layers} complete layers. No placement exists; allocation below is zero.`;
    for (const item of planner.memoryBudget(config, result))
      row(el("memoryRows"), [
        item.name,
        String(item.layers),
        gb(item.weightsGB),
        gb(item.cacheGB),
        gb(item.availableGB),
        gb(item.freeGB),
      ]);
  }

  window.updateWorkbench = function (next, result) {
    if (!applyingPreset && config && next) {
      const modelKeys = [
        "totalB",
        "activeB",
        "bytesParam",
        "layers",
        "kvGB",
        "kvReadGB",
        "flopParam",
      ];
      if (modelKeys.some((key) => config.values[key] !== next.values[key])) {
        el("modelPreset").value = "custom";
        el("quantPreset").value = "custom";
        modelNote();
      }
      const hostKeys = ["ramGB", "cpuTf", "ramBw", "actMB"];
      const gpuKeys = Object.keys(engine.FIELDS).filter((key) =>
        /^(vram|bw|tf|reserve)\d$/.test(key),
      );
      if (
        [...hostKeys, ...gpuKeys].some(
          (key) => config.values[key] !== next.values[key],
        ) ||
        config.transfer !== next.transfer ||
        JSON.stringify(config.pcie) !== JSON.stringify(next.pcie)
      ) {
        el("hardwarePreset").value = "custom";
        hardwareNote();
      }
    }
    config = next;
    el("applyModel").disabled = !config || el("modelPreset").value === "custom";
    el("applyHardware").disabled =
      !config || el("hardwarePreset").value === "custom";
    el("configurationMode").textContent = applyingPreset
      ? "Preset loaded · editable"
      : "Custom setup";
    renderMemory(result);
    renderPlanner();
  };

  function modelNote() {
    const model = planner.MODELS.find(
      (item) => item.id === el("modelPreset").value,
    );
    el("applyModel").disabled = !config || !model;
    if (!model) {
      el("modelPresetNote").textContent =
        "Enter your own parameter count, weight size, layers and cache below. Every model input remains editable.";
      el("modelPresetSource").hidden = true;
      return;
    }
    el("modelPresetNote").textContent = model.note;
    el("modelPresetSource").hidden = !model.source;
    if (model.source) el("modelPresetSource").href = model.source;
  }

  function hardwareNote() {
    const hardware = planner.HARDWARE.find(
      (item) => item.id === el("hardwarePreset").value,
    );
    el("applyHardware").disabled = !config || !hardware;
    el("hardwarePresetNote").replaceChildren();
    if (!hardware) {
      el("hardwarePresetNote").textContent =
        "Set independent VRAM, bandwidth, effective compute, reservation and PCIe values for each card.";
      return;
    }
    const facts = hardware.cards
      ? [
          `${hardware.cards} × ${hardware.vram} GB VRAM`,
          `${hardware.bw} GB/s per GPU`,
          `${hardware.tf} effective TFLOPS per GPU`,
          `${hardware.reserve} GB reserved per GPU`,
          `${hardware.ram} GB usable RAM`,
        ]
      : [
          `${hardware.ram} GB usable RAM`,
          `${hardware.ramBw} GB/s RAM`,
          `${hardware.cpuTf} effective CPU TFLOPS`,
          "All GPU slots disabled",
        ];
    for (const fact of facts) {
      const span = document.createElement("span");
      span.textContent = fact;
      el("hardwarePresetNote").append(span);
    }
  }

  options("modelPreset", planner.MODELS);
  options("quantPreset", planner.QUANTIZATIONS);
  options("hardwarePreset", planner.HARDWARE);
  el("quantPreset").value = "custom";
  modelNote();
  hardwareNote();
  // Navigation must preserve shared settings in the URL fragment.
  document
    .querySelectorAll('.site-nav a[href^="#"], .toolbar-link, .save-setup-link')
    .forEach((link) =>
      link.addEventListener("click", (event) => {
        event.preventDefault();
        document
          .querySelector(link.getAttribute("href"))
          ?.scrollIntoView({ block: "start" });
        if (link.getAttribute("href") === "#comparison")
          el("scenarioName").focus({ preventScroll: true });
      }),
    );
  el("modelPreset").addEventListener("change", modelNote);
  el("hardwarePreset").addEventListener("change", hardwareNote);
  function markManualInput(event) {
    const id = event.target.id.replace(/^(num|range)-/, "");
    if (
      [
        "totalB",
        "activeB",
        "bytesParam",
        "layers",
        "kvGB",
        "kvReadGB",
        "flopParam",
      ].includes(id) ||
      event.target.name === "mode"
    ) {
      el("modelPreset").value = "custom";
      el("quantPreset").value = "custom";
      modelNote();
    } else {
      el("hardwarePreset").value = "custom";
      hardwareNote();
    }
    el("configurationMode").textContent = "Custom setup";
  }
  el("controls").addEventListener("input", markManualInput);
  el("controls").addEventListener("change", markManualInput);
  for (const id of ["kvHeads", "headDim", "contextTokens", "cacheBytes"])
    el(id).addEventListener("input", () => {
      el("cacheStatus").textContent = "";
      renderPlanner();
    });
  el("applyModel").addEventListener("click", () => {
    if (!config) return;
    try {
      const id = el("modelPreset").value;
      const model = planner.MODELS.find((item) => item.id === id);
      const next = planner.applyModel(
        config,
        id,
        el("quantPreset").value,
        readCache(),
      );
      el("kvHeads").value = model.kvHeads;
      el("headDim").value = model.headDim;
      applyingPreset = true;
      applyConfig(next);
      applyingPreset = false;
      el("presetStatus").textContent =
        `${model.name} applied with the selected weight format and KV cache. Hardware kept.`;
    } catch (error) {
      applyingPreset = false;
      el("presetStatus").textContent = error.message;
    }
  });
  el("applyHardware").addEventListener("click", () => {
    if (!config) return;
    const id = el("hardwarePreset").value;
    applyingPreset = true;
    applyConfig(planner.applyHardware(config, id));
    applyingPreset = false;
    el("presetStatus").textContent =
      "Hardware profile applied. Model and KV storage kept. All four GPU slots and host settings updated.";
  });
  el("applyCache").addEventListener("click", () => {
    if (!config || !cache || cache.gb > engine.FIELDS.kvGB.max) return;
    const next = engine.parseConfig(engine.serializeConfig(config));
    next.values.kvGB = cache.gb;
    next.values.kvReadGB = cache.gb;
    applyConfig(next);
    el("cacheStatus").textContent =
      "KV storage and effective reads updated for one fully occupied sequence.";
  });
  el("exportReport").addEventListener("click", () => {
    if (!config) return;
    const url = URL.createObjectURL(
      new Blob([planner.report(config)], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "llm-configuration-report.md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    el("workspaceStatus").textContent =
      "Report downloaded with estimates, memory placement and reproducible inputs.";
  });
  const initial = readConfig();
  const valid = engine.validateConfig(initial).length === 0;
  window.updateWorkbench(
    valid ? initial : null,
    valid ? engine.estimate(initial) : null,
  );
  const resultsPanel = el("results");
  function pinResultsWhenTheyFit() {
    resultsPanel.classList.toggle(
      "sticky-results",
      innerWidth > 1180 && resultsPanel.offsetHeight < innerHeight - 100,
    );
  }
  new ResizeObserver(pinResultsWhenTheyFit).observe(resultsPanel);
  window.addEventListener("resize", pinResultsWhenTheyFit);
})();
