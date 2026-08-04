/**
 * The journeys the gate reads.
 *
 * Two things this page will not do, both taken from the service's own reasoning:
 *
 *   * **A skip is never rendered as a pass.** `beacon/src/gate.ts:237-241`: "A skip is never green.
 *     It counts against the journey exactly as a failure would, because the journeys that quietly
 *     did nothing are the easiest ones to fake." The gauge agrees — a skip publishes 0.5, and the
 *     help text says "A skip is never 1: not-run is not passed"
 *     (`beacon/src/server.ts:117`).
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
      return { word: 'Passed', glyph: '●', tone: 'clear', meaning: 'The most recent run passed.' }
    case 'skip':
      return {
        word: 'Skipped',
        glyph: '▲',
        tone: 'caution',
        meaning:
          'The most recent run was a skip. A skip is never green: it counts against the journey ' +
          'exactly as a failure would.',
      }
    case 'fail':
      return { word: 'Failed', glyph: '■', tone: 'stop', meaning: 'The most recent run failed.' }
    case 'error':
      return {
        word: 'Errored',
        glyph: '■',
        tone: 'stop',
        meaning: 'The most recent run did not complete.',
      }
    case null:
      return {
        word: 'Never run',
        glyph: '?',
        tone: 'unknown',
        meaning:
          'No scheduled run has ever been recorded. Nothing has been measured, and for a critical ' +
          'journey that refuses the gate.',
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
    'The journey list could not be read.',
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
          What Beacon actually drives against the estate. A critical journey that is failing,
          skipping, stale or has never run refuses the release gate.
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
            {muted.length} journey(s) are muted, and the gate requires that count to be zero.
          </strong>{' '}
          A muted journey is not a passing journey; it is an unmeasured one, and it is a{' '}
          <em>known</em> blocker rather than an unknown because somebody chose it and left their
          name on it (<code className="cf-num bw-code">beacon/src/gate.ts:201-212</code>).
        </Note>
      )}

      <Panel title="Registered journeys" reads="GET /v1/journeys">
        {journeys.state === 'loading' && <Loading label="Reading the journey list" />}
        {journeys.state === 'failed' && journeys.error && (
          <Failed which="The journey list" notice={journeys.error} onRetry={journeys.reload} />
        )}
        {journeys.state === 'empty' && (
          <Empty
            title="No journeys are registered"
            meaning={
              'Beacon is running and has nothing to drive. That is a finding about coverage, not ' +
              'a quiet week: a gate with no journeys behind it cannot refuse on one.'
            }
          />
        )}
        {journeys.state === 'ok' && rows.length === 0 && (
          <Empty
            title="No journeys match this filter"
            meaning="The list was read successfully; this filter simply excludes every row in it."
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
          <span className="bw-tag bw-tag--critical" title="A gate input. This one can refuse a release.">
            critical
          </span>
        )}
        {journey.muted && (
          <span className="bw-tag bw-tag--muted" title="Muted journeys must be zero at a gate.">
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
          Muted by <code className="cf-num bw-code">{journey.mutedBy ?? 'unknown'}</code>:{' '}
          {journey.mutedReason ?? 'no reason was given'}
        </p>
      )}
    </li>
  )
}
