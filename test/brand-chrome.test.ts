/**
 * The chrome a separate hostname needs, and the chrome this surface deliberately does not have.
 *
 * Three frontends in this estate shipped with the browser's blank-page glyph in the tab and a bare
 * URL wherever they were shared, because nothing asserted that a page has an icon and nothing
 * inherited one. Four more shipped with favicons in `public/` that the Dockerfile never copied,
 * while their own brand tests went on passing because they read the source tree rather than the
 * image.
 *
 * The absences are asserted in BOTH directions, so that adding a mark or an og card later is a
 * decision somebody has to argue for rather than a reflex.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { hasMark } from '@cloudsforge/ui'

const root = fileURLToPath(new URL('..', import.meta.url))
const html = readFileSync(join(root, 'index.html'), 'utf8')
const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')
const brandDir = process.env['CLOUDSFORGE_BRAND_DIR'] ?? join(root, '..', 'brand')
const hasBrand = existsSync(join(brandDir, 'assets', 'beacon'))

describe('the tab and the home screen', () => {
  for (const file of ['favicon-32x32.png', 'favicon-192x192.png', 'favicon-512x512.png']) {
    it(`ships ${file}, and it is a real file`, () => {
      const path = join(root, 'public', file)
      assert.ok(existsSync(path), `public/${file} is missing`)
      // A zero-byte placeholder passes an existence check and renders as nothing.
      assert.ok(statSync(path).size > 500, `public/${file} is too small to be an icon`)
    })
  }

  it('references them from index.html', () => {
    assert.match(html, /href="\/favicon-32x32\.png"/)
    assert.match(html, /href="\/favicon-192x192\.png"/)
    assert.match(html, /rel="apple-touch-icon"/)
  })

  it('copies public/ into the image', () => {
    // Without this line the built image has NO favicon at all, while a source-tree test goes on
    // passing. Four frontends shipped that way.
    assert.match(dockerfile, /^COPY public \.\/public$/m)
  })
})

describe('this surface has no mark, and that is a registry fact', () => {
  it('the design system draws nothing for it', () => {
    assert.equal(hasMark('beacon'), false)
  })

  it('nothing in the bundle renders one', () => {
    const src = ['app.tsx', 'main.tsx', join('components', 'shell.tsx')]
      .map((f) => readFileSync(join(root, 'src', f), 'utf8'))
      .join('\n')
    assert.doesNotMatch(src, /<Mark\b/)
    assert.doesNotMatch(src, /CloudsForgeLogo/)
  })

  it('and micro-brand still ships no mark the registry declares', {
    skip: hasBrand ? false : `no sibling checkout at ${brandDir}`,
  }, () => {
    // `brand/assets/beacon/mark-1024x1024.png` DOES exist, and it is the source the favicons were
    // cut from rather than a mark the registry declares — `markId` is null, so `Mark` draws
    // nothing. Pinned in this direction too: if micro-ui ever gives `beacon` a `markId`, this goes
    // red and somebody has to decide whether the console should wear one.
    assert.ok(existsSync(join(brandDir, 'assets', 'beacon', 'mark-1024x1024.png')))
  })
})

describe('this surface has no og card, and that is a brand-plan decision', () => {
  it('index.html declares no og: or twitter: meta', () => {
    assert.doesNotMatch(html, /property="og:/)
    assert.doesNotMatch(html, /name="twitter:/)
  })

  it('ships no og image, so no meta tag could point at one', () => {
    // `brand/plan.ts` — "No OG card and no social banner for Admin, Lantern or Beacon. Those
    // kinds exist to be opened by an operator, not shared." Inventing a meta tag pointing at a
    // file that does not exist is how a surface ships a broken preview.
    assert.equal(existsSync(join(root, 'public', 'og-1200x630.png')), false)
  })

  it('and asks not to be indexed, because every route here is admin-only', () => {
    assert.match(html, /name="robots" content="noindex, nofollow"/)
  })
})

describe('the release identity', () => {
  it('is a meta tag stamped by the build, not a build-time constant', () => {
    assert.match(html, /<meta name="cf-release" content="dev" \/>/)
    assert.match(dockerfile, /ARG RELEASE=dev/)
    assert.match(dockerfile, /cf-release/)
  })
})
