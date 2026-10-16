/* Architecture helpers, illustrative hardware profiles, and portable reports. */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./engine.js"));
  else root.LLMPlanner = factory(root.LLMEngine);
})(typeof globalThis === "object" ? globalThis : this, function (engine) {
  "use strict";

  const MODEL_SOURCE =
    "https://github.com/meta-llama/llama-models/blob/main/models/sku_list.py";
  const MODELS = Object.freeze(
    [
      {
        id: "llama31-8b",
        name: "Llama 3.1 · 8B",
        mode: "dense",
        totalB: 8,
        activeB: 8,
        layers: 32,
        kvHeads: 8,
        headDim: 128,
        source: MODEL_SOURCE,
        note: "Meta architecture; rounded 8B parameter count. Full attention, GQA, up to 128K context.",
      },
      {
        id: "llama31-70b",
        name: "Llama 3.1 · 70B",
        mode: "dense",
        totalB: 70,
        activeB: 70,
        layers: 80,
        kvHeads: 8,
        headDim: 128,
        source: MODEL_SOURCE,
        note: "Meta architecture; rounded 70B parameter count. Full attention, GQA, up to 128K context.",
      },
      {
        id: "dense32",
        name: "Dense · 32B example",
        mode: "dense",
        totalB: 32,
        activeB: 32,
        layers: 64,
        kvHeads: 8,
        headDim: 128,
        note: "Illustrative architecture, not a specific released model. Adjust every value to your model card.",
      },
      {
        id: "moe120",
        name: "MoE · 120B / 12B active example",
        mode: "moe",
        totalB: 120,
        activeB: 12,
        layers: 48,
        kvHeads: 8,
        headDim: 128,
        note: "Illustrative MoE architecture. Stores 120B parameters; estimates 12B active per token. Not a benchmark.",
      },
    ].map(Object.freeze),
  );

  const QUANTIZATIONS = Object.freeze(
    [
      { id: "q3", name: "3-bit · +10% storage overhead", bytes: 0.4125 },
      { id: "q4", name: "4-bit · +10% storage overhead", bytes: 0.55 },
      { id: "q5", name: "5-bit · +10% storage overhead", bytes: 0.6875 },
      { id: "q8", name: "8-bit · +5% storage overhead", bytes: 1.05 },
      { id: "fp16", name: "FP16 / BF16 · 2 bytes", bytes: 2 },
    ].map(Object.freeze),
  );

  // These are deliberately generic examples, not advertised specifications or measured speeds.
  const HARDWARE = Object.freeze(
    [
      {
        id: "single24",
        name: "1 × 24 GB · desktop example",
        cards: 1,
        vram: 24,
        bw: 900,
        tf: 30,
        reserve: 1.5,
        ram: 48,
        ramBw: 60,
        cpuTf: 2,
      },
      {
        id: "dual24",
        name: "2 × 24 GB · workstation example",
        cards: 2,
        vram: 24,
        bw: 900,
        tf: 30,
        reserve: 1.5,
        ram: 64,
        ramBw: 80,
        cpuTf: 3,
      },
      {
        id: "single48",
        name: "1 × 48 GB · workstation example",
        cards: 1,
        vram: 48,
        bw: 900,
        tf: 40,
        reserve: 2,
        ram: 64,
        ramBw: 80,
        cpuTf: 3,
      },
      {
        id: "dual80",
        name: "2 × 80 GB · server example",
        cards: 2,
        vram: 80,
        bw: 2000,
        tf: 100,
        reserve: 3,
        ram: 128,
        ramBw: 180,
        cpuTf: 6,
      },
      {
        id: "cpu64",
        name: "CPU only · 64 GB usable RAM",
        cards: 0,
        vram: 0,
        bw: 900,
        tf: 30,
        reserve: 0,
        ram: 64,
        ramBw: 60,
        cpuTf: 2,
      },
    ].map(Object.freeze),
  );

  function kvCache({ layers, kvHeads, headDim, tokens, bytes }) {
    for (const [key, value, max] of [
      ["layers", layers, 1024],
      ["KV heads", kvHeads, 1024],
      ["head dimension", headDim, 4096],
      ["context tokens", tokens, 1048576],
    ]) {
      if (!Number.isInteger(value) || value < 1 || value > max)
        throw new Error(`${key}: enter a whole number from 1 to ${max}.`);
    }
    if (![0.5, 1, 2, 4].includes(bytes))
      throw new Error("Choose a supported KV cache precision.");
    const bytesPerToken = 2 * layers * kvHeads * headDim * bytes;
    const totalBytes = bytesPerToken * tokens;
    return {
      bytesPerToken,
      totalBytes,
      gb: totalBytes / 1e9,
      gib: totalBytes / 2 ** 30,
    };
  }

  function applyModel(config, id, quantizationId, cache) {
    const model = MODELS.find((item) => item.id === id);
    const quantization = QUANTIZATIONS.find(
      (item) => item.id === quantizationId,
    );
    if (!model || !quantization)
      throw new Error("Choose a model and weight format.");
    const next = engine.parseConfig(engine.serializeConfig(config));
    next.mode = model.mode;
    Object.assign(next.values, {
      totalB: model.totalB,
      activeB: model.activeB,
      layers: model.layers,
      bytesParam: quantization.bytes,
    });
    const kv = kvCache({
      ...cache,
      layers: model.layers,
      kvHeads: model.kvHeads,
      headDim: model.headDim,
    });
    next.values.kvGB = kv.gb;
    next.values.kvReadGB = kv.gb;
    return engine.parseConfig(JSON.stringify(next));
  }

  function applyHardware(config, id) {
    const hardware = HARDWARE.find((item) => item.id === id);
    if (!hardware) throw new Error("Choose a hardware profile.");
    const next = engine.parseConfig(engine.serializeConfig(config));
    for (let i = 1; i <= 4; i++) {
      Object.assign(next.values, {
        ["vram" + i]: i <= hardware.cards ? hardware.vram : 0,
        ["bw" + i]: hardware.bw,
        ["tf" + i]: hardware.tf,
        ["reserve" + i]: i <= hardware.cards ? hardware.reserve : 0,
      });
      next.pcie[i - 1] = {
        generation: "4.0",
        lanes: hardware.cards > 1 ? 8 : 16,
      };
    }
    Object.assign(next.values, {
      ramGB: hardware.ram,
      ramBw: hardware.ramBw,
      cpuTf: hardware.cpuTf,
    });
    next.transfer = "host";
    return engine.parseConfig(JSON.stringify(next));
  }

  function contextSweep(
    config,
    cache,
    contexts = [2048, 4096, 8192, 16384, 32768, 65536, 131072],
  ) {
    const next = engine.parseConfig(engine.serializeConfig(config));
    return contexts.map((tokens) => {
      const kv = kvCache({ ...cache, layers: next.values.layers, tokens });
      next.values.kvGB = kv.gb;
      next.values.kvReadGB = kv.gb;
      if (kv.gb > engine.FIELDS.kvGB.max)
        return {
          tokens,
          cacheGB: kv.gb,
          storedGB: next.values.totalB * next.values.bytesParam + kv.gb,
          tps: null,
          status: "OUTSIDE INPUT RANGE",
        };
      const result = engine.estimate(next);
      return {
        tokens,
        cacheGB: kv.gb,
        storedGB: result.storedGB,
        tps: result.tps,
        status: result.status,
      };
    });
  }

  function memoryBudget(config, result = engine.estimate(config)) {
    const v = config.values;
    return result.devices.map((device) => {
      const assigned =
        result.optimal?.used.find((item) => item.name === device.name)
          ?.assigned || 0;
      const weightsGB = (result.weightGB * assigned) / v.layers;
      const cacheGB = (v.kvGB * assigned) / v.layers;
      return {
        name: device.name,
        color: device.color,
        layers: assigned,
        weightsGB,
        cacheGB,
        usedGB: weightsGB + cacheGB,
        availableGB: device.availableGB,
        freeGB: Math.max(0, device.availableGB - weightsGB - cacheGB),
        cap: device.cap,
      };
    });
  }

  function report(config) {
    const canonical = engine.parseConfig(engine.serializeConfig(config));
    const result = engine.estimate(canonical);
    const v = canonical.values;
    const lines = [
      "# LLM Calculator — configuration report",
      "",
      "https://llm-calculator.piotrzmudadev.com/",
      "",
      "Single-session decode estimate; not a measured benchmark.",
      "",
      `- Placement: ${result.status}`,
      `- Decode: ${result.tps === null ? "unavailable" : result.tps.toFixed(2) + " tokens/s"}`,
      `- Latency: ${result.optimal ? (result.optimal.total * 1000).toFixed(2) + " ms/token" : "unavailable"}`,
      `- Weights: ${result.weightGB.toFixed(3)} GB`,
      `- KV storage: ${v.kvGB.toFixed(3)} GB`,
      `- Effective KV reads: ${v.kvReadGB.toFixed(3)} GB/token`,
      `- Total model + cache: ${result.storedGB.toFixed(3)} GB`,
      "",
      "## Memory placement",
      "",
      "| Device | Layers | Weights GB | Cache GB | Usable GB | Free GB |",
      "| --- | ---: | ---: | ---: | ---: | ---: |",
    ];
    for (const row of memoryBudget(canonical, result))
      lines.push(
        `| ${row.name} | ${row.layers} | ${row.weightsGB.toFixed(3)} | ${row.cacheGB.toFixed(3)} | ${row.availableGB.toFixed(3)} | ${row.freeGB.toFixed(3)} |`,
      );
    lines.push(
      "",
      "## Assumptions",
      "",
      "Decimal GB; uniform contiguous layer blocks; sequential decode; user-entered effective compute and bandwidth. Runtime buffers belong in VRAM reservations. No prefill, tensor-parallel collectives, batched throughput or measured performance is modeled. Zero assigned layers means a device is unused or the configuration is infeasible.",
      "",
      "## Reproducible inputs (schema v1)",
      "",
      "```json",
      JSON.stringify(canonical, null, 2),
      "```",
      "",
    );
    return lines.join("\n");
  }

  return Object.freeze({
    MODELS,
    QUANTIZATIONS,
    HARDWARE,
    kvCache,
    applyModel,
    applyHardware,
    contextSweep,
    memoryBudget,
    report,
  });
});
