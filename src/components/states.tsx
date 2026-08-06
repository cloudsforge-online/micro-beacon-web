/**
 * The states a panel can be in, as visibly different things.
 *
 * They are separated because collapsing any two of them destroys information the operator needs:
 *
 *   LOADING   — we do not know yet. Waiting is the correct action.
 *   EMPTY     — the query answered, with nothing. **On this surface an empty answer is usually a
 *               FINDING rather than a quiet week**, so `Empty` demands a `hint` and a `meaning`:
 *               "no probes are registered" is a fact about the estate, not a blank list.
 *   FAILED    — the query did not answer. Retrying may work. The request id is what support needs.
 *
 * A spinner that never resolves, an empty list that was actually a timeout, and a "nothing here"
 * that was actually a 403 are the three failures this file exists to prevent.
 *
 * ── There is no `Refused` here, and its absence is a decision ──────────────────────────────────
 *
 * A 401 or a 403 from Beacon lands in `Failed`, with the code and the request id printed. Writing
 * a bespoke "you are not allowed" panel would mean this bundle deciding what Beacon's refusal
 * meant, and `authorise()` has three different 4xx paths whose causes are not interchangeable —
 * an expired token, a missing authority, and a verifier that is itself down and answers 503
 * (`beacon/src/server.ts`). `Failed` prints what the service said. `noticeFor` keeps the
 * code, so a screen that genuinely needs to branch can, and none of them currently does.
 */
import type { ReactNode } from 'react'
import type { ErrorNotice } from '../lib/api.ts'

// Every optional prop is spelled `?: T | undefined`. Under `exactOptionalPropertyTypes` those are
// two different types, and only the second one accepts the `value ?? undefined` a caller writes
// when it may or may not have something to pass.
export function Loading({ label = 'Loading' }: { label?: string | undefined }) {
  return (
    <div className="bw-state bw-state--loading" role="status" aria-live="polite">
      <span className="bw-spinner" aria-hidden="true" />
      <p className="bw-state__title">{label}</p>
    </div>
  )
}

/**
 * The query answered and there was nothing in it.
 *
 * `title` says what was asked and found nothing — "No probes are registered", never "No data".
 * `meaning` is REQUIRED and is the half that matters here: on a monitoring console an empty
 * collection is almost always a statement about coverage, and a panel that renders it as a shrug
 * is the false-green this repository was written around.
 */
export function Empty({
  title,
  meaning,
  action,
}: {
  title: string
  meaning: string
  action?: ReactNode | undefined
}) {
  return (
    <div className="bw-state bw-state--empty" role="status">
      <span className="bw-state__icon" aria-hidden="true">
        ⌀
      </span>
      <p className="bw-state__title">{title}</p>
      <p className="bw-state__hint">{meaning}</p>
      {action && <div className="bw-state__action">{action}</div>}
    </div>
  )
}

/**
 * A failure, with the code and the request id on screen.
 *
 * The id is what the operator quotes and what finds their exact request across every service at
 * once. Beacon sets `x-request-id` on every response including the ones produced before a route
 * matched (`beacon/src/server.ts`), so it is present even for a router 404 — which on this
 * surface most likely means this bundle was served somewhere the gateway does not route `/v1` to
 * the service. It is rendered in the monospace token and made selectable on its own line, because
 * it is going to be read aloud down a phone line or pasted into a support form.
 *
 * `which` names the FIGURE that is missing rather than the screen it was going to appear on. "The
 * journey list could not be read" is actionable; "That did not load" is not.
 */
export function Failed({
  which,
  notice,
  onRetry,
}: {
  which: string
  notice: ErrorNotice
  onRetry?: (() => void) | undefined
}) {
  return (
    <div className="bw-state bw-state--failed" role="alert">
      <span className="bw-state__icon" aria-hidden="true">
        ⊘
      </span>
      <p className="bw-state__title">{which} did not arrive</p>
      <p className="bw-state__hint">{notice.message}</p>
      <p className="bw-state__hint">
        Nothing was altered and nothing was lost — this panel only ever asks for figures. What is
        missing is the answer itself, so read the space below as blank rather than as calm, and ask
        again.
      </p>
      <p className="bw-state__meta">
        {notice.code ? (
          <>
            Beacon said <code className="cf-num bw-code">{notice.code}</code>
          </>
        ) : (
          <>
            Beacon named no error code
            {notice.status !== undefined && (
              <>
                {' '}
                (HTTP <code className="cf-num bw-code">{notice.status}</code>)
              </>
            )}
          </>
        )}
        {notice.requestId ? (
          <>
            {' · quote request '}
            <code className="cf-num bw-reqid">{notice.requestId}</code>
          </>
        ) : (
          // Said out loud rather than left blank. Beacon sets the header on every response, so an
          // absent id means the response did not come from Beacon at all — a gateway, a proxy, or
          // this bundle's own nginx answering a path it does not serve.
          <> · no request id, which means something other than Beacon sent this</>
        )}
      </p>
      {onRetry && (
        <div className="bw-state__action">
          <button type="button" className="cf-btn" onClick={onRetry}>
            Ask again
          </button>
        </div>
      )}
    </div>
  )
}
