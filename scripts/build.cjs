const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
// Explicit allowlist: credentials, dependencies, tests and repository metadata never become assets.
const files = [
  "index.html",
  "404.html",
  "robots.txt",
  "sitemap.xml",
  "_headers",
  "_redirects",
  "src/engine.js",
  "src/planner.js",
  "src/app.js",
  "src/workbench.js",
  "src/styles.css",
  "src/site.css",
  "assets/favicon.svg",
  "docs/METHODOLOGY.md",
  "README.md",
  "LICENSE",
];
(async () => {
  await fs.rm(output, { recursive: true, force: true });
  for (const name of files) {
    await fs.mkdir(path.dirname(path.join(output, name)), { recursive: true });
    await fs.copyFile(path.join(root, name), path.join(output, name));
  }
  console.log(`Built ${files.length} public assets in dist/.`);
})();
