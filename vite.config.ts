import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { surface } from '@cloudsforge/ui/surfaces'

/**
 * There is deliberately no `define`, no `envPrefix` and no `.env` file in this repository.
 *
 * A build-time constant is an environment baked into an image, and an image with an environment
 * baked into it has to be rebuilt to be promoted — which means the artefact that reaches
 * production is not the artefact that passed CI. Every host this app talks to is resolved at
 * RUNTIME from `window.location.hostname` by `cloudsforgeHosts()`, so one image serves localhost,
 * staging, a preview deployment and production. `test/no-build-time-config.test.ts` fails the
 * build if `import.meta.env` or a bare `VITE_` ever appears in `src/` or `index.html`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DEV PROXY BELOW IS NOT BUILD-TIME CONFIGURATION, AND THE DIFFERENCE IS WORTH STATING.
 *
 * `server.proxy` configures the DEV SERVER. `vite build` emits nothing from it: the bundle
 * contains no host, no port and no branch that reads one, which is exactly the property the
 * paragraph above defends. What it does is reproduce, on a laptop, the arrangement production
 * already has — the bundle and Beacon's API on ONE origin — and that arrangement is not a
 * convenience here. It is the only one a browser can use.
 *
 * **Beacon sends no `access-control-*` header anywhere in its source, and answers 404 to an
 * OPTIONS preflight.** Driven, not reasoned:
 *
 *   curl -s -D- -o /dev/null -X OPTIONS -H 'Origin: http://localhost:5193' \
 *     -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization' \
 *     http://127.0.0.1:4143/v1/gate?release=probe-1
 *   → HTTP/1.1 404 Not Found
 *
 * The estate's CORS is one middleware on the gateway (`deploy/gateway/dynamic/policy.yml`,
 * `cf-cors`), applied to every `websecure` router, and its allowlist names production origins
 * only — no `localhost` entry exists in it. So a page on Vite's own port cannot read Beacon
 * cross-origin at all: the preflight fails and the request never leaves the browser. A dev server
 * that pointed the app at an absolute Beacon origin would be a dev server that cannot work, and
 * discovering that in a browser rather than here is precisely the class of defect this estate
 * keeps shipping.
 *
 * `src/lib/hosts.ts` therefore resolves a RELATIVE api base on a local origin, and this proxy is
 * the other half of that decision. The two are checked against each other by
 * `test/hosts.test.ts`.
 *
 * The target is read from the SURFACE REGISTRY rather than typed, so there is no second copy of
 * a port in this repository to go stale. `CF_BEACON_ORIGIN` overrides it, and it exists because
 * the registry's `devPort` is a fact about the SERVICE (Beacon binds 4011 — `beacon/src/env.ts`,
 * `beacon/.env.example`, `beacon/Dockerfile:90`) while a deployment is free to remap it: the
 * estate's compose publishes the container on `127.0.0.1:4143`
 * (`deploy/compose/docker-compose.estate.yml`). That remap is a fact about the deployment and
 * belongs in an environment variable of the dev server, never in the bundle.
 *
 *   CF_BEACON_ORIGIN=http://127.0.0.1:4143 pnpm dev
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
const beaconOrigin =
  process.env['CF_BEACON_ORIGIN'] ?? `http://127.0.0.1:${surface('beacon').devPort}`

export default defineConfig({
  plugins: [react()],
  resolve: {
    // @cloudsforge/ui is a `link:` dependency, so its own node_modules holds a second copy of
    // React. Two copies means two dispatchers, and the shared bar would throw on its first
    // useState.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // The linked package is shipped as TypeScript source until it is published; pre-bundling it
    // would freeze a stale copy of a package that is edited in the same working tree.
    exclude: ['@cloudsforge/ui'],
  },
  build: {
    // Named chunks and a real manifest of hashes: the assets are immutable-cached by nginx, and
    // that is only safe when every rebuild produces a new filename.
    sourcemap: true,
  },
  // 5193. Taken deliberately rather than by taking the next free number: 5191 and 5194 are LEFT
  // FREE on purpose, because `micro-lantern-web` is being written in parallel and still carries
  // the template's placeholder 5199 (`lantern-web/vite.config.ts`). Lantern should take 5191 —
  // it is the other operator tool, and adjacency there is more useful than adjacency to a status
  // page. The occupied set was read off every sibling's `vite.config.ts` rather than assumed:
  // 3001, 3003, 5170, 5171, 5172, 5173, 5180, 5182-5190, 5192, 5195, 5199.
  server: {
    port: 5193,
    proxy: {
      // Beacon's authenticated read surface. See the block comment above for why this is a proxy
      // and not an absolute base in the bundle.
      '/v1': { target: beaconOrigin, changeOrigin: true },
      // `/api/status/public` — the redacted projection. `micro-status-web` is the surface that
      // renders it and this one deliberately does not duplicate that job; the prefix is proxied
      // anyway so that a request which lands here fails as a 404 FROM BEACON rather than as a
      // Vite dev-server HTML page, which would reach the client as a JSON parse error and be
      // reported as the wrong defect.
      '/api': { target: beaconOrigin, changeOrigin: true },
    },
  },
  preview: { port: 5193 },
})
