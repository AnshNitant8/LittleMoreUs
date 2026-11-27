import { CategoryIllustration } from '../components/Illustrations'
import { Screen } from '../components/ui'
import { CATEGORIES, CATEGORY_ORDER } from '../domain/constants'

export function ExploreScreen() {
  return (
    <Screen title="Explore">
      <p className="text-ink-soft">Pick a kind of moment. Questions arrive in a later build stage.</p>
      <ul className="space-y-3">
        {CATEGORY_ORDER.map((id) => {
          const c = CATEGORIES[id]
          return (
            <li key={id} className="flex items-center gap-4 rounded-[var(--radius-card)] p-4" style={{ background: c.accent }}>
              <CategoryIllustration category={id} />
              <div>
                <h2 className="text-lg font-extrabold">{c.name}</h2>
                <p className="text-sm text-ink-soft">{c.description}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </Screen>
  )
}
