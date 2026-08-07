/**
 * The route table.
 *
 * Two facts about it are enforced elsewhere and must stay in agreement with it: `ROUTES` in
 * lib/routes.ts is the declaration the navigation is derived from, and nginx.conf enumerates the
 * same paths so that an address which is NOT here answers 404 rather than 200.
 *
 * ── Everything here is gated, and the gate is read off the SERVICE rather than chosen ──────────
 *
 * `RequiresOperator` wraps the whole tree ONCE, inside the shell rather than around it. The
 * placement is the design:
 *
 *   * Inside the shell, so a signed-out operator still gets the company bar with its sign-in
 *     control and the section navigation. A gate that replaced the whole document would take away
 *     the one control that fixes the situation.
 *   * Around the `Outlet`'s content, so **no page below it mounts** — and therefore no
 *     `useResource` in any panel fires. A signed-out visitor to this console sees one sentence and
 *     a button, never a screen made of six identical 401s.
 *
 * Every route this bundle calls is authenticated (`authorise()`, `beacon/src/server.ts`)
 * and `beacon` is `adminOnly: true` in the registry, so there is no route here that could be public
 * and none is offered as one. `src/lib/auth.tsx` documents the contrast with `micro-explorer-web`,
 * whose reads are anonymous and which deliberately has no gate at all.
 *
 * The 404 page is deliberately OUTSIDE the gate. An operator who mistypes an address should be
 * told the address is wrong, not asked to sign in first and then told the address is wrong.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from './components/scroll-to-top.tsx'
import { AppShell } from './components/shell.tsx'
import { AuthProvider, RequiresOperator } from './lib/auth.tsx'
import { placementIsKnown } from './lib/hosts.ts'
import { GatePage } from './pages/gate.tsx'
import { JourneysPage } from './pages/journeys.tsx'
import { ProbesPage } from './pages/probes.tsx'
import { IncidentsPage } from './pages/incidents.tsx'
import { ObjectivesPage } from './pages/objectives.tsx'
import { ConformancePage } from './pages/conformance.tsx'
import { NotFoundPage } from './pages/not-found.tsx'

export function App() {
  const unregistered = !placementIsKnown()

  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <Routes>
          <Route element={<AppShell unregistered={unregistered} />}>
            {/* The gate is the landing page. Everything else on this surface is secondary. */}
            <Route
              index
              element={
                <RequiresOperator>
                  <GatePage />
                </RequiresOperator>
              }
            />
            <Route
              path="journeys"
              element={
                <RequiresOperator>
                  <JourneysPage />
                </RequiresOperator>
              }
            />
            <Route
              path="probes"
              element={
                <RequiresOperator>
                  <ProbesPage />
                </RequiresOperator>
              }
            />
            <Route
              path="incidents"
              element={
                <RequiresOperator>
                  <IncidentsPage />
                </RequiresOperator>
              }
            />
            <Route
              path="objectives"
              element={
                <RequiresOperator>
                  <ObjectivesPage />
                </RequiresOperator>
              }
            />
            <Route
              path="conformance"
              element={
                <RequiresOperator>
                  <ConformancePage />
                </RequiresOperator>
              }
            />
            {/* Unknown paths render inside the shell, so the operator keeps the navigation they
                need to get back out — under a real 404, which nginx.conf preserves. Not gated:
                see the header. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
