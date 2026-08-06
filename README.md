# micro-beacon-web

[![ci](https://github.com/cloudsforge-online/micro-beacon-web/actions/workflows/ci.yml/badge.svg)](https://github.com/cloudsforge-online/micro-beacon-web/actions/workflows/ci.yml)
![licence](https://img.shields.io/badge/licence-MIT-97CA00)
![node](https://img.shields.io/badge/node-%3E%3D22-5FA04E?logo=node.js&logoColor=white)
![typescript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![module](https://img.shields.io/badge/module-ESM-F7DF1E?logo=javascript&logoColor=black)
![tests](https://img.shields.io/badge/tests-node%3Atest%20%2B%20real%20Chromium-6E56CF)

The operator console for `micro-beacon`: **the release gate first**, then the journeys, probes,
incidents, conformance runs and error budgets it decides on. A static SPA served by nginx — no Node,
no toolchain and no environment in the image.

Design authority: [`ecosystem/13-operational-model.md`](https://github.com/cloudsforge-online/micro-docs/blob/main/ecosystem/13-operational-model.md)

> **It is read-only against Beacon and it holds no credential of its own.** Every call it makes is a
> `GET`. It never sends `POST /v1/gate` — the recording form — because asking the gate a question
> must not change what the gate would answer next time; and it never sends the static
> `x-beacon-token`, which is a shared secret held by Prometheus, Alertmanager and CI and would
> authenticate as `service:beacon-token`, making every action in the audit trail anonymous.
> `.github/workflows/ci.yml` and `test/beacon.test.ts` each assert both.

---

## Why this repository exists

The surface registry declares `beacon` with `inSwitcher: true` and `servesUi: false`
(`ui/packages/ui/src/surfaces.ts:409-449`), so every operator's product switcher has been offering an
entry that 404s. Confirmed through the real gateway before a line was written:

```bash
curl -s --cacert ../deploy/gateway/certs/ca.crt -o /dev/null -w '%{http_code}' \
  https://beacon.cloudsforge.localtest.me/
# → 404
```

`deploy/gateway/dynamic/estate-web.yml:432` said so in its own words — *"no bundle is served at
`beacon.<apex>`"* — and routed the whole host to the API. This is the bundle that entry now reaches.

**That is fixed, and the registry has been flipped on the measurement.**
`ui/packages/ui/src/surfaces.ts:446` now reads `servesUi: true`, and `test/hosts.test.ts:100` pins
it at `true` — so the day it regresses this README fails rather than becoming the next stale
inherited claim. Measured live on 2026-08-05: `https://beacon.cloudsforge.online/` → `200
text/html`. On testnet the same surface is `https://beacon-testnet.cloudsforge.online/` — testnet
hostnames are single-label `<surface>-testnet.`, never `<surface>.testnet.`.

---

## The operational fact this console exists to stop papering over

**Beacon's `slos` table is empty, nothing seeds it, and the release gate is therefore not checking
error budgets at all.** Verified against the running estate:

```bash
curl -s -H "x-beacon-token: …" http://127.0.0.1:4143/v1/slos
# → {"slos":[],"budgets":[]}
```

An objective is *registered*, never derived. `upsertSlo` has exactly one caller in the whole service
— the admin-only `PUT /v1/slos/:name` (`beacon/src/server.ts:686`) — and Beacon ships no catalogue.
`deploy/compose/docker-compose.estate.yml:2064-2091` records the consequence, found by running it:
every `slo_observations` insert fails a foreign key, `jobs.ts:305` catches and warns, `/readyz` stays
green, and *"what is lost is every objective and every error budget — the numbers the gate is
supposed to gate ON"*.

Trace it into the gate. `collectReasons` emits `error_budget_no_data` and `error_budget_exhausted`
from **inside a loop** over `await allBudgets(sql, inputs.now)` (`beacon/src/gate.ts:277-298`). With
no objectives registered that loop body never executes, so the gate emits **neither code, ever**. The
live answer proves it — `GET /v1/gate?release=probe-1` returns seven reasons and not one of them is
an `error_budget_*`.

**The gate's silence about budgets is indistinguishable from a clean pass, and it is not one.** So
this console:

1. renders **"No objectives defined"** — never a figure. The model's `figure` field is typed `null`,
   so a screen cannot render a number on that branch without the type changing first;
2. gives it the `unknown` tone, never `clear`, because an unmeasured thing is the same class as
   `error_budget_no_data`, which the gate treats as an unknown and refuses on;
3. states on **the gate's own page**, beside the verdict, that the verdict carries no error-budget
   signal in either direction;
4. **does not invent an objective.** Two agents refused to before this one, and the compose file
   refused for the same reason at `:2085-2090`: a threshold nobody agreed to becomes the one the
   estate is judged by. 99% of scheduled runs is *written down*
   (`13-operational-model.md:437`); writing it down is not agreeing it, and a browser is the last
   place it should be decided.

`test/objectives.test.ts` is the most important test in this repository. It asserts against the pure
rendering decision — there is nothing to stub — and it fails if the panel ever produces a hundred per
cent, a nought, a percentage, the `clear` tone, or a word from the healthy vocabulary.

### What Beacon has to do about it

Either seed the declared journeys' SLOs at boot, or make a missing SLO a **startup failure** rather
than a per-cycle warning. Until one of those happens this page will keep saying the gate has no
error-budget signal, because it does not.

---

## Pages, and what each one reads

| Path | Reads | What it shows |
| --- | --- | --- |
| `/?release=<tag>` | `GET /v1/gate`, `GET /v1/gate/history`, `GET /v1/slos` | **The landing page.** The verdict in three channels, the blockers split into two panels, any active waiver, the recorded promotion history, and the error-budget caveat above. |
| `/journeys` | `GET /v1/journeys` | Every registered journey, its last status and last run, which are critical, which are muted and by whom. |
| `/probes` | `GET /v1/probes` | Per-target HTTP checks. **Not a gate input** — the page says so, because a green probe list would otherwise read as something the gate had checked. |
| `/incidents` | `GET /v1/incidents?open=<bool>` | Open and recent incidents, with SEV1/SEV2 marked as the ones that refuse a release. |
| `/objectives` | `GET /v1/slos` | Error budgets, and the section above. |
| `/conformance` | `GET /v1/conformance` | The latest replay per suite — and, when empty, the reason the live gate is indeterminate. |

The release tag lives in the URL rather than in component state, so the address bar carries the
question: during an incident the useful thing is a link that shows somebody else exactly what you are
looking at. A malformed tag is rendered as a **validation message and no request is sent** — Beacon
would refuse the same string with a 400 (`beacon/src/server.ts:913-919`), and a round trip to be told
what the page already knows reads as a fault.

**An unknown path answers 404, not 200.** nginx enumerates the six routes and everything else falls
through to `error_page 404 /index.html`, which serves the same bundle while keeping the status.

## Two facts this console refuses to merge

### "The gate refused" is not "we could not ask the gate"

A refusal is an **answer**: Beacon looked, the release must not ship, HTTP 200
(`beacon/src/server.ts:388-392`), and every reason names something somebody can go and fix. A failure
to ask is an **absence**: nobody knows anything, least of all this page.

They are two different shapes in `src/lib/verdict.ts` — `Asked` has separate `answered` and
`unreachable` variants — so a screen cannot put one where the other belongs. The unreachable panel
shares no word, no glyph and no tone with any verdict, and carries the sentence *"This is not a
refusal … retrying is reasonable, and shipping on the strength of it is not."*

The service already models this and the client must not flatten it: `evaluate()` turns a failure to
gather inputs into a `beacon_unavailable` reason with `determinacy: 'unknown'` and returns it as a
200 verdict rather than throwing (`beacon/src/gate.ts:368-411`).

### A `known` blocker is not a milder `unknown`

They both refuse; only one may ever be waived. `beacon/src/gate.ts:68-74`: *"'ship it anyway, I know
about that' is a decision a human can be accountable for and 'ship it anyway, nobody knows' is not a
decision at all."* So they are **two panels with two headings**, the unknown one first — it is the
worse of the two and cannot be waived — and it is drawn with a dashed border no other panel uses, in
the muted foreground rather than anywhere on the good/warn/crit ramp.

`test/verdict.test.ts` reads `../beacon/src/gate.ts` and fails if the two `UNKNOWN_CODES` sets ever
differ in either direction. A code the service calls unknown and this bundle calls known would render
an unwaivable blocker inside the waivable list.

## Break-glass is visible here and cannot be created here

`POST /v1/gate/overrides` is deliberately not reachable from this bundle, for four reasons given in
full at the head of `src/lib/beacon.ts`. The decisive one: a form with a reason-code dropdown would
put `journey_skipped` and `conformance_never_run` in the same list, grey one out, and thereby present
an unknown as a waivable variant of a known — the exact conflation this surface exists to prevent.
(In this estate today every override anyone could type would be refused anyway: the gate is
`indeterminate`, and `decide()` returns on the unknown branch before an override is consulted at
all.)

What *is* rendered is the effect. `waived[]` comes back on every gate answer, so an override in force
is visible and dated on the page it changes, and the page says where one is made and on what terms —
admin only, a written reason of at least 16 characters, and a TTL of at most twelve hours
(`beacon/src/gate.ts:479`, `:499-548`).

## adminOnly, and the signed-out screen

`beacon` is `adminOnly: true` in the registry and every `/v1` route is authenticated
(`authorise()`, `beacon/src/server.ts:870-898`). A signed-out visitor gets a **sign-in path, not a
broken page and not data** — and `RequiresOperator` renders that panel *instead of* the page, so no
panel below it mounts and **no request is issued at all**. Driven in a real browser: zero `/v1`
requests, zero console errors.

The gate asks one question — is there a session — and lets Beacon answer the rest. It predicts no
role, because `authorise()` accepts any authenticated user principal for `READ_SCOPE` and
`GATE_SCOPE` (`:895`); a client that predicted the decision would eventually disagree with the
service making it, and would fail closed. When Beacon does refuse, the panel prints its code and its
request id.

This is the mirror image of `micro-explorer-web`, whose `src/lib/auth.tsx` documents at length why it
has **no** gate: its reads are anonymous, so a gate there would demand a session for public chain
facts.

## Brand and colour

`data-cf-product="beacon"` names a block that really exists (`ui/packages/ui/src/tokens.css:943-955`)
and is signal green `#7fae5c` — deliberately the chart `good` step, because for a status tool the
surface agreeing with its healthiest verdict is correct.

**The consequence is the most important constraint in this bundle.** This page's headline verdict is
usually `refuse`, and the registry says so in the same note: *"Beacon's own pages still reserve
green/amber/red for probe verdicts"* (`surfaces.ts:416-418`). A verdict drawn in `var(--cf-accent)`
would render a refusal in the colour of a pass. So every verdict carries **word + glyph + tone —
three channels, never colour alone** — draws only from the reserved status tokens, and
`test/verdict.test.ts` plus a CI rule both fail if `--cf-accent` appears in a badge, verdict or tone
rule. **There is no colour literal anywhere in `src/styles.css`**; every value is `var(--cf-*)`.

`markId` is null for this surface, so nothing here renders a mark, and `brand/plan.ts:43` rules out
an og card for Admin, Lantern and Beacon — so `index.html` carries no `og:` block rather than one
pointing at a file that does not exist. `test/brand-chrome.test.ts` asserts both absences in both
directions.

## The 1.1 design system, and the four defects adopting it closed

`@cloudsforge/ui` 1.1 added a light scheme, a consent layer, a shared skip link and a registry-derived
head. Applying it here was mostly not restyling.

**`data-cf-scheme="auto"`.** The third attribute on `<html>`, set statically beside the other two so
the page cannot paint in one scheme and change. A reader whose system says light now gets a light
page instead of fighting a dark one.

**The state colours forked by job, and one of them was under the floor.** `--cf-viz-good/warn/crit`
are validated against the **3:1 non-text** floor — right for a panel's border, a table edge, a chart
mark. `--cf-good-text` / `--cf-warn-text` / `--cf-critical-text` are the **4.5:1** steps of the same
colours. `--cf-critical` measures **3.38:1**, so `.bw-badge--stop` — the word *stop*, on the surface
whose whole job is to say it — has been below AA since it shipped. On the light scheme all three
fork, so `auto` without this change would have put every verdict under the floor rather than one.
The rule through `src/styles.css` is now: `color:` is a `-text` token, `border-color:` and
`outline:` are `--cf-viz-*`.

**The skip link now works.** This app had one — a `.bw-skip` anchor at `#main` — and it was half the
pattern: `<main id="main">` carried no `tabIndex={-1}`, so in Chrome and Safari following the link
scrolled the page, left focus on the link, and sent the next Tab back into the company bar.
`SkipLink` + `MainRegion` set the href, the id and the tabindex from one constant. Driven in a real
browser, not read: Tab, Enter, and assert focus is inside the landmark.

**`color-scheme: dark` on `<body>` was deleted, not moved.** It told the browser which form controls
to draw and would have gone on saying *dark* while the page around it turned light — a dark field
with a dark caret on a light panel, in the one control this console exists to be typed into. Its
replacement is `<meta name="color-scheme" content="dark light">` in the document head.

**A per-address head.** `DocumentMeta` in the shell applies `surfaceMeta('beacon', …)` on every
navigation, with the page name read off `ROUTES`. It also settled a disagreement nothing had put
side by side: `index.html` said `Beacon — release gate`, the runtime layer composes
`Release gate — Beacon`. The shell now states the derived form, and `test/sitemap.test.ts` generates
the expectation rather than retyping it.

## Crawlers, and why there is no sitemap

**This surface refuses every crawler on every environment, and publishes no sitemap at all.**

Derived, not decided here: `robotsDirective()` (`ui/packages/ui/src/seo.ts:139-142`) reads `servesUi`
and `adminOnly` and nothing else, and `beacon` carries `adminOnly: true`
(`ui/packages/ui/src/surfaces.ts:448`), so the directive is `noindex, nofollow`. Three layers state
it and a test proves they agree: `nginx.conf`'s `/robots.txt`, the static meta tag, and the runtime
one.

`/robots.txt` answers `Disallow: /` **unconditionally** — not, as on every public surface, only away
from mainnet — and names **no `Sitemap:` line**. The `Sitemap` directive is independent of the
user-agent groups above it, so a crawler obeying the disallow may still fetch a sitemap named beside
it; a line there would hand over the exact addresses the disallow withholds. `/sitemap.xml` answers
404, and this surface is absent from the estate sitemap too — `SITEMAP_SURFACES`
(`ui/packages/ui/src/sitemap.ts:47-49`) filters `adminOnly` rows out, so `site` already omits it.

Hiding is not the security boundary — `authorise()` verifies a token on every `/v1` route. It is that
a search result *confirms* the console exists and gives its address, and nobody arrives at a release
gate from a search engine.

Driven against a real nginx on the apex-style host and both testnet shapes: `/robots.txt` → `200
text/plain`, body byte-identical to `robotsTxt({ indexable: false })`; `/sitemap.xml` → `404
text/html`; every declared route still `200`, `/objectives/deeper` and `/nope` still `404`, `/v1/gate`
still the plain-text refusal.

**And there is no analytics tag.** `index.html` carries no `<meta name="cf-analytics">`, so
`analyticsId()` returns null, `<CookieBanner />` renders nothing and `initAnalytics()` primes denied
defaults for a tag that never arrives. GA4 reports `page_location`; a hit from an operator console
would ship the estate's own addresses to a third party through a different door than the one the
robots directive closed. Verified in a browser: zero cookies and zero third-party requests on load.

## Configuration

**There is none.** No `.env`, no `define`, no `envPrefix`, no `VITE_` anything. Every host resolves at
runtime from `window.location.hostname` through `cloudsforgeHosts()`, so one image serves localhost, a
preview deployment and production.

`vite.config.ts` reads `CF_BEACON_ORIGIN`, and that is a **dev-server** variable rather than a bundle
one — `vite build` emits nothing from it. It exists because the registry's `devPort` (4011) is a fact
about the *service* (`beacon/src/env.ts:298`), while this estate's compose republishes the container
on `127.0.0.1:4143`. The proxy target otherwise comes from the surface registry itself, so there is no
second copy of a port in this repository to go stale.

### Why the API base is never cross-origin

**Beacon sends no `access-control-*` header anywhere in its source and answers 404 to a preflight.**
Driven, not reasoned:

```bash
curl -s -D- -o /dev/null -X OPTIONS -H 'Origin: http://localhost:5193' \
  -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization' \
  http://127.0.0.1:4143/v1/gate?release=probe-1
# → HTTP/1.1 404 Not Found
```

The estate's CORS is one gateway middleware (`deploy/gateway/dynamic/policy.yml:42`) whose allowlist
names production origins only. Every read here carries an `Authorization` bearer, which is not
CORS-safelisted, so every one of them preflights. A cross-origin base is therefore not "slower" — it
is an address from which this page cannot make a single successful request. `resolveApiBase` returns a
relative base in the two arrangements that work (production's shared hostname, and `pnpm dev` behind
the proxy), and `test/hosts.test.ts` asserts Beacon's CORS behaviour against its real source so the
day that changes, this file gets re-read.

## What deploy has to do

**This repository cannot ship without one change in `micro-deploy`, and it is not written here.**

In production this bundle and `micro-beacon` must share `beacon.<apex>`, because that is the only
arrangement a browser can use. Today `deploy/gateway/dynamic/estate-web.yml:432` routes the **whole
host** to the API. Serving this bundle needs a higher-priority path-prefix rule sending `/v1`, `/api`,
`/metrics`, `/livez` and `/readyz` to `cf-svc-beacon`, with the bundle taking everything else — plus
a container for `beacon-web` in `docker-compose.estate.yml`.

Until then, and if the rule is ever mis-ordered, `nginx.conf` answers those prefixes with a
**plain-text 404 naming the missing gateway rule** rather than letting them fall through to the app
shell. `/v1/gate` rendering the operator console under a 404 would be technically honest and
completely unreadable as a diagnosis. CI probes the running image for exactly that.

Nothing is needed from `micro-ui`. `servesUi: false` on the `beacon` registry entry becomes wrong the
day this ships, and `test/hosts.test.ts` will go red and say so.

## Running it

```bash
pnpm install                                        # resolves @cloudsforge/ui through link:../ui/packages/ui
CF_BEACON_ORIGIN=http://127.0.0.1:4143 pnpm dev     # http://localhost:5193
pnpm typecheck
pnpm test
pnpm build
```

**Dev port 5193.** The occupied set was read off every sibling's `vite.config.ts` rather than assumed;
**5191 and 5194 are left free on purpose**, because `micro-lantern-web` is being written in parallel
and still carries the template's placeholder 5199.

The suite runs with no database and no estate. It does need a **real Chromium** — a browser suite that
skips itself when it cannot find one is green everywhere and proves nothing, so `chromePath()` throws
and names every path it looked in. The cross-repository halves of `test/verdict.test.ts`,
`test/hosts.test.ts` and `test/brand-chrome.test.ts` skip when the sibling is absent, and CI makes
every one of those absences fatal.

The image:

```bash
docker build -t beacon-web --build-context uipkg=../ui .
docker run --rm -p 8080:8080 beacon-web
```

## What the tests do and do not prove

`test/browser-journeys.test.ts` drives real Chromium against a **stubbed** network, through a model of
this repository's own `nginx.conf`. The entry point is called `renderOnlyWithStubbedNetwork` because
sixteen frontends in this estate shipped green browser suites over unusable pages, and
`test/harness-honesty.test.ts` fails if that name, or the warning it carries, is ever softened. Those
scenarios prove what the page does **with an answer**; they are structurally incapable of proving that
anything is reachable.

The tier that can is `micro-beacon`'s own smoke tier — `beacon/src/browser/smoke.ts`, in the
repository this console is the console *for*, which drives real Chromium through the real gateway with
nothing intercepted.

Two adaptations to the inherited harness are worth knowing about, because both were found by it
failing rather than by reading it:

* the template assumes every frontend's API is cross-origin from a surface on `127.0.0.1`, so its
  same-origin passthrough sent every `/v1` read to the static file server. This surface shares an
  origin with its API **by design**, so scenarios name the API prefixes — the same split `nginx.conf`
  makes — and `assertMounted` excludes them from its "failed to serve its own resources" check;
* `test/journeys/surface.ts` modelled `return 200 "…"` only, so this repository's `return 404 "…"`
  for the service prefixes fell through and was modelled as the app shell — precisely the behaviour
  the real config exists to avoid. It now reads the status the directive names.

### Every guard here has been watched to fail

Against a green baseline of 164 tests, each guard was broken, observed red, and restored:

| What was broken | What caught it |
| --- | --- |
| The empty-objectives panel made to report `100% remaining` in the `clear` tone | `test/objectives.test.ts` — 3 failures: the headline, the figure sweep, the tone |
| `renderOnlyWithStubbedNetwork` renamed back to `open` | `test/harness-honesty.test.ts` |
| A hex literal put into `.bw-badge--stop` | `test/tokens.test.ts` |
| `try_files $uri /index.html` added to the catch-all location | `test/routes.test.ts` |
| The verdict badge drawn in `var(--cf-accent)` | `test/verdict.test.ts` |

## The one temporary thing

`@cloudsforge/ui` is consumed as `link:../ui/packages/ui` because it is not published yet. When it is,
`package.json` becomes `"^1.0.0"`, the Dockerfile's `uipkg` build context goes, and the second checkout
in `ci.yml` goes with it. Nothing else in this repository changes.

---

## Provenance

The code in this repository was written by **Claude Opus 5** and **Claude Fable 5**, assets
generated with **FLUX 2 Pro**, under human direction and review.
