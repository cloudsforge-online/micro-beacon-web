/**
 * The harness must keep saying what it actually does.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS FILE GUARDS A NAME, AND A NAME IS WHAT COST THE ESTATE A NIGHT.
 *
 * `test/journeys/browser.ts` renders this bundle against a fake network: it installs
 * `page.route('**\/*', …)` and answers every request from a fixture. Under its original name —
 * `open()` — a reader had no way to tell that from a helper that opens the product. So 314
 * specified browser scenarios and a green CI coexisted with three completely unstyled surfaces,
 * four whose reads 404'd or 401'd in a browser, and a degradation banner shown to every visitor
 * of a healthy game. Nothing was lying except the name.
 *
 * The rename is only durable if reverting it is loud. So this asserts three things:
 *
 *   1. the entry point is still called `renderOnlyWithStubbedNetwork` — a name that cannot be
 *      read as "this opens the product";
 *   2. it still says, in words, that it cannot detect an unreachable API, a wrong host or an
 *      unrouted path — because a truthful name over a header that no longer explains it is half
 *      the guard;
 *   3. it still names the tier that CAN — `micro-beacon`'s smoke tier — because a warning that
 *      does not say where to go next gets read as an excuse rather than a signpost.
 *
 * And the fourth, which is the reason the other three matter: the file must STILL contain the
 * interception. If `page.route` ever disappears from it, this file is guarding a warning about a
 * thing that no longer happens, and the warning has become noise that the next reader will
 * correctly delete.
 *
 * ── The fourth check reads CODE, and the reason is a hole this guard shipped with ─────────────
 *
 * `emberkin-web` and `aetherholm-web` carry the ancestor of this file, and there the interception
 * check was `SOURCE.includes('page' + '.route(')` against the whole harness. That check CANNOT
 * FAIL. The harness explains itself at length, and its header quotes `page.route` three times
 * before the single line that actually calls it — so deleting the call outright leaves the string
 * behind in prose and the assertion green. Driven directly: renaming `await page.route(` to
 * something else in `test/journeys/browser.ts` left all four assertions passing.
 *
 * That is precisely the defect this estate keeps producing — a check that reads a description of
 * the thing instead of the thing. So the assertion below strips comments first and requires the
 * real catch-all call in the remaining executable source. Its sibling in the two `*-web`
 * repositories still has the weak form and should be brought to this one.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const HARNESS = fileURLToPath(new URL('./journeys/browser.ts', import.meta.url))
const SOURCE = readFileSync(HARNESS, 'utf8')

/** The header with its comment markers gone, so a quoted phrase is still readable text. */
const PROSE = SOURCE.replace(/^\s*\*\/?/gm, ' ')

/**
 * The harness with every comment LINE removed — what the file DOES, with what it SAYS taken out.
 *
 * Done by line and not with a `/* … *\/` regex, which is the obvious way and is wrong here. The
 * interception this file exists to find is `page.route('**\/*', …)`, and the catch-all pattern
 * `'**\/*'` CONTAINS the character pair that opens a block comment. A regex sweep therefore
 * treats the middle of the very line being looked for as the start of a comment, eats it, and the
 * assertion below fails on a harness that is perfectly intact. That was driven, not reasoned: the
 * first version of this check went red against the unmutated file.
 *
 * Every comment in the harness is either a JSDoc block, whose continuation lines begin with `*`,
 * or a whole-line `//`. Neither shape can begin a line of real code, so dropping those lines is
 * both safe and sufficient. A trailing `//` after code survives, which is harmless: no trailing
 * comment in that file quotes the interception.
 */
const CODE = SOURCE.split('\n')
  .filter((line) => !/^\s*(?:\/\*|\*|\/\/)/.test(line))
  .join('\n')

describe('the stubbing harness states what it does', () => {
  it('still intercepts every request — otherwise this whole file is guarding nothing', () => {
    // Assembled rather than written out, so this assertion does not match its own explanation in
    // the header above — and matched against CODE, not SOURCE, so it does not match the harness's
    // explanation either. The three `page.route` mentions in that file's header used to be enough
    // to keep this green with the real call deleted.
    const intercept = ['page', ".route('**/*'"].join('')
    assert.ok(
      CODE.includes(intercept),
      'the harness no longer intercepts every request. Either it stopped stubbing — in which ' +
        'case the warnings it carries are stale and this guard should be deleted along with ' +
        'them, deliberately — or the interception moved and this check must be re-aimed at it',
    )
  })

  it('the entry point is named for what it does, not for what a reader hopes it does', () => {
    assert.ok(
      SOURCE.includes('export async function renderOnlyWithStubbedNetwork('),
      'the stubbing entry point has been renamed. A name like `open()` invites the next reader ' +
        'to trust these scenarios for reachability, which they structurally cannot answer',
    )
    // The old name must not come back as an alias either — an `export { … as open }` would undo
    // this while leaving the declaration above intact.
    assert.doesNotMatch(
      SOURCE,
      /\bas open\b|export async function open\(|export const open\b/,
      'the old name is exported again, so callers can still read as though they opened the product',
    )
  })

  it('says plainly what it cannot see', () => {
    for (const phrase of ['unreachable API', 'wrong host', 'unrouted path']) {
      assert.ok(
        PROSE.includes(phrase),
        `the harness header no longer says it cannot detect an ${phrase}`,
      )
    }
  })

  it('names the tier that CAN see those things', () => {
    assert.ok(
      PROSE.includes('micro-beacon') && PROSE.includes('smoke'),
      'the harness header no longer names micro-beacon’s smoke tier, so a reader who learns ' +
        'these scenarios cannot answer reachability is not told what does',
    )
  })
})
