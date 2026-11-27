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
import { getPrototypeState, getSession, runScheduledJobs } from '../services/api'
import { LegalScreen } from '../screens/auth/LegalScreen'
import { OtpScreen } from '../screens/auth/OtpScreen'
import { SignInScreen } from '../screens/auth/SignInScreen'
import { WelcomeScreen } from '../screens/auth/WelcomeScreen'
import { OnboardingFlow } from '../screens/onboarding/OnboardingFlow'
import { RouterProvider, useRouter } from './router'

function Shell() {
  const { state } = useService(getPrototypeState)
  const slot = state.status === 'ready' ? state.data.active_slot : 'A'
  const userId = state.status === 'ready' ? (state.data.slot_users[slot]?.user_id ?? null) : null

  return (
    <>
      {/* key forces a clean remount when the simulated device changes */}
      <div key={slot} className="mx-auto min-h-dvh max-w-[430px] bg-cream">
        <SlotView />
      </div>
      <Toaster userId={userId} />
      <PrototypeControls />
    </>
  )
}

/** What one simulated device shows: signed-out flow, onboarding, or the main app. */
function SlotView() {
  const { route } = useRouter()
  const { state, reload } = useService(getSession)

  if (route.name === 'legal') return <LegalScreen page={route.param === 'privacy' ? 'privacy' : 'terms'} />
  if (state.status === 'loading') return <div className="px-4"><LoadingState /></div>
  if (state.status === 'error') return <div className="px-4 pt-10"><ErrorState message={state.error.message} onRetry={reload} /></div>

  const { user, onboarding_step } = state.data
  if (!user) {
    if (route.name === 'signin') return <SignInScreen key={route.param} mode={route.param === 'login' ? 'login' : 'signup'} />
    if (route.name === 'otp') return <OtpScreen />
    return <WelcomeScreen />
  }
  if (onboarding_step && onboarding_step !== 'done') return <OnboardingFlow user={user} step={onboarding_step} />

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
      screen = <HomeScreen name={user.display_name} />
  }
  return (
    <>
      {screen}
      <BottomNav />
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
