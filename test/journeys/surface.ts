/**
 * The built bundle, served the way this repository's own `nginx.conf` says to serve it.
 *
 * ── Why the route table is PARSED out of nginx.conf rather than restated here ──────────────────
 *
 * Every surface in this estate enumerates its real routes in nginx and lets everything else fall
 * to `error_page 404 /index.html`, which serves the bundle while KEEPING the 404 status — as
 * opposed to `try_files $uri /index.html`, which answers 200 for every address in existence. Doc
 * 22 §5.1 makes that one assertion per surface (`BJ-<KEY>-404`) precisely because the distinction
 * has broken surfaces before, and `site`'s own config records the case that produced it:
 * `/products/pay` answered 200 for as long as the rule was a prefix.
 *
 * A second, hand-written copy of that route table in this file would be a fourth description of
 * the same addresses, and the copy is always the one that goes wrong. So this reads the real file
 * and implements nginx's own matching order over it. A config that swapped `error_page` for
 * `try_files` makes these tests go red, which is the entire point.
 *
 * What it does NOT prove is that nginx behaves as modelled here. That is proved by curling the
 * running image, which the reusable `web-ci.yml` image job and this repository's `served-headers`
 * job both do. The two are complementary: one probes the real server for a handful of addresses,
 * this one drives a browser over all of them.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile, readFileSync } from 'node:fs'
import { existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../../', import.meta.url))

/* ---- parsing nginx.conf --------------------------------------------- */

type Modifier = '=' | '^~' | '~' | '~*' | ''

interface Location {
  readonly modifier: Modifier
  readonly pattern: string
  readonly body: string
}

/** Comments stripped first: several of these files quote the directive they forbid to explain it. */
function directives(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => {
      const hash = line.indexOf('#')
      return hash === -1 ? line : line.slice(0, hash)
    })
    .join('\n')
}

function parseLocations(conf: string): Location[] {
  const found: Location[] = []
  const header = /location\s+(=|\^~|~\*|~)?\s*([^\s{]+)\s*\{/g
  let match: RegExpExecArray | null
  while ((match = header.exec(conf)) !== null) {
    // Walk to the matching brace so a nested block cannot truncate the body.
    let depth = 1
    let i = header.lastIndex
    while (i < conf.length && depth > 0) {
      const ch = conf[i]
      if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
      i += 1
    }
    found.push({
      modifier: (match[1] ?? '') as Modifier,
      pattern: match[2] ?? '',
      body: conf.slice(header.lastIndex, i - 1),
    })
  }
  return found
}

export interface NginxModel {
  readonly locations: Location[]
  /** True when `error_page 404 /index.html` is present — the honest-404 rule. */
  readonly honest404: boolean
}

export function readNginx(repo = REPO): NginxModel {
  const raw = readFileSync(join(repo, 'nginx.conf'), 'utf8')
  const conf = directives(raw)

  // The banned fallback, checked here as well as in CI, because every navigation assertion below
  // silently becomes meaningless if it is ever added: with it, everything is 200.
  if (/try_files\s+\$uri\s+(\$uri\/\s+)?\/index\.html/.test(conf)) {
    throw new Error(
      'nginx.conf falls back to /index.html with a 200 for unknown paths. Every `navigation`\n' +
        'scenario in this suite would then pass against a surface with no 404 at all.',
    )
  }
  return { locations: parseLocations(conf), honest404: /error_page\s+404\s+\/index\.html/.test(conf) }
}

/* ---- nginx's matching order ----------------------------------------- */

interface Decision {
  readonly kind: 'file' | 'shell' | 'literal'
  /** For `kind: 'literal'`, the body `return` produced. */
  readonly text?: string
  /** For `kind: 'literal'`, the status `return` produced. */
  readonly status?: number
}

/**
 * ── ONE THING HERE IS WIDENED FROM THE TEMPLATE'S COPY, AND IT MATTERS ON THIS SURFACE ────────
 *
 * The template matches `return 200 "…"` only, because `/healthz` is the only literal any frontend
 * it was written for declares. This repository declares a second one, and it is not a 200:
 * `location ~ ^/(v1|api|metrics|livez|readyz)(/|$)` answers `return 404 "<sentence>"`, because in
 * production this bundle and micro-beacon share `beacon.<apex>` and something in front has to
 * decide which of them answers a path (see the header of nginx.conf).
 *
 * With the narrow pattern that location fell through to `notFound()` and was modelled as the app
 * shell under a 404 — which is precisely the behaviour the real config exists to AVOID, so the
 * model would have been green for a config that had lost the property. `return` is now read with
 * its status, and any code is honoured.
 *
 * ── AND TWO MORE SHAPES, ADDED WITH robots.txt AND sitemap.xml ────────────────────────────────
 *
 * **A single-quoted body.** `location = /robots.txt` returns one, because its body spans lines and
 * a double-quoted multi-line literal is the form nginx configs conventionally avoid. Read with
 * `"` only, that block fell through to `notFound()` and the model answered the app shell under a
 * 404 for an address the real server answers 200 `text/plain` — the same class of silent
 * disagreement the note above records, one quote character over.
 *
 * **`return <code>;` with NO body at all.** This is a genuinely different directive and not a
 * degenerate case of the one above: nginx hands a bodyless `return 404;` to `error_page`, so
 * `location = /sitemap.xml` answers the app shell WITH a 404 status, exactly as an unknown address
 * does — which is the whole design there, a sitemap that is absent rather than refused. Modelled
 * by returning null, because null is what routes this to the caller's `notFound()`, and
 * `notFound()` is what implements `error_page 404 /index.html` in this file.
 */
function decide(body: string): Decision | null {
  // `\2` closes on whichever quote opened, so a `'` inside a double-quoted body and vice versa
  // cannot terminate it early.
  const ret = /return\s+(\d{3})\s+(["'])([\s\S]*?)\2\s*;/.exec(body)
  if (ret) {
    return {
      kind: 'literal',
      status: Number(ret[1]),
      text: (ret[3] ?? '').replace(/\\n/g, '\n'),
    }
  }
  // Bodyless: `error_page` territory. See the note above.
  if (/return\s+\d{3}\s*;/.test(body)) return null
  if (/try_files\s+\/index\.html/.test(body)) return { kind: 'shell' }
  if (/try_files\s+\$uri/.test(body)) return { kind: 'file' }
  return null
}

/**
 * Which location answers `path`, following nginx's documented order: exact `=`, then the longest
 * `^~` prefix, then regexes in file order, then the longest plain prefix.
 */
function match(model: NginxModel, path: string): Location | undefined {
  const exact = model.locations.find((l) => l.modifier === '=' && l.pattern === path)
  if (exact) return exact

  const prefixes = model.locations
    .filter((l) => (l.modifier === '' || l.modifier === '^~') && path.startsWith(l.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)

  const priority = prefixes.find((l) => l.modifier === '^~')
  if (priority) return priority

  for (const location of model.locations) {
    if (location.modifier !== '~' && location.modifier !== '~*') continue
    if (new RegExp(location.pattern, location.modifier === '~*' ? 'i' : '').test(path)) return location
  }
  return prefixes[0]
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.map': 'application/json',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
}

/* ---- building the bundle -------------------------------------------- */

let building: Promise<string> | null = null

/**
 * `vite build` into a temporary directory, once per process.
 *
 * Built rather than served from `pnpm dev`, because doc 22's tier 2 is "the built bundle behind
 * its own nginx.conf" — a dev server resolves modules differently, transforms on demand and has
 * its own SPA fallback, so a bundle that is broken only when built would pass.
 */
async function buildBundle(repo: string): Promise<string> {
  if (!building) {
    building = (async () => {
      const outDir = mkdtempSync(join(tmpdir(), 'cf-journeys-'))
      const { build } = await import('vite')
      await build({
        root: repo,
        configFile: join(repo, 'vite.config.ts'),
        logLevel: 'error',
        build: { outDir, emptyOutDir: true, sourcemap: false },
      })
      if (!existsSync(join(outDir, 'index.html'))) {
        throw new Error(`the build produced no index.html in ${outDir}`)
      }
      return outDir
    })()
  }
  return building
}

/* ---- the surface ----------------------------------------------------- */

export interface Surface {
  readonly origin: string
  readonly root: string
  readonly nginx: NginxModel
  /** Status and body for one address, without a browser. Used by the 404 assertions. */
  fetchStatus(path: string): Promise<{ status: number; body: string; type: string }>
  close(): Promise<void>
}

let surface: Promise<Surface> | null = null

/** Start the surface, or return the one already running. One per test process. */
export function startSurface(repo = REPO): Promise<Surface> {
  if (!surface) surface = boot(repo)
  return surface
}

async function boot(repo: string): Promise<Surface> {
  const root = await buildBundle(repo)
  const nginx = readNginx(repo)
  const shell = readFileSync(join(root, 'index.html'), 'utf8')

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    const location = match(nginx, path)
    const decision = location ? decide(location.body) : null

    const notFound = (): void => {
      // `error_page 404 /index.html`: the shell, with the status left alone.
      if (nginx.honest404) {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
        res.end(shell)
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('not found')
      }
    }

    if (!decision) return notFound()
    if (decision.kind === 'literal') {
      // The status the directive named, NOT an assumed 200 — see the note on `decide`.
      res.writeHead(decision.status ?? 200, { 'content-type': 'text/plain' })
      res.end(decision.text ?? '')
      return
    }
    if (decision.kind === 'shell') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(shell)
      return
    }

    // `try_files $uri =404`: a real file or nothing. A missing asset must NOT become the shell —
    // a JavaScript request answered with HTML fails with a syntax error naming the wrong file.
    const onDisk = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''))
    if (!onDisk.startsWith(resolve(root)) || !existsSync(onDisk) || !statSync(onDisk).isFile()) {
      return notFound()
    }
    readFile(onDisk, (err, data) => {
      if (err) return notFound()
      res.writeHead(200, { 'content-type': TYPES[extname(onDisk)] ?? 'application/octet-stream' })
      res.end(data)
    })
  })

  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('the surface did not bind a port')
  // 127.0.0.1 rather than a hostname: `cloudsforgeHosts()` treats it as local and resolves every
  // other surface to its registry dev port, which is what the stub table then intercepts.
  const origin = `http://127.0.0.1:${address.port}`

  return {
    origin,
    root,
    nginx,
    async fetchStatus(path: string) {
      const response = await fetch(`${origin}${path}`, { redirect: 'manual' })
      return {
        status: response.status,
        body: await response.text(),
        type: response.headers.get('content-type') ?? '',
      }
    },
    close: () =>
      new Promise<void>((ok, fail) => server.close((err) => (err ? fail(err) : ok()))),
  }
}

export async function stopSurface(): Promise<void> {
  if (surface) {
    await (await surface).close()
    surface = null
    building = null
  }
}
