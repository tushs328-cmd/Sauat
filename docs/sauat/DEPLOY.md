# SAUAT static deployment

The static bundle is generated into `dist/`:

```bash
npm install
npm run build:static
```

The build copies the public shell, published content and a generated
`content/manifest.json`. Draft stories and test fixtures are not placed in the
manifest. Until a story is approved in both languages, the offline shell uses
the bundled test fixture as a safe fallback. The static bundle does not need
Node, Express or Ollama at runtime: hints use the local rules, progress and
events stay on the device, and the export button downloads JSON.

## Cloudflare Pages

1. Build locally with `npm run build:static` and check `dist/` with
   `npm run test:static`.
2. In Cloudflare Dashboard open **Workers & Pages → Create application → Pages
   → Upload assets**.
3. Upload the whole `dist/` directory. Do not upload the repository root or
   `content/` separately.
4. Open the generated URL, complete the onboarding screen, and reload once to
   let the service worker install.
5. For a Git-connected Pages project, use the repository root as the project
   directory, build command `npm run build:static`, and output directory
   `dist`. Use Node 20 or newer.

## Netlify Drop

1. Run `npm run build:static` locally.
2. Open [Netlify Drop](https://app.netlify.com/drop) and drag the `dist/`
   directory onto the drop zone.
3. Open the temporary URL, then reload after the offline badge changes to
   «Готово офлайн».
4. To update the demo, build again and drag the new `dist/` directory onto the
   existing site.

## GitHub Pages

### Manual upload

1. Run `npm run build:static`.
2. Publish the contents of `dist/` from a Pages-enabled branch or `/docs`
   directory. The contents of `dist/` must be the published root, so
   `index.html` must be at the root of the Pages site.
3. For a project site such as `https://user.github.io/sauat/`, keep the
   relative links produced by the build. Do not replace them with `/js/...` or
   `/content/...` links.

### Actions artifact

1. Run `npm run build:static` in the workflow.
2. Upload `dist/` with the Pages artifact action and deploy that artifact with
   the Pages deployment action.
3. Set the Pages source to **GitHub Actions**. The generated `manifest.webmanifest`
   and service worker already use the project-site subpath.

## Smoke check and limitations

Run:

```bash
npm run test:static
```

This starts a small local HTTP server under `/demo/`, checks relative links,
the production manifest, service-worker paths, local rules mentor guards, and
the local event export path. Static hosting cannot provide teacher/admin API
routes, server-side Ollama, or event synchronization; use the Docker/Express
deployment for those features.
