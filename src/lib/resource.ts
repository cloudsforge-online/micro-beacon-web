/**
 * One fetch, four states.
 *
 * Every screen in the estate needs the same four-way answer — loading, ok, empty, failed — and
 * every screen that computes it by hand eventually gets one of the cases wrong: an empty array
 * rendered for a timeout, or a fault rendered as "no results". The decision is made once here, as
 * a pure function, so the wrong version cannot be written a seventh time.
 *
 * ── There is no `refused` state here any more, and its absence is deliberate ───────────────────
 *
 * The template has a fifth state, `forbidden`, entered on a 403. This file used to have a wider
 * one, `refused`, entered on 401 OR 403, because every `micro-indexer` read demanded a scope this
 * browser could not hold. `micro-indexer` made its seven reads anonymous
 * (`authoriseRead`, `indexer/src/server.ts:792-801`), so that state was the machinery of a
 * restriction that no longer exists and it has been deleted rather than left to apologise.
 *
 * A 401 or a 403 from the chain index is now a genuine fault — this bundle presents no credential
 * at all (`publicRead` in src/lib/indexer.ts), so nothing it sends can be refused for lacking one.
 * If one arrives it means the service re-gated a read or something in front of it injected a
 * credential, and `failed` is the honest screen for both: a message, a request id to quote, and no
 * sentence pretending the reader could have done anything differently.
 */
import { useCallback, useEffect, useState } from 'react'
import { noticeFor, type ErrorNotice } from './api.ts'

export type ResourceState = 'loading' | 'ok' | 'empty' | 'failed'

/**
 * Which state a resource is in.
 *
 * FAILURE OUTRANKS EMPTINESS, in both directions. A request that threw has told us nothing about
 * whether data exists, so reporting "nothing here" for a timeout is how an outage reads as a
 * quiet week — and it outranks `loading` too, so a failure cannot be hidden behind a spinner that
 * never resolves.
 */
export function resourceState(opts: {
  loading: boolean
  error: ErrorNotice | null
  count: number | null
}): ResourceState {
  if (opts.error) return 'failed'
  if (opts.loading) return 'loading'
  if (opts.count === null) return 'loading'
  return opts.count > 0 ? 'ok' : 'empty'
}

export interface Resource<T> {
  state: ResourceState
  data: T | null
  error: ErrorNotice | null
  reload: () => void
}

/**
 * Run `load` on mount and on demand, and reduce the outcome to one of the four states.
 *
 * `count` exists because "empty" is a property of the DATA, not of the response: an object with
 * an empty list inside it is a 200 that should render the empty state.
 */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  count: (data: T) => number,
  fallbackMessage: string,
  /**
   * The VALUES the question depends on — a filter, a path parameter, a search term.
   *
   * ── Why this parameter exists, and why `load` is still not the dependency ─────────────────
   *
   * The template's version of this hook re-runs on `nonce` alone, and `load` is deliberately
   * excluded because most callers recreate it every render, which would make the effect a render
   * loop. That is correct for a screen with one fixed question, which is every screen the
   * template was written for.
   *
   * It is WRONG for a screen whose question changes. Selecting "Approved" in the queue filter,
   * or pasting a correlation id into the audit search, changes what should be asked — and with
   * `[nonce]` as the only dependency the request is never re-sent. The console then shows the
   * previous answer under the new filter, silently: the operator reads a list of pending requests
   * with "Approved" selected above it, and there is nothing on screen to say why.
   *
   * That is a worse failure on this surface than on a dashboard. An operator filtering the audit
   * to a correlation id during an incident, and being shown the unfiltered log with the id in the
   * box, is being handed the wrong evidence with the right label on it.
   *
   * So the caller passes the values rather than the closure. `[nonce, ...deps]` re-runs on either,
   * the in-flight request is aborted by the existing cleanup, and `load` stays out of the array.
   */
  deps: readonly unknown[] = [],
): Resource<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ErrorNotice | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    load(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return
        setData(value)
        setLoading(false)
      })
      .catch((err: unknown) => {
        // An abort is this component going away, not a failure. Rendering the failed state for it
        // is how a fast double-navigation leaves an error on a screen nobody is looking at.
        if (controller.signal.aborted) return
        setError(noticeFor(err, fallbackMessage))
        setLoading(false)
      })
    return () => controller.abort()
    // `load` is recreated every render by most callers, so it is deliberately not a dependency —
    // it would make this effect a render loop. `nonce` re-runs it on demand and `deps` re-runs it
    // when the QUESTION changes; see the note on the parameter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    state: resourceState({ loading, error, count: data === null ? null : count(data) }),
    data,
    error,
    reload,
  }
}
