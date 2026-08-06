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
      meaning:
        'This suite replied differently from the recording in a way that would break a client ' +
        'written against the old answer. The gate refuses on it.',
    }
  }
  if (run.skipped > 0) {
    return {
      word: 'Partly skipped',
      glyph: '▲',
      tone: 'caution',
      meaning:
        'Some interactions were never put side by side. Whatever could not be replayed is ' +
        'counted under skipped and never under identical, so this run proves less than the ' +
        'numbers beside it suggest.',
    }
  }
  return {
    word: 'No breaking differences',
    glyph: '●',
    tone: 'clear',
    meaning:
      'Every interaction came back either exactly as recorded or different in a way that leaves ' +
      'existing clients working.',
  }
}

export function ConformancePage() {
  const conformance = useResource(
    (signal) => listConformance(signal),
    (data) => data.suites.length,
    'Beacon did not send back the conformance results.',
    [],
  )

  return (
    <>
      <header className="bw-page__head">
        <h1 className="bw-page__title">Conformance</h1>
        <p className="bw-page__lead">
          This page is not about whether anything is up. A suite replays a corpus of interactions
          recorded earlier and holds each answer against the one on file, sorting every difference
          into three piles. Identical is unchanged. Benign is changed in a way that leaves existing
          callers working — a field appearing, an array growing. Breaking is the rest: a field
          taken away, an array that shrank, anything a client written against the old shape would
          fall over on.
        </p>
        <p className="bw-page__lead">
          So a service can answer every probe, carry every journey and still fail here, by quietly
          changing the shape of what it says. That failure is invisible to uptime and lands on
          whoever integrated with you, which is why it holds a release.
        </p>
        <p className="bw-page__lead">
          Beacon does not replay the corpus itself. CI does, and posts each suite’s result to{' '}
          <code className="cf-num bw-code">POST /v1/conformance</code>. A breaking difference is a
          known blocker and can be waived. A suite that never ran, skipped or errored is an unknown
          — nobody compared anything — and no override reaches an unknown.
        </p>
      </header>

      <Panel title="The most recent run of each suite" reads="GET /v1/conformance">
        {conformance.state === 'loading' && <Loading label="Asking Beacon for the conformance results" />}
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
              title="Not one suite has ever reported"
              meaning={
                'Beacon holds no conformance run at all. Nothing has been held against the ' +
                'recording, so no one can say whether this estate still answers the way its ' +
                'callers were built to expect. Read that as an open question, not as a clean bill.'
              }
            />
            <Note tone="stop">
              <strong>This is what is holding every release.</strong> An empty table raises{' '}
              <code className="cf-num bw-code">conformance_never_run</code>, an{' '}
              <em>unknown</em>, and a single unknown settles the whole evaluation before any other
              input is read. No override reaches it, so the only way forward is to make a run
              happen. That comes from CI, where{' '}
              <code className="cf-num bw-code">@cloudsforge/conformance</code> replays the corpus
              and posts the result to{' '}
              <code className="cf-num bw-code">POST /v1/conformance</code>.
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
