import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ASSUMPTIONS } from '../data/assumptions'
import type { DeviceSlot, FeatureFlags } from '../domain/types'
import { useService } from '../hooks/useService'
import {
  advanceClock,
  getPrototypeState,
  type PrototypeState,
  listAnalytics,
  listNotifications,
  markNotificationsRead,
  resetAllPrototypeData,
  adminListPayments,
  adminListReports,
  adminVerifyPayment,
  adminReviewReport,
  idemKey,
  setSimulatedOffline,
  switchUser,
  updateFlags,
} from '../services/api'
import { formatDateTime } from '../utils/time'

// Developer tooling for usability testing. Deliberately styled unlike the
// parent-facing app (dark navy, yellow hazard accents, monospace labels).

type Tab = 'session' | 'flags' | 'inbox' | 'analytics' | 'admin' | 'assumptions'
const TAB_LABELS: Record<Tab, string> = {
  session: 'User & clock',
  flags: 'Flags',
  inbox: 'Inbox',
  analytics: 'Analytics',
  admin: 'Admin',
  assumptions: 'Assumptions',
}

export function PrototypeControls() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('session')
  const panelRef = useRef<HTMLDivElement>(null)
  const { state } = useService(getPrototypeState)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const slot = state.status === 'ready' ? state.data.active_slot : 'A'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open Prototype Controls. Active user: Partner ${slot}`}
        className="fixed right-3 top-3 z-40 flex h-12 items-center gap-1.5 rounded-full border-2 border-proto-accent bg-proto px-3 font-mono text-xs font-bold text-proto-accent shadow-lg"
      >
        <GearIcon />
        <span aria-hidden="true">{slot}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Prototype Controls"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col bg-proto font-mono text-sm text-slate-100 outline-none"
          >
            <div className="bg-[repeating-linear-gradient(45deg,#FACC15_0_10px,#1F2A44_10px_20px)] h-2" aria-hidden="true" />
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-proto-accent">Prototype Controls</p>
                <p className="text-[11px] text-slate-400">Developer tools · not part of the parent experience</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 min-w-11 rounded-md border border-slate-500 px-3 text-slate-100"
                aria-label="Close Prototype Controls"
              >
                ✕
              </button>
            </div>
            <div role="tablist" aria-label="Prototype sections" className="flex flex-wrap gap-1 px-3 pb-2">
              {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`min-h-11 rounded-md px-2.5 text-xs ${tab === t ? 'bg-proto-accent font-bold text-proto' : 'bg-slate-700 text-slate-100'}`}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
            <div tabIndex={0} className="flex-1 overflow-y-auto px-4 pb-8" role="tabpanel" aria-label={TAB_LABELS[tab]}>
              {state.status === 'loading' && <p>Loading…</p>}
              {state.status === 'error' && <p role="alert">Could not load prototype state: {state.error.message}</p>}
              {state.status === 'ready' && (
                <>
                  {!state.data.storage.persistent && (
                    <p className="mb-3 rounded bg-amber-200 p-2 text-amber-950" role="status">
                      Browser storage is unavailable. Data lives in memory and will be lost on refresh.
                    </p>
                  )}
                  {state.data.storage.recoveredFromInvalid && (
                    <p className="mb-3 rounded bg-amber-200 p-2 text-amber-950" role="status">
                      Stored data was unreadable, so the prototype started fresh.
                    </p>
                  )}
                  {tab === 'session' && <SessionPanel data={state.data} />}
                  {tab === 'flags' && <FlagsPanel flags={state.data.flags} />}
                  {tab === 'inbox' && <InboxPanel slots={state.data.slot_users} />}
                  {tab === 'analytics' && <AnalyticsPanel />}
                  {tab === 'admin' && <AdminPanel />}
                  {tab === 'assumptions' && <AssumptionsPanel />}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mb-5">
    <h3 className="mb-2 text-xs uppercase tracking-widest text-proto-accent">{title}</h3>
    {children}
  </section>
)

const protoBtn = 'min-h-11 rounded-md border border-slate-500 bg-slate-700 px-3 text-slate-100 hover:bg-slate-600 disabled:opacity-50'

function SessionPanel({ data }: { data: PrototypeState }) {
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    await fn()
    setBusy(false)
  }
  return (
    <>
      <Section title="Switch user">
        <div className="grid grid-cols-2 gap-2">
          {(['A', 'B'] as DeviceSlot[]).map((s) => {
            const u = data.slot_users[s]
            const active = data.active_slot === s
            return (
              <button
                key={s}
                type="button"
                disabled={busy}
                aria-pressed={active}
                onClick={() =>
                  run(async () => {
                    await switchUser(s)
                    // Picking up the other phone starts on its Home screen.
                    window.location.hash = '#/home'
                  })
                }
                className={`min-h-16 rounded-md border-2 p-2 text-left ${active ? 'border-proto-accent bg-slate-600' : 'border-slate-600 bg-slate-800'}`}
              >
                <span className="block font-bold">
                  Partner {s} {active && <span className="text-proto-accent">● active</span>}
                </span>
                <span className="block truncate text-xs text-slate-300">{u ? u.display_name || u.identifier : 'Not signed in'}</span>
              </button>
            )
          })}
        </div>
      </Section>
      <Section title="Simulated clock">
        <p className="mb-2" aria-live="polite">
          Now: <strong>{formatDateTime(data.now)}</strong>
        </p>
        <div className="grid grid-cols-4 gap-2">
          {[
            [1, '+1 hour'],
            [24, '+24 hours'],
            [120, '+5 days'],
            [168, '+7 days'],
          ].map(([h, label]) => (
            <button key={h} type="button" disabled={busy} className={protoBtn} onClick={() => run(() => advanceClock(h as number))}>
              {label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Network">
        <label className="flex min-h-11 items-center justify-between gap-2">
          <span>Simulate offline (answers queue and retry)</span>
          <input type="checkbox" className="h-6 w-6" checked={data.simulate_offline} onChange={(e) => run(() => setSimulatedOffline(e.target.checked))} />
        </label>
      </Section>
      <Section title="Reset">
        {!confirmReset ? (
          <button type="button" className={`${protoBtn} w-full`} onClick={() => setConfirmReset(true)}>
            Reset all prototype data
          </button>
        ) : (
          <div className="rounded-md border border-red-400 p-3">
            <p className="mb-2">This erases every user, story and setting on this device.</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-md bg-red-500 px-3 font-bold text-white"
                onClick={() =>
                  run(async () => {
                    await resetAllPrototypeData()
                    setConfirmReset(false)
                    window.location.hash = ''
                  })
                }
              >
                Yes, reset
              </button>
              <button type="button" className={`${protoBtn} flex-1`} onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>
    </>
  )
}

function FlagsPanel({ flags }: { flags: FeatureFlags }) {
  const [error, setError] = useState<string | null>(null)
  const set = async (patch: Partial<FeatureFlags>) => {
    const res = await updateFlags(patch)
    setError(res.ok ? null : res.error.message)
  }
  const bools: (keyof FeatureFlags)[] = ['cap_enabled', 'show_pacing_label', 'game_enabled']
  const nums: (keyof FeatureFlags)[] = [
    'daily_cap', 'suggestions_per_day', 'expiry_days', 'recent_days', 'invite_expiry_days', 'reminder_delay_hours',
  ]
  return (
    <Section title="Feature flags (persisted)">
      {error && <p role="alert" className="mb-2 text-red-300">{error}</p>}
      <ul className="space-y-2">
        {bools.map((k) => (
          <li key={k}>
            <label className="flex min-h-11 items-center justify-between gap-2">
              <span>{k}</span>
              <input type="checkbox" className="h-6 w-6" checked={flags[k] as boolean} onChange={(e) => set({ [k]: e.target.checked })} />
            </label>
          </li>
        ))}
        <li>
          <label className="flex min-h-11 items-center justify-between gap-2">
            <span>free_window_days</span>
            <select
              className="min-h-11 rounded bg-slate-700 px-2"
              value={flags.free_window_days}
              onChange={(e) => set({ free_window_days: Number(e.target.value) as 5 | 30 })}
            >
              <option value={5}>5</option>
              <option value={30}>30</option>
            </select>
          </label>
        </li>
        {nums.map((k) => (
          <li key={k}>
            <label className="flex min-h-11 items-center justify-between gap-2">
              <span>{k}</span>
              <input
                type="number"
                min={0}
                className="min-h-11 w-24 rounded bg-slate-700 px-2 text-right"
                defaultValue={flags[k] as number}
                onBlur={(e) => {
                  const v = Number(e.target.value)
                  if (v !== flags[k]) void set({ [k]: v })
                }}
              />
            </label>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function InboxPanel({ slots }: { slots: Record<DeviceSlot, { user_id: string; display_name: string } | null> }) {
  const [slot, setSlot] = useState<DeviceSlot>('A')
  const user = slots[slot]
  const { state } = useService(() => listNotifications(user?.user_id ?? '__none__'), [user?.user_id])
  return (
    <Section title="Notification inbox (simulated push)">
      <div className="mb-3 flex gap-2">
        {(['A', 'B'] as DeviceSlot[]).map((s) => (
          <button key={s} type="button" aria-pressed={slot === s} className={`${protoBtn} ${slot === s ? 'border-proto-accent' : ''}`} onClick={() => setSlot(s)}>
            Partner {s}
          </button>
        ))}
        {user && (
          <button type="button" className={protoBtn} onClick={() => markNotificationsRead(user.user_id)}>
            Mark read
          </button>
        )}
      </div>
      {!user && <p className="text-slate-400">Partner {slot} is not signed in.</p>}
      {user && state.status === 'ready' && state.data.length === 0 && <p className="text-slate-400">No notifications yet.</p>}
      {user && state.status === 'ready' && (
        <ul className="space-y-2">
          {state.data.map((n) => (
            <li key={n.id} className="rounded-md bg-slate-800 p-2">
              <p className="text-[11px] text-slate-400">
                {n.type} · {formatDateTime(n.deliver_at)} {n.read ? '' : '· unread'}
              </p>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function AnalyticsPanel() {
  const { state } = useService(listAnalytics)
  return (
    <Section title="Analytics event log (metadata only)">
      {state.status === 'ready' && state.data.length === 0 && <p className="text-slate-400">No events yet.</p>}
      {state.status === 'ready' && (
        <ul className="space-y-1">
          {state.data.slice(0, 200).map((e) => (
            <li key={e.id} className="rounded bg-slate-800 p-2 text-xs">
              <span className="text-proto-accent">{e.name}</span> <span className="text-slate-400">{formatDateTime(e.at)}</span>
              <pre className="whitespace-pre-wrap break-all text-slate-300">{JSON.stringify(e.props)}</pre>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function AdminPanel() {
  const { state } = useService(adminListReports)
  return (
    <>
      <Section title="Verify payment queue">
        <PaymentQueue />
      </Section>
      <Section title="Review reports (story, intent and question only)">
        {state.status === 'ready' && state.data.length === 0 && <p className="text-slate-400">No reports.</p>}
        {state.status === 'ready' && (
          <ul className="space-y-2">
            {state.data.map((r) => (
              <li key={r.report_id} className="space-y-2 rounded-md bg-slate-800 p-3">
                <p className="text-[11px] text-slate-400">
                  {r.reason} · intent {r.story_intent} · {formatDateTime(r.created_at)}
                </p>
                <p className="font-sans text-slate-300">Q: {r.question_text}</p>
                <p className="font-sans">{r.story_text}</p>
                {r.outcome ? (
                  <p className="text-proto-accent">Reviewed: {r.outcome === 'quarantined' ? 'quarantined for both partners' : 'no action'}</p>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" className={protoBtn} onClick={() => adminReviewReport({ report_id: r.report_id, outcome: 'quarantined', idempotencyKey: idemKey('review') })}>
                      Quarantine
                    </button>
                    <button type="button" className={protoBtn} onClick={() => adminReviewReport({ report_id: r.report_id, outcome: 'no_action', idempotencyKey: idemKey('review') })}>
                      No action
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}

function PaymentQueue() {
  const { state } = useService(adminListPayments)
  if (state.status !== 'ready') return null
  if (state.data.length === 0) return <p className="text-slate-400">No payments submitted.</p>
  return (
    <ul className="space-y-2">
      {state.data.map((p) => (
        <li key={p.entitlement_id} className="space-y-2 rounded-md bg-slate-800 p-3">
          <p className="text-[11px] text-slate-400">{formatDateTime(p.purchased_at)} · INR 299</p>
          <p className="font-sans">
            {p.purchaser} · ref <span className="font-mono">{p.payment_reference}</span>
          </p>
          {p.status === 'pending' ? (
            <div className="flex gap-2">
              <button type="button" className={protoBtn} onClick={() => adminVerifyPayment({ entitlement_id: p.entitlement_id, decision: 'approve', idempotencyKey: idemKey('verify') })}>
                Approve
              </button>
              <button type="button" className={protoBtn} onClick={() => adminVerifyPayment({ entitlement_id: p.entitlement_id, decision: 'reject', idempotencyKey: idemKey('verify') })}>
                Reject
              </button>
            </div>
          ) : (
            <p className="text-proto-accent">{p.status === 'active' ? 'Approved: Storybook unlocked' : p.status === 'rejected' ? 'Rejected: stays locked' : p.status}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

function AssumptionsPanel() {
  return (
    <Section title="Assumptions & prototype limitations">
      <ul className="space-y-2">
        {ASSUMPTIONS.map((a) => (
          <li key={a.topic} className={`rounded-md p-3 ${a.important ? 'border border-proto-accent bg-slate-800' : 'bg-slate-800'}`}>
            <p className="font-bold">
              {a.topic} <span className="text-[11px] font-normal text-slate-400">stage {a.stage}</span>
            </p>
            <p className="mt-1 font-sans text-slate-200">{a.text}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
