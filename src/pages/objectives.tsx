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
 * "no objectives defined", must carry no figure at all, must not wear the `clear` tone, and must
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
    'Beacon’s objectives could not be read.',
    [],
  )

  return (
    <>
      <header className="bw-page__head">
        <h1 className="bw-page__title">Error budgets</h1>
        <p className="bw-page__lead">
          An objective, the allowance it buys, and how much of that allowance is left. These are the
          numbers the release gate is supposed to gate on.
        </p>
      </header>

      <Panel title="Registered objectives" reads="GET /v1/slos">
        {objectives.state === 'loading' && <Loading label="Reading the registered objectives" />}

        {objectives.state === 'failed' && objectives.error && (
          <>
            {/*
              A failure here is NOT the finding below. "There are no objectives" and "we could not
              find out whether there are objectives" are different facts, and the second one must
              never be shown wearing the first one's words — that would be this page committing the
              exact error it exists to report.
            */}
            <Note tone="warn">
              This page could not read the objectives, so it cannot tell you whether any exist.
              That is not the same as there being none.
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
          <summary>Where each of those claims was read</summary>
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
                Nothing was observed in this window, so there is no consumption to report. The gate
                treats this as an unknown and refuses on it.
              </p>
            ) : (
              <dl className="bw-budget__figures">
                <div>
                  <dt>Bad events</dt>
                  <dd className="cf-num">{row.bad}</dd>
                </div>
                <div>
                  <dt>Allowance</dt>
                  <dd className="cf-num">{row.allowedBad}</dd>
                </div>
                <div>
                  <dt>Remaining</dt>
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
            These objectives are registered and Beacon returned no budget for them. That is a gap in
            the answer rather than a budget that is intact.
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
          title="Objectives are registered, and no budget was returned for any of them"
          meaning={
            'Beacon answered with objectives and an empty budget list. That is the service ' +
            'failing to compute something it knows about, not a set of intact allowances.'
          }
        />
      )}
    </>
  )
}
