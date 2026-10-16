const { test, expect } = require("@playwright/test");

test("model and machine presets work independently with accurate cache and memory totals", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator("#presets > summary").click();
  await page
    .getByLabel("Model architecture", { exact: true })
    .selectOption("llama31-8b");
  await page.getByLabel("Weight storage", { exact: true }).selectOption("q4");
  await page
    .getByRole("button", { name: "Apply model preset", exact: true })
    .click();
  await expect(page.locator("#num-totalB")).toHaveValue("8");
  await expect(page.locator("#num-layers")).toHaveValue("32");
  await expect(page.locator("#num-bytesParam")).toHaveValue("0.55");
  await expect(page.locator("#num-kvGB")).toHaveValue("1.073741824");
  await expect(page.locator("#num-vram2")).toHaveValue("24");
  await expect(page.locator("#memoryWeights")).toHaveText("4.40 GB");
  await expect(page.locator("#memoryCache")).toHaveText("1.07 GB");
  await page
    .getByLabel("Hardware profile", { exact: true })
    .selectOption("single24");
  await page
    .getByRole("button", { name: "Apply hardware profile", exact: true })
    .click();
  await expect(page.locator("#num-vram2")).toHaveValue("0");
  await expect(page.locator("#num-totalB")).toHaveValue("8");
  await expect(page.locator("#memoryGpu")).toHaveText("22.50 GB");
  await expect(page.locator("#memoryReserved")).toHaveText("1.50 GB");
  await expect(page.locator("#contextRows tr")).toHaveCount(7);
  expect(errors).toEqual([]);
});

test("KV planner previews changes, rejects invalid architecture and explicitly applies inputs", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#num-layers").fill("32");
  await expect(page.locator("#cacheGB")).toHaveText("1.07 GB");
  await expect(page.locator("#num-kvGB")).toHaveValue("14");
  await page.getByLabel("Context tokens", { exact: true }).fill("16384");
  await expect(page.locator("#cacheGB")).toHaveText("2.15 GB");
  await page
    .getByRole("button", { name: "Apply cache to calculator", exact: true })
    .click();
  await expect(page.locator("#num-kvGB")).toHaveValue("2.147483648");
  await expect(page.locator("#num-kvReadGB")).toHaveValue("2.147483648");
  await page.getByLabel("KV heads", { exact: true }).fill("0");
  await expect(page.locator("#cacheGB")).toHaveText("—");
  await expect(page.locator("#applyCache")).toBeDisabled();
  await expect(page.locator("#contextRows tr")).toHaveCount(0);
  await expect(page.locator("#cacheNotice")).toContainText("whole number");
  await expect(page.locator("#num-kvGB")).toHaveValue("2.147483648");
  await page.getByLabel("KV heads", { exact: true }).fill("8");
  await page.getByLabel("KV precision", { exact: true }).selectOption("0.5");
  await expect(page.locator("#cacheGB")).toHaveText("0.54 GB");
  await page.locator("#num-layers").fill("");
  await expect(page.locator("#memoryWeights")).toHaveText("—");
  await expect(page.locator("#exportReport")).toBeDisabled();
});

test("a downloadable report captures the current settings, including infeasible configurations", async ({
  page,
}) => {
  await page.goto("/");
  for (let i = 1; i <= 4; i++) await page.locator("#num-vram" + i).fill("0");
  await page.locator("#num-ramGB").fill("0");
  await expect(page.locator("#memorySummary")).toContainText(
    "No placement exists",
  );
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download report", exact: true })
    .click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("llm-configuration-report.md");
  const chunks = [];
  for await (const chunk of await download.createReadStream())
    chunks.push(chunk);
  const report = Buffer.concat(chunks).toString();
  expect(report).toContain("Placement: DOES NOT FIT");
  expect(report).toContain('"ramGB": 0');
  expect(report).toContain("https://llm-calculator.piotrzmudadev.com/");
});

test("Cloudflare serves the canonical site, headers, a real 404, redirects and only public assets", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toContain(
    "script-src 'self'",
  );
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://llm-calculator.piotrzmudadev.com/",
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "LLM hardware calculator",
  );
  const redirect = await request.get("/LLM-calculator/", { maxRedirects: 0 });
  expect(redirect.status()).toBe(301);
  expect(redirect.headers().location).toBe("/");
  for (const route of [
    "/missing-page",
    "/.env.cloudflare",
    "/package.json",
    "/.git/config",
    "/tests/engine.test.cjs",
  ]) {
    const missing = await request.get(route);
    expect(missing.status()).toBe(404);
    expect(await missing.text()).toContain("That page is missing");
  }
  expect(errors).toEqual([]);
});

test("the complete workbench fits narrow screens and its sections stay keyboard reachable", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("link", { name: "Context planner", exact: true })
    .click();
  await expect(page.locator("#plannerTitle")).toBeInViewport();
  await page.getByLabel("Context tokens", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("KV precision", { exact: true })).toBeFocused();
});
