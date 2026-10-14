import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

/** Fetch on mount, with loading, error and data. Same shape as the dashboard's. */
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })

  const load = useCallback(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcher()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error) => !cancelled && setState({ data: null, error, loading: false }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(load, [load])
  return { ...state, reload: load }
}

/**
 * A keyset-paged list: { items, next } from the API, "Load more" appends.
 * Changing `params` starts again from the first page.
 */
export function usePaged(path, params = {}) {
  const key = JSON.stringify(params)
  const [state, setState] = useState({ items: [], next: null, loading: true, error: null })

  const fetchPage = useCallback(
    async (cursor) => {
      setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const page = await api.get(path, { ...params, cursor })
        setState((s) => ({
          items: cursor ? [...s.items, ...page.items] : page.items,
          next: page.next,
          loading: false,
          error: null,
        }))
      } catch (error) {
        setState((s) => ({ ...s, loading: false, error }))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, key],
  )

  useEffect(() => {
    fetchPage(null)
  }, [fetchPage])

  return {
    ...state,
    reload: () => fetchPage(null),
    more: state.next ? () => fetchPage(state.next) : null,
  }
}
