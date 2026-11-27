import { useRouter } from '../app/router'
import { TABS, type TabName } from '../app/tabs'

const LABELS: Record<TabName, string> = { home: 'Home', explore: 'Explore', storybook: 'Storybook', profile: 'Profile' }

function Icon({ tab }: { tab: TabName }) {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true } as const
  switch (tab) {
    case 'home':
      return <svg {...common}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" strokeLinejoin="round" /></svg>
    case 'explore':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" strokeLinejoin="round" /></svg>
    case 'storybook':
      return <svg {...common}><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" strokeLinejoin="round" /><path d="M4 21V5" /><path d="M12 8.5s-2.5-1.6-2.5-3.2a1.3 1.3 0 0 1 2.5-.6 1.3 1.3 0 0 1 2.5.6c0 1.6-2.5 3.2-2.5 3.2z" /></svg>
    case 'profile':
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" /></svg>
  }
}

export function BottomNav() {
  const { route, navigate } = useRouter()
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-[430px] justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const active = route.name === t
          return (
            <li key={t} className="flex-1">
              <button
                type="button"
                onClick={() => navigate(t)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-bold ${active ? 'text-coral' : 'text-ink-soft'}`}
              >
                <Icon tab={t} />
                {LABELS[t]}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
