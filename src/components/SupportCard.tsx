import { useService } from '../hooks/useService'
import { getSupportRegion } from '../services/api'

const IN_CONTACTS = [
  { name: 'Tele-MANAS', number: '14416', note: 'Free mental health support, 24 hours' },
  { name: 'Emergency services', number: '112', note: 'If you are in danger right now' },
  { name: 'Women Helpline', number: '181', note: 'Support if you feel unsafe' },
]

/**
 * Private support card, shown only to the person whose answer was flagged.
 * It does not diagnose or counsel, and never asks whether to share.
 */
export function SupportCard() {
  const { state } = useService(getSupportRegion)
  const india = state.status === 'ready' && state.data === 'IN'
  return (
    <section aria-labelledby="support-title" className="space-y-4 rounded-[var(--radius-card)] border-2 border-[#86C29C] bg-white p-5">
      <h2 id="support-title" className="text-lg font-extrabold">
        Thank you for sharing. It sounds like things may be heavy right now. You deserve support.
      </h2>
      {india ? (
        <ul className="space-y-2">
          {IN_CONTACTS.map((c) => (
            <li key={c.number}>
              <a href={`tel:${c.number}`} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-[#DDF1E4] px-4 py-2">
                <span>
                  <span className="block font-bold">{c.name}</span>
                  <span className="block text-sm text-ink-soft">{c.note}</span>
                </span>
                <span className="text-xl font-extrabold">{c.number}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <p className={india ? 'text-sm text-ink-soft' : 'font-bold'}>Please contact your local emergency services or your doctor.</p>
      <p className="text-sm text-ink-soft">This one won't become a story. Only you can see this message.</p>
    </section>
  )
}
