/**
 * Error budgets, and the honest rendering of the fact that there are none.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE FACT THIS FILE EXISTS TO STOP THE PAGE PAPERING OVER.
 *
 * **Beacon's `slos` table is empty and nothing seeds it.** Verified against the running estate
 * before this file was written:
 *
 *   curl -s -H "x-beacon-token: …" http://127.0.0.1:4143/v1/slos
 *   → {"slos":[],"budgets":[]}
 *
 * An objective is REGISTERED, never derived. `upsertSlo` has exactly one caller in the whole
 * service — the admin-only `PUT /v1/slos/:name` (`beacon/src/server.ts`) — and Beacon ships no
 * catalogue. `deploy/compose/docker-compose.estate.yml` records the consequence found by
 * running it: every `slo_observations` insert fails a foreign key, `jobs.ts` catches and warns,
 * the service stays healthy, and "what is lost is every objective and every error budget — the
 * numbers the gate is supposed to gate ON".
 *
 * Trace it through the gate. `collectReasons` emits `error_budget_no_data` and
 * `error_budget_exhausted` from INSIDE a loop over `await allBudgets(sql, inputs.now)`
 * (`beacon/src/gate.ts`). With no objectives registered that loop body never executes, so
 * the gate emits **neither code, ever**. It is not checking error budgets at all — and it does not
 * say so. The live answer proves it: `GET /v1/gate?release=probe-1` returns seven reasons and not
 * one of them is an `error_budget_*`.
 *
 * A naive panel renders that as "Error budgets: no problems", in green, and it is the exact
 * false-green this estate keeps shipping. So:
 *
 *   1. This module answers **"No objectives defined"**, never a figure. `figure` is `null` and
 *      the model carries no number at all — not a nought, not a percentage, not a remaining count.
 *   2. Its tone is `unknown`, never `clear`. An absence of measurement is the same class of thing
 *      as `error_budget_no_data`, which the gate treats as an unknown and refuses on.
 *   3. It states the CONSEQUENCE for the gate in words, on the gate's own page as well as this
 *      one, because the gate's silence about budgets is indistinguishable from a clean result and
 *      only a sentence can tell them apart.
 *   4. **It does not invent an objective.** Two agents refused to before this one, on the grounds
 *      that a threshold nobody agreed to becomes the one the estate is judged by; the compose file
 *      refused for the same reason, while noting that 99% of scheduled runs is
 *      written down in `13-operational-model.md`. Writing it down is not the same as agreeing
 *      it, and a browser is the last place it should be decided.
 *
 * `test/objectives.test.ts` is the most important test in this repository. It asserts that
 * `describeBudgets({slos: [], budgets: []})` produces the words "no objectives defined" and
 * produces NO number, NO percentage, NO `clear` tone and no word from the healthy vocabulary. Break
 * that panel and the suite goes red.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { ErrorBudget, GateReason, Objectives, Slo } from './beacon.ts'
import type { Voice } from './verdict.ts'

/* ══════════════════════════════ the panel ══════════════════════════════ */

export interface NoObjectives {
  readonly kind: 'no-objectives'
  readonly voice: Voice
  readonly headline: string
  /**
   * `null`, and the type says so rather than the value happening to be absent.
   *
   * There is no honest number here. A nought would claim a budget was spent, a hundred per cent
   * would claim one was intact, and both are claims about a measurement that does not exist.
   * Making the field `null` — not `number | null` — means a screen physically cannot render a
   * figure on this branch, and a future edit that wanted to would have to change the type first.
   */
  readonly figure: null
  readonly detail: string
  /** What this means for the release gate. Rendered on the gate page too, not only here. */
  readonly gateConsequence: string
  /** Why an absence rather than a nought. */
  readonly whyNotZero: string
  /** Where each claim above was read. Kept apart from the prose so the prose stays readable. */
  readonly citations: readonly string[]
}

export interface BudgetRow {
  readonly slo: string
  readonly voice: Voice
  /** The remaining allowance as the service worded it — a decimal string, never re-derived here. */
  readonly remaining: string
  readonly allowedBad: string
  readonly bad: string
  readonly indeterminate: boolean
  readonly exhausted: boolean
}

export interface HaveObjectives {
  readonly kind: 'objectives'
  readonly rows: readonly BudgetRow[]
  /** An objective registered with no budget row, which would be a gap in the service's answer. */
  readonly withoutBudget: readonly Slo[]
}

export type BudgetPanel = NoObjectives | HaveObjectives

/**
 * The panel model for `GET /v1/slos`.
 *
 * A pure function of the response, so the rendering DECISION can be asserted without a DOM. That
 * is the whole reason this is not written inline in a component: sixteen frontends in this estate
 * shipped green browser suites while their pages were unusable, because the harness answered its
 * own requests. A pure function cannot be tested that way — there is nothing to stub.
 */
export function describeBudgets(objectives: Objectives): BudgetPanel {
  if (objectives.slos.length === 0) {
    return {
      kind: 'no-objectives',
      voice: {
        word: 'No objectives defined',
        glyph: '⌀',
        // NEVER `clear`. An unmeasured thing wears the same tone as an unknown gate input,
        // because that is what it is.
        tone: 'unknown',
        meaning:
          'Nothing has been registered for Beacon to measure availability against, so there is ' +
          'no error budget to report for anything.',
      },
      headline: 'No objectives defined',
      figure: null,
      detail:
        'Beacon’s objectives table is empty and nothing seeds it. An objective is ' +
        'REGISTERED, never derived: the only caller that writes one is the admin-only ' +
        'PUT /v1/slos/:name route, and Beacon ships no catalogue. So no service in this estate ' +
        'has an error budget, and this panel shows the reason instead of a figure.',
      gateConsequence:
        'THE RELEASE GATE IS THEREFORE NOT CHECKING ERROR BUDGETS AT ALL. It emits its two budget ' +
        'reason codes from inside a loop over the registered objectives; with none registered, ' +
        'that loop body never runs and neither code can ever be produced. The gate’s silence ' +
        'about budgets is indistinguishable from a clean result and is not one — whatever ' +
        'verdict it gives, that verdict carries no error-budget signal whatsoever.',
      whyNotZero:
        'Shown as an absence rather than a nought, and never as a full remaining allowance. ' +
        'Beacon’s own words: zero observations is not full availability, and a service ' +
        'nothing has measured has not demonstrated anything. Inventing an objective here would be ' +
        'worse than showing none — a threshold nobody agreed to becomes the one the estate ' +
        'is judged by.',
      citations: [
        'beacon/src/gate.ts — collectReasons emits error_budget_* only from inside the budget loop',
        'beacon/src/server.ts — PUT /v1/slos/:name is the only caller of upsertSlo',
        'beacon/src/gate.ts — zero observations is not full availability',
        'deploy/compose/docker-compose.estate.yml — every slo_observations insert fails, and why it was not fixed there',
      ],
    }
  }

  const byName = new Map(objectives.budgets.map((b) => [b.slo, b]))
  return {
    kind: 'objectives',
    rows: objectives.budgets.map(budgetRow),
    // An objective with no budget beside it is not a healthy objective; it is one the service did
    // not answer for. Listed separately so it cannot be read as either.
    withoutBudget: objectives.slos.filter((slo) => !byName.has(slo.name)),
  }
}

/**
 * One budget as a voice.
 *
 * `indeterminate` is checked FIRST, and the order is the service's: `collectReasons` tests it
 * before `exhausted` (`beacon/src/gate.ts`), because a window with no observations in it
 * has no consumption to report and a page that showed one would be showing arithmetic over an
 * empty set.
 */
export function budgetRow(budget: ErrorBudget): BudgetRow {
  const voice: Voice = budget.indeterminate
    ? {
        word: 'Not measured',
        glyph: '?',
        tone: 'unknown',
        meaning:
          'No observations were recorded in the window. That is an unknown, and the gate refuses ' +
          'on it rather than treating an empty window as perfect.',
      }
    : budget.exhausted
      ? {
          word: 'Spent',
          glyph: '■',
          tone: 'stop',
          meaning:
            'The whole allowance is gone. That is a change freeze on this service, enforced by ' +
            'the gate rather than described in a document.',
        }
      : {
          word: 'Allowance remaining',
          glyph: '●',
          tone: 'clear',
          meaning: 'Measured, and there is budget left to spend.',
        }
  return {
    slo: budget.slo,
    voice,
    // The service's strings, unparsed. They are bigints on the wire for a reason
    // (`beacon/src/server.ts`), and a JSON number above 2^53 has already lost its low bits
    // by the time anyone reads it. Turning one into a `number` here to format it would reintroduce
    // exactly the loss the wire format exists to avoid.
    remaining: budget.remaining,
    allowedBad: budget.allowedBad,
    bad: budget.bad,
    indeterminate: budget.indeterminate,
    exhausted: budget.exhausted,
  }
}

/* ══════════════════════════════ what the gate's silence means ══════════════════════════════ */

export interface BudgetSignal {
  /** False when the gate structurally cannot have looked at a budget. */
  readonly evaluated: boolean
  /** The sentence to print beside the verdict. Never omitted when `evaluated` is false. */
  readonly sentence: string
  /**
   * Whether the answer actually carried an `error_budget_*` reason.
   *
   * Reported separately from `evaluated` because the two answer different questions and only one
   * of them is decidable from the reason list alone. **An absent budget reason means nothing on
   * its own**: it is what a fully intact budget looks like AND what a gate that never checked one
   * looks like. Only the objectives list can tell them apart, which is why this function takes
   * both.
   */
  readonly reasonsMentionedBudgets: boolean
}

const BUDGET_CODES = new Set(['error_budget_no_data', 'error_budget_exhausted'])

export function errorBudgetSignal(
  objectives: Objectives | null,
  reasons: readonly GateReason[],
): BudgetSignal {
  const reasonsMentionedBudgets = reasons.some((r) => BUDGET_CODES.has(r.code))
  if (objectives === null) {
    return {
      // Not "evaluated": nobody knows. Defaulting to true here would be the false-green arriving
      // by a side door — a failure to read the objectives would make the gate look budget-aware.
      evaluated: false,
      sentence:
        'This page could not read Beacon’s objectives, so it cannot tell you whether this ' +
        'verdict took any error budget into account.',
      reasonsMentionedBudgets,
    }
  }
  if (objectives.slos.length === 0) {
    return {
      evaluated: false,
      sentence:
        'No objectives are registered, so the gate emitted no error-budget reason and could not ' +
        'have: it produces those codes only from inside a loop over the registered objectives. ' +
        'This verdict carries no error-budget signal at all — in either direction.',
      reasonsMentionedBudgets,
    }
  }
  return {
    evaluated: true,
    sentence: `The gate evaluated ${String(objectives.slos.length)} registered objective(s) for this release.`,
    reasonsMentionedBudgets,
  }
}
