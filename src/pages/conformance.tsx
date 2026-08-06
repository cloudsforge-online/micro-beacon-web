/**
 * Conformance runs.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * AN EMPTY LIST HERE IS THE REASON THE LIVE GATE IS INDETERMINATE.
 *
 * `collectReasons` emits `conformance_never_run` when `latestConformance` returns nothing
 * (`beacon/src/gate.ts`). That code is an **unknown** — it cannot be waived by any
 * override — and one unknown makes the whole evaluation indeterminate, which refuses before
 * anything else is even looked at. So the empty panel below is not a quiet corner of this console;
 * it is the single reason every release in this estate is currently refused with
 * `indeterminate: true`.
 *
 * That is the opposite shape from the objectives page, and the two are worth reading together. An
 * empty conformance table makes the gate SHOUT. An empty objectives table makes it go SILENT. The
 * difference is that `conformance_never_run` is emitted when the collection is empty, while the
 * budget codes are emitted from inside a loop OVER the collection — so an empty one produces
 * nothing at all. Same absence, opposite consequence, and only one of them is visible in the
 * verdict.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { Empty, Failed, Loading } from '../components/states.tsx'
import { Badge, Note, Panel, When } from '../components/tone.tsx'
import { listConformance, type ConformanceRun } from '../lib/beacon.ts'
import { useResource } from '../lib/resource.ts'
import type { Voice } from '../lib/verdict.ts'

export function conformanceVoice(run: ConformanceRun): Voice {
  if (run.breaking > 0) {
    return {
      word: 'Breaking',
      glyph: '■',
      tone: 'stop',
      meaning: 'This suite found breaking differences against the recorded corpus. It refuses the gate.',
    }
  }
  if (run.skipped > 0) {
    return {
      word: 'Partly skipped',
      glyph: '▲',
      tone: 'caution',
      meaning:
        'Some vectors were not compared. A suite that could not be run reports under skipped, ' +
        'never under passed.',
    }
  }
  return {
    word: 'No breaking differences',
    glyph: '●',
    tone: 'clear',
    meaning: 'Every vector compared identically or benignly against the recorded corpus.',
  }
}

export function ConformancePage() {
  const conformance = useResource(
    (signal) => listConformance(signal),
    (data) => data.suites.length,
    'The conformance results could not be read.',
    [],
  )

  return (
    <>
      <header className="bw-page__head">
        <h1 className="bw-page__title">Conformance</h1>
        <p className="bw-page__lead">
          The latest replay of the recorded corpus, per suite. A breaking difference refuses the
          gate; so does never having run at all — and the second is an unknown, which no override
          can reach.
        </p>
      </header>

      <Panel title="Latest run per suite" reads="GET /v1/conformance">
        {conformance.state === 'loading' && <Loading label="Reading the conformance results" />}
        {conformance.state === 'failed' && conformance.error && (
          <Failed
            which="The conformance results"
            notice={conformance.error}
            onRetry={conformance.reload}
          />
        )}
        {conformance.state === 'empty' && (
          <>
            <Empty
              title="No conformance run has ever been recorded"
              meaning={
                'Beacon answered with an empty list. Nothing has been compared against the ' +
                'recorded corpus, so nobody knows whether the estate’s wire formats have changed.'
              }
            />
            <Note tone="stop">
              <strong>This is why the release gate is indeterminate right now.</strong> An empty
              list produces the reason <code className="cf-num bw-code">conformance_never_run</code>
              , which is an <em>unknown</em>. One unknown refuses the whole evaluation before
              anything else is considered, and no override can waive it. A run is recorded by{' '}
              <code className="cf-num bw-code">POST /v1/conformance</code> from CI, where{' '}
              <code className="cf-num bw-code">@cloudsforge/conformance</code> replays the corpus.
            </Note>
          </>
        )}
        {conformance.state === 'ok' && conformance.data && (
          <ul className="bw-rows">
            {conformance.data.suites.map((run) => (
              <li className="bw-row" key={run.suite}>
                <div className="bw-row__head">
                  <Badge voice={conformanceVoice(run)} />
                  <code className="cf-num bw-code">{run.suite}</code>
                </div>
                <dl className="bw-counts">
                  <div>
                    <dt>Identical</dt>
                    <dd className="cf-num">{run.identical}</dd>
                  </div>
                  <div>
                    <dt>Benign</dt>
                    <dd className="cf-num">{run.benign}</dd>
                  </div>
                  <div>
                    <dt>Breaking</dt>
                    <dd className="cf-num">{run.breaking}</dd>
                  </div>
                  <div>
                    {/* Its own column, never folded into a total. The service is explicit that a
                        suite which could not be run reports here rather than under passed
                        (`beacon/src/server.ts`). */}
                    <dt>Skipped</dt>
                    <dd className="cf-num">{run.skipped}</dd>
                  </div>
                </dl>
                <p className="bw-row__meta">
                  {run.releaseTag && (
                    <>
                      release <code className="cf-num bw-code">{run.releaseTag}</code> ·{' '}
                    </>
                  )}
                  ran <When iso={run.ranAt} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
