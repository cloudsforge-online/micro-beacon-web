/**
 * The journeys the gate reads.
 *
 * Two things this page will not do, both taken from the service's own reasoning:
 *
 *   * **A skip is never rendered as a pass.** `beacon/src/gate.ts`: "A skip is never green.
 *     It counts against the journey exactly as a failure would, because the journeys that quietly
 *     did nothing are the easiest ones to fake." The gauge agrees — a skip publishes 0.5, and the
 *     help text says "A skip is never 1: not-run is not passed"
 *     (`beacon/src/server.ts`).
 *   * **A journey with no run is not a journey that is fine.** `lastStatus` is null when nothing
 *     has ever run, and null renders as the word "never", never as a blank cell.
 *
 * The filter re-issues the request rather than filtering in memory, and that is deliberate even
 * though Beacon has no filter parameter to send: `useResource`'s `deps` are what re-run the
 * effect, and a filter that quietly reused a stale answer is how an operator reads the wrong list
 * under the right label. Here the filter is applied to the fetched list, so the request is
 * re-issued and the answer is fresh — see the note on `deps` in `src/lib/resource.ts`.
 */
import { useState } from 'react'
import { Empty, Failed, Loading } from '../components/states.tsx'
import { Badge, Note, Panel, When } from '../components/tone.tsx'
import { listJourneys, type Journey, type JourneyStatus } from '../lib/beacon.ts'
import { useResource } from '../lib/resource.ts'
import type { Voice } from '../lib/verdict.ts'

/** Status to voice. `null` is its own case and is the one that matters. */
export function journeyVoice(status: JourneyStatus | null): Voice {
  switch (status) {
    case 'pass':
      return {
        word: 'Passed',
        glyph: '●',
        tone: 'clear',
        meaning: 'Every step of the last scheduled run did what it was supposed to do.',
      }
    case 'skip':
      return {
        word: 'Skipped',
        glyph: '▲',
        tone: 'caution',
        meaning:
          'The last run stood down before it proved anything — usually a missing address or ' +
          'credential. It scores against this journey exactly as a failure does, because a ' +
          'scenario that quietly does nothing is the easiest kind to fake.',
      }
    case 'fail':
      return {
        word: 'Failed',
        glyph: '■',
        tone: 'stop',
        meaning:
          'A step asserted something about the product and the product disagreed. Treat this as ' +
          'user-visible until you have shown otherwise.',
      }
    case 'error':
      return {
        word: 'Errored',
        glyph: '■',
        tone: 'stop',
        meaning:
          'The run threw something other than a failed assertion, so it never reached a verdict. ' +
          'That usually points at Beacon or the harness rather than at the product.',
      }
    case null:
      return {
        word: 'Never run',
        glyph: '?',
        tone: 'unknown',
        meaning:
          'Not one scheduled run is on record. Nobody has measured this path, and where the ' +
          'journey is critical the gate refuses on that alone.',
      }
  }
}

type Filter = 'all' | 'critical' | 'muted'

export function JourneysPage() {
  const [filter, setFilter] = useState<Filter>('all')
  // `filter` is in the dependency array, so changing it aborts the in-flight request and asks
  // again. Beacon serves the whole list either way; re-asking costs one request and buys the
  // guarantee that the rows under a filter are not the rows from before it.
  const journeys = useResource(
    (signal) => listJourneys(signal),
    (data) => data.journeys.length,
    'Beacon did not send back the journey list.',
    [filter],
  )

  const rows = (journeys.data?.journeys ?? []).filter((j) =>
    filter === 'critical' ? j.critical : filter === 'muted' ? j.muted : true,
  )
  const muted = (journeys.data?.journeys ?? []).filter((j) => j.muted)

  return (
    <>
      <header className="bw-page__head">
        <h1 className="bw-page__title">Journeys</h1>
        <p className="bw-page__lead">
          A journey walks a whole path through the live estate, one named step at a time — sign in,
          hand off to another product, move money, read it back. Where a probe asks whether one
          address answers, a journey asks whether the product works. That is why a wall of green
          probes can sit beside a broken journey: every service replied, and the path through them
          still came apart.
        </p>
        <p className="bw-page__lead">
          Beacon drives each one on a schedule — every five minutes unless this estate says
          otherwise — and cuts a run off when it overruns its deadline. Only scheduled runs count. A
          run somebody kicked off by hand is left out on purpose, so that investigating an outage
          cannot turn the board green.
        </p>
        <p className="bw-page__lead">
          A critical journey holds the release gate shut when its last run failed, skipped or
          errored, when it has yet to string together three green runs, or when it has never run at
          all. It also holds the gate shut when that last run is older than the freshness horizon —
          the age past which Beacon stops treating a result as current, because a journey that
          stopped running keeps reporting whatever it said last. Any muted journey holds the gate
          shut too, critical or not.
        </p>
      </header>

      <div className="bw-filters" role="group" aria-label="Filter journeys">
        {(['all', 'critical', 'muted'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`bw-filter${filter === value ? ' is-active' : ''}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === 'all' ? 'All' : value === 'critical' ? 'Critical only' : 'Muted only'}
          </button>
        ))}
      </div>

      {muted.length > 0 && (
        <Note tone="warn">
          <strong>
            {muted.length} journey(s) are muted, and the gate will not promote anything until that
            count reaches zero.
          </strong>{' '}
          Muting hides the alarm, never the measurement — the journey keeps running and keeps
          scoring. So a muted row is not a healthy row; it is one nobody is acting on. The gate
          files it as a <em>known</em> blocker rather than an unknown, because a person chose it and
          their name is on the row below.
        </Note>
      )}

      <Panel title="Every registered journey" reads="GET /v1/journeys">
        {journeys.state === 'loading' && <Loading label="Asking Beacon which journeys are registered" />}
        {journeys.state === 'failed' && journeys.error && (
          <Failed which="The journey list" notice={journeys.error} onRetry={journeys.reload} />
        )}
        {journeys.state === 'empty' && (
          <Empty
            title="No journeys are registered"
            meaning={
              'Beacon is up and has been given nothing to drive. No user path in this estate is ' +
              'being exercised, so nobody can say whether the products work — and a gate with no ' +
              'journeys behind it has nothing to refuse on. Journeys are declared in Beacon’s own ' +
              'code and appear here once a deploy syncs them.'
            }
          />
        )}
        {journeys.state === 'ok' && rows.length === 0 && (
          <Empty
            title="No journeys match this filter"
            meaning={
              'Beacon sent a full list and this filter excludes every row in it. Switch back to ' +
              'All to see them. Nothing is missing and nothing failed.'
            }
          />
        )}
        {journeys.state === 'ok' && rows.length > 0 && (
          <ul className="bw-rows">
            {rows.map((journey) => (
              <JourneyRow key={journey.name} journey={journey} />
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}

function JourneyRow({ journey }: { journey: Journey }) {
  return (
    <li className="bw-row">
      <div className="bw-row__head">
        <Badge voice={journeyVoice(journey.lastStatus)} />
        <code className="cf-num bw-code">{journey.name}</code>
        {journey.critical && (
          <span
            className="bw-tag bw-tag--critical"
            title="On the critical path. This journey can hold a release on its own."
          >
            critical
          </span>
        )}
        {journey.muted && (
          <span
            className="bw-tag bw-tag--muted"
            title="Still running, still scoring, nobody acting on it. The gate refuses while any journey is muted."
          >
            muted
          </span>
        )}
      </div>
      <p className="bw-row__title">{journey.title}</p>
      <p className="bw-row__meta">
        <span className="bw-row__group">{journey.productGroup}</span>
        {' · last run '}
        <When iso={journey.lastRunAt} />
      </p>
      {journey.muted && (
        <p className="bw-row__muted">
          Silenced by <code className="cf-num bw-code">{journey.mutedBy ?? 'unknown'}</code>, who
          gave the reason: {journey.mutedReason ?? 'none was recorded'}
        </p>
      )}
    </li>
  )
}
