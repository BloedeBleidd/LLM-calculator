/* Shared by the static page and Node tests; no runtime dependencies or build step. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LLMEngine = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const PCIe_GBPS = Object.freeze({
    "3.0": 0.985,
    "4.0": 1.969,
    "5.0": 3.938,
    "6.0": 7.563,
  });
  const LANES = Object.freeze([1, 2, 4, 8, 16]);
  const COLORS = ["blue", "green", "purple", "orange"];
  const FIELDS = {
    totalB: {
      label: "Total Parameters (B)",
      min: 0.001,
      max: 10000,
      step: 0.001,
      val: 122,
    },
    activeB: {
      label: "Active Parameters / Token (B)",
      min: 0.001,
      max: 10000,
      step: 0.001,
      val: 10,
    },
    bytesParam: {
      label: "Bytes per Parameter",
      min: 0.001,
      max: 8,
      step: 0.001,
      val: 0.375,
    },
    kvGB: {
      label: "KV Cache Storage (GB)",
      min: 0,
      max: 4096,
      step: 0.001,
      val: 14,
    },
    kvReadGB: {
      label: "KV Cache Read / Token (GB)",
      min: 0,
      max: 4096,
      step: 0.001,
      val: 14,
    },
    layers: {
      label: "Number of Layers",
      min: 1,
      max: 1024,
      step: 1,
      val: 48,
      integer: true,
    },
    flopParam: {
      label: "FLOPs per Active Parameter",
      min: 0.1,
      max: 100,
      step: 0.1,
      val: 2,
    },
    ramGB: {
      label: "Usable RAM for CPU Layers (GB)",
      min: 0,
      max: 16384,
      step: 0.1,
      val: 64,
    },
    cpuTf: {
      label: "CPU Effective TFLOPS",
      min: 0.1,
      max: 1000,
      step: 0.1,
      val: 4,
    },
    ramBw: {
      label: "RAM Bandwidth (GB/s)",
      min: 1,
      max: 10000,
      step: 1,
      val: 60,
    },
    actMB: {
      label: "Activation Transfer (MB/token)",
      min: 0,
      max: 16384,
      step: 0.1,
      val: 16,
    },
  };
  for (let i = 1; i <= 4; i++) {
    FIELDS["vram" + i] = {
      label: `GPU ${i} VRAM (GB)`,
      min: 0,
      max: 2048,
      step: 0.1,
      val: [24, 24, 16, 0][i - 1],
    };
    FIELDS["bw" + i] = {
      label: `GPU ${i} Memory Bandwidth (GB/s)`,
      min: 1,
      max: 40000,
      step: 1,
      val: [936, 936, 360, 360][i - 1],
    };
    FIELDS["tf" + i] = {
      label: `GPU ${i} Effective Compute (TFLOPS)`,
      min: 0.1,
      max: 10000,
      step: 0.1,
      val: [82.6, 82.6, 25, 25][i - 1],
    };
    FIELDS["reserve" + i] = {
      label: `GPU ${i} Reserved VRAM (GB)`,
      min: 0,
      max: 2048,
      step: 0.1,
      val: i === 1 ? 0.5 : 0,
    };
  }
  const SLIDER_MAX = {
    totalB: 500,
    activeB: 200,
    bytesParam: 2.5,
    kvGB: 80,
    kvReadGB: 80,
    layers: 160,
    flopParam: 8,
    ramGB: 512,
    cpuTf: 20,
    ramBw: 300,
    actMB: 512,
  };
  for (const [key, definition] of Object.entries(FIELDS)) {
    definition.sliderMax =
      SLIDER_MAX[key] ||
      (key.startsWith("vram")
        ? 192
        : key.startsWith("reserve")
          ? 16
          : key.startsWith("bw")
            ? 4000
            : 300);
  }
  for (const definition of Object.values(FIELDS)) Object.freeze(definition);
  Object.freeze(FIELDS);

  function createDefaultConfig() {
    return {
      version: VERSION,
      mode: "moe",
      transfer: "p2p",
      values: Object.fromEntries(
        Object.entries(FIELDS).map(([key, def]) => [key, def.val]),
      ),
      pcie: [
        { generation: "5.0", lanes: 8 },
        { generation: "5.0", lanes: 8 },
        { generation: "5.0", lanes: 4 },
        { generation: "4.0", lanes: 16 },
      ],
    };
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function exactKeys(value, expected) {
    return (
      isRecord(value) &&
      Object.keys(value).length === expected.length &&
      expected.every((key) => Object.hasOwn(value, key))
    );
  }

  function validateConfig(config) {
    const errors = [];
    const error = (field, message) => errors.push({ field, message });
    if (!exactKeys(config, ["version", "mode", "transfer", "values", "pcie"])) {
      error(
        "configuration",
        "Configuration fields are missing or unsupported.",
      );
      return errors;
    }
    if (config.version !== VERSION)
      error("version", "Unsupported configuration version.");
    if (!["dense", "moe"].includes(config.mode))
      error("mode", "Choose Dense or MoE.");
    if (!["p2p", "host"].includes(config.transfer))
      error("transfer", "Choose a supported transfer mode.");
    if (!exactKeys(config.values, Object.keys(FIELDS))) {
      error(
        "values",
        "Numeric configuration fields are missing or unsupported.",
      );
      return errors;
    }
    for (const [key, definition] of Object.entries(FIELDS)) {
      const value = config.values[key];
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < definition.min ||
        value > definition.max
      ) {
        error(
          key,
          `${definition.label}: enter a number from ${definition.min} to ${definition.max}.`,
        );
      } else if (definition.integer && !Number.isInteger(value)) {
        error(key, `${definition.label}: enter a whole number.`);
      }
    }
    const v = config.values;
    if (config.mode === "moe" && v.activeB > v.totalB) {
      error(
        "activeB",
        "Active parameters cannot exceed total parameters in MoE mode.",
      );
    }
    for (let i = 1; i <= 4; i++) {
      if (v["vram" + i] > 0 && v["reserve" + i] > v["vram" + i]) {
        error(
          "reserve" + i,
          `GPU ${i}: reserved VRAM cannot exceed installed VRAM.`,
        );
      }
    }
    if (!Array.isArray(config.pcie) || config.pcie.length !== 4) {
      error("pcie", "Configure the PCIe link for each of the four GPU slots.");
    } else {
      config.pcie.forEach((link, index) => {
        if (
          !exactKeys(link, ["generation", "lanes"]) ||
          !Object.hasOwn(PCIe_GBPS, link.generation) ||
          !LANES.includes(link.lanes)
        ) {
          error(
            "pcie" + (index + 1),
            `GPU ${index + 1}: unsupported PCIe generation or lane count.`,
          );
        }
      });
    }
    return errors;
  }

  function parseConfig(input) {
    if (typeof input !== "string" || input.length > 65536)
      throw new Error("Configuration must be a JSON file smaller than 64 KiB.");
    let config;
    try {
      config = JSON.parse(input);
    } catch {
      throw new Error("Configuration is not valid JSON.");
    }
    const errors = validateConfig(config);
    if (errors.length) throw new Error(errors[0].message);
    // Reconstruct only schema fields, in a stable order. Never merge imported objects.
    return {
      version: VERSION,
      mode: config.mode,
      transfer: config.transfer,
      values: Object.fromEntries(
        Object.keys(FIELDS).map((key) => [key, config.values[key]]),
      ),
      pcie: config.pcie.map((link) => ({
        generation: link.generation,
        lanes: link.lanes,
      })),
    };
  }

  function serializeConfig(config) {
    const errors = validateConfig(config);
    if (errors.length) throw new Error(errors[0].message);
    return JSON.stringify(parseConfig(JSON.stringify(config)));
  }

  function layerCapacity(availableGB, layerGB, layers) {
    if (availableGB <= 0) return 0;
    // Roundoff tolerance only: 0.3 / 0.1 must fit three layers, not two.
    const tolerance = 16 * Number.EPSILON * Math.max(availableGB, layerGB);
    return Math.min(layers, Math.floor((availableGB + tolerance) / layerGB));
  }

  function makeDevice(
    name,
    kind,
    cap,
    bw,
    tf,
    color,
    pcie,
    readGB,
    flops,
    availableGB,
  ) {
    const mem = readGB / bw;
    const cmp = flops / (tf * 1e12);
    return {
      name,
      kind,
      cap,
      bw,
      tf,
      color,
      pcie,
      availableGB,
      mem,
      cmp,
      perLayer: Math.max(mem, cmp),
    };
  }

  function transferTime(a, b, activationGB, ramBW, transferMode) {
    if (a.kind === "cpu" && b.kind === "cpu") return 0;
    if (a.kind === "gpu" && b.kind === "gpu") {
      return transferMode === "p2p"
        ? activationGB / Math.min(a.pcie, b.pcie)
        : activationGB / a.pcie +
            (2 * activationGB) / ramBW +
            activationGB / b.pcie;
    }
    const gpu = a.kind === "gpu" ? a : b;
    return activationGB / gpu.pcie + activationGB / ramBW;
  }

  function permutations(items) {
    if (items.length < 2) return [items];
    return items.flatMap((item, i) =>
      permutations(items.slice(0, i).concat(items.slice(i + 1))).map((rest) => [
        item,
        ...rest,
      ]),
    );
  }

  function assignLayers(devices, layers) {
    if (
      devices.length > layers ||
      devices.some((d) => d.cap < 1) ||
      devices.reduce((sum, d) => sum + d.cap, 0) < layers
    )
      return null;
    const assigned = new Map(devices.map((d) => [d.name, 1]));
    let remaining = layers - devices.length;
    for (const device of [...devices].sort((a, b) => a.perLayer - b.perLayer)) {
      const extra = Math.min(remaining, device.cap - 1);
      assigned.set(device.name, assigned.get(device.name) + extra);
      remaining -= extra;
    }
    return assigned;
  }

  function bestSplit(devices, layers, activationGB, ramBW, transferMode) {
    devices = devices.filter((d) => d.cap > 0);
    let best = null;
    for (let mask = 1; mask < 2 ** devices.length; mask++) {
      const subset = devices.filter((_, i) => (mask >> i) & 1);
      const assigned = assignLayers(subset, layers);
      if (!assigned) continue;
      const blocks = subset.map((d) => ({
        ...d,
        assigned: assigned.get(d.name),
        time: assigned.get(d.name) * d.perLayer,
      }));
      for (const used of permutations(blocks)) {
        const links = used
          .slice(1)
          .map((device, i) =>
            transferTime(used[i], device, activationGB, ramBW, transferMode),
          );
        const total =
          used.reduce((sum, d) => sum + d.time, 0) +
          links.reduce((sum, time) => sum + time, 0);
        if (!best || total < best.total) best = { used, links, total };
      }
    }
    return best;
  }

  function estimate(config) {
    const errors = validateConfig(config);
    if (errors.length) throw new Error(errors[0].message);
    const v = config.values;
    const activeB = config.mode === "dense" ? v.totalB : v.activeB;
    const weightGB = v.totalB * v.bytesParam;
    const storedGB = weightGB + v.kvGB;
    const activeReadGB = activeB * v.bytesParam + v.kvReadGB;
    const storeLayer = storedGB / v.layers;
    const readLayer = activeReadGB / v.layers;
    const flopLayer = (activeB * 1e9 * v.flopParam) / v.layers;
    const activationGB = v.actMB / 1000; // All capacity and bandwidth units are decimal.
    const gpus = [];
    for (let i = 1; i <= 4; i++) {
      const available =
        v["vram" + i] > 0 ? v["vram" + i] - v["reserve" + i] : 0;
      if (available > 0) {
        const link = config.pcie[i - 1];
        gpus.push(
          makeDevice(
            `GPU ${i}`,
            "gpu",
            layerCapacity(available, storeLayer, v.layers),
            v["bw" + i],
            v["tf" + i],
            COLORS[i - 1],
            PCIe_GBPS[link.generation] * link.lanes,
            readLayer,
            flopLayer,
            available,
          ),
        );
      }
    }
    const cpu = makeDevice(
      "CPU / RAM",
      "cpu",
      layerCapacity(v.ramGB, storeLayer, v.layers),
      v.ramBw,
      v.cpuTf,
      "red",
      0,
      readLayer,
      flopLayer,
      v.ramGB,
    );
    const optimal = bestSplit(
      [...gpus, cpu],
      v.layers,
      activationGB,
      v.ramBw,
      config.transfer,
    );
    // A baseline can use any single enabled GPU, rather than silently assuming GPU 1.
    let baseline = bestSplit(
      [cpu],
      v.layers,
      activationGB,
      v.ramBw,
      config.transfer,
    );
    for (const gpu of gpus) {
      const candidate = bestSplit(
        [gpu, cpu],
        v.layers,
        activationGB,
        v.ramBw,
        config.transfer,
      );
      if (candidate && (!baseline || candidate.total < baseline.total))
        baseline = candidate;
    }
    const gpuCap = gpus.reduce((sum, d) => sum + d.cap, 0);
    const cpuUsed = optimal
      ? optimal.used.some((d) => d.kind === "cpu")
      : false;
    return {
      feasible: !!optimal,
      optimal,
      baseline,
      devices: [...gpus, cpu],
      storedGB,
      weightGB,
      activeReadGB,
      storeLayer,
      computeTflopPerToken: (activeB * v.flopParam) / 1000,
      activationGB,
      gpuCap,
      cpuCap: cpu.cap,
      availableGB: gpus.reduce((sum, d) => sum + d.availableGB, 0) + v.ramGB,
      tps: optimal ? 1 / optimal.total : null,
      baselineTps: baseline ? 1 / baseline.total : null,
      status: !optimal
        ? "DOES NOT FIT"
        : !cpuUsed
          ? "FULLY IN VRAM"
          : gpuCap >= v.layers
            ? "CPU SELECTED"
            : "CPU OFFLOAD",
      transferSeconds: optimal
        ? optimal.links.reduce((sum, t) => sum + t, 0)
        : null,
    };
  }

  return Object.freeze({
    VERSION,
    PCIe_GBPS,
    LANES,
    FIELDS,
    createDefaultConfig,
    validateConfig,
    parseConfig,
    serializeConfig,
    layerCapacity,
    transferTime,
    assignLayers,
    permutations,
    bestSplit,
    estimate,
  });
});
