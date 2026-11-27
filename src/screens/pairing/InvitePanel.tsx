import { useState } from 'react'
import { useRouter } from '../../app/router'
import { FieldError } from '../../components/Onboarding'
import { LoadingState } from '../../components/ui'
import type { InvitationStatus } from '../../domain/types'
import { useAction } from '../../hooks/useAction'
import { useService } from '../../hooks/useService'
import { cancelInvitation, createInvitation, getMyInvitation, getPrototypeState, switchUser } from '../../services/api'
import { browserTimezone, formatDateTime } from '../../utils/time'
import { SERVER_MODE } from '../../services/serverMode'

export function inviteLink(token: string): string {
  return `${window.location.origin}${window.location.pathname}#/invite/${token}`
}

const STATUS_COPY: Record<InvitationStatus, { label: string; note: string }> = {
  sent: { label: 'Sent', note: 'Waiting for your partner to open it.' },
  accepted: { label: 'Accepted', note: "You're connected." },
  expired: { label: 'Expired', note: 'That link has expired. You can make a new one whenever you like.' },
  declined: { label: 'Declined', note: 'That invitation was declined. You can make a new one whenever you like.' },
  cancelled: { label: 'Cancelled', note: 'That link no longer works. You can make a new one whenever you like.' },
}

/** Screen 06 body: create, share, cancel and regenerate a one-time invite link. */
export function InvitePanel() {
  const { navigate } = useRouter()
  const { state } = useService(getMyInvitation)
  const create = useAction('create-invite', (key) => createInvitation({ idempotencyKey: key, timezone: browserTimezone() }))
  const cancel = useAction('cancel-invite', (key) => cancelInvitation({ idempotencyKey: key }))
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)

  if (state.status === 'loading') return <LoadingState />
  if (state.status === 'error') return <FieldError id="invite-load" message={state.error.message} />
  const inv = state.data
  const live = inv?.status === 'sent' ? inv : null
  const link = live ? inviteLink(live.token) : ''
  const shareText = `I'd love for us to try A Little More Us together. We each answer one small question privately. Join me here: ${link}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
  }

  const openAsPartner = async () => {
    const s = await getPrototypeState()
    const other = s.ok && s.data.active_slot === 'A' ? 'B' : 'A'
    await switchUser(other)
    navigate('invite', live!.token)
  }

  return (
    <div className="space-y-4">
      {inv && (
        <p className="card" role="status">
          <span className="block text-sm font-bold uppercase tracking-wide text-ink-soft">Invitation status</span>
          <span className="block text-lg font-extrabold">{STATUS_COPY[inv.status].label}</span>
          <span className="block text-ink-soft">{STATUS_COPY[inv.status].note}</span>
          {live && <span className="mt-1 block text-sm text-ink-soft">Link works until {formatDateTime(live.expires_at)}</span>}
        </p>
      )}

      {live ? (
        <>
          <div>
            <label htmlFor="invite-link" className="mb-1 block font-bold">Your one-time link</label>
            <input
              id="invite-link"
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              className="min-h-12 w-full rounded-2xl border-2 border-line bg-white px-4 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn-secondary" onClick={copy}>Copy link</button>
            <a
              className="btn-secondary"
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Share via WhatsApp
            </a>
          </div>
          {copied === 'ok' && <p role="status" className="text-sm text-ink-soft">Link copied.</p>}
          {copied === 'failed' && <p role="status" className="text-sm text-ink-soft">Couldn't copy automatically. Select the link above and copy it.</p>}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn-ghost" disabled={create.busy} onClick={() => create.run()}>
              Regenerate link
            </button>
            <button type="button" className="btn-ghost" disabled={cancel.busy} onClick={() => cancel.run()}>
              Cancel invitation
            </button>
          </div>
          <p className="text-sm text-ink-soft">Regenerating makes a new link and the old one stops working.</p>
          {!SERVER_MODE && (
          <button
            type="button"
            onClick={openAsPartner}
            className="min-h-11 w-full rounded-md border-2 border-dashed border-proto bg-white px-3 font-mono text-sm font-bold text-proto"
          >
            Prototype: Open as partner
          </button>
          )}
        </>
      ) : (
        <button type="button" className="btn-primary" disabled={create.busy} onClick={() => create.run()}>
          {create.busy ? 'Making your link…' : inv ? 'Make a new invite link' : 'Make an invite link'}
        </button>
      )}
      <FieldError id="invite-error" message={(create.error ?? cancel.error)?.message} />
    </div>
  )
}
