import { useState } from 'react'
import type { User } from '../../domain/types'
import type { OnboardingStep } from '../../services/api'
import { FamilyScreen } from './FamilyScreen'
import { MomentsScreen } from './MomentsScreen'
import { NotificationPrefsScreen } from './NotificationPrefsScreen'
import { StageScreen } from './StageScreen'

const ORDER: Exclude<OnboardingStep, 'done'>[] = ['stage', 'family', 'moments', 'notifications']

/**
 * Onboarding Screens 03–05 and 08. The service decides the furthest step the
 * user may reach; Back lets them revisit earlier steps without losing data.
 */
export function OnboardingFlow({ user, step }: { user: User; step: Exclude<OnboardingStep, 'done'> }) {
  const [viewing, setViewing] = useState<number | null>(null)
  const furthest = ORDER.indexOf(step)
  const index = viewing === null ? furthest : Math.min(viewing, furthest)
  const current = ORDER[index]
  const props = {
    user,
    step: index + 1,
    total: ORDER.length,
    onBack: () => setViewing(Math.max(0, index - 1)),
    onDone: () => setViewing(index + 1 >= furthest ? null : index + 1),
  }
  switch (current) {
    case 'stage':
      return <StageScreen {...props} />
    case 'family':
      return <FamilyScreen {...props} />
    case 'moments':
      return <MomentsScreen {...props} />
    case 'notifications':
      return <NotificationPrefsScreen {...props} />
  }
}
