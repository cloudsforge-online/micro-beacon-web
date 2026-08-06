/**
 * Session state for the tree, and the gate in front of every route.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE HAS A GATE, WHEN THE SURFACE IT WAS CUT FROM DELIBERATELY HAS NONE
 *
 * `micro-explorer-web`'s `src/lib/auth.tsx` opens by explaining its own absence of a
 * `ProtectedRoute`, and the explanation is right for that surface: every `micro-indexer` route it
 * calls is anonymous, so "nothing on this surface can produce a 401", and a gate there would
 * demand a session for public chain facts. It cites
 * `docs/ecosystem/15-monetisation-model.md` — "A public chain whose explorer is paywalled is
 * not a public chain."
 *
 * **This surface is the exact inverse, on both halves of that sentence.**
 *
 *   * Every route this bundle calls is authenticated. `authorise()` at
 *     `beacon/src/server.ts` checks the static break-glass token and then requires an
 *     identity JWT; there is no anonymous branch on any `/v1` route. A signed-out visitor firing
 *     the six reads gets six 401s.
 *   * `beacon` is `adminOnly: true` in the registry (`ui/packages/ui/src/surfaces.ts`), and
 *     what these pages show is not public: open incident subjects, their last error strings, which
 *     journeys are muted and by whom. `beacon/src/publicstatus.ts` exists precisely because that
 *     material has to be PROJECTED away before it can be shown to anybody — that projection is
 *     `micro-status-web`'s job, and this is the other one.
 *
 * So a signed-out visitor gets a sign-in path, not a broken page and not data. And critically,
 * **the requests are not fired at all**: `RequiresOperator` renders the sign-in panel INSTEAD OF
 * the page, so no `useResource` in any panel below it ever mounts. An operator arriving without a
 * session sees one sentence and a button, never a screen made of six identical 401s.
 *
 * ── What this gate deliberately does NOT do ───────────────────────────────────────────────────
 *
 * **It does not check roles.** `beacon` is `adminOnly` in the registry, but that flag governs the
 * SWITCHER — "it just keeps a menu entry nobody can open out of every player's face"
 * (`ui/packages/ui/src/surfaces.ts`) — and `authorise()` accepts ANY authenticated user
 * principal for `READ_SCOPE` and `GATE_SCOPE` (`beacon/src/server.ts`). Only the write routes
 * pass `adminOnly: true`, and this bundle calls none of them.
 *
 * A client that predicted the authorisation decision would eventually disagree with the service
 * making it, and the disagreement would fail closed: a non-admin who CAN read the gate would be
 * shown a refusal this bundle invented. So the gate here asks one question — is there a session —
 * and lets Beacon answer the rest. When Beacon does refuse, the panel prints its code and its
 * request id rather than a guess about why.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── The `/auth/me` shape, re-read for this repository ─────────────────────────────────────────
 *
 * Identity answers `{ user: {...}, session: {...}, organisations: [...] }` — the profile is
 * **NESTED under `user`**. The estate got this wrong at the root: the web template declared
 * `interface Me { handle?, roles? }` and read both fields off the TOP level, where they are not.
 * Four frontends inherited it, `roles` was then always null, and the shared bar hid every
 * `adminOnly` entry from every signed-in operator — including, on every surface in the estate,
 * the entry that points here. There is no flat fallback, and `test/auth.test.ts` pins its absence:
 * tolerating one would encode a response identity does not send.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AccountState } from '@cloudsforge/ui'
import { AUTH_EXPIRED_EVENT, clearTokens, hasSession, nimbus, signIn, signOut } from './api.ts'

/** What identity answers at `/auth/me`, narrowed to what this app needs. */
export interface MeResponse {
  user?: {
    id?: string | null
    handle?: string | null
    roles?: readonly string[] | null
  } | null
}

export interface Operator {
  readonly handle: string | null
  readonly roles: readonly string[]
}

/**
 * Read the operator out of an `/auth/me` body.
 *
 * A pure function so `test/auth.test.ts` can prove the shape without a browser, and so the
 * nested-versus-flat mistake cannot be made silently a sixth time.
 */
export function readOperator(body: unknown): Operator {
  const empty: Operator = { handle: null, roles: [] }
  if (typeof body !== 'object' || body === null) return empty
  const nested = (body as MeResponse).user
  if (typeof nested !== 'object' || nested === null) return empty
  return {
    handle: typeof nested.handle === 'string' && nested.handle.length > 0 ? nested.handle : null,
    roles: Array.isArray(nested.roles)
      ? nested.roles.filter((r): r is string => typeof r === 'string')
      : [],
  }
}

export type SessionStatus = 'loading' | 'anonymous' | 'signedIn'

export interface Session {
  status: SessionStatus
  account: AccountState
  operator: Operator
  signIn: (returnTo?: string) => void
  signOut: () => void
}

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const value = useContext(SessionContext)
  // Throwing beats returning a signed-out default: a component rendered outside the provider would
  // otherwise show an anonymous UI to a signed-in operator and nobody would ever see why.
  if (!value) throw new Error('useSession must be used inside <AuthProvider>')
  return value
}

const NOBODY: Operator = { handle: null, roles: [] }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(() => (hasSession() ? 'loading' : 'anonymous'))
  const [operator, setOperator] = useState<Operator>(NOBODY)

  useEffect(() => {
    if (!hasSession()) return
    let live = true
    // Identity being unreachable must NOT close this console. It is the single most likely reason
    // somebody is reading a Beacon page at all — the live estate has three open SEV2 incidents,
    // all of them on `identity.*` journeys — and a gate that demanded a working `/auth/me` would
    // lock an operator out of the page that says identity is broken. So a failure here keeps the
    // tokens and treats the session as real; Beacon will decide whether it is.
    nimbus<unknown>('/auth/me')
      .then((profile) => {
        if (!live) return
        setOperator(readOperator(profile))
        setStatus('signedIn')
      })
      .catch(() => {
        if (!live) return
        setStatus(hasSession() ? 'signedIn' : 'anonymous')
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    const onExpired = () => {
      clearTokens()
      setOperator(NOBODY)
      setStatus('anonymous')
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  const doSignOut = useCallback(() => {
    setOperator(NOBODY)
    setStatus('anonymous')
    signOut()
  }, [])

  const value = useMemo<Session>(
    () => ({
      status,
      account: {
        signedIn: status === 'signedIn',
        handle: operator.handle,
        roles: operator.roles,
      },
      operator,
      signIn,
      signOut: doSignOut,
    }),
    [status, operator, doSignOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/**
 * The gate. Renders `children` only when there is a session.
 *
 * It renders INSTEAD OF the page rather than around it, which is the whole point: a wrapper that
 * rendered the page and let the panels fetch would show an operator six 401 panels and a sign-in
 * button, and the six panels would be the loudest thing on screen. Nothing below this component
 * mounts without a session, so nothing below it makes a request.
 *
 * `loading` is its own branch and never falls through to the sign-in panel. Flashing "sign in" at
 * somebody who is signed in, for the length of one `/auth/me` round trip, is the shape of a login
 * loop and is how an operator ends up signing in twice during an incident.
 */
export function RequiresOperator({ children }: { children: ReactNode }) {
  const { status, signIn: startSignIn } = useSession()

  if (status === 'loading') {
    return (
      <div className="bw-state bw-state--loading" role="status" aria-live="polite">
        <span className="bw-spinner" aria-hidden="true" />
        <p className="bw-state__title">Checking your session</p>
      </div>
    )
  }

  if (status === 'anonymous') {
    return (
      <section className="bw-signin" aria-labelledby="bw-signin-title">
        <span className="bw-signin__glyph" aria-hidden="true">
          ◉
        </span>
        <h1 className="bw-signin__title" id="bw-signin-title">
          Beacon is an operator surface
        </h1>
        <p className="bw-signin__lead">
          This console shows the release gate’s verdict for a release, the journeys and probes
          behind it, and the open incidents blocking it. Every one of those reads is authenticated,
          so there is nothing to show you until you sign in.
        </p>
        <p className="bw-signin__note">
          Nothing has been requested from Beacon on this page load. You are not looking at a failed
          screen — no question has been asked yet.
        </p>
        <button type="button" className="cf-btn cf-btn--primary" onClick={() => startSignIn()}>
          Sign in
        </button>
        <p className="bw-signin__aside">
          Signing in returns you to this address. If Beacon then refuses your account, this page
          will say so with the code and the request id Beacon gave — it will not guess on Beacon’s
          behalf.
        </p>
      </section>
    )
  }

  return <>{children}</>
}
