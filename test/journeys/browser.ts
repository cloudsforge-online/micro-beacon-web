/**
 * A real browser and a FAKE NETWORK, for the tier-1 and tier-2 scenarios of
 * docs/ecosystem/22-browser-journeys.md.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * READ THIS BEFORE TRUSTING ANYTHING IN THIS DIRECTORY.
 *
 * The engine below is genuine Chromium. The network it renders against is not: this file installs
 * `page.route('**\/*', ...)` and answers EVERY request from a fixture table. It therefore CANNOT
 * SEE an unreachable API, a wrong host, an unrouted path, a CORS refusal, a 404 on a stylesheet
 * or a service that is down — every one of those is answered here with a cheerful 200.
 *
 * The entry point is named `renderOnlyWithStubbedNetwork` for that reason, and its own header
 * carries the full account. It used to be called `open()`, and under that name the estate shipped
 * three completely unstyled surfaces, four more whose reads 404'd or 401'd in a browser, and a
 * degradation banner shown to every visitor of a healthy game — with CI green and 314 specified
 * browser scenarios green throughout.
 *
 * **The tier that CAN see those is `micro-beacon`'s smoke tier** — `beacon/src/browser/smoke.ts`,
 * run as `beacon smoke` / `pnpm smoke` — which drives real Chromium through the real gateway with
 * nothing intercepted, and fails structurally if any request interception ever appears in it.
 *
 * What is here is still worth having: everything downstream of a response is genuine rendering
 * logic, tested cheaply and deterministically with no estate required. It is simply not, and
 * cannot become, evidence that anything is reachable.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── Why a real browser, when the rest of this suite deliberately has no DOM ────────────────────
 *
 * `test/browser-stubs.ts` states the estate's position and it is the right one for what it covers:
 * jsdom is a second browser implementation to keep current, and a test that renders a component in
 * it proves the component renders in jsdom. Nothing here contradicts that. This file does not add
 * jsdom; it adds the actual engine, which is the only thing that can answer the questions doc 22
 * asks — did the bundle load, did the application mount, did anything go to the console, did any
 * request fail, and what did the client SEND.
 *
 * ── Why `playwright-core` and not `playwright` ────────────────────────────────────────────────
 *
 * The full package downloads its own ~1.5 GB browser set on install. The core package drives a
 * Chromium that is already on the machine. Every GitHub `ubuntu-latest` runner ships Google Chrome
 * and Chromium (runner-images: Ubuntu2404-Readme.md, "Browsers and Drivers"), so CI needs no extra
 * step and no workflow change. The frozen legacy estate reached the same conclusion and recorded
 * it in the `stack` tree, at `infra/beacon/src/browser.js`, lines 9-11.
 *
 * (Written without the usual `file.js:9` suffix on purpose. Several repositories in this estate
 * run a `citations.test.ts` that sweeps for exactly that form and resolves it against a SIBLING
 * checkout; the frozen estate is a different tree, so a citation in that shape is reported as a
 * broken one. Saying where it really lives is the honest fix, not silencing the sweep.)
 *
 * ── Why a missing browser is a FAILURE and not a skip ─────────────────────────────────────────
 *
 * This estate keeps producing checks that cannot fail: a Docker job that built an image and read
 * its metadata without ever running it, grep rules that skip files with NUL bytes in them, and a
 * unit test asserting that the client posts to the URL the client was written to post to. A
 * browser suite that quietly skips itself when it cannot find a browser is the same defect in its
 * purest form — it would be green on every runner in the estate and would have proven nothing.
 *
 * So `chromePath()` throws, and names every path it looked in. If you are running this on a
 * machine with a browser somewhere unusual, set `CF_CHROME`. There is deliberately no
 * `CF_SKIP_BROWSER_TESTS`.
 */
import { access, constants, readdir } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page, type Request } from 'playwright-core'

/* ---- finding a browser --------------------------------------------- */

/**
 * Well-known executables, most specific first.
 *
 * `/usr/bin/google-chrome` is the one that answers on a GitHub runner. The macOS entry is for a
 * developer running `pnpm test` on a laptop. Playwright's own download cache is searched last so
 * that a machine which has run `npx playwright install` at some point works without configuration.
 */
function candidatePaths(): string[] {
  const paths: string[] = []
  const fromEnv = process.env['CF_CHROME'] ?? process.env['CHROME_PATH'] ?? ''
  if (fromEnv) paths.push(fromEnv)
  paths.push(
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  )
  if (platform() === 'darwin') {
    paths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    )
  }
  return paths
}

/** The roots Playwright downloads browsers into, per platform. */
function playwrightCaches(): string[] {
  const home = homedir()
  return platform() === 'darwin'
    ? [join(home, 'Library', 'Caches', 'ms-playwright')]
    : [join(home, '.cache', 'ms-playwright')]
}

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Any `chromium-*` or `chromium_headless_shell-*` Playwright has downloaded. */
async function fromPlaywrightCache(): Promise<string[]> {
  const found: string[] = []
  for (const root of playwrightCaches()) {
    let entries: string[]
    try {
      entries = await readdir(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.startsWith('chromium')) continue
      const base = join(root, entry)
      found.push(
        join(base, 'chrome-linux', 'chrome'),
        join(base, 'chrome-linux', 'headless_shell'),
        join(base, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        join(base, 'chrome-mac', 'chrome-headless-shell'),
        join(base, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
        join(base, 'chrome-headless-shell-mac-x64', 'chrome-headless-shell'),
        join(base, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
      )
    }
  }
  return found
}

let resolved: string | null = null

export async function chromePath(): Promise<string> {
  if (resolved) return resolved
  const searched = [...candidatePaths(), ...(await fromPlaywrightCache())]
  for (const path of searched) {
    if (await executable(path)) {
      resolved = path
      return path
    }
  }
  throw new Error(
    'No Chromium or Chrome executable was found, so the browser journeys cannot run.\n' +
      'This is a failure and not a skip on purpose: a browser suite that skips itself is green\n' +
      'everywhere and proves nothing (see the header of test/journeys/browser.ts).\n' +
      'Set CF_CHROME to an executable, or install Chrome. Searched:\n  ' +
      searched.join('\n  '),
  )
}

/* ---- what the page did while we were not looking -------------------- */

export interface SentRequest {
  readonly method: string
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | null
}

export interface Collected {
  /**
   * Errors the APPLICATION produced: `console.error` from its own code, and uncaught exceptions.
   *
   * Kept apart from `resourceErrors` below, because Chromium logs an ordinary non-2xx API response
   * to the console as an error too. A scenario that deliberately arranges a 503 would otherwise
   * have to tolerate a message, and a suite full of tolerated messages stops noticing the one that
   * matters.
   */
  readonly consoleErrors: string[]
  /**
   * The browser's network log: `Failed to load resource`, with the address that failed.
   *
   * One of these on THIS surface's origin is the defect the whole tier exists to catch — a bundle
   * that 404s leaves the network idle and `domcontentloaded` fires anyway. `assertMounted` treats
   * a same-origin entry as fatal and a cross-origin one as the scenario's own business.
   */
  readonly resourceErrors: string[]
  /** Requests the browser could not complete at all — a CORS refusal, a DNS miss, a dead service. */
  readonly failedRequests: string[]
  /** Every request the page issued, in order. The `client-request` assertions read this. */
  readonly requests: SentRequest[]
}

/**
 * Is this the page fetching ITSELF?
 *
 * Same origin means yes, without exception. Not just `/assets/…` — a route the app owns is a
 * top-level navigation, and counting `GET /markets` as a client request puts the DOCUMENT in
 * `apiCalls()`, where a scenario reading "the first call to /markets" finds the navigation and
 * asserts against its query string rather than the API's. That produced a confident, wrong failure
 * before this was tightened.
 *
 * It is also exactly the rule the route handler follows: same origin goes to the surface, never to
 * the stub table. One rule, stated once, in the two places that have to agree.
 */
function isOwnAsset(url: string, origin: string): boolean {
  return url.startsWith(origin)
}

/* ---- stubbing the API ---------------------------------------------- */

export interface StubReply {
  readonly status?: number
  readonly json?: unknown
  readonly body?: string
  readonly contentType?: string
  readonly headers?: Record<string, string>
  /** Answer nothing at all, as an unreachable service does. */
  readonly abort?: boolean
  /** Milliseconds to wait before answering — H6, "degraded, not down". */
  readonly delayMs?: number
}

/**
 * A route table for the API this surface talks to.
 *
 * The key is matched against `<METHOD> <pathname>`, so `'GET /v1/faucet'`. A key with no method is
 * matched against the pathname alone. The FIRST matching entry wins, which lets a scenario put a
 * specific answer above a general one.
 *
 * Anything the table does not answer is aborted and recorded as a failed request, rather than
 * being let through to a real network. A tier-1 scenario that silently reached a live service
 * would pass or fail for a reason that has nothing to do with the bundle.
 */
export type Stubs = ReadonlyArray<readonly [pattern: string, reply: StubReply | ((req: SentRequest) => StubReply)]>

export interface PageOptions {
  /** Where to open. Relative to the surface's origin. */
  readonly path?: string
  readonly stubs?: Stubs
  /** Seeded into localStorage before the first script runs. */
  readonly storage?: Readonly<Record<string, string>>
  readonly reducedMotion?: boolean
  /** Fail the browser's WebGL probe, for the degraded-renderer scenarios. */
  readonly noWebgl?: boolean
  readonly viewport?: { width: number; height: number }
}

function matches(pattern: string, req: SentRequest, url: URL): boolean {
  const [maybeMethod, ...rest] = pattern.split(' ')
  const hasMethod = rest.length > 0 && /^[A-Z]+$/.test(maybeMethod ?? '')
  const path = hasMethod ? rest.join(' ') : pattern
  if (hasMethod && req.method !== maybeMethod) return false
  if (!path.includes('*')) return url.pathname === path
  // `*` matches anywhere in the path, not only at the end. `GET /markets/*/resolution` has to
  // reach a route that is nested under one the table also answers, and a trailing-only wildcard
  // silently matched nothing: the specific stub never fired, the general one answered the wrong
  // document, and the page threw while rendering it. The failure read as "the application never
  // mounted", which is true and unhelpful.
  const source = `^${path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`
  return new RegExp(source).test(url.pathname)
}

/* ---- driving one page ----------------------------------------------- */

let shared: Browser | null = null

/** One browser process for the whole file; a context per scenario, so nothing leaks between them. */
export async function browser(): Promise<Browser> {
  if (!shared) {
    shared = await chromium.launch({
      executablePath: await chromePath(),
      // --no-sandbox because CI runs as a user that cannot create a user namespace, and
      // --disable-dev-shm-usage because the runner's /dev/shm is 64 MB and Chromium crashes
      // rendering anything real in it. Both are standard for a container and neither weakens
      // anything this suite asserts.
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
  }
  return shared
}

export async function closeBrowser(): Promise<void> {
  if (shared) {
    await shared.close()
    shared = null
  }
}

export interface Session {
  readonly page: Page
  readonly collected: Collected
  readonly context: BrowserContext
  /** The status of the top-level navigation. The `navigation` assertions read this. */
  readonly status: number
  readonly origin: string
  /** The address that was navigated to. Its own status is `status`, not a resource failure. */
  readonly document: string
  /** Everything the page sent that was not one of its own static assets. */
  apiCalls(): SentRequest[]
  /** Bodies the bundle posted to Lantern's browser ingest. */
  reported(): unknown[]
  close(): Promise<void>
}

/**
 * Render this bundle against a FAKE NETWORK, and hand back what happened.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE NAME IS THE WARNING. THIS FUNCTION CANNOT DETECT AN UNREACHABLE API.
 *
 * It calls `page.route('**\/*', ...)` and answers EVERY request from the stub table below. The
 * bundle is real, the browser is real, the rendering is real — and the network is not there at
 * all. So the whole class of defect that lives between this bundle and the estate is structurally
 * invisible to it:
 *
 *   * an API host that does not resolve, or resolves to nothing;
 *   * a path the gateway does not route, answered by the static file server with its own
 *     index.html or a 404;
 *   * a request that works on the host and is refused in a page — CORS, a cookie policy, a
 *     mixed-content block;
 *   * a stylesheet or a bundle that 404s;
 *   * a service that is simply down.
 *
 * Every one of those is answered here by a fixture, cheerfully, with a 200.
 *
 * THIS IS NOT HYPOTHETICAL. It was called `open()` while it did all of the above, and the estate
 * shipped: three surfaces rendering completely unstyled, four more with reads answering 404 or
 * 401 in the browser, a degradation banner shown to every visitor of a healthy game because a
 * readiness probe was landing on nginx. CI was green. 314 specified browser scenarios were green.
 * The owner opened a browser and most of the estate was broken. A name that says `open` invites
 * the next reader to believe these scenarios opened the product; they opened a rehearsal of it.
 *
 * ── What CAN see those defects ────────────────────────────────────────────────────────────────
 *
 * `micro-beacon`'s smoke tier — `beacon/src/browser/smoke.ts`, run with `beacon smoke` or
 * `pnpm smoke` from that repository. It drives real Chromium through the real gateway with
 * NOTHING intercepted, and it enforces structurally that it never acquires an intercept: it fails
 * if `page.route`, `route.fulfill`, `setOfflineMode` or `route.abort` appears anywhere in its own
 * browser code. That is the tier a reachability question belongs in. This one cannot answer it,
 * and no amount of care inside a scenario here can make it able to.
 *
 * ── And what these scenarios ARE good for, which is a lot ─────────────────────────────────────
 *
 * Everything downstream of a response: that a list draws one row per record the response carried,
 * that a control stays inoperable until the thing it acts on has actually arrived, that a figure
 * is shown as the API worded it rather than recomputed in the client, that a 503 becomes a banner
 * and a 404 does not. Those are genuine rendering logic, they are cheap, they are deterministic,
 * they run with no estate, and deleting them would be a loss. They are simply not evidence that
 * anything is reachable.
 *
 * (Those examples are deliberately generic, and that is the ONE paragraph in this header that
 * differs from the `emberkin-web` and `aetherholm-web` copies, which name scenarios from their
 * own surfaces. This copy is the one `cfctl new` hands to a frontend that does not exist yet, so
 * it can name no surface. Every sentence `test/harness-honesty.test.ts` reads — the name, the
 * three things this cannot see, and `micro-beacon`'s smoke tier — is byte-identical across all
 * of them on purpose, so the guard is the same guard everywhere.)
 *
 * Deliberately does NOT assert anything: a scenario says what it needs, and `assertMounted` below
 * is the shared floor that most of them start from.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export async function renderOnlyWithStubbedNetwork(
  origin: string,
  options: PageOptions = {},
): Promise<Session> {
  const consoleErrors: string[] = []
  const resourceErrors: string[] = []
  const failedRequests: string[] = []
  const requests: SentRequest[] = []
  const reported: unknown[] = []
  const context = await (
    await browser()
  ).newContext({
    ...(options.viewport ? { viewport: options.viewport } : {}),
    ...(options.reducedMotion ? { reducedMotion: 'reduce' as const } : {}),
  })

  if (options.storage) {
    const seed = options.storage
    await context.addInitScript((entries: Record<string, string>) => {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
    }, seed)
  }

  if (options.noWebgl) {
    // The renderer asks for a context and branches on the answer. Refusing it here is closer to a
    // machine with no GPU than deleting the module would be, and it leaves the import graph alone
    // — which is half of what the scenario is about.
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        id: string,
        ...rest: unknown[]
      ) {
        if (id === 'webgl' || id === 'webgl2' || id === 'experimental-webgl') return null
        return (original as unknown as (...a: unknown[]) => unknown).call(this, id, ...rest)
      } as typeof HTMLCanvasElement.prototype.getContext
    })
  }

  const page = await context.newPage()

  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (text.startsWith('Failed to load resource')) {
      resourceErrors.push(`${message.location().url || '(unknown address)'} — ${text}`)
      return
    }
    consoleErrors.push(text)
  })
  page.on('pageerror', (error) => consoleErrors.push(`${error.name}: ${error.message}`))
  page.on('requestfailed', (request: Request) => {
    failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'failed'}`)
  })

  const stubs = options.stubs ?? []
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const sent: SentRequest = {
      method: request.method(),
      url: request.url(),
      headers: request.headers(),
      body: request.postData(),
    }
    // EVERY request, including this surface's own. `apiCalls()` filters to the cross-origin ones;
    // a scenario that needs to know the page fetched one of its OWN files — the art manifest,
    // a model — reads `collected.requests`. Recording only cross-origin requests made "did the
    // credits page fetch the manifest, or are the words baked in?" unanswerable.
    requests.push(sent)

    // ANYTHING ON THIS SURFACE'S OWN ORIGIN GOES TO THE SURFACE, always and before the stub table.
    //
    // Not just its assets. A route the app owns — `/markets`, `/settings` — is a top-level
    // navigation, and a stub table entry spelled `GET /markets` would otherwise answer the
    // DOCUMENT request with JSON. The browser then renders the JSON, `#root` never appears, and
    // the failure reads as "the application did not mount" while the bundle is perfectly fine.
    //
    // Every API this estate's frontends call is cross-origin from a surface served on 127.0.0.1:
    // `resolveApiBase` compares origins and the registry resolves each service to its own dev
    // port. So there is nothing a scenario legitimately needs to stub on this origin, and the
    // ambiguity is worth removing rather than documenting.
    if (sent.url.startsWith(origin)) {
      await route.continue()
      return
    }

    // Lantern's browser ingest, answered for every scenario without one being asked to declare it.
    // `src/lib/obs.ts` posts here two seconds after anything is reported, on every surface in the
    // estate, and a scenario that had not thought about it would fail on a connection refusal it
    // did not arrange. The bodies are kept: what the bundle REPORTED is often the clearest
    // evidence of what it thought went wrong.
    // The path is `/ingest/client` and NOT `/ingest/browser`. This mock intercepted the stale path
    // for as long as the bundle posted to it, which made it a test that could not fail: after the
    // app moved, an intercept on a path nothing calls silently matches nothing.
    if (url.pathname === '/ingest/client') {
      try {
        reported.push(JSON.parse(sent.body ?? 'null'))
      } catch {
        reported.push(sent.body)
      }
      await route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } })
      return
    }

    for (const [pattern, reply] of stubs) {
      if (!matches(pattern, sent, url)) continue
      const answer = typeof reply === 'function' ? reply(sent) : reply
      if (answer.delayMs) await new Promise((r) => setTimeout(r, answer.delayMs))
      if (answer.abort) {
        await route.abort('connectionrefused')
        return
      }
      const body = answer.json !== undefined ? JSON.stringify(answer.json) : (answer.body ?? '')
      await route.fulfill({
        status: answer.status ?? 200,
        contentType:
          answer.contentType ?? (answer.json !== undefined ? 'application/json' : 'text/plain'),
        headers: {
          'x-request-id': 'req-test-0001',
          'access-control-allow-origin': '*',
          ...(answer.headers ?? {}),
        },
        body,
      })
      return
    }

    // Nothing in the table and not our own origin: refuse it, loudly, in `failedRequests`.
    await route.abort('connectionrefused')
  })

  const target = `${origin}${options.path ?? '/'}`
  const response = await page.goto(target, { waitUntil: 'domcontentloaded' })
  // A SPA has mounted nothing at `domcontentloaded`, and `networkidle` is not enough either: a
  // bundle that 404s leaves the network perfectly idle. So wait for the application's own output.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)

  return {
    page,
    collected: { consoleErrors, resourceErrors, failedRequests, requests },
    context,
    status: response?.status() ?? 0,
    document: target.split('#')[0] ?? target,
    apiCalls: () => requests.filter((r) => !isOwnAsset(r.url, origin)),
    reported: () => reported,
    origin,
    async close() {
      await context.close()
    },
  }
}

/* ---- the floor every scenario stands on ----------------------------- */

export interface MountOptions {
  /** Substrings that must all be present in the rendered text. */
  readonly showing?: readonly string[]
  /** Console errors matching these are expected by the scenario and are not failures. */
  readonly tolerate?: readonly RegExp[]
  /** Failed requests matching these were arranged by the scenario. */
  readonly tolerateFailures?: readonly RegExp[]
}

/**
 * The application mounted, and nothing broke on the way.
 *
 * The legacy suite asserted `document.body.innerText.length > 40` and collected console errors
 * (the frozen `stack` tree, `infra/beacon/src/journeys/web.js`, lines 48-53). That floor is kept and raised: `#root` must
 * have rendered element children, because a body carrying only the shared bar clears 40 characters
 * while the page itself is blank.
 */
export async function assertMounted(session: Session, options: MountOptions = {}): Promise<string> {
  const { page, collected } = session

  const mounted = await page
    .waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, undefined, {
      timeout: 15_000,
    })
    .then(() => true)
    .catch(() => false)

  const text = await page.evaluate(() => document.body?.innerText ?? '')

  if (!mounted) {
    throw new Error(
      `#root has no children: the shell was served but the application never mounted.\n` +
        `  console errors: ${collected.consoleErrors.slice(0, 3).join(' | ') || 'none'}\n` +
        `  failed requests: ${collected.failedRequests.slice(0, 3).join(' | ') || 'none'}\n` +
        `  body text: ${JSON.stringify(text.slice(0, 200))}`,
    )
  }
  if (text.trim().length <= 40) {
    throw new Error(`the page rendered ${text.trim().length} characters of text; it is blank`)
  }

  const tolerate = options.tolerate ?? []
  const errors = collected.consoleErrors.filter((e) => !tolerate.some((r) => r.test(e)))
  if (errors.length > 0) throw new Error(`the page logged errors:\n  ${errors.join('\n  ')}`)

  // A resource this surface serves that did not load is the defect described at the top of this
  // file: the shell arrives, the script tag points at nothing, and every other signal says fine.
  // A cross-origin one is an API answer, which is the scenario's own arrangement to judge.
  // The document itself is excluded: a `navigation` scenario opens an address that MUST answer
  // 404, and Chromium logs that to the console like any other non-2xx. Its status is asserted
  // directly, as `session.status`.
  const ownFailures = collected.resourceErrors.filter(
    (e) => e.startsWith(session.origin) && !e.startsWith(`${session.document} —`),
  )
  if (ownFailures.length > 0) {
    throw new Error(`this surface failed to serve its own resources:\n  ${ownFailures.join('\n  ')}`)
  }

  // The observability ingest is exempt by default, and `src/lib/obs.ts` rule 1 is the reason:
  // telemetry that can break the page it measures is worse than no telemetry, so a dropped report
  // is invisible to the user by design. It is also sent with `keepalive`, which the browser is
  // free to abort. A scenario that wants to assert what was reported reads `session.reported()`.
  const tolerateFailures = [/\/ingest\/browser/, ...(options.tolerateFailures ?? [])]
  const failures = collected.failedRequests.filter((f) => !tolerateFailures.some((r) => r.test(f)))
  if (failures.length > 0) {
    throw new Error(
      `the page could not complete requests (nothing in the scenario's stub table answered them):\n  ` +
        failures.join('\n  '),
    )
  }

  for (const needle of options.showing ?? []) {
    if (!text.includes(needle)) {
      throw new Error(`the page does not say ${JSON.stringify(needle)}.\nIt says: ${text.slice(0, 800)}`)
    }
  }
  return text
}
