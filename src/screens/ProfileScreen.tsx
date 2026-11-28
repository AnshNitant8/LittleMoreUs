import { useState, type ReactNode } from 'react'
import { ReferFriend } from '../components/ReferFriend'
import { useRouter } from '../app/router'
import { FieldError, SelectAll } from '../components/Onboarding'
import { ErrorState, LoadingState, Screen } from '../components/ui'
import { AGE_BAND_LABELS, CATEGORIES, DEPTH_LABELS, PARENT_LABEL_PRESETS } from '../domain/constants'
import { AGE_BANDS, CATEGORY_IDS, DEPTHS, type AgeBand, type CategoryId, type Depth, type Result, type User } from '../domain/types'
import { useAction } from '../hooks/useAction'
import { useService } from '../hooks/useService'
import {
  disconnectCouple,
  getCouple,
  getEntitlement,
  getMe,
  logout,
  requestExport,
  updateCouple,
  updateMe,
  updatePreferences,
  type CoupleView,
} from '../services/api'
import { downloadText } from '../utils/download'
import { formatDate, formatDateTime } from '../utils/time'
import { useNotificationPrefsForm } from './onboarding/NotificationPrefsScreen'

type SectionId = 'you' | 'stage' | 'moments' | 'notifications' | 'suggestions' | 'couple' | 'disconnect'

/** Screen 16: edit profile, preferences and couple settings; export; privacy; pause, disconnect, delete. */
export function ProfileScreen() {
  const { navigate } = useRouter()
  const me = useService(getMe)
  const couple = useService(getCouple)
  const [open, setOpen] = useState<SectionId | null>(null)
  const out = useAction('logout', (key) => logout({ idempotencyKey: key }))
  const toggle = (id: SectionId) => setOpen((cur) => (cur === id ? null : id))
  const close = () => setOpen(null)

  if (me.state.status === 'loading') return <Screen title="Profile"><LoadingState /></Screen>
  if (me.state.status === 'error') return <Screen title="Profile"><ErrorState message={me.state.error.message} onRetry={me.reload} /></Screen>
  const u = me.state.data
  const c = couple.state.status === 'ready' ? couple.state.data : null
  const band = c ? c.age_band : u.age_band
  const p = u.preferences
  // Expired snoozes are cleared by a scheduled job on the simulated clock.
  const snoozed = p.snoozed_until

  return (
    <Screen title="Profile">
      <Row id="you" open={open} onToggle={toggle} title="About you" summary={`${u.display_name} · your little one calls you ${u.parent_label}`}>
        <AboutYouForm user={u} onDone={close} />
      </Row>
      <Row id="stage" open={open} onToggle={toggle} title={c ? 'Household stage' : 'Your stage'} summary={band ? AGE_BAND_LABELS[band] : 'Not set'}>
        <StageForm current={band} paired={!!c} onDone={close} />
      </Row>
      <Row
        id="moments"
        open={open}
        onToggle={toggle}
        title="Moments"
        summary={`${p.categories.map((x) => CATEGORIES[x].name).join(', ')} · ${p.depth ? DEPTH_LABELS[p.depth] : 'Depth not set'}${p.muted_categories.length ? ` · ${p.muted_categories.length} muted` : ''}`}
      >
        <MomentsForm user={u} onDone={close} />
      </Row>
      <Row id="notifications" open={open} onToggle={toggle} title="Notifications" summary={`${u.notification_prefs.window.start}–${u.notification_prefs.window.end}, quiet ${u.notification_prefs.quiet_hours.start}–${u.notification_prefs.quiet_hours.end}`}>
        <NotificationsForm user={u} onDone={close} />
      </Row>
      <Row
        id="suggestions"
        open={open}
        onToggle={toggle}
        title="Pause or snooze suggestions"
        summary={p.paused ? 'Paused' : snoozed ? `Snoozed until ${formatDate(snoozed)}` : 'On'}
      >
        <SuggestionsForm paused={p.paused} snoozedUntil={snoozed} />
      </Row>

      <section aria-labelledby="partner-title" className="card space-y-2">
        <h2 id="partner-title" className="font-extrabold">Your partner</h2>
        {c ? (
          <>
            <p>Connected with <strong>{c.partner.display_name}</strong> since {formatDate(c.created_at)}</p>
            <p className="text-ink-soft">
              {c.partner.parent_label ? <>Your little one calls them <strong className="text-ink">{c.partner.parent_label}</strong></> : "They haven't chosen their label yet."}
            </p>
          </>
        ) : (
          <>
            <p className="text-ink-soft">You aren't connected with a partner right now.</p>
            <button type="button" className="btn-secondary" onClick={() => navigate('invite-partner')}>Invite your partner</button>
          </>
        )}
      </section>
      {c && (
        <Row id="couple" open={open} onToggle={toggle} title="Shared timezone" summary={c.timezone}>
          <TimezoneForm couple={c} onDone={close} />
        </Row>
      )}

      <ExportSection />
      <PrivacySection />
      <ReferFriend from="profile" />

      {c && (
        <Row id="disconnect" open={open} onToggle={toggle} title="Disconnect from your partner" summary="Ends your pairing. Saved stories stay.">
          <DisconnectForm onDone={close} />
        </Row>
      )}

      <div className="space-y-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={out.busy}
          onClick={async () => {
            const r = await out.run()
            if (r?.ok) navigate('welcome')
          }}
        >
          Log out
        </button>
        <FieldError id="logout-error" message={out.error?.message} />
        <button type="button" className="btn-ghost w-full" onClick={() => navigate('delete-account')}>Delete my account</button>
      </div>
    </Screen>
  )
}

function Row({ id, open, onToggle, title, summary, children }: { id: SectionId; open: SectionId | null; onToggle: (id: SectionId) => void; title: string; summary: string; children: ReactNode }) {
  const expanded = open === id
  return (
    <section className="card space-y-3" aria-labelledby={`${id}-title`}>
      <button type="button" className="flex min-h-11 w-full items-center gap-3 text-left" aria-expanded={expanded} aria-controls={`${id}-panel`} onClick={() => onToggle(id)}>
        <span className="flex-1">
          <span id={`${id}-title`} className="block font-extrabold">{title}</span>
          <span className="block text-sm text-ink-soft">{summary}</span>
        </span>
        <span className="text-sm font-bold text-coral">{expanded ? 'Close' : 'Edit'}</span>
      </button>
      {expanded && <div id={`${id}-panel`} className="space-y-3 border-t border-line pt-3">{children}</div>}
    </section>
  )
}

const inputCls = 'min-h-12 w-full rounded-2xl border-2 border-line bg-white px-4 text-lg focus:border-coral focus:outline-none'

function SaveBar({ busy, onSave, error, id }: { busy: boolean; onSave: () => void; error?: string; id: string }) {
  return (
    <>
      <FieldError id={id} message={error} />
      <button type="button" className="btn-primary" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : 'Save'}</button>
    </>
  )
}

function AboutYouForm({ user, onDone }: { user: User; onDone: () => void }) {
  const [name, setName] = useState(user.display_name)
  const [label, setLabel] = useState(user.parent_label)
  const save = useAction('profile-you', (key) => updateMe({ display_name: name, parent_label: label, idempotencyKey: key }))
  return (
    <>
      <label htmlFor="p-name" className="block font-bold">Your first name</label>
      <input id="p-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
      <label htmlFor="p-label" className="block font-bold">What your little one calls you</label>
      <input id="p-label" className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} aria-describedby="p-label-help" />
      <p id="p-label-help" className="text-sm text-ink-soft">Only you can set your own label. Any script is fine.</p>
      <div className="flex flex-wrap gap-2" aria-label="Suggestions">
        {PARENT_LABEL_PRESETS.map((l) => (
          <button key={l} type="button" className={`min-h-11 rounded-full border-2 px-4 ${label === l ? 'border-coral bg-coral-tint' : 'border-line bg-white'}`} aria-pressed={label === l} onClick={() => setLabel(l)}>
            {l}
          </button>
        ))}
      </div>
      <SaveBar id="you-error" busy={save.busy} error={save.error?.message} onSave={async () => (await save.run())?.ok && onDone()} />
    </>
  )
}

function StageForm({ current, paired, onDone }: { current: AgeBand | null; paired: boolean; onDone: () => void }) {
  const [band, setBand] = useState<AgeBand | null>(current)
  const save = useAction('profile-stage', async (key): Promise<Result<unknown>> =>
    paired ? updateCouple({ age_band: band!, idempotencyKey: key }) : updateMe({ age_band: band!, idempotencyKey: key }),
  )
  return (
    <>
      <fieldset className="space-y-1">
        <legend className="sr-only">Parenthood stage</legend>
        {AGE_BANDS.map((b) => (
          <label key={b} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="radio" name="p-band" className="h-5 w-5 accent-coral" checked={band === b} onChange={() => setBand(b)} />
            {AGE_BAND_LABELS[b]}
          </label>
        ))}
      </fieldset>
      {paired && <p className="text-sm text-ink-soft">This is shared with your partner, who will see a short notice. It only shapes future moments.</p>}
      <SaveBar id="stage-error" busy={save.busy || !band} error={save.error?.message} onSave={async () => (await save.run())?.ok && onDone()} />
    </>
  )
}

function MomentsForm({ user, onDone }: { user: User; onDone: () => void }) {
  const [cats, setCats] = useState<CategoryId[]>(user.preferences.categories)
  const [depth, setDepth] = useState<Depth | null>(user.preferences.depth)
  const [muted, setMuted] = useState<CategoryId[]>(user.preferences.muted_categories)
  const flip = (list: CategoryId[], id: CategoryId) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const save = useAction('profile-moments', (key) =>
    updatePreferences({ categories: cats, depth: depth ?? undefined, muted_categories: muted, idempotencyKey: key }),
  )
  return (
    <>
      <fieldset className="space-y-1">
        <legend className="font-bold">Kinds of moments you'd like</legend>
        <SelectAll total={CATEGORY_IDS.length} selected={cats.length} onChange={(all) => setCats(all ? [...CATEGORY_IDS] : [])} />
        {CATEGORY_IDS.map((id) => (
          <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-coral" checked={cats.includes(id)} onChange={() => setCats(flip(cats, id))} />
            {CATEGORIES[id].name}
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="font-bold">How deep</legend>
        {DEPTHS.map((d) => (
          <label key={d} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="radio" name="p-depth" className="h-5 w-5 accent-coral" checked={depth === d} onChange={() => setDepth(d)} />
            {DEPTH_LABELS[d]}
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="font-bold">Mute a kind of moment</legend>
        <p className="text-sm text-ink-soft">Muted kinds won't be suggested to either of you. Nothing already open is affected.</p>
        {CATEGORY_IDS.map((id) => (
          <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-coral" checked={muted.includes(id)} onChange={() => setMuted(flip(muted, id))} />
            Mute {CATEGORIES[id].name}
          </label>
        ))}
      </fieldset>
      <SaveBar id="moments-error" busy={save.busy} error={save.error?.message} onSave={async () => (await save.run())?.ok && onDone()} />
    </>
  )
}

function NotificationsForm({ user, onDone }: { user: User; onDone: () => void }) {
  const form = useNotificationPrefsForm({ initial: user.notification_prefs, onSaved: onDone, submitLabel: 'Save' })
  return (
    <>
      {form.fields}
      {form.submit}
    </>
  )
}

function SuggestionsForm({ paused, snoozedUntil }: { paused: boolean; snoozedUntil: string | null }) {
  const pause = useAction('pause', (key, v: boolean) => updatePreferences({ paused: v, idempotencyKey: key }))
  const snooze = useAction('snooze', (key, d: 0 | 3 | 7) => updatePreferences({ snooze_days: d, idempotencyKey: key }))
  return (
    <>
      <p className="text-sm text-ink-soft">
        Take a break from app suggestions whenever you like. Anything your partner starts still appears on Home, and you can always start a moment yourself.
      </p>
      <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3">
        <span className="font-bold">Pause suggestions</span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={paused}
          checked={paused}
          disabled={pause.busy}
          onChange={(e) => pause.run(e.target.checked)}
          className="h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition before:block before:h-6 before:w-6 before:translate-x-0.5 before:rounded-full before:bg-white before:shadow before:transition checked:bg-coral checked:before:translate-x-5"
        />
      </label>
      <div className="space-y-2">
        <p className="font-bold">Snooze</p>
        {snoozedUntil && <p role="status" className="text-sm">Snoozed until {formatDateTime(snoozedUntil)}.</p>}
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className="btn-secondary px-2" disabled={snooze.busy} onClick={() => snooze.run(3)}>3 days</button>
          <button type="button" className="btn-secondary px-2" disabled={snooze.busy} onClick={() => snooze.run(7)}>7 days</button>
          <button type="button" className="btn-secondary px-2" disabled={snooze.busy || !snoozedUntil} onClick={() => snooze.run(0)}>End</button>
        </div>
      </div>
      <FieldError id="suggest-error" message={(pause.error ?? snooze.error)?.message} />
    </>
  )
}

function timezones(current: string): string[] {
  let all: string[] = []
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    all = []
  }
  if (!all.length) all = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Singapore', 'Asia/Dubai', 'Australia/Sydney']
  return all.includes(current) ? all : [current, ...all]
}

function TimezoneForm({ couple, onDone }: { couple: CoupleView; onDone: () => void }) {
  const [tz, setTz] = useState(couple.timezone)
  const save = useAction('profile-tz', (key) => updateCouple({ timezone: tz, idempotencyKey: key }))
  return (
    <>
      <label htmlFor="p-tz" className="block font-bold">Timezone you share</label>
      <select id="p-tz" className={inputCls} value={tz} onChange={(e) => setTz(e.target.value)}>
        {timezones(couple.timezone).map((z) => <option key={z} value={z}>{z}</option>)}
      </select>
      <p className="text-sm text-ink-soft">Used for your daily rhythm and quiet hours. Either of you can change it once a day.</p>
      <SaveBar id="tz-error" busy={save.busy} error={save.error?.message} onSave={async () => (await save.run())?.ok && onDone()} />
    </>
  )
}

function ExportSection() {
  const { navigate } = useRouter()
  const ent = useService(getEntitlement)
  const exp = useAction('export', (key) => requestExport({ idempotencyKey: key }))
  const [done, setDone] = useState(false)
  const unlocked = ent.state.status === 'ready' && ent.state.data.unlocked
  if (ent.state.status !== 'ready') return null
  if (!unlocked) {
    return (
      <section aria-labelledby="export-title" className="card space-y-2">
        <h2 id="export-title" className="font-extrabold">Your data</h2>
        <p className="text-sm text-ink-soft">Export comes with the full Storybook. Once it's unlocked, you can download your profile and shared stories as a file, once a day.</p>
        <button type="button" className="btn-secondary" onClick={() => navigate('unlock')}>Unlock to export</button>
      </section>
    )
  }
  return (
    <section aria-labelledby="export-title" className="card space-y-2">
      <h2 id="export-title" className="font-extrabold">Your data</h2>
      <p className="text-sm text-ink-soft">Download your profile and your shared stories as a file, once a day. Answers are never included.</p>
      <button
        type="button"
        className="btn-secondary"
        disabled={exp.busy}
        onClick={async () => {
          const r = await exp.run()
          if (r?.ok) {
            downloadText(r.data.filename, r.data.json)
            setDone(true)
          }
        }}
      >
        {exp.busy ? 'Preparing…' : 'Export my data'}
      </button>
      {done && <p role="status" className="text-sm">Your export has downloaded.</p>}
      <FieldError id="p-export-error" message={exp.error?.message} />
    </section>
  )
}

function PrivacySection() {
  return (
    <details className="card">
      <summary className="min-h-11 cursor-pointer py-2 font-extrabold">Privacy and your data</summary>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-soft">
        <li>Your answers are private. Your partner never sees them, only the shared story made from both.</li>
        <li>Answers are deleted 24 hours after a story is made, or straight away if a moment closes without one.</li>
        <li>Stories you don't save leave Recent after 5 days. Saved stories stay until either of you deletes one.</li>
        <li>To write a story, only the question, your two answers and your parent labels are sent to Google's Gemini. No names, contact details or account IDs.</li>
        <li>Notifications never include questions or answers.</li>
        <li>This is a prototype. Data lives in this browser only and is not a secure multi-user store.</li>
      </ul>
    </details>
  )
}

function DisconnectForm({ onDone }: { onDone: () => void }) {
  const go = useAction('disconnect', (key) => disconnectCouple({ confirm: true, idempotencyKey: key }))
  return (
    <>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>You'll no longer share new moments.</li>
        <li>Any moment still open closes, and its answers are deleted.</li>
        <li>Saved stories stay in both your Storybooks until either of you deletes one.</li>
        <li>If one of you unlocked the full Storybook, that unlock stays with the person who paid.</li>
      </ul>
      <FieldError id="disconnect-error" message={go.error?.message} />
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-primary" disabled={go.busy} onClick={() => go.run()}>Disconnect</button>
        <button type="button" className="btn-secondary" onClick={onDone}>Keep connected</button>
      </div>
    </>
  )
}
