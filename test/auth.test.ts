/**
 * The session, and the gate this surface has because its reads are not public.
 *
 * `micro-explorer-web` pins the ABSENCE of a gate, for a good reason on that surface: its reads are
 * anonymous, so a gate there would demand a session for public chain facts. This file pins the
 * presence of one, for the mirror-image reason — every Beacon `/v1` route is authenticated and
 * `beacon` is `adminOnly` — and pins the two properties that make it worth having rather than
 * merely present: that no request is fired without a session, and that no ROLE is predicted here.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { readOperator } from '../src/lib/auth.tsx'

const root = fileURLToPath(new URL('..', import.meta.url))
const authSource = readFileSync(join(root, 'src', 'lib', 'auth.tsx'), 'utf8')
const app = readFileSync(join(root, 'src', 'app.tsx'), 'utf8')

describe('reading the operator out of /auth/me', () => {
  it('reads the NESTED shape identity really sends', () => {
    // The estate got this wrong at the root: the web template declared `{ handle, roles }` and read
    // both off the TOP level, where they are not. Four frontends inherited it, `roles` was always
    // null, and the shared bar hid every adminOnly entry from every signed-in operator — including,
    // on every surface, the entry that points at this one.
    assert.deepEqual(readOperator({ user: { handle: 'ada', roles: ['admin'] } }), {
      handle: 'ada',
      roles: ['admin'],
    })
  })

  it('accepts NO flat fallback', () => {
    // Tolerating one would encode a response identity does not send, and the next reader would not
    // be able to tell which is real.
    assert.deepEqual(readOperator({ handle: 'ada', roles: ['admin'] }), { handle: null, roles: [] })
  })

  it('returns nobody for anything it does not recognise', () => {
    for (const body of [null, undefined, 'ada', 42, {}, { user: null }]) {
      assert.deepEqual(readOperator(body), { handle: null, roles: [] })
    }
  })

  it('drops a non-string role rather than rendering it', () => {
    assert.deepEqual(readOperator({ user: { handle: '', roles: ['admin', 7, null] } }), {
      handle: null,
      roles: ['admin'],
    })
  })
})

describe('the gate', () => {
  it('renders the sign-in panel INSTEAD OF the children, so no panel below it mounts', () => {
    // The property that matters. A wrapper that rendered the page and let the panels fetch would
    // show an operator six 401 panels and a sign-in button, and the six panels would be the
    // loudest thing on screen.
    assert.match(authSource, /if \(status === 'anonymous'\) \{[\s\S]*?return \(/)
    // `children` is returned only on the final path.
    const tail = authSource.slice(authSource.lastIndexOf("status === 'anonymous'"))
    assert.match(tail, /return <>\{children\}<\/>/)
  })

  it('has its own branch for `loading`, which never falls through to the sign-in panel', () => {
    // Flashing "sign in" at somebody who is signed in, for the length of one /auth/me round trip,
    // is the shape of a login loop.
    assert.match(authSource, /if \(status === 'loading'\)/)
  })

  it('predicts no role, because authorise() accepts any authenticated user for a read', () => {
    // A client that predicted the authorisation decision would eventually disagree with the
    // service making it, and the disagreement would fail closed: a non-admin who CAN read the gate
    // would be shown a refusal this bundle invented.
    const gate = authSource.slice(authSource.indexOf('export function RequiresOperator'))
    assert.doesNotMatch(gate, /roles|isAdmin|adminOnly/)
  })

  it('wraps every declared route and leaves the 404 page outside', () => {
    assert.match(app, /<RequiresOperator>/)
    assert.match(app, /path="\*" element=\{<NotFoundPage \/>\}/)
  })

  it('keeps the session when identity is unreachable, rather than closing the console', () => {
    // Identity being down is the single most likely reason somebody is reading a Beacon page —
    // the live estate has three open SEV2 incidents, all on identity journeys. A gate that
    // demanded a working /auth/me would lock an operator out of the page that says so.
    assert.match(authSource, /setStatus\(hasSession\(\) \? 'signedIn' : 'anonymous'\)/)
  })

  it('says, on the signed-out panel, that nothing has been requested', () => {
    // The difference between "we asked and got nothing" and "we have not asked". An operator
    // looking at a page with no data must be able to tell which.
    assert.match(authSource, /Nothing has been requested from Beacon on this page load/)
  })
})
