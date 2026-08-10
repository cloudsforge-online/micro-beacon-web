/**
 * Every colour in this bundle comes from a design token, and there is no exception.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS IS A GREP, AND IT IS A GREP FOR A REASON.
 *
 * Three surfaces in this estate rendered COMPLETELY UNSTYLED in a real browser while their own
 * suites stayed green, because the tokens were delivered and never consumed. A stylesheet that
 * carries its own hex literals degrades gracefully when the token stylesheet is missing — it looks
 * slightly wrong. This one does not: without `@cloudsforge/ui/tokens.css` every rule below
 * resolves to nothing, and the page is white text on white.
 *
 * That is deliberate. A dependency that fails LOUDLY is worth more than one that fails
 * plausibly — and the failure this repository is guarding against is the plausible kind.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8')
/**
 * The stylesheet with its comments removed.
 *
 * ── The asymmetry below is deliberate, and it was found by the guard firing on itself ─────────
 *
 * The colour-FUNCTION sweeps run against this, not against the raw file, because styles.css opens
 * by saying "No hex literal, no `rgb()`, no named colour" — and the first version of this test went
 * red on a pristine stylesheet, matching its own rationale. `micro-web-template`'s CI records the
 * same lesson about `try_files`: "a guard that fires on its own rationale trains people to disable
 * the guard."
 *
 * The HEX sweep still runs against the RAW file, and the difference is not an oversight. A hex
 * literal sitting in a comment is a value the next reader copies out of the comment and pastes
 * into a rule; the string `rgb()` inside a sentence describing a prohibition is not a colour and
 * cannot become one. So the strictness goes where the risk is.
 */
const effective = css.replace(/\/\*[\s\S]*?\*\//g, '')
const main = readFileSync(join(root, 'src', 'main.tsx'), 'utf8')

describe('the stylesheet names no colour of its own', () => {
  it('contains no hex literal', () => {
    // Assembled so this test does not match its own explanation, and applied to the file WITH its
    // comments, because a hex in a comment is a hex somebody will copy out of the comment.
    const hex = new RegExp('#' + '[0-9a-fA-F]{3,8}\\b', 'g')
    const found = [...css.matchAll(hex)].map((m) => m[0])
    assert.deepEqual(found, [], `hex literals in styles.css: ${found.join(', ')}`)
  })

  it('contains no rgb(), rgba(), hsl() or named colour function', () => {
    assert.doesNotMatch(effective, /\brgba?\(/)
    assert.doesNotMatch(effective, /\bhsla?\(/)
    assert.doesNotMatch(
      effective,
      /\b(color|background|border-color|fill|stroke)\s*:\s*(red|green|blue|white|black|grey|gray|orange|yellow)\b/,
    )
  })

  it('draws from the tokens it says it draws from', () => {
    for (const token of [
      '--cf-bg',
      '--cf-fg',
      '--cf-fg-mute',
      '--cf-line',
      '--cf-surface',
      '--cf-viz-good',
      '--cf-viz-warn',
      '--cf-viz-crit',
      // `--cf-bar-h` USED TO BE IN THIS LIST. It left with the sub-nav: the only rule in this
      // stylesheet that read the bar's height was `.bw-subnav`'s sticky offset, and that rule is
      // `.cf-subnav`'s now. The offset is still asserted, one describe below — against `ui.css`,
      // where it now lives — rather than dropped.
      '--cf-radius',
    ]) {
      assert.ok(css.includes(`var(${token})`), `styles.css never uses var(${token})`)
    }
  })
})

describe('the sub-nav is the design system’s, and there is no second copy of it here', () => {
  /*
   * The same shape `test/tokens.test.ts` in micro-explorer-web uses for the shared form controls,
   * for the same reason and off the same census.
   *
   * Measured 2026-08-10: ten frontends declared the section strip in their own stylesheet under
   * six class prefixes, from what was plainly one original — `ui/packages/ui/src/subnav.test.ts`
   * carries the count. This repository's copy was one of the better ones: it scrolled, and it took
   * its measure from `--cf-max-w` rather than the `76rem` five of the ten used. It had still
   * drifted where a private copy always drifts — `.bw-subnav__link.is-active` marked the current
   * section in ink and underline where the estate's rule is three channels, it set the sections a
   * step under the bar's own controls, and it had no `:focus-visible` rule at all.
   *
   * BOTH halves are asserted, and that is the point of the shape. The shared classes must EXIST,
   * because a `className` naming a class `ui.css` does not declare fails exactly as silently as an
   * undefined custom property — which is the failure the top of this file is about. And the local
   * block must be GONE, because a private copy left beside the shared one is how there came to be
   * ten of them.
   */
  const ui = readFileSync(
    join(root, 'node_modules', '@cloudsforge', 'ui', 'dist', 'ui.css'),
    'utf8',
  )

  it('the shared sub-nav exists', () => {
    const declared = new Set([...ui.matchAll(/\.(cf-[a-z0-9_-]+)/g)].map((m) => m[1] ?? ''))
    for (const present of [
      'cf-subnav',
      'cf-subnav__inner',
      'cf-subnav__link',
      'cf-subnav__link--current',
    ]) {
      assert.ok(declared.has(present), `.${present} is missing from ui.css`)
    }
  })

  it('still sticks to the bar’s own height token, never a number copied out of it', () => {
    // This assertion did not weaken when the rule moved; it followed the rule. The property is
    // read out of `ui.css` now because that is where the strip is.
    const rule = /(^|\n)\.cf-subnav\s*\{([^}]*)\}/.exec(ui)
    assert.ok(rule, 'ui.css declares no `.cf-subnav` rule')
    assert.match(rule[2] ?? '', /top:\s*var\(--cf-bar-h\)/)
  })

  it('the local copy is gone, not merely unused', () => {
    // `effective` has had its comments stripped, so the note in src/styles.css explaining the
    // deletion — which necessarily spells the old class names — does not match here.
    const survivors = [...effective.matchAll(/\.bw-subnav[a-z0-9_-]*/g)].map((m) => m[0])
    assert.deepEqual(
      survivors,
      [],
      `styles.css still declares ${survivors.join(', ')}; the strip is SubNav's now`,
    )
  })

  it('nothing is still styling the local current-section modifier for a nav link', () => {
    // `is-active` was this repo's spelling of the current section; the shared one is
    // `cf-subnav__link--current`. The modifier itself is NOT banned outright, because
    // `.bw-filter.is-active` is a genuine second user of it — the incident and journey filter
    // buttons, which are buttons and not destinations. So the survivors are enumerated instead.
    const owners = [...new Set([...effective.matchAll(/\.(bw-[a-z0-9_-]+)\.is-active\b/g)].map(
      (m) => m[1] ?? '',
    ))].sort()
    assert.deepEqual(owners, ['bw-filter'], `unexpected .is-active users: ${owners.join(', ')}`)
  })
})

describe('the token stylesheets are imported before this one', () => {
  it('imports tokens.css, ui.css and then styles.css, in that order', () => {
    const order = [...main.matchAll(/import '([^']+\.css)'/g)].map((m) => m[1])
    assert.deepEqual(order, ['@cloudsforge/ui/tokens.css', '@cloudsforge/ui/ui.css', './styles.css'])
  })
})

describe('the chrome attributes are on <html> and set statically', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8')

  it('names the beacon product block, which really exists', () => {
    assert.match(html, /<html[^>]*data-cf-product="beacon"/)
    // Checked against the real token file rather than assumed. `micro-explorer-web` found that
    // `explorer` has NO block and falls through to the company ember in silence; `admin` did the
    // same for months. `beacon` does have one.
    const tokens = readFileSync(
      join(root, 'node_modules', '@cloudsforge', 'ui', 'dist', 'tokens.css'),
      'utf8',
    )
    assert.match(tokens, /\[data-cf-product='beacon'\]/)
  })

  it('names a substrate the token file declares', () => {
    const substrate = /data-cf-substrate="([a-z]+)"/.exec(html)
    assert.ok(substrate)
    const tokens = readFileSync(
      join(root, 'node_modules', '@cloudsforge', 'ui', 'dist', 'tokens.css'),
      'utf8',
    )
    assert.match(tokens, new RegExp(`\\[data-cf-substrate='${substrate[1] ?? ''}'\\]`))
  })

  it('sets both attributes in the document rather than from React', () => {
    // A page that painted before the attributes landed would flash the default ember and then
    // change colour.
    assert.doesNotMatch(main, /data-cf-product/)
  })
})
