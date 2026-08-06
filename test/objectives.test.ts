/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE SINGLE MOST IMPORTANT TEST IN THIS REPOSITORY.
 *
 * **It fails if the empty-objectives panel ever renders as healthy.**
 *
 * The fact it defends is live, in this estate, right now. `GET /v1/slos` answers
 * `{"slos":[],"budgets":[]}` — verified with curl before a line of `src/lib/objectives.ts` was
 * written — because Beacon's `slos` table is empty and nothing seeds it. `upsertSlo` has exactly
 * one caller, the admin-only `PUT /v1/slos/:name`, and Beacon ships no catalogue.
 *
 * Trace it into the gate. `collectReasons` emits `error_budget_no_data` and
 * `error_budget_exhausted` from INSIDE a loop over `await allBudgets(sql, inputs.now)`
 * (`beacon/src/gate.ts`). With no objectives that loop body never executes, so the gate
 * emits neither code, ever. The release gate is not checking error budgets at all — and nothing
 * anywhere says so. A naive panel would render "Error budgets: no problems", in green, which is
 * the exact false-green this estate keeps shipping.
 *
 * ── Why this is asserted against a PURE FUNCTION and not against a rendered page ───────────────
 *
 * Sixteen frontends in this estate shipped green browser suites while their pages were unusable,
 * because every harness called `page.route('**\/*', …)` and answered its own requests. A guard
 * that lived in a browser scenario could be satisfied by a fixture. `describeBudgets()` takes the
 * response and returns the rendering DECISION, so there is nothing to stub: the assertions below
 * are about what the page must decide, and the page has no second way to decide it.
 *
 * ── The four things forbidden, and why each one ───────────────────────────────────────────────
 *
 *   NO FIGURE.       `figure` is typed `null`, so a screen cannot render a number on this branch
 *                    without the type changing first. Asserted as a value too, because a type is
 *                    not present at runtime.
 *   NO PERCENTAGE OR NOUGHT anywhere in the prose. A hundred per cent claims the budget is
 *                    intact; a nought claims it was spent. Both are claims about a measurement
 *                    that does not exist.
 *   NOT THE `clear` TONE. `clear` maps to `--cf-viz-good`. An unmeasured thing is the same class
 *                    as `error_budget_no_data`, which the gate treats as an unknown and refuses on.
 *   NO HEALTHY WORD. "ok", "healthy", "good", "fine", "nominal", "pass", "all clear", "no
 *                    problems". A reader skimming a panel reads the adjective, not the paragraph.
 *
 * `citations` is excluded from the prose sweeps, deliberately and with the exclusion stated here
 * rather than buried: it holds paths into micro-beacon, and a path carries digits that are not
 * figures about a budget. Excluding it is a hole, so it is narrowed — the sweep still requires
 * every citation to LOOK like one: a path, an em dash, and the claim read there. It used to
 * require a LINE as well, and that requirement is gone, because a line names a position in a file
 * micro-beacon owns and is free to edit. See the assertion itself for what replaced it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeBudgets, errorBudgetSignal } from '../src/lib/objectives.ts'
import type { ErrorBudget, GateReason, Objectives } from '../src/lib/beacon.ts'

/** The live answer, byte for byte. */
const LIVE_EMPTY: Objectives = { slos: [], budgets: [] }

/** Words that would make a reader believe a measurement had been taken and had come out well. */
const HEALTHY = /\b(ok|okay|healthy|health|good|fine|nominal|normal|all clear|no problems|no issues|satisfied|met|passing|passed)\b/i

/** A figure claiming intactness, and a figure claiming exhaustion. Both are claims. */
const PERCENTAGE = /\d+\s*(%|per\s?cent)/i
const HUNDRED = /\b100\b/
const NOUGHT = /\b0(\.0+)?\b/

function prose(panel: ReturnType<typeof describeBudgets>): string[] {
  assert.equal(panel.kind, 'no-objectives', 'this helper is only meaningful on the empty branch')
  if (panel.kind !== 'no-objectives') throw new Error('unreachable')
  return [
    panel.headline,
    panel.detail,
    panel.gateConsequence,
    panel.whyNotZero,
    panel.voice.word,
    panel.voice.meaning,
  ]
}

describe('the empty objectives table is never rendered as healthy', () => {
  const panel = describeBudgets(LIVE_EMPTY)

  it('takes the no-objectives branch', () => {
    assert.equal(panel.kind, 'no-objectives')
  })

  it('says "no objectives defined", in the headline and in the badge word', () => {
    if (panel.kind !== 'no-objectives') throw new Error('unreachable')
    assert.match(panel.headline, /no objectives defined/i)
    assert.match(panel.voice.word, /no objectives defined/i)
  })

  it('carries NO figure at all — not a nought, not a percentage, not a remaining count', () => {
    if (panel.kind !== 'no-objectives') throw new Error('unreachable')
    assert.equal(panel.figure, null)
    for (const text of prose(panel)) {
      assert.doesNotMatch(text, HUNDRED, `"${text}" claims a hundred of something`)
      assert.doesNotMatch(text, PERCENTAGE, `"${text}" states a percentage`)
      assert.doesNotMatch(text, NOUGHT, `"${text}" renders a nought where a measurement is absent`)
    }
  })

  it('does not wear the clear tone, which is the chart good step', () => {
    if (panel.kind !== 'no-objectives') throw new Error('unreachable')
    assert.notEqual(panel.voice.tone, 'clear')
    // Positively pinned as well: `unknown` is the tone an unmeasured thing must wear, and
    // asserting only the negative would let a future edit move it to `caution` — which would say
    // "we measured this and it is a bit concerning" about something nobody measured.
    assert.equal(panel.voice.tone, 'unknown')
  })

  it('uses no word from the healthy vocabulary', () => {
    if (panel.kind !== 'no-objectives') throw new Error('unreachable')
    for (const text of prose(panel)) {
      assert.doesNotMatch(text, HEALTHY, `"${text}" reads as a measurement that came out well`)
    }
  })

  it('states, in words, that the release gate is not checking error budgets', () => {
    if (panel.kind !== 'no-objectives') throw new Error('unreachable')
    // The whole reason this requirement exists: the gate's silence about budgets is
    // indistinguishable from a clean pass, so a label alone is not enough. The consequence has to
    // be spelled out, and the page has to carry it on the GATE's own screen as well as this one.
    assert.match(panel.gateConsequence, /release gate/i)
    assert.match(panel.gateConsequence, /not checking error budgets/i)
    assert.match(panel.gateConsequence, /no error-budget signal/i)
  })

  it('says why the absence is not a nought, without inventing an objective', () => {
    if (panel.kind !== 'no-objectives') throw new Error('unreachable')
    assert.match(panel.whyNotZero, /zero observations is not full availability/i)
    // The refusal to invent one is itself the claim, and it is checked, because two agents before
    // this one refused on the same grounds and the reasoning is the thing worth keeping.
    assert.match(panel.whyNotZero, /threshold nobody agreed to/i)
  })

  it('cites where each claim was read, and every citation looks like one', () => {
    if (panel.kind !== 'no-objectives') throw new Error('unreachable')
    assert.ok(panel.citations.length >= 3)
    for (const citation of panel.citations) {
      // A repository-relative PATH, an em dash, and the claim read there. This is what keeps
      // `citations` from becoming the field prose is moved into to escape the sweeps above.
      assert.match(citation, /^[\w./-]+\.(ts|yml|md)\s+—\s+\S/, citation)
      /*
       * AND NO LINE NUMBER, WHICH IS THE HALF THIS ASSERTION USED TO REQUIRE.
       *
       * It demanded `path:line`. A line number names a position in a file that a DIFFERENT
       * repository owns and is free to edit: micro-beacon inserts a helper above `collectReasons`
       * and all four of these go stale at once, while nothing in this bundle is wrong. Nothing
       * runs this suite when micro-beacon changes, so it surfaces during a release — which is how
       * one shape of citation produced seven of nineteen CI failures across the estate in a day.
       *
       * The claim after the dash is what makes a citation checkable, and it names a SYMBOL —
       * `collectReasons`, `upsertSlo` — which moves with the code. The line never did.
       */
      assert.doesNotMatch(citation, /\.(ts|yml|md):\d/, `${citation} names a line; cite the file`)
    }
  })
})

describe('the error-budget signal a verdict carries', () => {
  const noBudgetReasons: readonly GateReason[] = [
    {
      code: 'conformance_never_run',
      subject: 'conformance',
      detail: 'no conformance run has been recorded',
      determinacy: 'unknown',
    },
  ]

  it('reports NOT evaluated when no objective is registered', () => {
    const signal = errorBudgetSignal(LIVE_EMPTY, noBudgetReasons)
    assert.equal(signal.evaluated, false)
    assert.equal(signal.reasonsMentionedBudgets, false)
    assert.match(signal.sentence, /no error-budget signal at all/i)
  })

  it('reports NOT evaluated when the objectives could not be read', () => {
    // The false-green arriving by a side door. If a failure to read `/v1/slos` defaulted to
    // "evaluated", a Beacon that answered the gate and not the objectives would make the verdict
    // look budget-aware — which is worse than the defect this page reports, because it would be
    // this page's own invention.
    const signal = errorBudgetSignal(null, noBudgetReasons)
    assert.equal(signal.evaluated, false)
    assert.match(signal.sentence, /could not read/i)
  })

  it('an absent budget reason means nothing on its own, and the type says which question is which', () => {
    // Two objectives registered and no budget reason in the answer: THAT is a verdict that took
    // budgets into account. Byte-identical reason list to the case above; only the objectives
    // differ. This is the assertion that proves the reason list alone cannot answer the question.
    const withObjectives: Objectives = {
      slos: [
        { name: 'a.runs', service: 'a', tier: 1, kind: 'availability', objectivePpm: '990000', windowDays: 28, enabled: true },
        { name: 'b.runs', service: 'b', tier: 1, kind: 'availability', objectivePpm: '990000', windowDays: 28, enabled: true },
      ],
      budgets: [],
    }
    const signal = errorBudgetSignal(withObjectives, noBudgetReasons)
    assert.equal(signal.evaluated, true)
    assert.equal(signal.reasonsMentionedBudgets, false)
  })

  it('notices when the answer DOES carry a budget reason', () => {
    const signal = errorBudgetSignal(LIVE_EMPTY, [
      {
        code: 'error_budget_no_data',
        subject: 'a.runs',
        detail: 'no observations recorded in the window',
        determinacy: 'unknown',
      },
    ])
    // Contradictory — with no objectives the gate cannot have produced that code — and the page
    // says so rather than picking one of the two to believe.
    assert.equal(signal.evaluated, false)
    assert.equal(signal.reasonsMentionedBudgets, true)
  })
})

describe('a budget that exists', () => {
  const base: ErrorBudget = {
    slo: 'identity.signin.runs',
    total: '1000',
    good: '990',
    bad: '10',
    allowedBad: '10',
    remaining: '0',
    consumedPpm: '1000000',
    exhausted: true,
    indeterminate: false,
  }

  it('renders an indeterminate window as unknown, and prints no arithmetic over it', () => {
    const panel = describeBudgets({
      slos: [{ name: base.slo, service: 'identity', tier: 1, kind: 'availability', objectivePpm: '990000', windowDays: 28, enabled: true }],
      budgets: [{ ...base, indeterminate: true, exhausted: false }],
    })
    assert.equal(panel.kind, 'objectives')
    if (panel.kind !== 'objectives') throw new Error('unreachable')
    const row = panel.rows[0]
    assert.ok(row)
    assert.equal(row.voice.tone, 'unknown')
    assert.doesNotMatch(row.voice.word, HEALTHY)
    // Indeterminate is checked BEFORE exhausted, in the same order the service checks them.
    assert.match(row.voice.word, /not measured/i)
  })

  it('carries the service’s decimal strings through unparsed', () => {
    const panel = describeBudgets({
      slos: [{ name: base.slo, service: 'identity', tier: 1, kind: 'availability', objectivePpm: '990000', windowDays: 28, enabled: true }],
      budgets: [{ ...base, remaining: '9007199254740993' }],
    })
    if (panel.kind !== 'objectives') throw new Error('unreachable')
    // Above 2^53. Parsing it into a `number` to format it would silently return
    // 9007199254740992, which is the exact loss the wire format exists to avoid.
    assert.equal(panel.rows[0]?.remaining, '9007199254740993')
  })

  it('lists an objective the service returned no budget for, rather than implying it is intact', () => {
    const panel = describeBudgets({
      slos: [
        { name: 'a.runs', service: 'a', tier: 1, kind: 'availability', objectivePpm: '990000', windowDays: 28, enabled: true },
      ],
      budgets: [],
    })
    if (panel.kind !== 'objectives') throw new Error('unreachable')
    assert.equal(panel.withoutBudget.length, 1)
    assert.equal(panel.rows.length, 0)
  })
})
