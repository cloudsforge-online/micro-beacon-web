/**
 * The auth client: tokens, one refresh at a time, and one error shape.
 *
 * Carried forward from `micro-explorer-web`'s `src/lib/api.ts`, which is the version of this file
 * that has actually been run against Nimbus. The behaviour worth preserving verbatim is the
 * SINGLE-FLIGHT REFRESH: a console that fires six requests on mount, all of which 401 on an
 * expired access token, must perform ONE refresh. Six refreshes against a rotating refresh token
 * means five of them present a token that has just been superseded, and the operator is signed out
 * while holding a valid session — at the moment they were trying to find out why the estate will
 * not ship.
 *
 * ── One thing is the OPPOSITE of the surface this was taken from, and it is not a detail ───────
 *
 * `micro-explorer-web` states the rule "a bearer must never travel to the chain index", because
 * every `micro-indexer` read it makes is anonymous. **Every route this bundle calls is
 * authenticated, without exception.** `authorise()` (`beacon/src/server.ts:870-898`) checks the
 * static `x-beacon-token` first and then requires an identity JWT; for `READ_SCOPE` and
 * `GATE_SCOPE` it accepts ANY authenticated user principal (`:895`). So every call here is issued
 * with the default `auth: true` and carries the bearer.
 *
 * **The static break-glass token is never sent from this bundle and must never be.** It is a
 * shared secret held by Prometheus, Alertmanager and CI (`beacon/src/server.ts:21-29`); putting it
 * in a browser would publish it to every reader of the page and to every extension in their
 * profile, and it authenticates as `service:beacon-token` — which would make every action in the
 * audit trail anonymous. `test/api.test.ts` asserts no request this client builds carries an
 * `x-beacon-token` header.
 */
import { consumeAuthCallback, signInRedirect, signOutRedirect } from '@cloudsforge/ui'
import { APP_NAME, apiBase, hosts, pageOrigin } from './hosts.ts'
import { report } from './obs.ts'

/** Nimbus issues and refreshes tokens; it is cross-origin from every app, always. */
function nimbusUrl(): string {
  return hosts().nimbus
}

/**
 * The shared CloudsForge token keys.
 *
 * Deliberately the same strings in every product: a session established at the Account portal is
 * picked up here without a second round trip, and signing out of one app on a shared machine
 * clears the tokens the next app would have read.
 */
const ACCESS_KEY = 'cf.accessToken'
const REFRESH_KEY = 'cf.refreshToken'

/** Fired when a refresh fails. `AuthProvider` listens and drops the session. */
export const AUTH_EXPIRED_EVENT = 'cf:auth-expired'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

/* ---- token storage ------------------------------------------------- */

const memory = new Map<string, string>()

/**
 * Storage, with a memory fallback.
 *
 * `localStorage` throws rather than returning null in a Safari private window and in a
 * third-party iframe with storage blocked. A module that touched it directly would take the whole
 * bundle down at import time in both, and could not be unit tested outside a browser at all. The
 * fallback loses the session on reload, which is a worse experience than persistence and a much
 * better one than a blank page.
 */
function store(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    if (typeof localStorage !== 'undefined') {
      // Probe rather than trust: the throw happens on ACCESS, not on the typeof check.
      localStorage.getItem(ACCESS_KEY)
      return localStorage
    }
  } catch {
    // Fall through to memory.
  }
  return {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  }
}

export const getAccessToken = (): string | null => store().getItem(ACCESS_KEY)
export const getRefreshToken = (): string | null => store().getItem(REFRESH_KEY)

export function setTokens(tokens: AuthTokens): void {
  store().setItem(ACCESS_KEY, tokens.accessToken)
  store().setItem(REFRESH_KEY, tokens.refreshToken)
}

export function clearTokens(): void {
  store().removeItem(ACCESS_KEY)
  store().removeItem(REFRESH_KEY)
}

export const hasSession = (): boolean => Boolean(getAccessToken() && getRefreshToken())

/* ---- errors -------------------------------------------------------- */

export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  /**
   * The server's id for the exact request that failed, echoed in both the `x-request-id` header
   * and the error body. Beacon sets it on EVERY response (`beacon/src/server.ts:1006`), including
   * the ones produced before a route matched, so it is present even for a 404 from the router.
   */
  readonly requestId: string | undefined

  constructor(status: number, message: string, code?: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

/**
 * Pull the sentence, the code and the request id out of a service's error body.
 *
 * Beacon's envelope is **nested** — `{error: {code, message, requestId}}`, built by `errorReply()`
 * at `beacon/src/server.ts:995-997`. This function used to read it as flat in the template,
 * assigning `data.error` — an object — straight to the displayed message, so every server-side
 * failure rendered as `[object Object]` with the real message, the code and the request id all
 * present in the response and all discarded.
 *
 * Both shapes are accepted rather than only the nested one, because a proxy or an older service on
 * the rollback path may still answer flat.
 */
export function readErrorBody(body: unknown): {
  message?: string
  code?: string
  requestId?: string
} {
  if (typeof body !== 'object' || body === null) return {}
  const top = body as { error?: unknown; code?: unknown; requestId?: unknown; message?: unknown }
  const nested =
    typeof top.error === 'object' && top.error !== null
      ? (top.error as { code?: unknown; message?: unknown; requestId?: unknown })
      : undefined

  // A string `error` is the flat shape's message. An object `error` is the nested envelope, and
  // its fields win over any same-named field at the top level.
  const message =
    pickString(nested?.message) ??
    (typeof top.error === 'string' ? top.error : undefined) ??
    pickString(top.message)

  return {
    ...(message ? { message } : {}),
    ...(pickString(nested?.code) ?? pickString(top.code)
      ? { code: (pickString(nested?.code) ?? pickString(top.code)) as string }
      : {}),
    ...(pickString(nested?.requestId) ?? pickString(top.requestId)
      ? { requestId: (pickString(nested?.requestId) ?? pickString(top.requestId)) as string }
      : {}),
  }
}

function pickString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** What a failure state needs: the sentence, the code to branch on, and the id to quote. */
export interface ErrorNotice {
  message: string
  requestId: string | undefined
  /**
   * The service's error CODE, carried through so a screen can branch on it.
   *
   * Beacon's set is small and every member means something different to an operator:
   * `unauthenticated` (401), `forbidden` (403), `verifier_unavailable` (503 — identity is down,
   * NOT Beacon), `bad_request` (400 — a malformed release tag), `override_refused` (422),
   * `not_found` (404 — this client asked for a path the service does not serve, which is a defect
   * in this bundle) and `internal`. Collapsing any two of them puts the wrong sentence on screen
   * during an incident.
   */
  code: string | undefined
  /** The HTTP status, for the one case where the code is absent and the status is all there is. */
  status: number | undefined
}

/**
 * Normalise a caught error for display.
 *
 * `fallback` covers the non-ApiError case, which is a bug in this bundle rather than a server
 * response — so it is also the only case worth reporting from here. An ApiError has already been
 * logged by the service that produced it, under the request id shown to the operator.
 */
export function noticeFor(err: unknown, fallback: string): ErrorNotice {
  if (err instanceof ApiError) {
    return {
      message: err.message,
      requestId: err.requestId,
      code: err.code,
      status: err.status,
    }
  }
  report({
    app: APP_NAME,
    type: err instanceof Error ? err.name : 'UnknownError',
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? (err.stack ?? null) : null,
    context: { fallback },
  })
  return {
    message: fallback,
    requestId: undefined,
    code: undefined,
    status: undefined,
  }
}

/* ---- the single-flight refresh ------------------------------------- */

let inflightRefresh: Promise<boolean> | null = null

/**
 * Refresh the session, at most once concurrently.
 *
 * Every caller that arrives while a refresh is in flight awaits THE SAME promise; the slot is
 * cleared when it settles, so the next 401 after this one starts a fresh attempt rather than
 * replaying a stale answer.
 */
export function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return Promise.resolve(false)
  if (!inflightRefresh) {
    inflightRefresh = performRefresh(refreshToken).finally(() => {
      inflightRefresh = null
    })
  }
  return inflightRefresh
}

async function performRefresh(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${nimbusUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      // Returning false signs the operator out either way, but the two causes are not the same
      // event: a 401 is an expired refresh token and routine, anything else is Nimbus failing.
      if (res.status !== 401) {
        report({
          app: APP_NAME,
          type: 'RefreshFailed',
          message: `Token refresh failed (${res.status})`,
          statusCode: res.status,
          requestId: res.headers.get('x-request-id'),
        })
      }
      return false
    }
    setTokens((await res.json()) as AuthTokens)
    return true
  } catch (err) {
    report({
      app: APP_NAME,
      type: 'RefreshUnreachable',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? (err.stack ?? null) : null,
      context: { nimbus: nimbusUrl() },
    })
    return false
  }
}

function expireSession(): void {
  clearTokens()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

/* ---- the request core ---------------------------------------------- */

export interface RequestOptions {
  method?: string
  body?: unknown
  /** Default true: attach the bearer token and refresh once on 401. */
  auth?: boolean
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
  /**
   * Extra request headers. **Nothing on this surface sets one, and that is a fact about the API.**
   *
   * Beacon reads exactly three request headers: `authorization` and `x-beacon-token` in
   * `authorise` (`beacon/src/server.ts:876`, `:884`), plus `x-request-id` and `host` in the server
   * frame (`:249`, `:253`). There is no `Idempotency-Key` anywhere in that repository, and this
   * bundle sends no request that would need one: every call it makes is a GET.
   *
   * The parameter is kept rather than deleted because deleting it would make the next writer add
   * it back without this note. `authorization` and `content-type` are set AFTER these are spread,
   * so a caller cannot accidentally drop the bearer by passing a header map of its own.
   */
  headers?: Record<string, string>
}

async function request<T>(base: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, query, signal, headers: extra } = opts

  // `base` may be '' (relative, same origin), so resolve against the page origin.
  const url = new URL(base + path, pageOrigin())
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
    }
  }

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = { accept: 'application/json', ...extra }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const token = getAccessToken()
    if (auth && token) headers['authorization'] = `Bearer ${token}`
    return fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    })
  }

  let res: Response
  try {
    res = await send()
  } catch (err) {
    // The user-facing sentence is the right one whether the cause is their wifi or our container.
    // The cause itself, though, only exists here — discarding it is how a service being down
    // looked exactly like a bad connection, for everyone, for as long as it lasted.
    report({
      app: APP_NAME,
      type: 'NetworkError',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? (err.stack ?? null) : null,
      context: { method, url: url.toString() },
    })
    // Status 0 and code `unreachable`, and BOTH are load-bearing on this surface. The gate page
    // has to be able to tell "Beacon refused the release" from "we could not ask Beacon", and
    // this is the second of those. See `askedTheGate` in src/lib/verdict.ts.
    throw new ApiError(
      0,
      'Beacon could not be reached, so the gate was never asked.',
      'unreachable',
      undefined,
    )
  }

  // One silent refresh and retry on expiry. Six of these at once share one refresh.
  if (res.status === 401 && auth && hasSession()) {
    if (await refreshSession()) {
      res = await send()
    } else {
      expireSession()
      throw new ApiError(
        401,
        'Your session expired. Sign in again.',
        'session_expired',
        res.headers.get('x-request-id') ?? undefined,
      )
    }
  }

  if (!res.ok) {
    // Beacon sets this header on every response, error or not, so it is present even when the
    // body is a proxy's HTML page rather than ours.
    let requestId = res.headers.get('x-request-id') ?? undefined
    let message = res.statusText || `Request failed (${res.status})`
    let code: string | undefined
    try {
      const parsed = readErrorBody(await res.json())
      if (parsed.message) message = parsed.message
      if (parsed.code) code = parsed.code
      if (parsed.requestId) requestId = parsed.requestId
    } catch (err) {
      // A non-JSON error body means something in FRONT of the service answered — a gateway, a
      // CDN, a misrouted deploy — and the request never reached it. Nothing server-side logs
      // that, so it has to be reported from here. On this surface it has a specific and likely
      // cause: nginx.conf's `/v1` block, which answers a plain-text 404 naming the missing
      // gateway rule.
      report({
        app: APP_NAME,
        type: 'NonJsonErrorBody',
        message: `${res.status} response from ${url.pathname} was not JSON`,
        stack: err instanceof Error ? (err.stack ?? null) : null,
        statusCode: res.status,
        requestId,
        context: { method, contentType: res.headers.get('content-type') },
      })
    }
    // `auth` means "attach a bearer IF we hold one", not "we hold one", so a 401 to a call made
    // without a session is the route saying it needs authentication rather than a session ending —
    // and expiring one that never existed dispatches `cf:auth-expired`, which signs an operator
    // out of a session they never had. `hasSession()` is the template's fix, kept.
    if (res.status === 401 && auth && hasSession()) expireSession()
    throw new ApiError(res.status, message, code, requestId)
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return undefined as T
  return (await res.json()) as T
}

/** Beacon's API: relative wherever a browser can reach it. See `apiBase()` in hosts.ts. */
export const api = <T,>(path: string, opts?: RequestOptions): Promise<T> =>
  request<T>(apiBase(), path, opts)

/** Nimbus, which is cross-origin from everywhere. */
export const nimbus = <T,>(path: string, opts?: RequestOptions): Promise<T> =>
  request<T>(nimbusUrl(), path, opts)

/* ---- boot and sign-in --------------------------------------------- */

/**
 * Redeem an SSO hand-off code, if the Account portal sent us back with one.
 *
 * Called once from main.tsx BEFORE React renders, so the first paint already knows whether there
 * is a session and no screen flashes signed-out and then signed-in. That matters more here than on
 * a public surface: the signed-out screen on this app is a sign-in panel, and flashing it at an
 * operator who has just signed in is the shape of a login loop.
 *
 * The strip-then-exchange ordering inside `consumeAuthCallback` is load-bearing and is documented
 * where it is implemented: the code leaves the address bar before it goes over the wire, so it is
 * never in the history, in a referrer, or in a screenshot taken while the request is in flight.
 */
export async function bootstrapSession(): Promise<boolean> {
  try {
    const tokens = await consumeAuthCallback()
    if (tokens) {
      setTokens(tokens)
      return true
    }
  } catch (err) {
    // A failed exchange is a signed-out boot, not a broken app: the sign-in button is right there.
    report({
      app: APP_NAME,
      type: 'AuthCallbackFailed',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? (err.stack ?? null) : null,
    })
  }
  return hasSession()
}

/**
 * Send the browser to the Account portal, returning here afterwards.
 *
 * `returnTo` defaults to the CURRENT URL including its path and query, which is what puts an
 * operator who deep-linked to `/objectives` back on `/objectives` rather than on the gate.
 */
export function signIn(returnTo?: string): void {
  signInRedirect(returnTo ?? (typeof window === 'undefined' ? undefined : window.location.href))
}

/** Clear this app's tokens FIRST — the portal cannot reach them — then end the shared session. */
export function signOut(returnTo?: string): void {
  clearTokens()
  signOutRedirect(returnTo ?? (typeof window === 'undefined' ? undefined : window.location.origin))
}

/** Reset module state. Tests only. */
export function __resetAuth(): void {
  inflightRefresh = null
  memory.clear()
}
