import { useCallback, useEffect, useState } from 'react'

/**
 * Fetch on mount, with the three states every screen needs: loading, error,
 * data. Small on purpose — a data-fetching library earns its place when there
 * is caching to share, and there isn't yet.
 */
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
