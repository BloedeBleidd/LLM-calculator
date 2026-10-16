# Cloudflare deployment

Production: **https://llm-calculator.piotrzmudadev.com/**. Source: the public [GitHub repository](https://github.com/BloedeBleidd/LLM-calculator). The application is a separate `llm-calculator` Cloudflare Worker serving static assets; it does not depend on GitHub Pages or the portfolio Worker.

## Verify and publish

```sh
npm ci --ignore-scripts
npm test
npm run format:check
npm run build
npx playwright install chromium
npm run test:browser
npm run deploy:built
```

`npm run build` copies an explicit allowlist of public files into `dist/`. It never copies repository metadata, credentials, dependencies, scripts or tests. Local browser tests run those built assets through Wrangler at `127.0.0.1:8795`; `npm run preview` starts the same preview manually. `npm run dev` is a lightweight source server for editing, and opening `index.html` directly remains supported.

Wrangler reads the account, Worker name, custom subdomain and static asset behavior from `wrangler.jsonc`. Custom Domains manage DNS and certificates for the selected hostname. Neither `workers.dev` nor preview URLs are enabled. Keep all other applications, apex routes and domain records unchanged.

Supply `CLOUDFLARE_API_TOKEN` in the deployment environment or an ignored `.env.cloudflare` file. The helper loads it only after the build and passes it to Wrangler. Never place secrets in `dist/`, browser scripts, Git, workflow logs or command arguments. The token must have the appropriate Workers and zone permissions. GitHub Actions runs checks without a deployment credential; publishing uses the explicit deployment command.

## Routing and rollback

The root is canonical. Former `/LLM-calculator/` paths on this hostname redirect to `/`. Missing paths return the authored 404 page with status 404. Static assets revalidate on request; the CSP permits only local scripts, so there are no CDN or third-party runtime dependencies. URL-fragment configurations stay in the browser.

Record the Worker version emitted by each successful deploy. Restore a previous version through Cloudflare deployment history if needed. Repository visibility and site hosting are independent: changing source visibility does not move or publish the running application. The GitHub repository stays public; GitHub Pages is not the production viewer.
