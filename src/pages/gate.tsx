/**
 * The release gate. **This is the landing page, and everything else on this surface is secondary.**
 *
 * AD-04. `beacon/src/gate.ts` is the only thing in the estate that can say "no" to a promotion and
 * have it stick, and 08-prioritised-backlog ENA-37 requires the refusal to be "enforced in the
 * workflow, not by convention". This page is emphatically NOT that enforcement — `beacon/src/cli.ts`
 * is, by turning the same call into an exit code. What this page is for is the other half: an
 * operator being able to see, at a glance, **whether the estate may ship and why not.**
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * FOUR RULES THIS PAGE HOLDS, EACH OF WHICH THE ESTATE HAS BROKEN ELSEWHERE.
 *
 * 1. **It only ever GETs.** `GET /v1/gate` does not record; `POST /v1/gate` is the recording form
 *    used at the moment of a real promotion (`beacon/src/server.ts`). A console
 *    that recorded on every keystroke would fill `gate_decisions` with evaluations nobody made,
 *    and the history panel below — which reads that table — would then be mostly a record of
 *    somebody refreshing this page. `src/lib/beacon.ts` exports no way to reach the POST.
 *
 * 2. **A refusal is rendered as an answer, never as a failure.** The route is 200 for `refuse`
 *    (`beacon/src/server.ts`). `Asked` in `src/lib/verdict.ts` makes "answered" and
 *    "unreachable" two different shapes so a screen cannot put one where the other belongs.
 *
 * 3. **Known and unknown blockers are two panels, not one list.** They both refuse; only one may
 *    ever be waived (`beacon/src/gate.ts`). Sorting them together would put the estate's
 *    most important distinction behind a badge colour.
 *
 * 4. **The verdict is never drawn in `var(--cf-accent)`.** This surface's accent is signal green,
 *    and the verdict on this page is usually `refuse`. See the header of index.html.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── The release tag lives in the URL, deliberately ────────────────────────────────────────────
 *
 * `?release=…` rather than component state, so the address bar carries the question. During an
 * incident the useful thing is to paste a link that shows somebody else exactly what you are
 * looking at, and a tag held in a `useState` is a question that cannot be shared. It also means a
 * bad tag survives a reload, which is what makes the validation message reachable at all.
 */
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Empty, Failed, Loading } from '../components/states.tsx'
import { Badge, Fact, Note, Panel, When } from '../components/tone.tsx'
import {
  RELEASE_TAG,
  askGate,
  gateHistory,
  listObjectives,
  type GateReason,
} from '../lib/beacon.ts'
import { describeBudgets, errorBudgetSignal } from '../lib/objectives.ts'
import { useResource } from '../lib/resource.ts'
import {
  DETERMINACY_HEADING,
  DETERMINACY_VOICE,
  REASON_MEANING,
  WAIVABLE,
  classify,
  contradictions,
  disagreements,
  unreachableVoice,
  validateRelease,
  verdictVoice,
} from '../lib/verdict.ts'

export function GatePage() {
  const [params, setParams] = useSearchParams()
  const release = params.get('release') ?? ''
  const [draft, setDraft] = useState(release)
  const validity = validateRelease(release, RELEASE_TAG)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = draft.trim()
    // `replace: false`, so the back button walks the questions an operator asked. During an
    // incident that history is worth keeping.
    setParams(next ? { release: next } : {})
  }

  return (
    <>
      <header className="bw-page__head">
        <h1 className="bw-page__title">Release gate</h1>
        <p className="bw-page__lead">
          One question, asked per release: may this build be promoted? Beacon answers from four
          inputs — the journeys, the error budgets, the conformance suites and any incident still
          open — and lists every reason it is saying no.
        </p>
        <p className="bw-page__lead">
          A refusal is not advice. The same call runs in the pipeline as{' '}
          <code className="cf-num bw-code">beacon gate</code>, which exits non-zero and stops the
          promotion, so a blocked gate means the build does not go out. Two things clear it: fix
          what it named, or have somebody with break-glass waive it. A waiver names one reason code,
          carries the author and a written reason, and expires within twelve hours — and it can only
          ever touch a blocker Beacon measured. Anything nobody measured is beyond reach.
        </p>
        <p className="bw-page__lead">
          Asking costs nothing. This page only ever sends{' '}
          <code className="cf-num bw-code">GET /v1/gate</code>, which records no decision, so you
          are seeing what the pipeline would see and you can ask as often as you like.
        </p>
      </header>

      <form className="bw-ask" onSubmit={submit}>
        <label className="bw-ask__label" htmlFor="bw-release">
          Release tag
        </label>
        <input
          className="bw-ask__input cf-num"
          id="bw-release"
          name="release"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="v1.4.0"
          autoComplete="off"
          spellCheck={false}
          // No `pattern` attribute. Browser validation would refuse the submit before the page
          // could explain what a release tag is, and the explanation is the useful part.
          aria-describedby="bw-release-help"
        />
        <button type="submit" className="cf-btn cf-btn--primary">
          Ask the gate
        </button>
        <p className="bw-ask__help" id="bw-release-help">
          Letters, digits, dots, underscores and hyphens, up to 128 of them, opening with a letter
          or a digit. Beacon holds tags to the same shape and turns anything else away with a 400,
          so a tag this box accepts is one the service will too.
        </p>
      </form>

      {release === '' ? (
        <Empty
          title="Name a release and the gate will answer"
          meaning={
            'Every verdict is about one specific build, so there is no question on the table ' +
            'until you enter a tag. Beacon has not been asked anything — this is a blank form, ' +
            'not a result that came back empty.'
          }
        />
      ) : validity.ok ? (
        <GateResult release={release} />
      ) : (
        // A 400 rendered as a validation message rather than as a crash or a failure panel. The
        // request is not sent: Beacon would refuse the same string, and a round trip to be told
        // what this page already knows is a round trip that reads as a fault.
        <div className="bw-state bw-state--invalid" role="alert">
          <span className="bw-state__icon" aria-hidden="true">
            ▲
          </span>
          <p className="bw-state__title">
            <code className="cf-num bw-code">{release}</code> is not the shape of a release tag
          </p>
          <p className="bw-state__hint">{validity.why}</p>
          <p className="bw-state__meta">
            No request went out, so nothing about your release has been decided. This is the form
            declining to ask a malformed question — correct the tag and ask again.
          </p>
        </div>
      )}
    </>
  )
}

/**
 * The answer for one release.
 *
 * Split into its own component so the three resources below are MOUNTED only when there is a valid
 * tag to ask about. A hook cannot be conditional, so the alternative would be to fire the requests
 * and discard them — which is how a page ends up asking Beacon about the empty string.
 */
function GateResult({ release }: { release: string }) {
  // Three separate resources rather than one combined fetch, and the reason is the whole point of
  // this surface: they fail independently and each failure means something different. Beacon
  // answering the gate and NOT answering `/v1/slos` is a completely different situation from the
  // reverse, and a combined promise would collapse both into one apologetic panel.
  const gate = useResource(
    (signal) => askGate(release, signal),
    () => 1,
    'Beacon could not be reached, so the question never got there.',
    [release],
  )
  const objectives = useResource(
    (signal) => listObjectives(signal),
    // Counted by `slos`, not by `budgets`. An estate with objectives but no observations yet has
    // budgets of its own; an estate with no objectives has neither, and that is the case here.
    (data) => data.slos.length,
    'Beacon did not send back its objectives.',
    [release],
  )
  const history = useResource(
    (signal) => gateHistory(release, signal),
    (data) => data.decisions.length,
    'Beacon did not send back the decisions on record for this release.',
    [release],
  )

  const answer = gate.data
  const budget = errorBudgetSignal(objectives.data, answer?.reasons ?? [])
  // The full consequence paragraph, taken from the same pure function the objectives page uses, so
  // the two pages cannot drift into two different accounts of the same defect.
  const panel = objectives.data ? describeBudgets(objectives.data) : null
  const consequence = panel?.kind === 'no-objectives' ? panel.gateConsequence : null

  return (
    <>
      {/* ── the verdict ─────────────────────────────────────────────────────────────────── */}
      <Panel title="Verdict" reads={`GET /v1/gate?release=${release}`}>
        {gate.state === 'loading' && <Loading label={`Asking the gate about ${release}`} />}

        {gate.state === 'failed' && gate.error && (
          <div className="bw-verdict bw-verdict--unknown" role="alert">
            <Badge voice={unreachableVoice(gate.error)} size="hero" />
            <p className="bw-verdict__meaning">{unreachableVoice(gate.error).meaning}</p>
            {/*
              ══════════════════════════════════════════════════════════════════════════════════
              THIS IS NOT A REFUSAL, AND THE PANEL SAYS SO IN WORDS RATHER THAN BY LOOKING
              DIFFERENT.

              "The gate refused" and "we could not ask the gate" are completely different facts,
              and collapsing them is this estate's signature defect. Beacon itself models the
              distinction — a failure to gather inputs becomes a `beacon_unavailable` reason with
              `determinacy: 'unknown'` and comes back as a 200 verdict
              (`beacon/src/gate.ts`) — so this bundle must not flatten what the service
              took care to keep apart. What THIS panel covers is the layer further out: the
              request never reached Beacon, so no verdict exists anywhere, not even a refusing
              one.
              ══════════════════════════════════════════════════════════════════════════════════
            */}
            <Note tone="stop">
              <strong>This is not a refusal.</strong> Beacon has said nothing whatsoever about{' '}
              <code className="cf-num bw-code">{release}</code>; the question never got there. Do
              not read this screen as a block and do not read it as a pass — try again by all
              means, but shipping on the strength of it would be shipping on no information.
            </Note>
            <Failed which="The gate’s answer" notice={gate.error} onRetry={gate.reload} />
          </div>
        )}

        {gate.state !== 'loading' && gate.state !== 'failed' && answer && (
          <GateVerdict answer={answer} />
        )}
      </Panel>

      {/* ── the error-budget caveat, on the gate's own page ──────────────────────────────── */}
      <Panel title="What this verdict leaves out" reads="GET /v1/slos">
        {objectives.state === 'loading' && <Loading label="Asking Beacon which objectives are set" />}
        {objectives.state === 'failed' && objectives.error && (
          <>
            <Note tone="warn">{budget.sentence}</Note>
            <Failed
              which="The registered objectives"
              notice={objectives.error}
              onRetry={objectives.reload}
            />
          </>
        )}
        {objectives.data && !budget.evaluated && (
          <div className="bw-caveat">
            <Note tone="stop">{budget.sentence}</Note>
            {consequence && <p className="bw-caveat__body">{consequence}</p>}
            <p className="bw-caveat__aside">
              The reason list above{' '}
              {budget.reasonsMentionedBudgets
                ? 'does carry an error-budget code, which cannot be true alongside this. Report ' +
                  'it — one of the two is wrong.'
                : 'names no error-budget code, and on its own that tells you nothing: a budget ' +
                  'with room to spare produces the same silence. The empty objectives table is ' +
                  'the only thing that separates the two.'}
            </p>
          </div>
        )}
        {objectives.data && budget.evaluated && <Note>{budget.sentence}</Note>}
      </Panel>

      {/* ── the recorded history ─────────────────────────────────────────────────────────── */}
      <Panel title="Decisions already on the record" reads={`GET /v1/gate/history?release=${release}`}>
        {history.state === 'loading' && <Loading label="Asking Beacon what was decided before" />}
        {history.state === 'failed' && history.error && (
          <Failed
            which="The recorded decisions"
            notice={history.error}
            onRetry={history.reload}
          />
        )}
        {history.state === 'empty' && (
          <Empty
            title="No decision has been written down for this release"
            meaning={
              'A decision goes on the record only when a promotion is genuinely attempted, which ' +
              'the pipeline does through POST /v1/gate. So an empty list means nobody has tried ' +
              'to ship this tag — not that the gate has never looked at it. This console has ' +
              'asked, repeatedly if you have reloaded, and deliberately left no trace.'
            }
          />
        )}
        {history.state === 'ok' && history.data && (
          <ol className="bw-history">
            {history.data.decisions.map((decision, index) => (
              <li className="bw-history__row" key={`${decision.decidedAt}-${String(index)}`}>
                <Badge voice={verdictVoice(decision)} />
                <span className="bw-history__by">
                  by <code className="cf-num bw-code">{decision.evaluatedBy}</code>
                </span>
                <When iso={decision.decidedAt} />
                <span className="bw-history__count">
                  {decision.reasons.length === 0
                    ? 'nothing stood in the way'
                    : `${String(decision.reasons.length)} reason(s) on the record`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </>
  )
}

/** The verdict itself, plus the two reason panels and the waived list. */
function GateVerdict({
  answer,
}: {
  answer: {
    release: string
    decision: 'promote' | 'promote_with_override' | 'refuse'
    promote: boolean
    indeterminate: boolean
    reasons: readonly GateReason[]
    waived: readonly GateReason[]
  }
}) {
  const voice = verdictVoice(answer)
  const { known, unknown } = classify(answer.reasons)
  const odd = contradictions(answer)
  const mismatched = disagreements(answer.reasons)

  return (
    <>
      <div className={`bw-verdict bw-verdict--${voice.tone}`}>
        <Badge voice={voice} size="hero" />
        <p className="bw-verdict__meaning">{voice.meaning}</p>
        <dl className="bw-verdict__facts">
          <Fact label="Release">
            <code className="cf-num bw-code">{answer.release}</code>
          </Fact>
          <Fact label="Decision">
            <code className="cf-num bw-code">{answer.decision}</code>
          </Fact>
          <Fact label="Anything unmeasured">
            <code className="cf-num bw-code">{String(answer.indeterminate)}</code>
          </Fact>
          <Fact label="Reasons to say no">
            <span className="cf-num">{String(answer.reasons.length)}</span>
          </Fact>
        </dl>
      </div>

      {odd.length > 0 && (
        <Note tone="stop">
          <strong>This answer cannot all be true at once.</strong> {odd.join(' ')} What you see
          above is the most cautious reading of it. Please report it — one part of Beacon’s reply
          disagrees with another.
        </Note>
      )}

      {mismatched.length > 0 && (
        <Note tone="stop">
          <strong>This console and Beacon disagree about what kind of blocker this is.</strong>{' '}
          Beacon’s own classification is the one drawn below, because it is the one the pipeline
          acts on. {mismatched.map((r) => r.code).join(', ')} — worth reporting: it usually means a
          reason code reached the gate before it reached this console.
        </Note>
      )}

      {answer.reasons.length === 0 && (
        <Note>
          Not one reason came back. Be precise about what that buys you: the gate lists what it
          FOUND, and a check that never ran contributes nothing to that list. An absent reason and a
          satisfied one look the same from here. The panel below says which you are looking at.
        </Note>
      )}

      <ReasonList
        determinacy="unknown"
        reasons={unknown}
        // The unknown panel is FIRST, above the known one, and the order is not cosmetic. An
        // unknown is the worse of the two — it cannot be waived and it means nobody has measured
        // the thing — so it goes where an operator's eye lands first. Listing them after the
        // knowns would put the waivable problems above the unwaivable ones.
      />
      <ReasonList determinacy="known" reasons={known} />

      {answer.waived.length > 0 && (
        <section className="bw-reasons bw-reasons--waived">
          <h3 className="bw-reasons__title">Waived, and still true</h3>
          <p className="bw-reasons__lead">
            These blockers have not gone away. Somebody with break-glass looked at each one, chose
            to accept it, and left their name and their reasoning attached. Every waiver runs out
            within twelve hours and none can be made permanent, so this list shrinks on its own and
            the underlying problems come back with it. Waivers are made through Beacon’s admin route
            or its command line; this console shows them and cannot create one.
          </p>
          <ul className="bw-reasons__list">
            {answer.waived.map((reason, index) => (
              <li className="bw-reason" key={`${reason.code}-${reason.subject}-${String(index)}`}>
                <code className="cf-num bw-code">{reason.code}</code>{' '}
                <span className="bw-reason__subject">{reason.subject}</span>
                <span className="bw-reason__detail">{reason.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/**
 * One class of blocker.
 *
 * Renders nothing when the list is empty — deliberately, rather than showing an "all clear" for
 * that class. A heading reading "We could not find out" over a panel saying "none" is a green tick
 * for a check that may simply never have run, which is the exact reasoning error the objectives
 * panel exists to correct. The verdict above already says whether anything blocked.
 */
function ReasonList({
  determinacy,
  reasons,
}: {
  determinacy: 'known' | 'unknown'
  reasons: readonly GateReason[]
}) {
  if (reasons.length === 0) return null
  const voice = DETERMINACY_VOICE[determinacy]
  return (
    <section className={`bw-reasons bw-reasons--${determinacy}`}>
      <h3 className="bw-reasons__title">
        <Badge voice={voice} /> {DETERMINACY_HEADING[determinacy]}
      </h3>
      <p className="bw-reasons__lead">{WAIVABLE[determinacy]}</p>
      <ul className="bw-reasons__list">
        {reasons.map((reason, index) => (
          <li className="bw-reason" key={`${reason.code}-${reason.subject}-${String(index)}`}>
            <div className="bw-reason__head">
              <code className="cf-num bw-code">{reason.code}</code>
              <span className="bw-reason__subject">{reason.subject}</span>
            </div>
            <p className="bw-reason__detail">{reason.detail}</p>
            <p className="bw-reason__meaning">{REASON_MEANING[reason.code]}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
