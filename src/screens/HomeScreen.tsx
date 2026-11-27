import { useRouter } from '../app/router'
import { HeroFamilies } from '../components/Illustrations'
import { ComingLater, Screen } from '../components/ui'

export function HomeScreen({ name }: { name: string }) {
  const { navigate } = useRouter()
  return (
    <Screen title="Home" hideTitle>
      <header>
        <p className="text-2xl font-extrabold">Hello, {name}</p>
        <p className="text-ink-soft">A little more us, today.</p>
      </header>
      <div className="card bg-cream-deep">
        <HeroFamilies className="w-full" />
      </div>
      <ComingLater what="Featured moment and “Waiting for you”" stage={4} />
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-secondary" onClick={() => navigate('explore')}>Explore</button>
        <button type="button" className="btn-secondary" onClick={() => navigate('storybook')}>Storybook</button>
      </div>
    </Screen>
  )
}
