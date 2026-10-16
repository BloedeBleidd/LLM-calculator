const { test } = require("node:test");
const assert = require("node:assert/strict");
const e = require("../src/engine.js");

function config(overrides = {}) {
  const c = e.createDefaultConfig();
  c.mode = "dense";
  Object.assign(
    c.values,
    {
      totalB: 1,
      bytesParam: 1,
      kvGB: 0,
      kvReadGB: 0,
      layers: 2,
      ramGB: 0,
      actMB: 0,
      vram1: 2,
      bw1: 100,
      tf1: 1,
      reserve1: 0,
      vram2: 0,
      vram3: 0,
      vram4: 0,
    },
    overrides,
  );
  return c;
}
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

test("dense memory-bound decode has a hand-calculated latency and throughput", () => {
  const result = e.estimate(config());
  close(result.optimal.total, 0.01);
  close(result.tps, 100);
  assert.equal(result.status, "FULLY IN VRAM");
  assert.equal(result.optimal.used[0].assigned, 2);
});

test("compute-bound decode uses FLOPs rather than summing both roofline bounds", () => {
  const result = e.estimate(config({ bw1: 40000 }));
  close(result.optimal.total, 0.002);
  close(result.tps, 500);
});

test("MoE storage depends on total parameters, reads and compute on active parameters", () => {
  const c = config({
    totalB: 100,
    activeB: 10,
    bytesParam: 0.5,
    kvGB: 10,
    kvReadGB: 4,
    layers: 4,
    vram1: 60,
    bw1: 100,
    tf1: 10,
  });
  c.mode = "moe";
  const result = e.estimate(c);
  assert.equal(result.storedGB, 60);
  assert.equal(result.activeReadGB, 9);
  close(result.optimal.total, 0.09);
  const changed = structuredClone(c);
  changed.values.kvReadGB = 20; // Cache rereads may exceed the stored volume.
  assert.equal(e.estimate(changed).storedGB, 60);
  assert.ok(e.estimate(changed).tps < result.tps);
});

test("activation MB converts to decimal GB and host staging includes both RAM operations", () => {
  const c = config({
    layers: 2,
    vram1: 0.5,
    vram2: 0.5,
    bw2: 100,
    tf2: 1,
    actMB: 100,
    ramBw: 50,
  });
  c.pcie[0] = { generation: "4.0", lanes: 4 };
  c.pcie[1] = { generation: "4.0", lanes: 4 };
  const direct = e.estimate(c);
  close(direct.activationGB, 0.1);
  close(direct.transferSeconds, 0.1 / (1.969 * 4));
  close(direct.optimal.total, 0.01 + 0.1 / (1.969 * 4));
  c.transfer = "host";
  close(
    e.estimate(c).transferSeconds,
    (2 * 0.1) / (1.969 * 4) + (2 * 0.1) / 50,
  );
});

test("CPU placement respects usable RAM, including zero to disable offload", () => {
  const c = config({ totalB: 10, vram1: 0, ramGB: 5 });
  assert.equal(e.estimate(c).feasible, false);
  assert.equal(e.estimate(c).tps, null);
  assert.equal(e.estimate(c).status, "DOES NOT FIT");
  c.values.ramGB = 10;
  const result = e.estimate(c);
  assert.equal(result.optimal.used.length, 1);
  assert.equal(result.optimal.used[0].kind, "cpu");
  close(result.tps, 60 / 10);
  c.values.ramGB = 0;
  assert.equal(e.estimate(c).feasible, false);
});

test("each GPU reservation changes capacity and fractional layers cannot be placed", () => {
  const c = config({ totalB: 2, layers: 2, vram1: 1, vram2: 1, reserve2: 0.1 });
  assert.equal(e.estimate(c).feasible, false);
  c.values.reserve2 = 0;
  assert.equal(e.estimate(c).feasible, true);
  c.values.layers = 1;
  assert.equal(e.estimate(c).feasible, false);
});

test("roundoff does not drop an exactly fitting layer or admit materially insufficient memory", () => {
  assert.equal(e.layerCapacity(0.3, 0.1, 3), 3);
  assert.equal(e.layerCapacity(0.3 - 1e-9, 0.1, 3), 2);
});

test("baseline considers enabled cards even when GPU 1 is disabled", () => {
  const c = config({ vram1: 0, vram2: 2, bw2: 200, tf2: 10 });
  const result = e.estimate(c);
  assert.equal(result.baseline.used[0].name, "GPU 2");
  close(result.baselineTps, 200);
  c.values.vram2 = 0.5;
  c.values.vram3 = 0.5;
  assert.equal(e.estimate(c).baseline, null);
  assert.equal(e.estimate(c).feasible, true);
});

test("configurations round-trip without changing effective input or results", () => {
  const c = e.createDefaultConfig();
  const parsed = e.parseConfig(e.serializeConfig(c));
  assert.deepEqual(parsed, c);
  assert.deepEqual(e.estimate(parsed), e.estimate(c));
  parsed.values.totalB = 1;
  assert.equal(c.values.totalB, 122);
});

test("invalid fields, silent coercion, unsupported versions and unsafe imports are rejected", () => {
  for (const value of [NaN, Infinity, "", "100", -1, 10001]) {
    const c = config({ totalB: value });
    assert.ok(e.validateConfig(c).some((error) => error.field === "totalB"));
    assert.throws(() => e.estimate(c));
  }
  const fractional = config({ layers: 1.5 });
  assert.ok(e.validateConfig(fractional).length);
  const moe = config({ activeB: 2 });
  moe.mode = "moe";
  assert.ok(e.validateConfig(moe).some((error) => error.field === "activeB"));
  for (const input of ["null", "[]", "{}", "{broken", "x".repeat(65537)])
    assert.throws(() => e.parseConfig(input));
  const c = config();
  c.pcie[0].lanes = 3;
  assert.throws(() => e.parseConfig(JSON.stringify(c)));
  c.pcie[0].lanes = 4;
  c.version = 2;
  assert.throws(() => e.parseConfig(JSON.stringify(c)));
  c.version = 1;
  const poisoned = JSON.stringify(c).replace(
    '"version":1',
    '"__proto__":{"polluted":true},"version":1',
  );
  assert.throws(() => e.parseConfig(poisoned));
  assert.equal({}.polluted, undefined);
});

// Independent oracle: enumerate every layer allocation (including unused devices),
// then every order. This checks the production greedy/subset optimizer's result.
function bruteForce(devices, layers, activationGB, ramBW, mode) {
  let best = Infinity;
  function enumerate(index, remaining, selected) {
    if (index === devices.length) {
      if (remaining !== 0) return;
      function order(prefix, rest) {
        if (!rest.length) {
          let total = prefix.reduce(
            (sum, d) => sum + d.assigned * d.perLayer,
            0,
          );
          for (let i = 1; i < prefix.length; i++) {
            const a = prefix[i - 1],
              b = prefix[i];
            if (a.kind === "gpu" && b.kind === "gpu") {
              total +=
                mode === "p2p"
                  ? activationGB / Math.min(a.pcie, b.pcie)
                  : activationGB / a.pcie +
                    activationGB / b.pcie +
                    (2 * activationGB) / ramBW;
            } else {
              total +=
                activationGB / (a.kind === "gpu" ? a.pcie : b.pcie) +
                activationGB / ramBW;
            }
          }
          best = Math.min(best, total);
          return;
        }
        rest.forEach((device, i) =>
          order(
            [...prefix, device],
            rest.filter((_, j) => i !== j),
          ),
        );
      }
      order([], selected);
      return;
    }
    const device = devices[index];
    for (let count = 0; count <= Math.min(device.cap, remaining); count++) {
      enumerate(
        index + 1,
        remaining - count,
        count ? [...selected, { ...device, assigned: count }] : selected,
      );
    }
  }
  enumerate(0, layers, []);
  return best;
}

test("optimizer agrees with exhaustive allocations and orders across heterogeneous small systems", () => {
  for (let seed = 1; seed <= 80; seed++) {
    const devices = [
      {
        name: "A",
        kind: "gpu",
        cap: seed % 4,
        perLayer: 0.01 * (1 + (seed % 3)),
        pcie: 2 + (seed % 5),
      },
      {
        name: "B",
        kind: "gpu",
        cap: (seed + 1) % 5,
        perLayer: 0.007 * (1 + (seed % 4)),
        pcie: 3 + (seed % 7),
      },
      {
        name: "C",
        kind: "cpu",
        cap: (seed + 2) % 4,
        perLayer: 0.03 * (1 + (seed % 2)),
        pcie: 0,
      },
    ];
    const layers = 1 + (seed % 6);
    const activation = 0.02 * (seed % 4);
    for (const mode of ["p2p", "host"]) {
      const expected = bruteForce(devices, layers, activation, 20, mode);
      const actual = e.bestSplit(devices, layers, activation, 20, mode);
      if (expected === Infinity) assert.equal(actual, null);
      else {
        close(actual.total, expected);
        assert.equal(
          actual.used.reduce((sum, d) => sum + d.assigned, 0),
          layers,
        );
        assert.ok(
          actual.used.every((d) => d.assigned > 0 && d.assigned <= d.cap),
        );
      }
    }
  }
});

test("CPU can be selected for speed without reporting a false VRAM shortage", () => {
  const c = config({ bw1: 1, ramGB: 2, ramBw: 100, cpuTf: 10 });
  const result = e.estimate(c);
  assert.equal(result.status, "CPU SELECTED");
  assert.equal(result.optimal.used[0].kind, "cpu");
  close(result.tps, 100);
});
