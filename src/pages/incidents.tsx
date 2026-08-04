/**
 * Open incidents, and which of them block a release.
 *
 * SEV1 and SEV2 block; SEV3 and SEV4 do not (`blocksRelease`, `beacon/src/gate.ts:341`). Every row
 * says which it is, because the difference is the difference between "this is why the estate will
 * not ship" and "this is a thing we know about". The service's reasoning for not blocking on the
 * lower two is worth keeping in front of a reader: refusing on SEV3 "would mean the estate could
 * not ship the fix for a certificate expiring in a fortnight, and a gate that blocks its own remedy
 * gets switched off".
 *
 * The open/recent filter re-issues the request, and here it genuinely must: `GET /v1/incidents`
 * changes what it returns based on `?open=true` (`beacon/src/server.ts:562-569`), so a filter that
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
      ? 'This severity blocks the release gate while it is open.'
      : 'This severity does not block the release gate — a gate that blocked its own remedy would get switched off.',
  }
}

export function IncidentsPage() {
  const [openOnly, setOpenOnly] = useState(true)
  const incidents = useResource(
    (signal) => listIncidents(openOnly, signal),
    (data) => data.incidents.length,
    'The incident list could not be read.',
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
          What Beacon has opened, from its own journey failures and from Alertmanager. An open SEV1
          or SEV2 refuses every release until it is closed.
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
            {blocking.length} open incident(s) at SEV1 or SEV2 are refusing every release right now.
          </strong>{' '}
          Each one appears on the gate page as an{' '}
          <code className="cf-num bw-code">incident_open</code> reason, classified{' '}
          <em>known</em> — so break-glass can waive it, with a name and a written reason attached.
        </Note>
      )}

      <Panel title={openOnly ? 'Open incidents' : 'Recent incidents'} reads={`GET /v1/incidents?open=${String(openOnly)}`}>
        {incidents.state === 'loading' && <Loading label="Reading the incident list" />}
        {incidents.state === 'failed' && incidents.error && (
          <Failed which="The incident list" notice={incidents.error} onRetry={incidents.reload} />
        )}
        {incidents.state === 'empty' && (
          <Empty
            title={openOnly ? 'No incidents are open' : 'No incidents were opened in the window'}
            meaning={
              openOnly
                ? 'Beacon answered with an empty list, so no incident is blocking a release. Note ' +
                  'the scope of that: it says nothing about the journeys, budgets or conformance ' +
                  'the gate also reads.'
                : 'Beacon answered with an empty list for the configured window. An incident older ' +
                  'than the window is not shown here and is not gone.'
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
                  {incident.productGroup} · detected by {incident.detectedBy} ·{' '}
                  <span className="cf-num">{incident.failures}</span> consecutive failure(s) · open
                  since <When iso={incident.openedAt} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
