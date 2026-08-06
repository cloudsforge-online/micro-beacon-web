/**
 * Error budgets — and, in this estate, the honest report that there are none.
 *
 * The rendering DECISION is not made here. It is made by `describeBudgets()` in
 * `src/lib/objectives.ts`, as a pure function of the response, and this component only draws what
 * that function returned. The split exists because of how this estate has failed before: sixteen
 * frontends shipped green browser suites while their pages were unusable, because every harness
 * stubbed the network and answered its own requests. A decision made inside a component can only
 * be tested that way. A pure function has nothing to stub, and `test/objectives.test.ts` — the most
 * important test in this repository — asserts against it directly.
 *
 * What that test forbids is the false-green: given `{slos: [], budgets: []}` the model must say
 * "no objective is set", must carry no figure at all, must not wear the `clear` tone, and must
 * not contain a word from the healthy vocabulary. Make this panel render a hundred per cent, or a
 * nought, or a green tick, and the suite goes red.
 */
import { Empty, Failed, Loading } from '../components/states.tsx'
import { Badge, Note, Panel } from '../components/tone.tsx'
import { listObjectives } from '../lib/beacon.ts'
import { describeBudgets } from '../lib/objectives.ts'
import { useResource } from '../lib/resource.ts'

export function ObjectivesPage() {
  const objectives = useResource(
    (signal) => listObjectives(signal),
    // Counted by `slos`. `budgets` being empty when `slos` is not would be the service failing to
    // answer for something it knows about, which `describeBudgets` reports as `withoutBudget`
    // rather than as an absence of objectives.
    (data) => data.slos.length,
    'Beacon did not send back its objectives.',
    [],
  )

  return (
    <>
      <header className="bw-page__head">
        <h1 className="bw-page__title">Error budgets</h1>
        <p className="bw-page__lead">
          Four words do all the work here, so take them in one breath. An <strong>objective</strong>{' '}
          fixes a <strong>target</strong> — the share of events that have to succeed, 99% of
          scheduled runs, say — across a <strong>window</strong>, a rolling stretch of days that
          the count is taken over. The slack the target leaves is the{' '}
          <strong>error budget</strong>: how many events are allowed to go wrong before the target
          is missed. Spending it is called <strong>burn</strong>.
        </p>
        <p className="bw-page__lead">
          A budget with room left is a service allowed to take risks. A budget spent to nothing is a
          change freeze on that service, and the gate is what enforces it — not a paragraph in a
          runbook. These are the figures a release is supposed to be weighed against.
        </p>
      </header>

      <Panel title="Every objective and its budget" reads="GET /v1/slos">
        {objectives.state === 'loading' && <Loading label="Asking Beacon which objectives are set" />}

        {objectives.state === 'failed' && objectives.error && (
          <>
            {/*
              A failure here is NOT the finding below. "There are no objectives" and "we could not
              find out whether there are objectives" are different facts, and the second one must
              never be shown wearing the first one's words — that would be this page committing the
              exact error it exists to report.
            */}
            <Note tone="warn">
              The request for the objectives did not come back, so this page cannot say whether any
              are registered. Do not read the panel below as an empty table — an unanswered question
              and an answer of “none” are different facts, and only one of them is on screen.
            </Note>
            <Failed
              which="The registered objectives"
              notice={objectives.error}
              onRetry={objectives.reload}
            />
          </>
        )}

        {objectives.data && <Budgets data={objectives.data} />}
      </Panel>
    </>
  )
}

function Budgets({ data }: { data: Parameters<typeof describeBudgets>[0] }) {
  const panel = describeBudgets(data)

  if (panel.kind === 'no-objectives') {
    return (
      <div className="bw-noobjectives">
        <Badge voice={panel.voice} size="hero" />
        <p className="bw-noobjectives__detail">{panel.detail}</p>
        <Note tone="stop">
          <strong>{panel.gateConsequence}</strong>
        </Note>
        <p className="bw-noobjectives__why">{panel.whyNotZero}</p>
        <details className="bw-noobjectives__cites">
          <summary>Check any of that against the source</summary>
          <ul>
            {panel.citations.map((citation) => (
              <li key={citation}>
                <code className="cf-num bw-code">{citation}</code>
              </li>
            ))}
          </ul>
        </details>
      </div>
    )
  }

  return (
    <>
      <ul className="bw-budgets">
        {panel.rows.map((row) => (
          <li className="bw-budget" key={row.slo}>
            <div className="bw-budget__head">
              <code className="cf-num bw-code">{row.slo}</code>
              <Badge voice={row.voice} />
            </div>
            {row.indeterminate ? (
              // No arithmetic over an empty window. The counts exist on the wire but they are all
              // nought, and printing "0 of 0 spent" here would be a figure standing where the
              // service explicitly declined to make a claim.
              <p className="bw-budget__none">
                Not one event landed in this window, so there is no burn to report and no figure
                that would not be invented. An empty window is an unknown, and the gate refuses on
                it rather than reading it as a target comfortably met.
              </p>
            ) : (
              <dl className="bw-budget__figures">
                <div>
                  <dt>Burnt</dt>
                  <dd className="cf-num">{row.bad}</dd>
                </div>
                <div>
                  <dt>Budget</dt>
                  <dd className="cf-num">{row.allowedBad}</dd>
                </div>
                <div>
                  <dt>Left</dt>
                  <dd className="cf-num">{row.remaining}</dd>
                </div>
              </dl>
            )}
          </li>
        ))}
      </ul>

      {panel.withoutBudget.length > 0 && (
        <>
          <Note tone="warn">
            Beacon knows about these objectives and sent back no budget for any of them. Something
            it can describe, it could not count. Read the omission as a hole in the answer, never as
            an allowance sitting untouched.
          </Note>
          <ul className="bw-budgets bw-budgets--gap">
            {panel.withoutBudget.map((slo) => (
              <li key={slo.name}>
                <code className="cf-num bw-code">{slo.name}</code>
              </li>
            ))}
          </ul>
        </>
      )}

      {panel.rows.length === 0 && (
        <Empty
          title="Objectives are registered, and not one came back with a budget"
          meaning={
            'The objectives arrived; the budget list beside them was empty. Beacon failed to ' +
            'work out something it holds the definitions for, so no target on this page is being ' +
            'tracked. None of this is evidence that an allowance is still whole.'
          }
        />
      )}
    </>
  )
}
