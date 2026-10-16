const { test, expect } = require("@playwright/test");

test("the first screen prioritizes an editable custom model and the actual token chain", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 740 });
    await expect(page.locator("#num-totalB")).toBeInViewport();
  }
  await page.getByRole("link", { name: "Model", exact: true }).click();
  await expect(page.locator("#num-totalB")).toBeInViewport();
  await expect(page.locator("#presets")).not.toHaveAttribute("open");
  await expect(page.locator("#modelPreset")).toHaveValue("custom");
  await expect(page.locator("#quantPreset")).toHaveValue("custom");
  await expect(page.locator("#hardwarePreset")).toHaveValue("custom");
  await page.locator("#num-totalB").fill("85.37");
  await page.locator("#num-activeB").fill("9.123");
  await page.locator("#num-bytesParam").fill("0.49321");
  await page.locator("#num-layers").fill("57");
  await expect(page.locator("#num-bytesParam")).toHaveValue("0.49321");
  await expect(page.locator("#range-bytesParam")).toHaveValue("0.49321");
  await expect(page.locator("#flowSummary")).toContainText("57 layers");
  await expect(page.locator("#calculationNotice")).toBeHidden();
  await expect(page.locator("#configurationMode")).toHaveText("Custom setup");
});

test("a preset stays editable and selecting Custom never overwrites the current values", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#presets > summary").click();
  await page
    .getByLabel("Model architecture", { exact: true })
    .selectOption("llama31-8b");
  await page
    .getByRole("button", { name: "Apply model preset", exact: true })
    .click();
  await expect(page.locator("#num-bytesParam")).toHaveValue("0.375");
  await page.locator("#num-totalB").fill("");
  await expect(page.locator("#modelPreset")).toHaveValue("custom");
  await expect(page.locator("#applyModel")).toBeDisabled();
  await page.locator("#num-totalB").fill("13.37");
  await expect(page.locator("#modelPreset")).toHaveValue("custom");
  await page
    .getByLabel("Hardware profile", { exact: true })
    .selectOption("dual24");
  await page
    .getByRole("button", { name: "Apply hardware profile", exact: true })
    .click();
  await page.locator("#num-vram1").fill("27.25");
  await page.locator("#num-vram2").fill("18.75");
  await page.locator("#num-bw2").fill("432.125");
  await page.locator("#gen2").selectOption("3.0");
  await page.locator("#lane2").selectOption("4");
  await expect(page.locator("#hardwarePreset")).toHaveValue("custom");
  await page
    .getByLabel("Hardware profile", { exact: true })
    .selectOption("single48");
  await page
    .getByLabel("Hardware profile", { exact: true })
    .selectOption("custom");
  await expect(page.locator("#num-vram1")).toHaveValue("27.25");
  await expect(page.locator("#num-vram2")).toHaveValue("18.75");
  await expect(page.locator("#num-bw2")).toHaveValue("432.125");
  await expect(page.locator("#num-totalB")).toHaveValue("13.37");
});

test("the layer map and step controls show exact ordering, transfers and elapsed time", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Token flow", exact: true }).click();
  await expect(page.locator("#layerMap")).toHaveAttribute(
    "aria-label",
    "GPU 1: layers 1 to 18; GPU 2: layers 19 to 37; GPU 3: layers 38 to 48",
  );
  await expect(page.locator("#visuals .compute-phase")).toHaveCount(3);
  await expect(page.locator("#visuals .transfer-phase")).toHaveCount(2);
  await expect(page.locator("#stepPosition")).toContainText("Step 1 / 5");
  await expect(
    page.getByRole("button", { name: "Previous token step" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next token step" }).click();
  await expect(page.locator("#stepDetail")).toContainText(
    "16.00 MB of activations passes from GPU 1 to GPU 2",
  );
  await expect(page.locator("#stepDetail")).toContainText("Direct P2P");
  await expect(page.locator("#stepDetail")).toContainText("Elapsed:");
  await page.locator('[data-token-step="4"]').click();
  await expect(page.locator("#stepPosition")).toContainText("Step 5 / 5");
  await expect(page.locator("#stepDetail")).toContainText("layers 38–48");
  await expect(
    page.getByRole("button", { name: "Next token step" }),
  ).toBeDisabled();
  await page.locator('label[for="host"]').click();
  await expect(page.locator("#visuals .transfer-phase").first()).toContainText(
    "Via host RAM",
  );
  await page.locator("#num-vram2").fill("0");
  await page.locator("#num-vram3").fill("0");
  await expect(page.locator("#visuals")).toContainText("CPU / RAM");
  await page.locator("#num-ramGB").fill("0");
  await expect(page.locator("#visuals")).toHaveText("DOES NOT FIT");
  await expect(
    page.getByRole("button", { name: "Next token step" }),
  ).toBeDisabled();
});

test("a completely custom setup can be saved, restored and exported without using any preset", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#num-totalB").fill("73.125");
  await page.locator("#num-activeB").fill("8.75");
  await page.locator("#num-bytesParam").fill("0.4375");
  await page.locator("#num-vram1").fill("29.5");
  await page
    .getByRole("link", { name: "Save your setup", exact: true })
    .click();
  await expect(page.getByLabel("Scenario name")).toBeFocused();
  await page.getByLabel("Scenario name").fill("My own model and GPUs");
  await page.getByRole("button", { name: "Save current", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset defaults", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Load My own model and GPUs", exact: true })
    .click();
  await expect(page.locator("#num-totalB")).toHaveValue("73.125");
  await expect(page.locator("#num-vram1")).toHaveValue("29.5");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const chunks = [];
  for await (const chunk of await (await pending).createReadStream())
    chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString()).values.bytesParam).toBe(
    0.4375,
  );
});
