/**
 * Open incidents, and which of them block a release.
 *
 * SEV1 and SEV2 block; SEV3 and SEV4 do not (`blocksRelease`, `beacon/src/gate.ts`). Every row
 * says which it is, because the difference is the difference between "this is why the estate will
 * not ship" and "this is a thing we know about". The service's reasoning for not blocking on the
 * lower two is worth keeping in front of a reader: refusing on SEV3 "would mean the estate could
 * not ship the fix for a certificate expiring in a fortnight, and a gate that blocks its own remedy
 * gets switched off".
 *
 * The open/recent filter re-issues the request, and here it genuinely must: `GET /v1/incidents`
 * changes what it returns based on `?open=true` (`beacon/src/server.ts`), so a filter that
 * did not re-ask would show the closed incidents from the previous answer under the word "open".
 * That is the failure `src/lib/resource.ts` describes at length in the note on `deps`.
 */
import { useState } from 'react'
import { Empty, Failed, Loading } from '../components/states.tsx'
import { Badge, Note, Panel, When } from '../components/tone.tsx'
import { blocksRelease, listIncidents, type Severity } from '../lib/beacon.ts'
import { useResource } from '../lib/resource.ts'
import type { Voice } from '../lib/verdict.ts'

export function severityVoice(severity: Severity): Voice {
  const blocks = blocksRelease(severity)
  return {
    word: severity.toUpperCase(),
    glyph: blocks ? '■' : '▲',
    tone: blocks ? 'stop' : 'caution',
    meaning: blocks
      ? 'While this one is open, no release ships. Closing it or waiving it are the only ways past.'
      : 'This one holds nothing up. Refusing releases over a degraded corner would stop the estate ' +
        'shipping the fix for it, and a gate that blocks its own remedy is a gate somebody turns off.',
  }
}

export function IncidentsPage() {
  const [openOnly, setOpenOnly] = useState(true)
  const incidents = useResource(
    (signal) => listIncidents(openOnly, signal),
    (data) => data.incidents.length,
    'Beacon did not send back the incident list.',
    // The value, not the closure. This is the parameter the request is built from, so it has to
    // be what re-runs the effect.
    [openOnly],
  )

  const rows = incidents.data?.incidents ?? []
  const blocking = rows.filter((i) => i.closedAt === null && blocksRelease(i.severity))

  return (
    <>
      <header className="bw-page__head">
        <h1 className="bw-page__title">Incidents</h1>
        <p className="bw-page__lead">
          An incident marks a failure that outlasted the smoothing, not a single bad check. Beacon
          raises one on its own when a probe misses three checks running, when a journey fails or
          errors twice in a row, or when Alertmanager posts an alert. An operator can also open one
          by hand. Further failures against the same subject fold into the incident already open and
          push its count up, so one broken target never becomes forty rows.
        </p>
        <p className="bw-page__lead">
          Recovery closes them the same way it opened them. A probe that answers cleanly twice
          closes its incident; a journey closes its own by passing again. A skip closes nothing — a
          journey that can only skip has gone quiet, which is not the same as having recovered.
          Anything Beacon cannot close for itself, including every alert and every manual incident,
          is closed by a person at{' '}
          <code className="cf-num bw-code">POST /v1/incidents/:id/close</code>.
        </p>
        <p className="bw-page__lead">
          Beacon opens a critical subject at SEV2 and everything else at SEV3, and it will never
          declare a SEV1 by itself — that call belongs to a person looking at the evidence. Severity
          climbs while an incident is open and never drops back. <strong>SEV1 and SEV2 turn every
          release away until they close;</strong> SEV3 and SEV4 do not.
        </p>
      </header>

      <div className="bw-filters" role="group" aria-label="Filter incidents">
        <button
          type="button"
          className={`bw-filter${openOnly ? ' is-active' : ''}`}
          aria-pressed={openOnly}
          onClick={() => setOpenOnly(true)}
        >
          Open only
        </button>
        <button
          type="button"
          className={`bw-filter${openOnly ? '' : ' is-active'}`}
          aria-pressed={!openOnly}
          onClick={() => setOpenOnly(false)}
        >
          Recent
        </button>
      </div>

      {blocking.length > 0 && (
        <Note tone="stop">
          <strong>
            Nothing can ship while these {blocking.length} incident(s) stay open at SEV1 or SEV2.
          </strong>{' '}
          Each one reaches the gate page as an{' '}
          <code className="cf-num bw-code">incident_open</code> reason, filed <em>known</em> —
          somebody measured it and it is bad. Known blockers can be waived through break-glass, and
          the waiver carries a name and a written reason for as long as it lasts.
        </Note>
      )}

      <Panel title={openOnly ? 'Open incidents' : 'Recent incidents'} reads={`GET /v1/incidents?open=${String(openOnly)}`}>
        {incidents.state === 'loading' && <Loading label="Asking Beacon for the incidents" />}
        {incidents.state === 'failed' && incidents.error && (
          <Failed which="The incident list" notice={incidents.error} onRetry={incidents.reload} />
        )}
        {incidents.state === 'empty' && (
          <Empty
            title={openOnly ? 'Nothing is open right now' : 'Nothing was opened inside the window'}
            meaning={
              openOnly
                ? 'Beacon has no incident on its books, so none is turning releases away. Be ' +
                  'careful how far you take that. An estate where every probe and journey is ' +
                  'green produces this exact screen, and so does an estate where none is ' +
                  'registered and nothing is being watched at all — check the probes and journeys ' +
                  'pages to tell the two apart. It also says nothing about budgets or ' +
                  'conformance, which the gate weighs separately.'
                : 'Beacon found none opened inside the window it keeps. Anything older has aged ' +
                  'out of this view rather than disappeared, so an incident you remember may still ' +
                  'be open — out of range here rather than gone.'
            }
          />
        )}
        {incidents.state === 'ok' && (
          <ul className="bw-rows">
            {rows.map((incident) => (
              <li className="bw-row" key={incident.id}>
                <div className="bw-row__head">
                  <Badge voice={severityVoice(incident.severity)} />
                  <code className="cf-num bw-code">{incident.subject}</code>
                  <span className="bw-tag">{incident.state}</span>
                  {incident.closedAt !== null && <span className="bw-tag">closed</span>}
                </div>
                {incident.cause && <p className="bw-row__title">{incident.cause}</p>}
                {incident.lastError && (
                  // The last error verbatim. This is the field a redacted public projection
                  // deliberately drops (`beacon/src/publicstatus.ts`), and it is the single most
                  // useful string on this page — it is what says WHY, in the service's own words.
                  <p className="bw-row__error">
                    <code className="cf-num bw-code">{incident.lastError}</code>
                  </p>
                )}
                <p className="bw-row__meta">
                  {incident.productGroup} · found by {incident.detectedBy} ·{' '}
                  <span className="cf-num">{incident.failures}</span> failure(s) folded in · opened{' '}
                  <When iso={incident.openedAt} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
