/**
 * What this surface tells a crawler, and the three places that have to keep saying the same thing.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE ANSWER IS DERIVED FROM THE REGISTRY, AND THIS FILE'S JOB IS TO PROVE IT STILL IS.
 *
 * `robotsDirective()` (`ui/packages/ui/src/seo.ts:139-142`) reads `servesUi` and `adminOnly` and
 * nothing else. `beacon` carries `adminOnly: true` (`ui/packages/ui/src/surfaces.ts:448`), so the
 * answer is `noindex, nofollow`, and it is stated in three layers with three different readers:
 *
 *   1. `nginx.conf`  — `/robots.txt`, which a crawler fetches BEFORE any page,
 *   2. `index.html`  — the static meta tag, which a fetcher that runs no JavaScript gets,
 *   3. `DocumentMeta` in src/components/shell.tsx — the runtime tag, on every navigation.
 *
 * Three copies of one fact is three chances to drift, and drift here is silent in the worst
 * direction: the layer that would have said "do not index" is the one nobody looks at, and the
 * evidence that it stopped saying it arrives as a search result. So none of the three is retyped
 * below. The expectations are GENERATED — `robotsTxt()` composes the served body, `surfaceMeta()`
 * composes the meta content, `ENV_LABELS` composes the map's alternation — and compared with what
 * the files actually contain.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THERE IS NO SITEMAP AT ALL, WHICH IS THE DIFFERENCE FROM EVERY SIBLING
 *
 * `micro-foresight-web` and `site` both publish one. This surface publishes nothing and 404s the
 * address, for the same reason it refuses crawlers: a sitemap is a LIST OF ADDRESSES, and the
 * addresses are the thing an `adminOnly` console is withholding. It is absent from the estate
 * sitemap too, and that is not this repository's doing — `SITEMAP_SURFACES`
 * (`ui/packages/ui/src/sitemap.ts:47-49`) filters `adminOnly` rows out, so `site` already omits
 * it. Asserted below, because the day that filter changes this file's whole position is wrong.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { ENV_LABELS, SITEMAP_SURFACES, surface } from '@cloudsforge/ui'
import { robotsDirective, surfaceMeta } from '@cloudsforge/ui/seo'
import { robotsTxt } from '@cloudsforge/ui/sitemap'
import { PRODUCT } from '../src/lib/hosts.ts'
import { ROUTES } from '../src/lib/routes.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const nginx = readFileSync(join(root, 'nginx.conf'), 'utf8')
const html = readFileSync(join(root, 'index.html'), 'utf8')
const shell = readFileSync(join(root, 'src', 'components', 'shell.tsx'), 'utf8')

/**
 * index.html with its comments removed, which is what the ABSENCE sweeps below run against.
 *
 * ── This asymmetry was found by the guard firing on itself, and it is the same lesson twice ───
 *
 * The first version of the two assertions at the foot of this file went red against a shell that
 * is exactly right. index.html argues, at length and by name, that it carries no
 * `<meta name="cf-analytics">` and no script from the tag manager — so a sweep for those strings
 * over the raw file matches the paragraph explaining why they are absent. `test/tokens.test.ts`
 * records the same finding one file over: "a guard that fires on its own rationale trains people
 * to disable the guard."
 *
 * Stripped for these two and NOT for the assertion that the paragraph still exists, which is the
 * point of that one. The distinction is safe in a way `tokens.test.ts`'s deliberately is not: a
 * hex literal in a comment is a value the next reader pastes into a rule, whereas a hostname
 * inside `<!-- -->` cannot load anything. The strictness goes where the risk is.
 */
const htmlWithoutComments = html.replace(/<!--[\s\S]*?-->/g, '')

/** The single-quoted body of a `return 200 '…';` inside an exact-match location. */
function servedBody(path: string): string {
  const block = new RegExp(`location = ${path.replace('.', '\\.')} \\{([\\s\\S]*?)\\n    \\}`).exec(
    nginx,
  )
  assert.ok(block, `nginx.conf has no exact-match location for ${path}`)
  const body = /\n {8}return 200 '([\s\S]*?)';/.exec(block[1] ?? '')
  assert.ok(body, `the ${path} location does not return an unconditional literal body`)
  return body[1] ?? ''
}

/* ══════════════════════════ the registry decides, not this repository ══════════════════════════ */

describe('the indexing position is read off the surface registry', () => {
  it('resolves to noindex, nofollow — and does so because of adminOnly', () => {
    /*
     * Both halves, because they fail differently. The first is the fact this whole file depends on.
     * The second is WHY, and it is worth pinning separately: `robotsDirective` returns the same
     * string for `servesUi: false`, and this surface DOES serve a UI — so a registry edit that
     * flipped `servesUi` to false by mistake would keep the directive right for a reason that is
     * wrong, and every other assertion here would stay green while the footer, the switcher and
     * `apiBase()` all quietly changed meaning.
     */
    const beacon = surface(PRODUCT)
    assert.equal(robotsDirective(beacon), 'noindex, nofollow')
    assert.equal(beacon.servesUi, true)
    assert.equal(beacon.adminOnly, true)
  })

  it('is absent from the estate sitemap, and the registry is what excludes it', () => {
    // `site/nginx.conf` composes its sitemap from this list. Nothing in THIS repository could put
    // beacon into it or keep it out; the filter is the mechanism, and this asserts the mechanism
    // rather than the current output of it.
    assert.equal(
      SITEMAP_SURFACES.some((s) => s.key === PRODUCT),
      false,
      'beacon is in SITEMAP_SURFACES, so the apex now publishes the operator console’s address',
    )
  })
})

/* ══════════════════════════ the three layers must agree ══════════════════════════ */

describe('the static tag and the runtime tag say the same thing', () => {
  it('index.html carries exactly what surfaceMeta produces, with no local override', () => {
    /*
     * The assertion the shell's `DocumentMeta` exists to make safe. index.html is what a fetcher
     * that executes nothing gets; `applyHead` is what a browser gets. If the two disagree, one of
     * them is a lie to somebody, and which one depends on the client — which is the least
     * debuggable shape a defect can have.
     *
     * Generated rather than typed: `surfaceMeta(PRODUCT)` with no `robots` key is exactly what the
     * shell calls, so this compares the file with the CALL rather than with a string somebody
     * believed the call returned.
     */
    const derived = surfaceMeta(PRODUCT).robots
    assert.match(html, new RegExp(`<meta name="robots" content="${derived}" />`))
  })

  it('the shell passes no robots override, so the registry stays the only decision', () => {
    // The other direction. A `robots:` key at the call site would make this repository the author
    // of the position, and the registry row would become decoration that nobody notices is stale.
    const call = /surfaceMeta\(PRODUCT, \{([\s\S]*?)\}\)/.exec(shell)
    assert.ok(call, 'the shell no longer calls surfaceMeta(PRODUCT, …) — re-aim this check')
    assert.doesNotMatch(call[1] ?? '', /robots/, 'the shell overrides the derived robots directive')
  })

  it('the shell’s <title> is the one DocumentMeta composes for the same address', () => {
    /*
     * index.html used to read `Beacon — release gate` while the runtime layer composed
     * `Release gate — Beacon`: one page, two titles, in two different word orders, and nothing put
     * them side by side because the first is what a link preview shows and the second is what the
     * tab shows. This is the assertion that made them one, and it is generated from `ROUTES` — the
     * index route's label — rather than from a string retyped here.
     */
    const index = ROUTES.find((route) => route.path === '')
    assert.ok(index, 'ROUTES has no index route — re-aim this check')
    const derived = surfaceMeta(PRODUCT, {
      ...(index.label === null ? {} : { title: index.label }),
    }).title
    const written = /<title>([^<]*)<\/title>/.exec(html)
    assert.ok(written, 'index.html has no <title>')
    assert.equal(written[1], derived)
  })

  it('titles every page from ROUTES rather than from a fourth list of names', () => {
    /*
     * `DocumentMeta` reads the label off `ROUTES` — the same declaration the sub-navigation, the
     * router and nginx's enumerated locations come from. Checked by composing what it composes:
     * every declared route produces a distinct title, which is the property an operator with six
     * tabs open on one console actually relies on.
     */
    const titles = ROUTES.map(
      (route) => surfaceMeta(PRODUCT, { ...(route.label === null ? {} : { title: route.label }) }).title,
    )
    assert.equal(new Set(titles).size, ROUTES.length, `two routes share a title: ${titles.join(' / ')}`)
    // The index is the surface name alone rather than "Beacon — Beacon", and a named page is
    // suffixed with it. Both are `surfaceMeta`'s doing; this states which shape is expected.
    assert.equal(surfaceMeta(PRODUCT).title, 'Beacon')
    assert.equal(surfaceMeta(PRODUCT, { title: 'Journeys' }).title, 'Journeys — Beacon')
  })
})

/* ══════════════════════════ robots.txt ══════════════════════════ */

describe('the robots.txt nginx serves', () => {
  it('is exactly what the design system generates for a surface that is not indexable', () => {
    // Compared with its trailing newline intact: robots.txt is line-oriented and parsers differ on
    // whether an unterminated last line counts.
    assert.equal(servedBody('/robots.txt'), robotsTxt({ indexable: false }))
  })

  it('refuses every crawler unconditionally, not only away from mainnet', () => {
    /*
     * THE DIFFERENCE FROM EVERY OTHER SURFACE IN THE ESTATE, and the one an editor copying a
     * sibling's config would undo. `site` and `foresight-web` both wrap the refusal in
     * `if ($cf_env)`, because on mainnet they WANT to be indexed. This surface never does — its
     * directive is `noindex, nofollow` on production too — so a conditional here would publish the
     * operator console the moment it reached the environment where that matters.
     */
    const block = /location = \/robots\.txt \{([\s\S]*?)\n    \}/.exec(nginx)
    assert.ok(block, 'no location for /robots.txt')
    assert.doesNotMatch(
      block[1] ?? '',
      /if \(\$cf_env\)/,
      'robots.txt refuses crawlers conditionally; on this surface the refusal is unconditional',
    )
    assert.match(servedBody('/robots.txt'), /^Disallow: \/$/m)
  })

  it('names no sitemap, which a Disallow does not by itself prevent being read', () => {
    /*
     * The `Sitemap:` directive is INDEPENDENT of the user-agent groups above it, so a crawler
     * obeying `Disallow: /` is still entitled to fetch a sitemap named in the same file. A line
     * here would hand over the exact list of addresses the disallow exists to withhold.
     * `robotsTxt` omits it when no `sitemapUrl` is passed; this asserts the served body, so the
     * check survives somebody hand-editing nginx.conf instead of the call.
     */
    assert.doesNotMatch(servedBody('/robots.txt'), /Sitemap:/i)
  })

  it('names no hostname, so one image is correct on every environment', () => {
    const body = servedBody('/robots.txt')
    assert.ok(!body.includes('cloudsforge'), 'robots.txt names the estate apex')
    assert.ok(!body.includes('localhost'), 'robots.txt names localhost')
  })
})

/* ══════════════════════════ sitemap.xml ══════════════════════════ */

describe('the sitemap this surface does not have', () => {
  it('404s, and does so with no body of its own', () => {
    /*
     * `return 404;` with NO text hands the response to `error_page 404 /index.html`, so the
     * address answers exactly as any other address this surface does not serve — indistinguishable
     * from it, which is the design. `return 404 "…"` would answer directly and make the absence
     * itself a distinguishable fact about the surface.
     */
    const block = /location = \/sitemap\.xml \{([\s\S]*?)\n    \}/.exec(nginx)
    assert.ok(block, 'nginx.conf has no exact-match location for /sitemap.xml')
    assert.match(block[1] ?? '', /\n {8}return 404;/)
    assert.doesNotMatch(block[1] ?? '', /return 200/, 'the sitemap location returns a body')
  })

  it('is not a static file either, which the exact-match location would have shadowed', () => {
    /*
     * `location = /sitemap.xml` wins over the `location /` prefix that serves the static tree, so a
     * file in `public/` would be deployed, unreachable, and edited by the next reader to no effect
     * — the worst of the three states, worse than either serving it or not having it. `site`'s own
     * config records deleting exactly such a file rather than leaving it to be shadowed.
     */
    for (const name of ['robots.txt', 'sitemap.xml']) {
      assert.equal(
        existsSync(join(root, 'public', name)),
        false,
        `public/${name} exists, and nginx will never serve it`,
      )
    }
  })
})

/* ══════════════════════════ the shared environment map ══════════════════════════ */

describe('the $cf_env map, which this surface declares and deliberately never reads', () => {
  /** The alternation of environment labels inside the map. */
  function alternation(): string[] {
    const map = /map \$host \$cf_env \{[\s\S]*?~\^[^\n]*?\(\?:([^)]*)\)\\\./.exec(nginx)
    assert.ok(map, 'the $cf_env map is missing from nginx.conf')
    return (map[1] ?? '').split('|')
  }

  it('recognises exactly the labels the registry reserves', () => {
    /*
     * `ENV_LABELS` (`ui/packages/ui/src/surfaces.ts:1065-1071`) is the estate's single list —
     * `deploy/scripts/check-apex-prefix.py` reads the same export. This surface's answer does not
     * branch on the result, and the map is kept anyway so that a label added to the registry goes
     * red HERE as well as in the sixteen repositories that do branch on it. A surface that dropped
     * the map would be the one nobody notices has stopped participating.
     */
    assert.deepEqual(alternation().sort(), [...ENV_LABELS].sort())
  })

  it('matches a suffixed subdomain as well as a bare environment apex', () => {
    // The environment is a SUFFIX on the first label now (`beacon-testnet.`) and was an apex
    // prefix (`testnet.`) before. `surfaces.ts` keeps the old shape deliberately, so both have to
    // match or half the estate reads as production.
    const map = /map \$host \$cf_env \{[\s\S]*?\n\}/.exec(nginx)
    assert.ok(map, 'the $cf_env map is missing')
    assert.match(map[0], /\(\?:\[\^\.\]\+-\)\?/, 'the map does not allow a suffixed subdomain')
  })
})

/* ══════════════════════════ nothing loads a tag ══════════════════════════ */

describe('no analytics tag is loaded from the shell', () => {
  it('index.html carries no measurement ID, and the absence is argued rather than accidental', () => {
    /*
     * `analyticsId()` (`ui/packages/ui/src/consent.ts:161-169`) reads `<meta name="cf-analytics">`
     * and returns null without one, which is what makes `<CookieBanner />` render nothing and
     * `initAnalytics()` a no-op here. The reason is the same one that produced `noindex, nofollow`
     * above: GA4 reports `page_location`, so a hit from an operator console ships the estate's own
     * addresses to a third party.
     *
     * The second assertion is the one that matters in a year: the absence is pinned TOGETHER with
     * the paragraph explaining it, so deleting the explanation and adding the tag is one change
     * that goes red rather than two that each look reasonable.
     */
    assert.doesNotMatch(htmlWithoutComments, /name="cf-analytics"/)
    assert.match(html, /THERE IS DELIBERATELY NO `<meta name="cf-analytics">` HERE/)
  })

  it('and there is no gtag snippet anywhere in the shell or the source', () => {
    /*
     * The rule the whole consent layer rests on: a `<script src>` for the tag fetches a third-party
     * script and sets `_ga` ON LOAD, before any banner has been drawn let alone answered, and under
     * ePrivacy Art. 5(3) a cookie set before consent is a violation a banner underneath it does not
     * cure. `grantConsent()` — reachable only from the Accept button — is the one call site that
     * may inject it, and it lives in @cloudsforge/ui, not here.
     *
     * The domain is assembled so this assertion does not match its own explanation.
     */
    const tagHost = ['googletagmanager', '.com'].join('')
    for (const [name, text] of [
      // index.html quotes the hostname inside the paragraph forbidding it, so this one is swept
      // with its comments gone — see the note on `htmlWithoutComments` above.
      ['index.html', htmlWithoutComments],
      ['src/components/shell.tsx', shell],
      ['src/main.tsx', readFileSync(join(root, 'src', 'main.tsx'), 'utf8')],
    ] as const) {
      assert.equal(text.includes(tagHost), false, `${name} loads the analytics tag directly`)
      assert.equal(text.includes('gtag('), false, `${name} calls gtag() directly`)
    }
  })
})
