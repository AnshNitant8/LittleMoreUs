import { ComingLater, Screen } from '../components/ui'

export function StorybookScreen() {
  return (
    <Screen title="Storybook">
      <p className="text-ink-soft">Your private, shared collection of little stories.</p>
      <ComingLater what="Saved and recent stories" stage={6} />
    </Screen>
  )
}
