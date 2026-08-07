/**
 * A state, rendered as a word, a glyph and a tone — in that order of importance.
 *
 * The word is never optional and the glyph is never the only non-colour channel. `micro-ui`
 * measured the estate's reserved status hues at ΔE 4.6 apart under protanopia, which is why
 * `micro-status-web` encodes every day three times (`status-web/src/components/state.tsx`). A badge
 * that said what it meant only by being amber would say nothing at all to a reader who cannot
 * separate it from the green one — and the reader of this page is doing so at the moment a release
 * was refused.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * NOTHING IN THIS FILE MAY BE DRAWN IN `var(--cf-accent)`.
 *
 * This surface's accent is signal green (`ui/packages/ui/src/tokens.css`), deliberately
 * the chart `good` step, because for a status tool "the surface agreeing with its healthiest
 * verdict is correct". The registry adds the constraint in the same note: "Beacon's own pages
 * still reserve green/amber/red for probe verdicts"
 * (`ui/packages/ui/src/surfaces.ts`).
 *
 * So a `Badge` inheriting the accent would render every state green — including `Refused`. The
 * four tones map to `--cf-viz-good`, `--cf-viz-warn`, `--cf-viz-crit` and `--cf-fg-mute`, and
 * `test/verdict.test.ts` reads styles.css and fails if `--cf-accent` appears in any `.bw-badge`,
 * `.bw-verdict` or `.bw-tone` rule.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { ReactNode } from 'react'
import type { Voice } from '../lib/verdict.ts'

/** A state badge. Word first in the DOM order that matters; the glyph is hidden from the tree. */
export function Badge({ voice, size = 'md' }: { voice: Voice; size?: 'md' | 'hero' }) {
  return (
    <span
      className={`bw-badge bw-badge--${voice.tone}${size === 'hero' ? ' bw-badge--hero' : ''}`}
      // The accessible name is the WORD; the glyph is aria-hidden, or a screen reader announces
      // "black square Refused" and the shape channel leaks into the channel that already worked.
      title={voice.meaning}
      role="status"
    >
      <span className="bw-badge__glyph" aria-hidden="true">
        {voice.glyph}
      </span>
      <span className="bw-badge__word">{voice.word}</span>
    </span>
  )
}

/** A label and its value, as a definition pair. The value may be a node — a badge, a link. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bw-fact">
      <dt className="bw-fact__label">{label}</dt>
      <dd className="bw-fact__value">{children}</dd>
    </div>
  )
}

/**
 * A value that may be absent, where absence is a real answer rather than a rendering problem.
 *
 * `missing` is the SENTENCE, not a dash. A journey's `lastStatus` is null when it has never run,
 * and rendering that as anything other than words is how a never-run journey joins the ones that
 * passed.
 */
export function Maybe({ value, missing }: { value: string | null; missing: string }) {
  if (value === null || value.length === 0) {
    return <span className="bw-absent">{missing}</span>
  }
  return <span className="cf-num">{value}</span>
}

/**
 * A timestamp, as the service worded it, with the age beside it.
 *
 * The absolute time is the one that can be compared with a log line; the relative age is the one
 * that answers "is this stale". Both, always: an age alone is unpasteable into a support ticket,
 * and an ISO string alone hides that the last run was on Tuesday.
 */
export function When({ iso, now = Date.now() }: { iso: string | null; now?: number }) {
  if (!iso) return <span className="bw-absent">never</span>
  const at = Date.parse(iso)
  if (Number.isNaN(at)) {
    // A timestamp that will not parse is shown raw rather than dropped. Beacon serialises with
    // `toISOString()`, so an unparseable one means something between here and there rewrote it.
    return <code className="cf-num bw-code">{iso}</code>
  }
  return (
    <span className="bw-when">
      <code className="cf-num bw-code">{new Date(at).toISOString()}</code>{' '}
      <span className="bw-when__age">({ageOf(now - at)})</span>
    </span>
  )
}

/** A coarse age. Deliberately coarse: a precise one invites reading it as a measurement. */
export function ageOf(ms: number): string {
  if (ms < 0) return 'dated ahead of now'
  const seconds = Math.round(ms / 1000)
  if (seconds < 90) return `${String(seconds)}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `${String(minutes)}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${String(hours)}h ago`
  return `${String(Math.round(hours / 24))}d ago`
}

/** A plain advisory panel. `warn` for something the operator must weigh; `stop` for a defect. */
export function Note({
  tone = 'plain',
  children,
}: {
  tone?: 'plain' | 'warn' | 'stop'
  children: ReactNode
}) {
  return (
    <p className={`bw-note bw-note--${tone}`} role="note">
      <span className="bw-note__icon" aria-hidden="true">
        {tone === 'stop' ? '■' : tone === 'warn' ? '▲' : '·'}
      </span>
      <span>{children}</span>
    </p>
  )
}

/** A section with a heading and a one-line statement of what it is reading. */
export function Panel({
  title,
  reads,
  children,
}: {
  title: string
  /** The Beacon route behind this panel, printed so a reader can go and curl it themselves. */
  reads: string
  children: ReactNode
}) {
  return (
    <section className="bw-panel">
      <header className="bw-panel__head">
        <h2 className="bw-panel__title">{title}</h2>
        <code className="cf-num bw-panel__reads">{reads}</code>
      </header>
      {children}
    </section>
  )
}
