import { OnboardingLayout } from '../../components/Onboarding'

const COPY = {
  terms: {
    title: 'Terms (prototype)',
    body: [
      'This is a usability-test prototype, not a live service.',
      'You must be 18 or older to use A Little More Us.',
      'Stories are imaginative writing created by AI from both partners’ answers. They are not your child’s actual words and are not advice of any kind.',
      'Nothing here offers medical, therapeutic or relationship advice.',
    ],
  },
  privacy: {
    title: 'Privacy notice (prototype)',
    body: [
      'You each answer privately. Your partner never sees your raw answer, only the shared story made after you both agree.',
      'Raw answers are deleted 24 hours after a story is made, or straight away if a moment is declined, expires or is withdrawn.',
      'Notifications never contain question or answer text.',
      'We don’t ask for your baby’s name, date of birth or photo.',
      'In this prototype, data is stored only in this browser. It is not a secure multi-user system.',
    ],
  },
}

export function LegalScreen({ page }: { page: 'terms' | 'privacy' }) {
  const c = COPY[page]
  return (
    <OnboardingLayout
      title={c.title}
      onBack={() => history.back()}
      footer={<button type="button" className="btn-secondary" onClick={() => history.back()}>Done</button>}
    >
      <ul className="list-disc space-y-3 pl-5">
        {c.body.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </OnboardingLayout>
  )
}
