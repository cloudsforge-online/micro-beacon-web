/**
 * The four states, and the rule that decides between them.
 *
 * FAILURE OUTRANKS EMPTINESS, in both directions. A request that threw has told us nothing about
 * whether data exists, so reporting "nothing here" for a timeout is how an outage reads as a quiet
 * week — and it outranks `loading` too, so a failure cannot be hidden behind a spinner that never
 * resolves.
 *
 * That ordering matters more on this surface than on most. Half the panels here have an empty
 * answer as their MOST INTERESTING outcome — no objectives, no probes, no conformance run — so an
 * error rendered as emptiness would be indistinguishable from the estate's real findings.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { resourceState } from '../src/lib/resource.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

const notice = { message: 'gone', code: 'internal', requestId: 'r-1', status: 500 }

describe('which state a resource is in', () => {
  it('is loading before anything has arrived', () => {
    assert.equal(resourceState({ loading: true, error: null, count: null }), 'loading')
    // A settled request with no data yet is still loading, not empty.
    assert.equal(resourceState({ loading: false, error: null, count: null }), 'loading')
  })

  it('is ok when the answer carried rows', () => {
    assert.equal(resourceState({ loading: false, error: null, count: 3 }), 'ok')
  })

  it('is empty when the answer carried none', () => {
    assert.equal(resourceState({ loading: false, error: null, count: 0 }), 'empty')
  })

  it('is failed even while still loading', () => {
    assert.equal(resourceState({ loading: true, error: notice, count: null }), 'failed')
  })

  it('is failed even when a previous answer had rows', () => {
    // Stale data plus a fresh failure is failure. Showing the old rows under a fresh error is how
    // an operator reads yesterday's estate during today's incident.
    assert.equal(resourceState({ loading: false, error: notice, count: 5 }), 'failed')
  })

  it('is failed rather than empty when the count is nought', () => {
    // The one that matters here: an empty answer is a FINDING on this surface, so a failure
    // wearing its clothes would be a fabricated finding.
    assert.equal(resourceState({ loading: false, error: notice, count: 0 }), 'failed')
  })
})

describe('a filter re-issues the request', () => {
  it('every panel with a filter passes the filter VALUE as a dependency', () => {
    // `[nonce]` alone would never re-send, and the console would show the previous answer under
    // the new filter — silently. `src/lib/resource.ts` describes the failure at length: an
    // operator filtering during an incident and being handed the wrong evidence with the right
    // label on it.
    const journeys = readFileSync(join(root, 'src', 'pages', 'journeys.tsx'), 'utf8')
    const incidents = readFileSync(join(root, 'src', 'pages', 'incidents.tsx'), 'utf8')
    const gate = readFileSync(join(root, 'src', 'pages', 'gate.tsx'), 'utf8')
    assert.match(journeys, /\[filter\],/)
    assert.match(incidents, /\[openOnly\],/)
    // The gate's three resources all depend on the release, so typing a new tag re-asks all three.
    assert.equal([...gate.matchAll(/\[release\],/g)].length, 3)
  })
})
