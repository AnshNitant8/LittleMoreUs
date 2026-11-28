import { useRouter } from '../../app/router'
import { ErrorState, LoadingState } from '../../components/ui'
import { SAMPLE_BOOK } from '../../data/sampleBook'
import { CATEGORIES } from '../../domain/constants'
import { useService } from '../../hooks/useService'
import { getBook, type BookEntry, type BookView } from '../../services/api'
import { trackEvent } from '../../services/productAnalytics'
import { useEffect } from 'react'

const SERIF = { fontFamily: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif" }
const sample = () => Promise.resolve({ ok: true as const, data: SAMPLE_BOOK })

/** The full Storybook as a keepsake book. `sample` shows a made-up couple's book. */
export function BookScreen({ isSample }: { isSample: boolean }) {
  const { navigate } = useRouter()
  const { state, reload } = useService(isSample ? sample : getBook)
  useEffect(() => trackEvent(isSample ? 'sample_book_opened' : 'book_opened'), [isSample])

  return (
    <main aria-labelledby="book-title" className="min-h-dvh px-4 pb-16 pt-4 print:px-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <button type="button" className="btn-ghost -ml-3" onClick={() => navigate('storybook')}>← Storybook</button>
        {state.status === 'ready' && state.data.stats.stories > 0 && (
          <button type="button" className="btn-ghost -mr-3 text-sm" onClick={() => { trackEvent('book_printed', { source: book_kind(state) }); window.print() }}>Print or save as PDF</button>
        )}
      </div>
      {state.status === 'loading' && <LoadingState label="Opening your book" />}
      {state.status === 'error' &&
        (state.error.locked ? (
          <div className="card space-y-3">
            <p className="font-extrabold">Your book comes with the full Storybook</p>
            <button type="button" className="btn-primary" onClick={() => navigate('unlock')}>Unlock full Storybook</button>
            <button type="button" className="btn-ghost w-full" onClick={() => navigate('book', 'sample')}>See a sample book</button>
          </div>
        ) : (
          <ErrorState message={state.error.message} onRetry={reload} />
        ))}
      {state.status === 'ready' && <Book book={state.data} />}
    </main>
  )
}

function Book({ book }: { book: BookView }) {
  const { navigate } = useRouter()
  return (
    <article className="space-y-10">
      {book.sample && (
        <p role="note" className="rounded-full bg-ink px-4 py-2 text-center text-sm font-bold text-white print:hidden">
          Sample book · a made-up couple, to show what yours can look like
        </p>
      )}

      {/* Cover */}
      <header className="relative overflow-hidden rounded-[28px] px-6 pb-8 pt-10 text-center shadow-sm" style={{ background: 'linear-gradient(160deg, #FDE2D8 0%, #FBEFD9 55%, #E1ECFB 100%)' }}>
        <svg viewBox="0 0 32 32" width="44" height="44" className="mx-auto" aria-hidden="true">
          <path d="M16 27s-10-6.2-10-13.6A5.6 5.6 0 0 1 16 10.6a5.6 5.6 0 0 1 10 2.8C26 20.8 16 27 16 27z" fill="#F2765D" />
        </svg>
        <h1 id="book-title" className="mt-4 text-3xl font-bold leading-tight text-ink" style={SERIF}>{book.title}</h1>
        <p className="mt-2 text-lg text-ink" style={SERIF}>{book.couple}</p>
        {book.since && <p className="mt-1 text-sm text-ink-soft">Since {book.since}</p>}
        <dl className="mx-auto mt-6 grid max-w-xs grid-cols-3 gap-2 text-ink">
          <Stat n={book.stats.stories} label={book.stats.stories === 1 ? 'story' : 'stories'} />
          <Stat n={book.stats.words} label="in your words" />
          <Stat n={book.stats.ideas} label={book.stats.ideas === 1 ? 'small idea' : 'small ideas'} />
        </dl>
      </header>

      {book.stats.stories === 0 ? (
        <div className="card space-y-3 text-center">
          <p className="font-extrabold">Your book is waiting for its first page</p>
          <p className="text-ink-soft">Save a story to your Storybook and it becomes a page here, with the question, the story, your small idea, and your own words if you add them.</p>
          <button type="button" className="btn-secondary" onClick={() => navigate('home')}>Start a moment</button>
        </div>
      ) : (
        <>
          {/* Contents */}
          <nav aria-labelledby="contents-title" className="rounded-[var(--radius-card)] bg-white p-5">
            <h2 id="contents-title" className="text-sm font-extrabold uppercase tracking-widest text-ink-soft">Contents</h2>
            <ol className="mt-3 space-y-2">
              {book.chapters.map((c, i) => (
                <li key={c.title} className="flex items-baseline gap-3">
                  <span className="text-sm text-ink-soft">{toRoman(i + 1)}</span>
                  <a href={`#chapter-${i}`} onClick={(e) => { e.preventDefault(); document.getElementById(`chapter-${i}`)?.scrollIntoView({ behavior: 'smooth' }) }} className="flex-1 font-bold text-ink" style={SERIF}>
                    {c.title}
                  </a>
                  <span className="text-sm text-ink-soft">{c.entries.length} {c.entries.length === 1 ? 'page' : 'pages'}</span>
                </li>
              ))}
            </ol>
          </nav>

          {book.chapters.map((c, i) => (
            <section key={c.title} id={`chapter-${i}`} aria-labelledby={`chapter-title-${i}`} className="space-y-6">
              <div className="pt-2 text-center">
                <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-ink-soft">Chapter {toRoman(i + 1)}</p>
                <h2 id={`chapter-title-${i}`} className="mt-1 text-2xl font-bold text-ink" style={SERIF}>{c.title}</h2>
                <div className="mx-auto mt-3 h-px w-16 bg-coral-soft" aria-hidden="true" />
              </div>
              {c.entries.map((e) => <Page key={e.story_id} entry={e} />)}
            </section>
          ))}

          <footer className="pb-4 text-center">
            <p className="text-xl text-ink" style={SERIF}>To be continued…</p>
            <p className="mt-1 text-sm text-ink-soft">Every moment you save adds a page.</p>
          </footer>
        </>
      )}

      {book.sample && (
        <div className="space-y-2 print:hidden">
          <button type="button" className="btn-primary" onClick={() => navigate('unlock')}>Unlock your own Storybook</button>
          <button type="button" className="btn-ghost w-full" onClick={() => navigate('storybook')}>Back to my Storybook</button>
        </div>
      )}
    </article>
  )
}

function Page({ entry }: { entry: BookEntry }) {
  const c = CATEGORIES[entry.category]
  return (
    <article className="break-inside-avoid overflow-hidden rounded-[var(--radius-card)] bg-white shadow-sm">
      <div className="flex items-center justify-between px-5 py-3" style={{ background: c.accent }}>
        <span className="text-sm font-extrabold text-ink">{entry.category_name}</span>
        <span className="text-sm text-ink-soft">{entry.date}</span>
      </div>
      <div className="space-y-5 p-5">
        <p className="text-ink-soft italic" style={SERIF}>“{entry.question}”</p>

        <blockquote className="border-l-4 pl-4 text-lg leading-relaxed text-ink" style={{ ...SERIF, borderColor: c.accentStrong }}>
          {entry.text}
        </blockquote>

        {entry.words.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">In your own words</h3>
            {entry.words.map((w) => (
              <figure key={w.label} className="rounded-2xl p-4" style={{ background: c.accent }}>
                <blockquote className="leading-relaxed text-ink" style={SERIF}>“{w.text}”</blockquote>
                <figcaption className="mt-2 text-sm font-bold text-ink-soft">— {w.label}</figcaption>
              </figure>
            ))}
          </div>
        )}

        {entry.suggestion && (
          <div className="flex gap-3 rounded-2xl border-2 border-dashed border-line p-4">
            <span aria-hidden="true" className="text-xl">✨</span>
            <div>
              <p className="text-sm font-extrabold text-ink">A small idea for you two</p>
              <p className="mt-1 text-ink">{entry.suggestion}</p>
            </div>
          </div>
        )}

        {entry.reactions.length > 0 && (
          <p className="text-2xl" aria-label={`Reactions: ${entry.reactions.join(' ')}`}>{entry.reactions.join(' ')}</p>
        )}
      </div>
    </article>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white/70 px-2 py-3">
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block text-2xl font-extrabold">{n}</span>
        <span className="block text-xs leading-tight text-ink-soft">{label}</span>
      </dd>
    </div>
  )
}

function book_kind(s: { status: string; data?: BookView }): string {
  return s.status === 'ready' && s.data?.sample ? 'sample' : 'mine'
}

function toRoman(n: number): string {
  const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, s] of map) while (n >= v) { out += s; n -= v }
  return out
}
