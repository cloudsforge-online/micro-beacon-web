/**
 * Synthetic probes.
 *
 * `pending` is the case this page is built around. A probe that has never reported is `pending`,
 * and Beacon is explicit that this is not the same as down: `scrapeRefresh` publishes NOTHING for
 * it rather than a zero, because "a gap in a graph is readable; a series that reads 0 for a probe
 * that has never run makes every deploy look like an outage"
 * (`beacon/src/server.ts`). This page follows the same rule in words: `pending` is
 * "not yet reported", in the unknown tone, and never in the same tone as `up`.
 *
 * Probes are NOT a gate input. `collectReasons` reads journeys, budgets, conformance and open
 * incidents (`beacon/src/gate.ts`) and never touches `probes` or `probe_states` — a probe
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
      return {
        word: 'Up',
        glyph: '●',
        tone: 'clear',
        meaning: 'The target replied with the status this probe asks for, and replied quickly.',
      }
    case 'degraded':
      return {
        word: 'Degraded',
        glyph: '▲',
        tone: 'caution',
        meaning:
          'The status was right and the reply was slow — over a second and a half, which is the ' +
          'line between up and degraded.',
      }
    case 'down':
      return {
        word: 'Down',
        glyph: '■',
        tone: 'stop',
        meaning:
          'Enough checks failed in a row to cross the threshold. The target sent the wrong ' +
          'status, refused the connection, or sent nothing before the deadline.',
      }
    case 'pending':
      return {
        word: 'Not yet reported',
        glyph: '?',
        tone: 'unknown',
        meaning:
          'No check has come back for this probe. Read that as neither up nor down: nothing ' +
          'has been measured, and Beacon withholds the metric rather than publishing a zero ' +
          'that every dashboard would draw as an outage.',
      }
  }
}

export function ProbesPage() {
  const probes = useResource(
    (signal) => listProbes(signal),
    (data) => data.probes.length,
    'Beacon did not send back the probe list.',
    [],
  )

  return (
    <>
      <header className="bw-page__head">
        <h1 className="bw-page__title">Probes</h1>
        <p className="bw-page__lead">
          A probe is a single HTTP request, sent on its own cadence from wherever Beacon is
          running. It counts as a pass only when the target comes back with the exact status the
          probe asks for. Redirects are not followed, so a 302 where a 200 was wanted fails like
          any other wrong answer.
        </p>
        <p className="bw-page__lead">
          A correct but slow reply — over a second and a half — is degraded, not up. Silence past
          the probe’s deadline is down. One bad request is not enough to move the state either: it
          takes a run of consecutive failures to bring a target down and a run of clean replies to
          bring it back, so a dropped packet pages nobody. Three and two are the defaults, and this
          estate can set both.
        </p>
        <p className="bw-page__lead">
          <strong>Nothing on this page reaches the release gate directly.</strong> The gate reads
          journeys, error budgets, conformance and open incidents; a probe gets a hearing there
          only once it has opened an incident. And a probe watches from one vantage point, so
          “down” means the target stopped answering Beacon — not that a user has noticed. Look at
          the journeys to find out whether anyone has.
        </p>
      </header>

      <Panel title="Every registered probe" reads="GET /v1/probes">
        {probes.state === 'loading' && <Loading label="Asking Beacon which probes are registered" />}
        {probes.state === 'failed' && probes.error && (
          <Failed which="The probe list" notice={probes.error} onRetry={probes.reload} />
        )}
        {probes.state === 'empty' && (
          <>
            <Empty
              title="No probes are registered"
              meaning={
                'Beacon answered, and the list it sent back was empty. Read this as coverage, ' +
                'not as calm: not one address in the estate is being checked, so neither this ' +
                'page nor the public status page — which draws from the same table — can tell ' +
                'you anything about whether a target is answering.'
              }
            />
            <Note tone="warn">
              Rows appear here once somebody registers a probe through the admin-only{' '}
              <code className="cf-num bw-code">PUT /v1/probes/:name</code>. Beacon carries no
              built-in catalogue, so an estate nobody has registered probes for reports silence and
              never an alarm. That silence is the thing to act on.
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
                  → passes only on <span className="cf-num">{probe.expectStatus}</span>
                </p>
                <p className="bw-row__meta">
                  checked every <span className="cf-num">{probe.intervalMs / 1000}s</span>, giving
                  up after <span className="cf-num">{probe.deadlineMs / 1000}s</span>
                </p>
                <p className="bw-row__meta">
                  {probe.productGroup} · unchanged since <When iso={probe.since} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
