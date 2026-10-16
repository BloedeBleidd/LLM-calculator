const { test, expect } = require("@playwright/test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

async function field(page, id, value) {
  await page.locator("#num-" + id).fill(String(value));
}

test("defaults are valid, sliders agree with numeric values, and the page works from a file URL", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#topTps")).toContainText(/\d+\.\d+ t\/s/);
  await expect(page.locator("#calculationNotice")).toBeHidden();
  const mismatches = await page
    .locator("input[type=number]")
    .evaluateAll((numbers) =>
      numbers
        .filter(
          (input) =>
            !input.validity.valid ||
            Number(input.value) !==
              Number(
                document.getElementById(input.id.replace("num-", "range-"))
                  .value,
              ),
        )
        .map((input) => input.id),
    );
  expect(mismatches).toEqual([]);
  await field(page, "bytesParam", 0.37525);
  await expect(page.locator("#range-bytesParam")).toHaveValue("0.37525");
  await field(page, "vram2", 384.123456);
  await expect(page.locator("#range-vram2")).toHaveValue("384.123456");
  expect(
    await page.locator("#num-vram2").evaluate((input) => input.validity.valid),
  ).toBe(true);

  await page.goto(
    pathToFileURL(path.resolve(__dirname, "../../index.html")).href,
  );
  await expect(page.locator("#topTps")).toContainText(/\d+\.\d+ t\/s/);
  expect(errors).toEqual([]);
});

test("invalid values stop calculations without silent coercion and recover when corrected", async ({
  page,
}) => {
  await page.goto("./");
  await field(page, "totalB", "");
  await expect(page.locator("#topTps")).toHaveText("—");
  await expect(page.locator("#num-totalB")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Share configuration" }),
  ).toBeDisabled();
  await field(page, "totalB", 1);
  await expect(page.locator("#calculationNotice")).toContainText(
    "Active parameters cannot exceed",
  );
  await field(page, "activeB", "");
  await page.locator("label[for=dense]").click();
  await expect(page.locator("#calculationNotice")).toBeHidden();
  await field(page, "layers", 1.5);
  await expect(page.locator("#calculationNotice")).toContainText(
    "whole number",
  );
  await field(page, "layers", 48);
  await expect(page.locator("#topTps")).toContainText("t/s");
  await field(page, "ramBw", -5);
  await expect(page.locator("#topTps")).toHaveText("—");
});

test("insufficient capacity is explicit and CPU-only inference respects usable RAM", async ({
  page,
}) => {
  await page.goto("./");
  for (let i = 1; i <= 4; i++) await field(page, "vram" + i, 0);
  await field(page, "ramGB", 0);
  await expect(page.locator("#topVram")).toHaveText("DOES NOT FIT");
  await expect(page.locator("#topTps")).toHaveText("—");
  await expect(page.locator("#calculationNotice")).toContainText(
    "complete layers",
  );
  await field(page, "ramGB", 128);
  await expect(page.locator("#topVram")).toHaveText("CPU OFFLOAD");
  await expect(page.locator("#topSplit")).toHaveText("CPU: 48");
  await expect(page.locator("#topTps")).toContainText(/\d+\.\d+ t\/s/);
});

test("export/import round-trips all inputs and invalid imports leave the current setup untouched", async ({
  page,
}) => {
  await page.goto("./");
  await field(page, "reserve2", 2);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadEvent;
  const chunks = [];
  for await (const chunk of await download.createReadStream())
    chunks.push(chunk);
  const json = Buffer.concat(chunks);
  expect(JSON.parse(json).values.reserve2).toBe(2);
  await field(page, "reserve2", 0);
  await page.locator("#configFile").setInputFiles({
    name: "config.json",
    mimeType: "application/json",
    buffer: json,
  });
  await expect(page.locator("#workspaceStatus")).toHaveText(
    "Configuration imported.",
  );
  await expect(page.locator("#num-reserve2")).toHaveValue("2");
  await page.locator("#configFile").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":999}'),
  });
  await expect(page.locator("#workspaceStatus")).toContainText("Import failed");
  await expect(page.locator("#num-reserve2")).toHaveValue("2");
  await page.locator("#configFile").setInputFiles({
    name: "large.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(65537, 32),
  });
  await expect(page.locator("#workspaceStatus")).toContainText("64 KiB");
});

test("shared configurations work in a fresh browser and editing clears the stale link", async ({
  page,
  browser,
}) => {
  await page.goto("./");
  await field(page, "actMB", 37);
  await page.getByRole("button", { name: "Share configuration" }).click();
  const url = await page
    .getByLabel("Configuration link", { exact: true })
    .inputValue();
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.locator("#num-actMB")).toHaveValue("37");
  await expect(other.locator("#topTps")).toHaveText(
    await page.locator("#topTps").textContent(),
  );
  await field(page, "actMB", 40);
  await expect(page).not.toHaveURL(/#config=/);
  await expect(
    page.getByLabel("Configuration link", { exact: true }),
  ).toBeHidden();
  await other.goto(url.split("#")[0] + "#config=%7Bbroken");
  await expect(other.locator("#workspaceStatus")).toContainText("invalid");
  await expect(other.locator("#num-actMB")).toHaveValue("37");
  await context.close();
});

test("saved scenarios restore complete inputs and persist across reload/reset, with literal names", async ({
  page,
}) => {
  await page.goto("./");
  const name = "<img src=x onerror=alert(1)>";
  await page.getByLabel("Scenario name").fill(name);
  await page.getByRole("button", { name: "Save current", exact: true }).click();
  await field(page, "ramGB", 16);
  await page.getByLabel("Scenario name").fill("Less RAM");
  await page.getByRole("button", { name: "Save current", exact: true }).click();
  await expect(page.locator("#scenarioRows tr")).toHaveCount(2);
  await expect(page.locator("#scenarioRows img")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#num-ramGB")).toHaveValue("16");
  await page.getByRole("button", { name: "Reset defaults" }).click();
  await expect(page.locator("#scenarioRows tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Load Less RAM", exact: true })
    .click();
  await expect(page.locator("#num-ramGB")).toHaveValue("16");
  await page
    .getByRole("button", { name: "Remove Less RAM", exact: true })
    .click();
  await expect(page.locator("#scenarioRows tr")).toHaveCount(1);
});

test("blocked browser storage does not prevent estimation or JSON export", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Denied", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Denied", "SecurityError");
    };
  });
  await page.goto("./");
  await expect(page.locator("#topTps")).toContainText("t/s");
  await field(page, "actMB", 30);
  await expect(page.locator("#workspaceStatus")).toContainText(
    "storage is unavailable",
  );
  await expect(page.getByRole("button", { name: "Export JSON" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("narrow layouts and the keyboard-operated guide remain usable with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("./");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  expect(await page.locator(".dashboard").evaluate((el) => el.inert)).toBe(
    true,
  );
  await page
    .getByRole("link", { name: "8. PCIe and P2P", exact: true })
    .click();
  await expect(page).not.toHaveURL(/#g-/);
  expect(
    await page
      .locator(".guide-panel")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Guide", exact: true }),
  ).toBeFocused();
  expect(await page.locator(".dashboard").evaluate((el) => el.inert)).toBe(
    false,
  );
});
