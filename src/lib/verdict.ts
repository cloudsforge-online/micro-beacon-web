/**
 * The gate's answer, turned into something a person can read, without softening any of it.
 *
 * Pure — no React, no fetch, no DOM — so every property this surface exists to hold is provable in
 * `node --test` with nothing installed. That mirrors the service's own reasoning for exporting
 * `decide()` as a pure function: the property this repository exists to guarantee should be
 * provable "without a database, a clock, an HTTP server or a probe" (`beacon/src/gate.ts`).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THREE THINGS THIS MODULE MUST NEVER LET A READER BELIEVE.
 *
 * 1. **That an unknown is a milder kind of known.** `beacon/src/gate.ts`: they both refuse,
 *    "only one of them may ever be overridden, because 'ship it anyway, I know about that' is a
 *    decision a human can be accountable for and 'ship it anyway, nobody knows' is not a decision
 *    at all". So `classify()` returns two separate lists rather than one sorted list, the two are
 *    rendered as two panels with two different headings, and `WAIVABLE` says in one word which of
 *    them break-glass can reach.
 *
 * 2. **That a refusal is an error.** `GET /v1/gate` answers 200 for `refuse`
 *    (`beacon/src/server.ts`). A refusal is the ANSWER. So there is no path in this module
 *    from a verdict to a failure state, and `Asked` below is a separate type from `GateAnswer`
 *    precisely so that a screen cannot render one where the other belongs.
 *
 * 3. **That the verdict is the surface's accent colour.** `beacon`'s accent is signal green
 *    (`ui/packages/ui/src/tokens.css`), deliberately the chart `good` step, because for a
 *    status tool "the surface agreeing with its healthiest verdict is correct" — and the registry
 *    adds, in the same breath, that "Beacon's own pages still reserve green/amber/red for probe
 *    verdicts" (`ui/packages/ui/src/surfaces.ts`). The headline answer on this app's
 *    landing page is usually `refuse`. A verdict drawn in `var(--cf-accent)` would therefore
 *    inherit the page's green and a refusal would render as a pass. Every `Voice` below carries a
 *    `tone` that maps to a RESERVED status token only, and `test/verdict.test.ts` fails if
 *    `--cf-accent` ever appears in a verdict rule in styles.css.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
// Both imports are `import type`, and under `verbatimModuleSyntax` a type-only import is ERASED
// rather than emitted. So this module has no runtime dependency on the fetch client or on
// @cloudsforge/ui, and `test/verdict.test.ts` exercises it with nothing installed and no window.
// That is deliberate: the properties asserted there are the ones this repository exists to hold,
// and a test that needed a browser to run them is a test that will one day be skipped.
import type { ErrorNotice } from './api.ts'
import type {
  Determinacy,
  GateAnswer,
  GateReason,
  GateVerdict,
  ReasonCode,
} from './beacon.ts'

/**
 * The four tones this app draws with, and NONE of them is the accent.
 *
 * `quiet` exists so that a fact with no verdict attached — a count, a timestamp — has somewhere to
 * live that is not one of the three reserved status hues. Using `stop` for "this is important"
 * rather than "this is bad" is how a page's red stops meaning anything.
 */
export type Tone = 'clear' | 'caution' | 'stop' | 'unknown' | 'quiet'

/**
 * A state as a word, a glyph and a tone — in that order of importance.
 *
 * The word is never optional and the glyph is never the only non-colour channel. `micro-ui`
 * measured the estate's reserved status hues at ΔE 4.6 apart under protanopia — the note is in the
 * header of `status-web/src/lib/states.ts` — so a badge that says what it means only by being
 * amber says nothing at all to a large minority of the people reading this page under stress. And
 * the people reading THIS page are reading it at the moment a release was refused.
 */
export interface Voice {
  readonly word: string
  readonly glyph: string
  readonly tone: Tone
  /** One sentence, shown as a title and read by a screen reader. Never a synonym of the word. */
  readonly meaning: string
}

/* ══════════════════════════════ determinacy ══════════════════════════════ */

/**
 * The unknown codes, mirrored from `UNKNOWN_CODES` at `beacon/src/gate.ts`.
 *
 * `test/verdict.test.ts` reads that file from a sibling checkout and fails if the two sets differ,
 * in either direction. A code the service calls `unknown` and this bundle calls `known` would
 * render an unwaivable blocker inside the waivable list — which is the single most misleading
 * thing this page could do.
 */
export const UNKNOWN_CODES: ReadonlySet<ReasonCode> = new Set<ReasonCode>([
  'journey_never_run',
  'journey_stale',
  'journey_insufficient_history',
  'error_budget_no_data',
  'conformance_never_run',
  'conformance_inconclusive',
  'beacon_unavailable',
])

/** This bundle's own classification. Compared with the wire's, never substituted for it. */
export function determinacyOf(code: ReasonCode): Determinacy {
  return UNKNOWN_CODES.has(code) ? 'unknown' : 'known'
}

/**
 * A reason whose wire determinacy disagrees with this bundle's understanding of its code.
 *
 * Expected to be empty for ever. It is computed anyway because the alternative is silence: a code
 * added to the service and not to this list would otherwise be classified here by
 * `determinacyOf` — which knows nothing about it — and rendered under the wrong heading with no
 * indication that anything was guessed.
 */
export function disagreements(reasons: readonly GateReason[]): readonly GateReason[] {
  return reasons.filter((r) => r.determinacy !== determinacyOf(r.code))
}

/**
 * The two lists, kept apart.
 *
 * Order within each list is the SERVICE's order, unchanged. `collectReasons` gathers journeys,
 * then budgets, then conformance, then incidents (`beacon/src/gate.ts`), and re-sorting
 * them by severity here would hide the fact that they arrive grouped by subsystem.
 */
export function classify(reasons: readonly GateReason[]): {
  readonly known: readonly GateReason[]
  readonly unknown: readonly GateReason[]
} {
  return {
    known: reasons.filter((r) => r.determinacy === 'known'),
    unknown: reasons.filter((r) => r.determinacy === 'unknown'),
  }
}

/**
 * What break-glass can reach, in one sentence per class.
 *
 * `addOverride` refuses an indeterminate reason code at the point of creation
 * (`beacon/src/gate.ts`) AND `decide()` never consults an override on the unknown branch.
 * Two layers, and the service explains why they are both needed: one protects
 * against an override that already exists, the other against one being written in the belief that
 * it will work.
 */
export const WAIVABLE: Readonly<Record<Determinacy, string>> = {
  known:
    'Somebody with break-glass can accept one of these and let the release through. Their name ' +
    'and their written reasoning go on the record, and the waiver runs out within twelve hours.',
  unknown:
    'No waiver reaches these. Break-glass turns an indeterminate code away at the point somebody ' +
    'tries to write it, so the only route past is to go and find out what is true.',
}

export const DETERMINACY_HEADING: Readonly<Record<Determinacy, string>> = {
  known: 'Measured, and it came out bad',
  unknown: 'Never measured — and that is the worse of the two',
}

export const DETERMINACY_VOICE: Readonly<Record<Determinacy, Voice>> = {
  known: {
    word: 'Known',
    glyph: '■',
    tone: 'stop',
    meaning: 'Beacon took the measurement and did not like the result.',
  },
  unknown: {
    word: 'Unknown',
    glyph: '?',
    tone: 'unknown',
    meaning:
      'Beacon never got a measurement here. Silence is not the same as success, so it counts ' +
      'against the release.',
  },
}

/* ══════════════════════════════ the verdict ══════════════════════════════ */

/**
 * The headline, in three channels.
 *
 * `refuse` splits in two because the two refusals are different facts. A determinate refusal names
 * things somebody can fix or accept; an indeterminate one names things nobody has measured, and it
 * cannot be overridden at all. Giving them the same word would put the estate's most important
 * distinction behind a colour difference.
 */
export function verdictVoice(answer: {
  readonly decision: GateVerdict
  readonly indeterminate: boolean
}): Voice {
  if (answer.indeterminate) {
    // `indeterminate: true` implies `refuse`, always — see `decide()` in
    // `beacon/src/gate.ts`. Checked first so that a body which somehow carried `promote` alongside it
    // could not render as a pass — see `contradictions()` below, which reports that rather than
    // hiding it.
    return {
      word: 'Refused — something was never measured',
      glyph: '?',
      tone: 'unknown',
      meaning:
        'At least one of the four inputs came back with no measurement behind it. The gate shuts ' +
        'when it cannot see, and nobody can waive their way past a thing nobody has looked at.',
    }
  }
  switch (answer.decision) {
    case 'promote':
      return {
        word: 'Clear to promote',
        glyph: '●',
        tone: 'clear',
        meaning: 'Beacon measured all four inputs and not one of them stands in the way.',
      }
    case 'promote_with_override':
      return {
        word: 'Cleared only because somebody waived it',
        glyph: '▲',
        tone: 'caution',
        meaning:
          'Real blockers were found here and a person with break-glass accepted every one of ' +
          'them. Beacon refuses to file this as a clean run, so the history shows it for what it ' +
          'is.',
      }
    case 'refuse':
      return {
        word: 'Refused',
        glyph: '■',
        tone: 'stop',
        meaning:
          'Beacon measured all four inputs and at least one of them says this build should not ' +
          'ship.',
      }
  }
}

/**
 * Anything in the answer that cannot all be true at once.
 *
 * There should never be one. It is computed because the alternative is to trust one field and
 * silently drop the other: a body carrying `indeterminate: true` with `promote: true` would render
 * as a refusal under `verdictVoice` while the JSON said the opposite, and an operator comparing
 * this page with `beacon gate --release …` would have no way to see why they disagreed. A database
 * CHECK constraint already forbids the combination on a RECORDED decision
 * (`gate_decisions_indeterminate_never_promotes`, `beacon/src/gate.ts`); nothing enforces it
 * on the wire.
 */
export function contradictions(answer: GateAnswer): readonly string[] {
  const out: string[] = []
  if (answer.indeterminate && answer.promote) {
    out.push(
      'It reports something unmeasured and clears the build in the same breath. An evaluation ' +
        'with an unmeasured input always refuses, so one of those two claims is wrong.',
    )
  }
  if (answer.promote !== (answer.decision !== 'refuse')) {
    out.push(
      `It reports decision=${answer.decision} beside promote=${String(answer.promote)}. ` +
        'Beacon works the second out from the first, so they have no way to disagree.',
    )
  }
  if (answer.decision === 'promote' && answer.waived.length > 0) {
    out.push(
      'It calls this a clean promotion while also listing blockers that were waived. Beacon ' +
        'keeps those apart on purpose, so that nobody reading the history later mistakes a ' +
        'waived release for an untroubled one.',
    )
  }
  return out
}

/* ══════════════════════════════ asked, versus answered ══════════════════════════════ */

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DISTINCTION THIS ESTATE KEEPS COLLAPSING, MADE INTO A TYPE.
 *
 * "The gate refused" and "we could not ask the gate" are completely different facts:
 *
 *   * A refusal is an ANSWER. Beacon looked, and the release must not ship. HTTP 200. The reasons
 *     are on screen and each one names a thing somebody can go and fix.
 *   * A failure to ask is an ABSENCE. Nobody knows whether the release may ship. This page knows
 *     nothing about the estate; it knows only that it could not reach Beacon.
 *
 * Collapsing them in either direction is a disaster with a different shape each way. Rendering an
 * unreachable Beacon as a refusal invents a blocker nobody can find. Rendering a refusal as a
 * failed request invites a retry, and a retry that eventually "works" is how somebody ships past a
 * gate that never stopped saying no.
 *
 * **The service already models this and this client must not flatten it.** `evaluate()` catches a
 * failure to gather inputs and turns it into a `beacon_unavailable` reason with
 * `determinacy: 'unknown'` — a refusal, not an exception — and says why it does not rethrow: "one
 * plausible thing a caller does with an exception is log it and carry on"
 * (`beacon/src/gate.ts`). That is Beacon failing to read its OWN state, and it still
 * arrives here as a 200 with a verdict. What `unasked` covers is the layer further out: this
 * browser could not reach Beacon at all, and no verdict exists anywhere.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export type Asked =
  /** No release tag has been entered yet. Nothing has been asked, and nothing is claimed. */
  | { readonly kind: 'unasked' }
  /** The tag is not one Beacon would accept. A validation message, not a request. */
  | { readonly kind: 'invalid'; readonly release: string; readonly why: string }
  | { readonly kind: 'asking'; readonly release: string }
  /** Beacon answered. The verdict is inside, and it may well be a refusal. */
  | { readonly kind: 'answered'; readonly release: string; readonly answer: GateAnswer }
  /** Beacon did NOT answer. There is no verdict, and this page says so rather than inventing one. */
  | { readonly kind: 'unreachable'; readonly release: string; readonly notice: ErrorNotice }

/**
 * The headline for a state where there is no verdict.
 *
 * Deliberately shares nothing with `verdictVoice`: no word, no glyph and no tone is reused, so a
 * screenshot of this panel can never be mistaken for a screenshot of a verdict. The tone is
 * `unknown` — the same tone an indeterminate refusal wears — because both mean "nobody knows",
 * and that is the one thing the two states genuinely have in common.
 */
export function unreachableVoice(notice: ErrorNotice): Voice {
  const identityDown = notice.code === 'verifier_unavailable'
  return {
    word: 'No answer came back',
    glyph: '⊘',
    tone: 'unknown',
    meaning: identityDown
      ? 'Beacon replied, but it could not check who you are because the identity service is ' +
        'down. That is a fault in identity and it says nothing at all about this release.'
      : 'The request to Beacon did not come back, so there is no verdict to show you — not a ' +
        'refusal, not a pass, nothing about whether this build may ship.',
  }
}

/** Whether a tag is one Beacon would accept, and the sentence to show when it is not. */
export function validateRelease(raw: string, pattern: RegExp): { ok: true } | { ok: false; why: string } {
  const value = raw.trim()
  if (value.length === 0) {
    return { ok: false, why: 'Type the tag of the build you want a verdict on.' }
  }
  if (pattern.test(value)) return { ok: true }
  // The service's own sentence, from `requireRelease`, `beacon/src/server.ts`. Quoted rather
  // than paraphrased so that the page and the 400 an operator may also see in a terminal agree.
  return {
    ok: false,
    why: 'release must be a tag of up to 128 characters of [A-Za-z0-9._-], starting with a letter or digit.',
  }
}

/* ══════════════════════════════ reason copy ══════════════════════════════ */

/**
 * One line per reason code, saying what it MEANS rather than restating it.
 *
 * The `detail` on the wire is already specific — "the most recent run was a skip", "SEV2 open
 * since …" — so this adds the thing an operator cannot read off the row: why Beacon thinks it
 * matters. Every sentence is the service's reasoning, condensed, with the line it came from.
 */
export const REASON_MEANING: Readonly<Record<ReasonCode, string>> = {
  journey_failing:
    'A journey on the critical path came back failed or errored on its last scheduled run. Treat ' +
    'this as a user-visible problem until somebody shows it is not.',
  journey_skipped:
    'The journey stood down instead of proving anything — usually a missing address or ' +
    'credential. It scores as a failure here, because a scenario that quietly does nothing is ' +
    'the easiest kind to fake.',
  journey_muted:
    'Somebody silenced this journey. It is still running and still scoring; what stopped was ' +
    'anyone acting on it. The gate will not promote while a single journey is muted.',
  journey_recent_failure:
    'The last run passed, but a red one sits within the recent window the gate reads. It wants ' +
    'three green runs in a row, because one pass straight after a failure is a flake that landed ' +
    'the right way up.',
  error_budget_exhausted:
    'This service has spent its whole error budget for the window. That is a change freeze, and ' +
    'the gate is the thing enforcing it rather than a document asking nicely.',
  conformance_breaking:
    'A suite answered differently from the recording in a way that would break code written ' +
    'against the old shape. Nothing here is about uptime — the service may be perfectly up.',
  incident_open:
    'An incident is open at SEV1 or SEV2. Close it, or have it waived, and this clears. SEV3 and ' +
    'SEV4 never appear here.',
  journey_never_run:
    'Not one scheduled run of this journey exists. Nobody has ever measured this path, so its ' +
    'silence is worth nothing.',
  journey_stale:
    'The last run is older than the freshness horizon. THIS IS THE ONE THAT CATCHES A DEAD ' +
    'SCHEDULER: a journey that stopped running keeps reporting whatever it said last, so a board ' +
    'full of green can mean nothing has run since Tuesday.',
  journey_insufficient_history:
    'The journey has not run often enough for the gate to trust a pass. It is not failing; there ' +
    'is too little history behind it to draw on.',
  error_budget_no_data:
    'Not one event landed in the window, so there is nothing to divide. An empty window is not ' +
    'perfect availability — a service nobody has watched has demonstrated nothing.',
  conformance_never_run:
    'No suite has ever reported, so nothing has been held against the recording. Whether this ' +
    'estate still answers the way its callers expect is an open question.',
  conformance_inconclusive:
    'A suite’s last attempt skipped or errored, so no comparison was made. A suite that could ' +
    'not run tells you as little as one that never ran.',
  beacon_unavailable:
    'Beacon could not read its own records, so it evaluated nothing. It answers with a refusal ' +
    'rather than throwing, because an exception is the kind of thing a caller logs and walks ' +
    'past.',
}
