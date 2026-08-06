/**
 * The request client, driven against a stubbed `fetch` — and what it must NEVER send.
 *
 * There is no DOM in this suite on purpose (see the header of test/browser-stubs.ts). What is
 * tested here is the pure layer: the error envelope, the single-flight refresh, and the headers
 * that actually reach `fetch`.
 *
 * The headers are the half worth having. This surface is the estate's only browser client of a
 * service with a STATIC SHARED SECRET in its authorise path, and a bundle that sent it would
 * publish it to every reader of the page and to every extension in their profile — and would
 * authenticate as `service:beacon-token`, making every action in the audit trail anonymous.
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installFetch, installStorage, installWindow, json, removeStorage, removeWindow } from './browser-stubs.ts'
import {
  ApiError,
  __resetAuth,
  noticeFor,
  readErrorBody,
  refreshSession,
  setTokens,
} from '../src/lib/api.ts'
import { askGate, gateHistory, listIncidents, listObjectives } from '../src/lib/beacon.ts'

beforeEach(() => {
  installWindow('http://localhost:5193/')
  installStorage()
  __resetAuth()
})

afterEach(() => {
  removeWindow()
  removeStorage()
})

describe('the error envelope', () => {
  it('reads the nested shape Beacon actually sends', () => {
    // `errorReply()`, beacon/src/server.ts. The template read this as FLAT and assigned
    // `data.error` — an object — straight to the displayed message, so every server-side failure
    // rendered as `[object Object]` with the request id present and discarded.
    const parsed = readErrorBody({
      error: { code: 'bad_request', message: 'release must be a tag', requestId: 'r-1' },
    })
    assert.deepEqual(parsed, { message: 'release must be a tag', code: 'bad_request', requestId: 'r-1' })
  })

  it('still reads a flat shape, for anything in front of the service on a rollback path', () => {
    assert.deepEqual(readErrorBody({ error: 'gone', code: 'x', requestId: 'r-2' }), {
      message: 'gone',
      code: 'x',
      requestId: 'r-2',
    })
  })

  it('returns nothing rather than guessing, for a body it does not recognise', () => {
    assert.deepEqual(readErrorBody('<html>502</html>'), {})
    assert.deepEqual(readErrorBody(null), {})
  })

  it('keeps the code on the notice, so a screen can branch on it', () => {
    const notice = noticeFor(new ApiError(403, 'missing authority: beacon:read', 'forbidden', 'r-3'), 'x')
    assert.equal(notice.code, 'forbidden')
    assert.equal(notice.requestId, 'r-3')
    assert.equal(notice.status, 403)
  })
})

describe('what reaches fetch', () => {
  it('sends the bearer on every Beacon read — every route is authenticated', () => {
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    const stub = installFetch(() => json(200, { release: 'x', decision: 'refuse', promote: false, indeterminate: true, reasons: [], waived: [] }))
    return askGate('probe-1').then(() => {
      stub.restore()
      const call = stub.calls[0]
      assert.ok(call)
      assert.equal(call.headers['authorization'], 'Bearer access-1')
    })
  })

  it('NEVER sends the static break-glass token', async () => {
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    const stub = installFetch(() => json(200, { slos: [], budgets: [] }))
    await listObjectives()
    await gateHistory('probe-1').catch(() => undefined)
    await listIncidents(true).catch(() => undefined)
    stub.restore()
    for (const call of stub.calls) {
      for (const name of Object.keys(call.headers)) {
        assert.notEqual(name.toLowerCase(), 'x-beacon-token', `${call.url} carried the static token`)
      }
    }
  })

  it('uses a relative URL on a local origin, because a cross-origin one cannot be answered', async () => {
    const stub = installFetch(() => json(200, { slos: [], budgets: [] }))
    await listObjectives()
    stub.restore()
    assert.equal(stub.calls[0]?.url, 'http://localhost:5193/v1/slos')
  })

  it('puts the release in the query string, encoded', async () => {
    const stub = installFetch(() => json(200, { release: 'a b', decision: 'refuse', promote: false, indeterminate: false, reasons: [], waived: [] }))
    await askGate('a b')
    stub.restore()
    assert.equal(stub.calls[0]?.url, 'http://localhost:5193/v1/gate?release=a+b')
  })

  it('sends only GETs — this bundle is read-only against Beacon', async () => {
    const stub = installFetch(() => json(200, { incidents: [] }))
    await listIncidents(true)
    await listObjectives()
    stub.restore()
    for (const call of stub.calls) assert.equal(call.method, 'GET')
  })
})

describe('a refusal is not an error', () => {
  it('resolves with the verdict when the gate refuses', async () => {
    // HTTP 200 for `refuse` (beacon/src/server.ts). A client that treated a 4xx as the
    // refusal signal would make a refused release indistinguishable from a malformed request.
    const stub = installFetch(() =>
      json(200, {
        release: 'probe-1',
        decision: 'refuse',
        promote: false,
        indeterminate: true,
        reasons: [{ code: 'conformance_never_run', subject: 'conformance', detail: '', determinacy: 'unknown' }],
        waived: [],
      }),
    )
    const answer = await askGate('probe-1')
    stub.restore()
    assert.equal(answer.decision, 'refuse')
    assert.equal(answer.indeterminate, true)
  })

  it('throws with a distinguishable code when Beacon cannot be reached at all', async () => {
    const stub = installFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    const err = await askGate('probe-1').catch((e: unknown) => e)
    stub.restore()
    assert.ok(err instanceof ApiError)
    // Status 0 and code `unreachable`, both load-bearing: this is "we could not ask the gate",
    // which is a completely different fact from "the gate refused".
    assert.equal(err.status, 0)
    assert.equal(err.code, 'unreachable')
    assert.match(err.message, /never asked/i)
  })
})

describe('the single-flight refresh', () => {
  it('performs ONE refresh for many concurrent callers', async () => {
    setTokens({ accessToken: 'stale', refreshToken: 'refresh-1' })
    let refreshes = 0
    const stub = installFetch((call) => {
      if (call.url.includes('/auth/refresh')) {
        refreshes += 1
        return json(200, { accessToken: 'fresh', refreshToken: 'refresh-2' })
      }
      return json(200, { ok: true })
    })
    await Promise.all([refreshSession(), refreshSession(), refreshSession()])
    stub.restore()
    // Six refreshes against a rotating refresh token means five present a token that has just been
    // superseded, and the operator is signed out while holding a valid session.
    assert.equal(refreshes, 1)
  })

  it('does not expire a session that never existed', async () => {
    // `auth` means "attach a bearer IF we hold one". A 401 to a call made without a session is the
    // route saying it needs authentication, not a session ending — and expiring one that never
    // existed dispatches `cf:auth-expired`, signing an operator out of nothing.
    const browser = installWindow('http://localhost:5193/')
    const stub = installFetch(() => json(401, { error: { code: 'unauthenticated', message: 'a valid credential is required' } }))
    const err = await listObjectives().catch((e: unknown) => e)
    stub.restore()
    assert.ok(err instanceof ApiError)
    assert.equal(err.status, 401)
    assert.deepEqual(browser.dispatched, [])
  })
})
