/**
 * The boot sequence. The order is not arbitrary.
 *
 *   1. Observability first, so an exception thrown by anything below is reported rather than lost.
 *      A crash during the first render is the single most valuable event this app can send.
 *   2. `initAnalytics()` second, so Consent Mode's DENIED defaults are in place before anything
 *      that could load a tag has begun. It is a no-op on this surface and is called anyway; the
 *      long note beside the call says why, and index.html says why there is no measurement ID.
 *   3. `bootstrapSession()` third, and AWAITED, so the SSO hand-off code in the URL fragment is
 *      redeemed before React mounts. It strips `#cf_code` from the address bar before the exchange
 *      goes over the wire — see the note in @cloudsforge/ui. Rendering first would show the
 *      signed-out panel to somebody who has just signed in, which on this surface is the shape of
 *      a login loop: they would click "Sign in" again and go round.
 *   4. Render last — UNLESS there is nothing to render because the browser is leaving. With no
 *      session, step 3 asks the portal (once) whether the reader already holds one; the whole
 *      point of that ask is that an operator never sees a sign-in prompt for a session they are
 *      already carrying, and painting the panel over a departing page would put one on screen.
 *      `.finally()` could not express it, which is why the boot reports three outcomes and not a
 *      boolean.
 *
 * The two stylesheets from @cloudsforge/ui are imported HERE and before `./styles.css`, so the
 * design tokens exist before anything in this bundle references one. Three surfaces in this estate
 * rendered completely unstyled because tokens were delivered and never consumed; nothing in
 * styles.css contains a colour of its own, so a missing import would not degrade this page — it
 * would erase it.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@cloudsforge/ui/tokens.css'
import '@cloudsforge/ui/ui.css'
import './styles.css'
import { initAnalytics } from '@cloudsforge/ui/consent'
import { App } from './app.tsx'
import { bootstrapSession, type BootResult } from './lib/api.ts'
import { initObs } from './lib/obs.ts'

initObs()

/*
 * Consent Mode is primed with every category DENIED before anything else runs — two pushes onto a
 * plain array, no request, no cookie — and the analytics tag is loaded ONLY if this reader granted
 * consent on a previous visit. A first-time reader gets nothing until they press Accept.
 *
 * It goes here, second, rather than inside a component, because the denied default has to be in
 * place before any tag could conceivably arrive; a default installed after a script has begun
 * running is a race, and the losing branch of that race sets a cookie.
 *
 * ON THIS SURFACE IT IS A NO-OP TODAY, AND IT IS CALLED ANYWAY.
 *
 * index.html carries no `<meta name="cf-analytics">` and must not — the reasoning is written out
 * at length where the tag would have gone, and it comes down to `beacon` being `adminOnly: true`
 * in the registry: a console that asks not to be indexed must not report its own routes to Google
 * either. So `analyticsId()` returns null here, `grantConsent()` has nothing to grant, and this
 * call primes defaults for a tag that never arrives.
 *
 * That is the point of calling it. The alternative — leaving it out because it would do nothing —
 * makes the gate something a future editor has to REMEMBER to add at the same moment they add the
 * meta tag. This way the order is already right and cannot be got wrong by one edit.
 */
initAnalytics()

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

void bootstrapSession()
  // A boot that THREW is a signed-out boot, not a blank page: the panel and its footer are the two
  // things a reader can still use. Only a deliberate departure suppresses the render.
  .catch((): BootResult => 'signed-out')
  .then((boot) => {
    if (boot === 'asking-the-portal') return
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
