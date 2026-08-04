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
      '--cf-bar-h',
      '--cf-radius',
    ]) {
      assert.ok(css.includes(`var(${token})`), `styles.css never uses var(${token})`)
    }
  })

  it('uses the bar’s own height token for the sticky sub-nav, never a copied number', () => {
    assert.match(css, /top: var\(--cf-bar-h\)/)
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
