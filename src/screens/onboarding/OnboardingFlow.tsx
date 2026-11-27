import { useState } from 'react'
import type { AgeBand, User } from '../../domain/types'
import type { OnboardingStep } from '../../services/api'
import { InviteStepScreen } from '../pairing/InviteStepScreen'
import { FamilyScreen } from './FamilyScreen'
import { MomentsScreen } from './MomentsScreen'
import { NotificationPrefsScreen } from './NotificationPrefsScreen'
import { StageScreen } from './StageScreen'

type Step = Exclude<OnboardingStep, 'done'>

/**
 * Onboarding Screens 03–06 and 08. The service decides the furthest step the
 * user may reach; Back lets them revisit earlier steps without losing data.
 * A user who joined through an invitation is already paired and skips 06.
 */
export function OnboardingFlow({ user, step, paired, householdAgeBand }: { user: User; step: Step; paired: boolean; householdAgeBand: AgeBand | null }) {
  const order: Step[] = paired ? ['stage', 'family', 'moments', 'notifications'] : ['stage', 'family', 'moments', 'invite', 'notifications']
  const [viewing, setViewing] = useState<number | null>(null)
  const furthest = order.indexOf(step)
  const index = viewing === null ? furthest : Math.min(viewing, furthest)
  const props = {
    user,
    step: index + 1,
    total: order.length,
    onBack: () => setViewing(Math.max(0, index - 1)),
    onDone: () => setViewing(index + 1 >= furthest ? null : index + 1),
  }
  switch (order[index]) {
    case 'stage':
      return <StageScreen {...props} householdAgeBand={householdAgeBand} />
    case 'family':
      return <FamilyScreen {...props} />
    case 'moments':
      return <MomentsScreen {...props} />
    case 'invite':
      return <InviteStepScreen {...props} />
    case 'notifications':
      return <NotificationPrefsScreen {...props} />
  }
}
