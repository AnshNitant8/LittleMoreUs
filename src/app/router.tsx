import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/** Minimal hash router: #/<screen>/<param>. Keeps the place on refresh. */
export interface Route {
  name: string
  param: string | null
}


function parseHash(hash: string): Route {
  const [name, param] = hash.replace(/^#\/?/, '').split('/')
  return { name: name || 'home', param: param ? decodeURIComponent(param) : null }
}

interface RouterValue {
  route: Route
  navigate: (name: string, param?: string | null) => void
}

const RouterContext = createContext<RouterValue | null>(null)

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const navigate = useCallback((name: string, param: string | null = null) => {
    const hash = `#/${name}${param ? `/${encodeURIComponent(param)}` : ''}`
    if (window.location.hash !== hash) window.location.hash = hash
    setRoute({ name, param })
    window.scrollTo?.({ top: 0 })
  }, [])
  return <RouterContext.Provider value={{ route, navigate }}>{children}</RouterContext.Provider>
}

export function useRouter(): RouterValue {
  const v = useContext(RouterContext)
  if (!v) throw new Error('useRouter outside RouterProvider')
  return v
}
