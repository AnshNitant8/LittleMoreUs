import { useEffect, useState } from 'react'
import { BottomNav } from '../components/BottomNav'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PrototypeControls } from '../components/PrototypeControls'
import { Toaster } from '../components/Toaster'
import { ErrorState, LoadingState } from '../components/ui'
import { useService } from '../hooks/useService'
import { ExploreScreen } from '../screens/ExploreScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { StorybookScreen } from '../screens/StorybookScreen'
import { getPrototypeState, getSession, resumeGeneration, runScheduledJobs } from '../services/api'
import { AnswerScreen } from '../screens/moments/AnswerScreen'
import { AskScreen } from '../screens/moments/AskScreen'
import { StoryScreen } from '../screens/moments/StoryScreen'
import { WaitingScreen } from '../screens/moments/WaitingScreen'
import { CATEGORY_IDS, type CategoryId } from '../domain/types'
import { LegalScreen } from '../screens/auth/LegalScreen'
import { OtpScreen } from '../screens/auth/OtpScreen'
import { SignInScreen } from '../screens/auth/SignInScreen'
import { WelcomeScreen } from '../screens/auth/WelcomeScreen'
import { OnboardingFlow } from '../screens/onboarding/OnboardingFlow'
import { AcceptInviteScreen } from '../screens/pairing/AcceptInviteScreen'
import { InvitePartnerScreen } from '../screens/pairing/InvitePartnerScreen'
import { RouterProvider, useRouter } from './router'
import { StartGameScreen } from '../screens/moments/GameScreen'
import { DeleteAccountScreen, RecoverAccountScreen } from '../screens/account/AccountScreens'
import { UnlockScreen } from '../screens/storybook/UnlockScreen'

function Shell() {
  const { state } = useService(getPrototypeState)
  const slot = state.status === 'ready' ? state.data.active_slot : 'A'
  const userId = state.status === 'ready' ? (state.data.slot_users[slot]?.user_id ?? null) : null

  return (
    <>
      {/* key forces a clean remount when the simulated device changes */}
      <div key={slot} className="mx-auto min-h-dvh max-w-[430px] bg-cream">
        <ErrorBoundary>
          <SlotView />
        </ErrorBoundary>
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

  const { user, onboarding_step, couple, pending_invite, erase_at } = state.data
  if (user && erase_at) return <RecoverAccountScreen eraseAt={erase_at} />
  // Screen 07: an invite link, or an invite opened before signing in.
  if (route.name === 'invite' && route.param) return <AcceptInviteScreen key={route.param} token={route.param} signedIn={!!user} />
  if (user && pending_invite && !couple) return <AcceptInviteScreen key={pending_invite} token={pending_invite} signedIn />
  if (!user) {
    if (route.name === 'signin') return <SignInScreen />
    if (route.name === 'otp') return <OtpScreen />
    return <WelcomeScreen />
  }
  if (onboarding_step && onboarding_step !== 'done') return (
      <OnboardingFlow user={user} step={onboarding_step} paired={!!couple} householdAgeBand={couple?.age_band ?? null} />
    )

  if (route.name === 'delete-account') return <DeleteAccountScreen />

  // Storybook full-screen views. Membership and locks are enforced by the service layer.
  if (route.name === 'story' && route.param) return <StoryScreen key={route.param} storyId={route.param} />
  if (route.name === 'unlock') return <UnlockScreen key={route.param ?? 'unlock'} lockedStory={!!route.param} />

  // Full-screen moment flows (no bottom nav: one primary action per screen).
  if (couple && route.param) {
    if (route.name === 'ask') {
      const cat = CATEGORY_IDS.includes(route.param as CategoryId) ? (route.param as CategoryId) : null
      return <AskScreen key={route.param} category={cat} />
    }
    if (route.name === 'play') return <StartGameScreen />
    if (route.name === 'answer') return <AnswerScreen key={route.param} interactionId={route.param} />
    if (route.name === 'waiting') return <WaitingScreen key={route.param} interactionId={route.param} />
  }

  let screen
  switch (route.name) {
    case 'explore':
      screen = <ExploreScreen paired={!!couple} />
      break
    case 'storybook':
      screen = <StorybookScreen />
      break
    case 'profile':
      screen = <ProfileScreen />
      break
    case 'invite-partner':
      if (!couple) return <InvitePartnerScreen />
      screen = <HomeScreen name={user.display_name} couple={couple} />
      break
    default:
      screen = <HomeScreen name={user.display_name} couple={couple} />
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
    void runScheduledJobs().then((r) => {
      setBoot(r.ok ? 'ready' : 'error')
      // Finish any story whose generation was interrupted when the app closed.
      if (r.ok) void resumeGeneration()
    })
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
