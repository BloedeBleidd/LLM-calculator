const { test } = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../src/engine.js");
const planner = require("../src/planner.js");
const cache = { layers: 32, kvHeads: 8, headDim: 128, tokens: 8192, bytes: 2 };

test("KV cache matches a hand-calculated one GiB example and distinguishes GQA heads", () => {
  const result = planner.kvCache(cache);
  assert.equal(result.totalBytes, 1073741824);
  assert.equal(result.gb, 1.073741824);
  assert.equal(result.gib, 1);
  assert.equal(result.bytesPerToken, 131072);
  assert.equal(planner.kvCache({ ...cache, kvHeads: 32 }).gb, 4 * result.gb);
  assert.equal(planner.kvCache({ ...cache, bytes: 0.5 }).gb, result.gb / 4);
  assert.equal(planner.kvCache({ ...cache, tokens: 16384 }).gb, 2 * result.gb);
});

test("KV architecture rejects fractional, missing, infinite and out-of-range fields", () => {
  for (const [field, value] of [
    ["layers", NaN],
    ["kvHeads", 0],
    ["kvHeads", 1.5],
    ["headDim", Infinity],
    ["tokens", "8192"],
    ["tokens", 1048577],
    ["bytes", 0.75],
  ])
    assert.throws(() => planner.kvCache({ ...cache, [field]: value }));
});

test("model presets preserve hardware and produce version-one configurations without mutation", () => {
  const original = engine.createDefaultConfig();
  const before = JSON.stringify(original);
  const config = planner.applyModel(original, "llama31-70b", "q4", cache);
  assert.equal(JSON.stringify(original), before);
  assert.equal(config.version, 1);
  assert.equal(config.mode, "dense");
  assert.equal(config.values.layers, 80);
  assert.equal(config.values.totalB, 70);
  assert.equal(config.values.bytesParam, 0.55);
  assert.equal(config.values.kvGB, 2.68435456);
  assert.equal(config.values.kvReadGB, config.values.kvGB);
  assert.equal(config.values.vram1, original.values.vram1);
  assert.deepEqual(config.pcie, original.pcie);
  assert.deepEqual(engine.validateConfig(config), []);
  assert.throws(() => planner.applyModel(original, "unknown", "q4", cache));
});

test("hardware profiles replace all slots, reserve memory, and keep model inputs", () => {
  const original = engine.createDefaultConfig();
  const config = planner.applyHardware(original, "single24");
  assert.equal(config.values.vram1, 24);
  assert.equal(config.values.reserve1, 1.5);
  for (let i = 2; i <= 4; i++) {
    assert.equal(config.values["vram" + i], 0);
    assert.equal(config.values["reserve" + i], 0);
  }
  assert.equal(config.transfer, "host");
  assert.equal(config.values.kvGB, original.values.kvGB);
  assert.equal(config.values.totalB, original.values.totalB);
  assert.equal(original.values.vram2, 24);
  const cpu = planner.applyHardware(original, "cpu64");
  assert.equal(engine.estimate(cpu).optimal.used[0].kind, "cpu");
});

test("memory budgets conserve weight and cache bytes, including infeasible placements", () => {
  const config = engine.createDefaultConfig();
  const result = engine.estimate(config);
  const rows = planner.memoryBudget(config, result);
  const sum = (field) => rows.reduce((total, row) => total + row[field], 0);
  assert.equal(sum("layers"), config.values.layers);
  assert.ok(Math.abs(sum("weightsGB") - result.weightGB) < 1e-10);
  assert.ok(Math.abs(sum("cacheGB") - config.values.kvGB) < 1e-10);
  for (const row of rows) assert.ok(row.usedGB <= row.availableGB + 1e-10);
  config.values.ramGB = 0;
  for (let i = 1; i <= 4; i++) config.values["vram" + i] = 0;
  assert.equal(
    planner.memoryBudget(config).reduce((n, row) => n + row.layers, 0),
    0,
  );
});

test("context sweeps are independent what-if estimates and respect the cache input ceiling", () => {
  const config = planner.applyHardware(
    planner.applyModel(engine.createDefaultConfig(), "llama31-8b", "q4", cache),
    "single24",
  );
  const before = JSON.stringify(config);
  const rows = planner.contextSweep(config, cache);
  assert.equal(rows.length, 7);
  assert.equal(rows[2].cacheGB, 1.073741824);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].cacheGB > rows[i - 1].cacheGB);
    assert.ok(rows[i].tps <= rows[i - 1].tps);
  }
  assert.equal(JSON.stringify(config), before);
  const large = planner.contextSweep(
    config,
    { ...cache, kvHeads: 1024, headDim: 4096, bytes: 4 },
    [1048576],
  );
  assert.equal(large[0].status, "OUTSIDE INPUT RANGE");
  assert.equal(large[0].tps, null);
});

test("reports include actual results, memory placement, limits and a round-trippable JSON block", () => {
  const config = engine.createDefaultConfig();
  const report = planner.report(config);
  assert.match(report, /36\.44 tokens\/s/);
  assert.match(report, /not a measured benchmark/);
  assert.match(report, /GPU 1 \| 18/);
  assert.deepEqual(
    engine.parseConfig(report.split("```json\n")[1].split("\n```")[0]),
    config,
  );
  config.values.ramGB = 0;
  for (let i = 1; i <= 4; i++) config.values["vram" + i] = 0;
  assert.match(planner.report(config), /Placement: DOES NOT FIT/);
});

test("execution traces cover every layer once and conserve compute, transfer time and stored memory", () => {
  const config = engine.createDefaultConfig();
  const result = engine.estimate(config);
  const steps = planner.executionSteps(config, result);
  assert.deepEqual(
    steps.map((step) => step.kind),
    ["compute", "transfer", "compute", "transfer", "compute"],
  );
  const blocks = steps.filter((step) => step.kind === "compute");
  assert.deepEqual(
    blocks.map((step) => [step.device, step.firstLayer, step.lastLayer]),
    [
      ["GPU 1", 1, 18],
      ["GPU 2", 19, 37],
      ["GPU 3", 38, 48],
    ],
  );
  assert.ok(
    Math.abs(
      blocks.reduce((sum, step) => sum + step.weightsGB + step.cacheGB, 0) -
        result.storedGB,
    ) < 1e-10,
  );
  assert.equal(steps[0].start, 0);
  for (let i = 1; i < steps.length; i++)
    assert.equal(steps[i].start, steps[i - 1].end);
  assert.ok(Math.abs(steps.at(-1).end - result.optimal.total) < 1e-12);
  for (const step of steps.filter((step) => step.kind === "transfer")) {
    assert.equal(step.activationMB, 16);
    assert.equal(step.path, "Direct P2P");
  }
});

test("traces distinguish host staging and CPU offload, and do not invent an infeasible allocation", () => {
  const config = engine.createDefaultConfig();
  config.transfer = "host";
  assert.ok(
    planner.executionSteps(config).some((step) => step.path === "Via host RAM"),
  );
  config.values.vram2 = 0;
  config.values.vram3 = 0;
  const cpuTrace = planner.executionSteps(config);
  assert.ok(cpuTrace.some((step) => step.device === "CPU / RAM"));
  assert.ok(cpuTrace.some((step) => step.path === "GPU ↔ host RAM / CPU"));
  config.values.vram1 = 0;
  config.values.ramGB = 0;
  assert.deepEqual(planner.executionSteps(config), []);
});

test("architecture presets accept an arbitrary custom weight size without changing it", () => {
  const config = engine.createDefaultConfig();
  config.values.bytesParam = 0.49321;
  const next = planner.applyModel(config, "llama31-8b", "custom", cache);
  assert.equal(next.values.bytesParam, 0.49321);
  assert.equal(next.values.totalB, 8);
});
