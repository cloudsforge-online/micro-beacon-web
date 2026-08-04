/**
 * Beacon's read surface, as this bundle sees it.
 *
 * Every route below was read out of `beacon/src/server.ts` one at a time, and the wire shapes are
 * the ones that file BUILDS rather than the domain types it builds them from. That distinction is
 * not pedantry:
 *
 *   * `GET /v1/gate` answers `{release, decision, promote, indeterminate, reasons, waived}` —
 *     `gateBody()` at `beacon/src/server.ts:842-857`. The domain type is `GateDecision`, whose
 *     field is `releaseTag`. Reading `releaseTag` off the wire gets `undefined`.
 *   * `GET /v1/slos` answers every count as a **decimal STRING**, because they are bigints and a
 *     JSON number above 2^53 has already lost its low bits by the time anyone reads it
 *     (`beacon/src/server.ts:669-681`). `objectivePpm` is a string for the same reason. Nothing
 *     here parses one into a `number` without saying why.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `POST /v1/gate` IS NOT IN THIS FILE, AND ITS ABSENCE IS THE POINT.
 *
 * There are two gate endpoints and they differ by one word in the service's own header: "The route
 * is a GET and it does **not** record by default. Asking the gate a question must not change what
 * the gate would answer next time" (`beacon/src/server.ts:16-18`). `POST /v1/gate` is the
 * recording form, used at the moment of an actual promotion — by `beacon/src/cli.ts`, from a
 * pipeline, with an exit code attached.
 *
 * A console that recorded a decision every time somebody typed a release tag would fill
 * `gate_decisions` with evaluations nobody made, and `GET /v1/gate/history` — which this app
 * renders — would then show a promotion history composed mostly of a person refreshing a page.
 * So this module exports no way to reach it, and `test/beacon.test.ts` asserts the string
 * `POST` does not appear beside the gate path anywhere under `src/`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── `POST /v1/gate/overrides` is also absent, and that is a decision rather than an omission ───
 *
 * Break-glass is real, it is admin-only, and `addOverride` (`beacon/src/gate.ts:499-548`) enforces
 * three things at the point of creation: an indeterminate reason code is refused outright, the
 * written reason must be at least 16 characters, and the TTL must be positive and at most twelve
 * hours (`MAX_OVERRIDE_TTL_MS`, `beacon/src/gate.ts:479`). This bundle offers no form for it, for
 * four reasons, in ascending order of weight:
 *
 *   1. It is a WRITE that decides whether the estate ships. Every other control on this surface is
 *      a read, and a console whose only write is the one that overrides the release gate is a
 *      console where the destructive action is the easiest thing to reach.
 *   2. The author of an override is taken from the TOKEN and never from the body
 *      (`beacon/src/server.ts:436-438`), which is correct — and it means the accountability the
 *      mechanism rests on is already carried by whatever authenticated. A browser form adds a text
 *      field and a click; it does not add accountability.
 *   3. **In the estate as it stands today, every override anyone could type would be refused.**
 *      The live gate is `indeterminate: true` because of `conformance_never_run`, and an
 *      indeterminate evaluation refuses before any override is consulted at all — `decide()`
 *      returns on the unknown branch FIRST, and `beacon/src/gate.ts:141-148` says the branch is
 *      first precisely so that a waiver step added later cannot reach it. A button that cannot
 *      work is worse than no button: it teaches an operator that the gate is arbitrary.
 *   4. The one that decided it. A form with a reason-code dropdown puts `journey_skipped` and
 *      `conformance_never_run` in the same list, greys one out, and thereby presents an unknown as
 *      a waivable variant of a known. **That is the exact conflation this whole surface exists to
 *      prevent.** `beacon/src/gate.ts:485` states the rule in capitals and gives the reasoning:
 *      "ship it anyway, I know about that" is a decision a human can be accountable for and "ship
 *      it anyway, nobody knows" is not a decision at all.
 *
 * What IS rendered is the effect: `waived[]` comes back on every gate answer, so an override that
 * is in force is visible, attributed and dated on the page it changes. Where to make one is stated
 * in words — `beacon/src/cli.ts`, or `POST /v1/gate/overrides` with an admin token — rather than
 * hidden behind a control.
 */
import { api } from './api.ts'

/* ══════════════════════════════ the gate ══════════════════════════════ */

/**
 * Every reason the gate can give, as a closed set — `beacon/src/gate.ts:51-66`.
 *
 * Mirrored here rather than imported, because this bundle has no dependency on the service's
 * source, and pinned against it by `test/verdict.test.ts`, which reads `../beacon/src/gate.ts`
 * from a sibling checkout and fails if a code is added there and not here. A client that silently
 * stops understanding a code renders it as an unstyled string in the worst possible moment.
 */
export type ReasonCode =
  /* ---- known failures: we looked, and it is bad ---- */
  | 'journey_failing'
  | 'journey_skipped'
  | 'journey_muted'
  | 'journey_recent_failure'
  | 'error_budget_exhausted'
  | 'conformance_breaking'
  | 'incident_open'
  /* ---- unknowns: we could not find out, which is worse ---- */
  | 'journey_never_run'
  | 'journey_stale'
  | 'journey_insufficient_history'
  | 'error_budget_no_data'
  | 'conformance_never_run'
  | 'conformance_inconclusive'
  | 'beacon_unavailable'

export type Determinacy = 'known' | 'unknown'

export type GateVerdict = 'promote' | 'promote_with_override' | 'refuse'

export interface GateReason {
  readonly code: ReasonCode
  readonly subject: string
  readonly detail: string
  /**
   * `known` — we looked and it is bad. `unknown` — we could not find out.
   *
   * Taken from the WIRE and never recomputed here. `determinacyOf` exists in this bundle too and
   * is used to check the service's answer against the client's understanding, not to replace it:
   * if a future code arrives that this bundle classifies differently from the service, the page
   * must show the service's classification and say the two disagree, not quietly overwrite one
   * with the other.
   */
  readonly determinacy: Determinacy
}

/** `gateBody()`, `beacon/src/server.ts:842-857`. Note `release`, not `releaseTag`. */
export interface GateAnswer {
  readonly release: string
  readonly decision: GateVerdict
  readonly promote: boolean
  readonly indeterminate: boolean
  readonly reasons: readonly GateReason[]
  readonly waived: readonly GateReason[]
}

/** One row of `GET /v1/gate/history` — `decisionHistory`, `beacon/src/gate.ts:430-458`. */
export interface RecordedDecision {
  readonly releaseTag: string
  readonly decision: GateVerdict
  readonly reasons: readonly GateReason[]
  /**
   * Always empty on a recorded decision, and that is the SERVICE's doing rather than a gap here:
   * `decisionHistory` sets `waived: []` because the column does not exist
   * (`beacon/src/gate.ts:455`). The history panel therefore does not render a waived list, because
   * rendering an always-empty one would say "nothing was waived" about a promotion that may well
   * have been.
   */
  readonly waived: readonly GateReason[]
  readonly indeterminate: boolean
  readonly decidedAt: string
  readonly evaluatedBy: string
}

export interface GateHistory {
  readonly release: string
  readonly decisions: readonly RecordedDecision[]
}

/**
 * The release tag Beacon accepts, byte-for-byte from `RELEASE_TAG`, `beacon/src/server.ts:192`.
 *
 * Mirrored so the page can say "that is not a release tag" without a round trip, and pinned
 * against the source by `test/verdict.test.ts`. It is NOT a replacement for the server's check:
 * a tag that passes here is still sent and still validated there, because a client-side regex that
 * has drifted is a client that hides a 400 rather than one that prevents it.
 */
export const RELEASE_TAG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/**
 * Ask the gate. **Read-only, and always a GET.**
 *
 * Answers HTTP 200 for `refuse` as well — `beacon/src/server.ts:388-392`: "the REFUSAL is the
 * answer, and answering with a 4xx would make a refused release indistinguishable from a
 * malformed request to every retry wrapper ever written". So a rejected promotion arrives here as
 * a resolved promise carrying a verdict, and never as a thrown `ApiError`. Anything this function
 * throws means the question was not answered.
 */
export const askGate = (release: string, signal?: AbortSignal): Promise<GateAnswer> =>
  api<GateAnswer>('/v1/gate', { query: { release }, ...(signal ? { signal } : {}) })

export const gateHistory = (release: string, signal?: AbortSignal): Promise<GateHistory> =>
  api<GateHistory>('/v1/gate/history', { query: { release }, ...(signal ? { signal } : {}) })

/* ══════════════════════════════ journeys ══════════════════════════════ */

export type JourneyStatus = 'pass' | 'fail' | 'error' | 'skip'

/** `GET /v1/journeys` — `beacon/src/server.ts:523-537`. */
export interface Journey {
  readonly name: string
  readonly title: string
  readonly productGroup: string
  readonly critical: boolean
  readonly muted: boolean
  readonly mutedReason: string | null
  readonly mutedBy: string | null
  /** Null when the journey has never run. **Null is not a pass and must never render as one.** */
  readonly lastStatus: JourneyStatus | null
  readonly lastRunAt: string | null
}

export const listJourneys = (signal?: AbortSignal): Promise<{ journeys: readonly Journey[] }> =>
  api('/v1/journeys', { ...(signal ? { signal } : {}) })

/* ══════════════════════════════ probes ══════════════════════════════ */

export type ProbeState = 'up' | 'down' | 'degraded' | 'pending'

/** `GET /v1/probes` — `beacon/src/server.ts:487-501`. */
export interface Probe {
  readonly name: string
  readonly target: string
  readonly productGroup: string
  readonly url: string
  readonly method: string
  readonly expectStatus: number
  readonly intervalMs: number
  readonly deadlineMs: number
  readonly critical: boolean
  readonly enabled: boolean
  /**
   * `pending` when the probe has never reported. The service is explicit that this is not zero:
   * "A probe that has never run publishes nothing rather than 0"
   * (`beacon/src/server.ts:111`), and `scrapeRefresh` skips it entirely rather than setting a
   * gauge (`:775-777`). This page follows the same rule in words.
   */
  readonly state: ProbeState
  readonly since: string | null
}

export const listProbes = (signal?: AbortSignal): Promise<{ probes: readonly Probe[] }> =>
  api('/v1/probes', { ...(signal ? { signal } : {}) })

/* ══════════════════════════════ incidents ══════════════════════════════ */

export type Severity = 'sev1' | 'sev2' | 'sev3' | 'sev4'

/** `GET /v1/incidents?open=true` — `beacon/src/server.ts:562-569`. */
export interface Incident {
  readonly id: string
  readonly scope: string
  readonly subject: string
  readonly severity: Severity
  readonly state: string
  readonly productGroup: string
  readonly openedAt: string
  readonly closedAt: string | null
  readonly cause: string | null
  readonly lastError: string | null
  readonly failures: number
  readonly detectedBy: string
}

export const listIncidents = (
  open: boolean,
  signal?: AbortSignal,
): Promise<{ incidents: readonly Incident[] }> =>
  api('/v1/incidents', { query: { open }, ...(signal ? { signal } : {}) })

/**
 * SEV1 and SEV2 block a release; SEV3 and SEV4 do not — `blocksRelease`, `beacon/src/gate.ts:341`.
 *
 * Mirrored so the incident list can mark which rows are gate inputs. The reasoning is the
 * service's and worth carrying: refusing on SEV3 "would mean the estate could not ship the fix for
 * a certificate expiring in a fortnight, and a gate that blocks its own remedy gets switched off".
 */
export function blocksRelease(severity: Severity): boolean {
  return severity === 'sev1' || severity === 'sev2'
}

/* ══════════════════════════════ conformance ══════════════════════════════ */

/** `GET /v1/conformance` — `beacon/src/server.ts:710-713`. */
export interface ConformanceRun {
  readonly suite: string
  readonly status: string
  readonly identical: number
  readonly benign: number
  readonly breaking: number
  readonly skipped: number
  readonly durationMs: number | null
  readonly releaseTag: string | null
  readonly corpusRef: string | null
  readonly ranAt: string | null
}

export const listConformance = (
  signal?: AbortSignal,
): Promise<{ suites: readonly ConformanceRun[] }> => api('/v1/conformance', { ...(signal ? { signal } : {}) })

/* ══════════════════════════════ SLOs and error budgets ══════════════════════════════ */

/**
 * One registered objective. **Every count on this route is a decimal STRING.**
 *
 * `beacon/src/server.ts:662-668` explains `objectivePpm`: it is a bigint, and `JSON.stringify`
 * THROWS on one rather than coercing it, so it is converted explicitly "so the failure mode is a
 * decimal string on the wire rather than a 500 on a read-only route the first time an SLO exists".
 */
export interface Slo {
  readonly name: string
  readonly service: string
  readonly tier: number
  readonly kind: string
  readonly objectivePpm: string
  readonly windowDays: number
  readonly enabled: boolean
}

/** One error budget. Same rule: every count is a decimal string, never a JSON number. */
export interface ErrorBudget {
  readonly slo: string
  readonly total: string
  readonly good: string
  readonly bad: string
  readonly allowedBad: string
  readonly remaining: string
  readonly consumedPpm: string
  readonly exhausted: boolean
  /**
   * True when the window holds no observations at all.
   *
   * The service's words, at `beacon/src/gate.ts:278-281`: "Zero observations is not 100%
   * availability. A service nothing has measured has not demonstrated anything, and treating an
   * empty window as perfect is how a broken collector reads as a perfect estate." An
   * indeterminate budget becomes an `error_budget_no_data` reason, which is an `unknown`, which
   * refuses.
   */
  readonly indeterminate: boolean
}

export interface Objectives {
  readonly slos: readonly Slo[]
  readonly budgets: readonly ErrorBudget[]
}

export const listObjectives = (signal?: AbortSignal): Promise<Objectives> =>
  api('/v1/slos', { ...(signal ? { signal } : {}) })
