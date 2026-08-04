/**
 * Synthetic probes.
 *
 * `pending` is the case this page is built around. A probe that has never reported is `pending`,
 * and Beacon is explicit that this is not the same as down: `scrapeRefresh` publishes NOTHING for
 * it rather than a zero, because "a gap in a graph is readable; a series that reads 0 for a probe
 * that has never run makes every deploy look like an outage"
 * (`beacon/src/server.ts:775-777`). This page follows the same rule in words: `pending` is
 * "not yet reported", in the unknown tone, and never in the same tone as `up`.
 *
 * Probes are NOT a gate input. `collectReasons` reads journeys, budgets, conformance and open
 * incidents (`beacon/src/gate.ts:192-332`) and never touches `probes` or `probe_states` — a probe
 * failure reaches the gate only if it opens an incident. The page says so, because a reader who
 * assumed otherwise would look at a green probe list and conclude the gate had checked it.
 */
import { Empty, Failed, Loading } from '../components/states.tsx'
import { Badge, Note, Panel, When } from '../components/tone.tsx'
import { listProbes, type ProbeState } from '../lib/beacon.ts'
import { useResource } from '../lib/resource.ts'
import type { Voice } from '../lib/verdict.ts'

export function probeVoice(state: ProbeState): Voice {
  switch (state) {
    case 'up':
      return { word: 'Up', glyph: '●', tone: 'clear', meaning: 'The target answered as expected.' }
    case 'degraded':
      return {
        word: 'Degraded',
        glyph: '▲',
        tone: 'caution',
        meaning: 'The target answered, but slowly enough to count against it.',
      }
    case 'down':
      return { word: 'Down', glyph: '■', tone: 'stop', meaning: 'The target did not answer.' }
    case 'pending':
      return {
        word: 'Not yet reported',
        glyph: '?',
        tone: 'unknown',
        meaning:
          'This probe has never reported. It is not up and it is not down — nothing has been ' +
          'measured, and Beacon publishes no metric for it at all rather than a zero.',
      }
  }
}

export function ProbesPage() {
  const probes = useResource(
    (signal) => listProbes(signal),
    (data) => data.probes.length,
    'The probe list could not be read.',
    [],
  )

  return (
    <>
      <header className="bw-page__head">
        <h1 className="bw-page__title">Probes</h1>
        <p className="bw-page__lead">
          Individual HTTP checks against estate targets.{' '}
          <strong>These are not a release-gate input.</strong> The gate reads journeys, error
          budgets, conformance and open incidents; a probe reaches it only by opening an incident.
        </p>
      </header>

      <Panel title="Registered probes" reads="GET /v1/probes">
        {probes.state === 'loading' && <Loading label="Reading the probe list" />}
        {probes.state === 'failed' && probes.error && (
          <Failed which="The probe list" notice={probes.error} onRetry={probes.reload} />
        )}
        {probes.state === 'empty' && (
          <>
            <Empty
              title="No probes are registered"
              meaning={
                'Beacon answered with an empty list. There is no per-target HTTP check running in ' +
                'this estate at all, so nothing on this page — and nothing on the public status ' +
                'page, which projects from the same table — is reporting target health.'
              }
            />
            <Note tone="warn">
              A probe is registered through the admin-only{' '}
              <code className="cf-num bw-code">PUT /v1/probes/:name</code>, and Beacon ships no
              catalogue of its own. This is the same shape of gap as the empty objectives table:
              nothing seeds it, so nothing is measured, and the absence reports as silence rather
              than as an alarm.
            </Note>
          </>
        )}
        {probes.state === 'ok' && probes.data && (
          <ul className="bw-rows">
            {probes.data.probes.map((probe) => (
              <li className="bw-row" key={probe.name}>
                <div className="bw-row__head">
                  <Badge voice={probeVoice(probe.state)} />
                  <code className="cf-num bw-code">{probe.name}</code>
                  {probe.critical && <span className="bw-tag bw-tag--critical">critical</span>}
                  {!probe.enabled && <span className="bw-tag bw-tag--muted">disabled</span>}
                </div>
                <p className="bw-row__meta">
                  <code className="cf-num bw-code">
                    {probe.method} {probe.url}
                  </code>{' '}
                  → expects <span className="cf-num">{probe.expectStatus}</span>
                </p>
                <p className="bw-row__meta">
                  {probe.productGroup} · in this state since <When iso={probe.since} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
