import { useRouter } from '../../app/router'
import { OnboardingLayout } from '../../components/Onboarding'
import { InvitePanel } from './InvitePanel'

/** Screen 06 outside onboarding, reached from the Home invitation card. */
export function InvitePartnerScreen() {
  const { navigate } = useRouter()
  return (
    <OnboardingLayout
      title="Invite your partner"
      intro="You'll each use your own account and answer privately. Nothing you write is shown to the other person."
      onBack={() => navigate('home')}
      footer={<button type="button" className="btn-secondary" onClick={() => navigate('home')}>Skip for now</button>}
    >
      <InvitePanel />
    </OnboardingLayout>
  )
}
