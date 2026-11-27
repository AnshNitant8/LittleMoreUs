import { useEffect, useState } from 'react'
import { BottomNav } from '../components/BottomNav'
import { PrototypeControls } from '../components/PrototypeControls'
import { Toaster } from '../components/Toaster'
import { ErrorState, LoadingState } from '../components/ui'
import { useService } from '../hooks/useService'
import { ExploreScreen } from '../screens/ExploreScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { StorybookScreen } from '../screens/StorybookScreen'
import { getPrototypeState, runScheduledJobs } from '../services/api'
import { RouterProvider, useRouter } from './router'

function Shell() {
  const { route } = useRouter()
  const { state } = useService(getPrototypeState)
  const slot = state.status === 'ready' ? state.data.active_slot : 'A'
  const userId = state.status === 'ready' ? (state.data.slot_users[slot]?.user_id ?? null) : null

  let screen
  switch (route.name) {
    case 'explore':
      screen = <ExploreScreen />
      break
    case 'storybook':
      screen = <StorybookScreen />
      break
    case 'profile':
      screen = <ProfileScreen />
      break
    default:
      screen = <HomeScreen />
  }

  return (
    <>
      {/* key forces a clean remount when the simulated device changes */}
      <div key={slot} className="mx-auto min-h-dvh max-w-[430px] bg-cream">
        {screen}
      </div>
      <BottomNav />
      <Toaster userId={userId} />
      <PrototypeControls />
    </>
  )
}

export default function App() {
  const [boot, setBoot] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    // Scheduled jobs run on every application load.
    void runScheduledJobs().then((r) => setBoot(r.ok ? 'ready' : 'error'))
  }, [])

  if (boot === 'loading') return <div className="mx-auto max-w-[430px] px-4"><LoadingState label="Getting things ready" /></div>
  if (boot === 'error')
    return (
      <div className="mx-auto max-w-[430px] px-4 pt-10">
        <ErrorState message="The prototype could not start. Try refreshing the page." onRetry={() => window.location.reload()} />
      </div>
    )
  return (
    <RouterProvider>
      <Shell />
    </RouterProvider>
  )
}
