// Domain types for A Little More Us (spec Section 14).
// Field names are snake_case to match the specification and stay consistent
// across the service layer, storage and UI.

export type ISODate = string // ISO-8601 timestamp produced from the simulated clock
export type UserId = string
export type CoupleId = string

// ---------- Enumerations ----------

export const CATEGORY_IDS = [
  'remember_us',
  'our_journey',
  'little_appreciations',
  'what_we_need',
  'lets_play',
] as const
export type CategoryId = (typeof CATEGORY_IDS)[number]

export const AGE_BANDS = ['1_6', '7_12', '13_18', 'other'] as const
export type AgeBand = (typeof AGE_BANDS)[number]

export const DEPTHS = ['light', 'mix', 'deeper'] as const
export type Depth = (typeof DEPTHS)[number]

export type EmotionalIntensity = 'low' | 'medium' | 'high'

export type StoryIntent =
  | 'memory'
  | 'present'
  | 'appreciation'
  | 'preference'
  | 'future_plan'
  | 'support'
  | 'playful_hypothetical'

export type QuestionType = 'paired' | 'game'

export type InteractionStatus =
  | 'awaiting_partner'
  | 'declined'
  | 'expired'
  | 'withdrawn'
  | 'safety_held'
  | 'generating'
  | 'completed'
  | 'closed_disconnected'

export type InvitationStatus = 'sent' | 'accepted' | 'declined' | 'expired' | 'cancelled'

export type QuestionHistoryStatus =
  | 'available'
  | 'delivered'
  | 'answered'
  | 'skipped'
  | 'dismissed'
  | 'expired'
  | 'retired'

export type EntitlementStatus = 'pending' | 'active' | 'rejected' | 'revoked'

export type NotificationType =
  | 'app_suggestion'
  | 'partner_invitation'
  | 'pending_reminder'
  | 'story_ready'
  | 'pairing_status'
  | 'household_notice'

export type ReactionValue = '❤️' | '😂' | '🥹' | '🌟'
export type ReportReason = 'inaccurate' | 'uncomfortable' | 'other'

// ---------- Entities ----------

export interface TimeWindow {
  /** "HH:MM" 24h local time */
  start: string
  end: string
}

export interface Preferences {
  categories: CategoryId[]
  depth: Depth | null
  muted_categories: CategoryId[]
  paused: boolean
  snoozed_until: ISODate | null
}

export interface NotificationPrefs {
  window: TimeWindow
  quiet_hours: TimeWindow
  toggles: {
    app_suggestions: boolean
    partner_invitations: boolean
    pending_reminders: boolean
  }
}

export interface User {
  user_id: UserId
  identifier: string // phone or email; never sent to Gemini or analytics
  display_name: string
  parent_label: string
  /** Pre-pairing only; after pairing the household age band lives on Couple. */
  age_band: AgeBand | null
  preferences: Preferences
  notification_prefs: NotificationPrefs
  is_18_confirmed: boolean
  deletion_requested_at: ISODate | null
  created_at: ISODate
  /** Which onboarding steps are complete (prototype bookkeeping). */
  onboarding_complete: boolean
}

export interface Couple {
  couple_id: CoupleId
  member_user_ids: [UserId, UserId]
  timezone: string
  timezone_changed_at: ISODate | null
  age_band: AgeBand | null
  state: 'paired' | 'disconnected'
  created_at: ISODate
  disconnected_at: ISODate | null
  daily_counter: { date: string; count: number }
}

export interface Invitation {
  token: string
  inviter_id: UserId
  status: InvitationStatus
  created_at: ISODate
  expires_at: ISODate
  responded_by: UserId | null
}

export interface GameOption {
  option_id: string
  label: string
}

export interface Question {
  question_id: string
  version_id: string
  topic_id: string
  category: CategoryId
  text: string
  context: string
  story_intent: StoryIntent | null // null for games (no story)
  story_pattern: string | null
  role_eligibility: 'all'
  stage_tags: AgeBand[] | ['general']
  emotional_intensity: EmotionalIntensity
  type: QuestionType
  options?: GameOption[]
  active: boolean
  editorial_order: number
}

export interface Interaction {
  interaction_id: string
  couple_id: CoupleId
  question_id: string
  question_version_id: string
  question_text_snapshot: string
  context_snapshot: string
  category: CategoryId
  story_intent: StoryIntent | null
  initiator_id: UserId
  type: QuestionType
  status: InteractionStatus
  created_at: ISODate
  /** Couple-local day (YYYY-MM-DD) the interaction was created; used for the daily cap. */
  created_local_day: string
  expires_at: ISODate
  reminder_sent_at: ISODate | null
  safety_held_at: ISODate | null
  /** Boolean only, never the text. Purged after 30 simulated days. */
  distress_flag: boolean | null
  first_responder_id: UserId
}

export type ConsentState = 'given' | 'withdrawn'

export interface Response {
  response_id: string
  interaction_id: string
  user_id: UserId
  /** Raw answer text or a game option id. Hard-deleted per retention rules. */
  text_or_choice: string | null
  consent_state: ConsentState
  consent_at: ISODate | null
  status: 'submitted' | 'deleted'
  delete_after: ISODate | null
  distress_flag: boolean
  submitted_at: ISODate
}

export interface Story {
  story_id: string
  interaction_id: string
  couple_id: CoupleId
  text: string
  category: CategoryId
  story_intent: StoryIntent
  question_text_snapshot: string
  created_at: ISODate
  saved: boolean
  is_fallback: boolean
  regenerated_from_id: string | null
  regenerate_used: boolean
  quarantined: boolean
  hidden_for_user_ids: UserId[]
  model_name: string
  prompt_version: string
}

export interface Reaction {
  story_id: string
  user_id: UserId
  value: ReactionValue
  created_at: ISODate
}

export interface Report {
  report_id: string
  story_id: string
  user_id: UserId
  reason: ReportReason
  story_text_snapshot: string
  story_intent: StoryIntent
  question_text_snapshot: string
  prompt_version: string
  model_name: string
  reviewed_by: string | null
  reviewed_at: ISODate | null
  outcome: 'quarantined' | 'no_action' | null
  created_at: ISODate
}

export interface QuestionHistory {
  user_id: UserId
  couple_id: CoupleId | null
  question_id: string
  topic_id: string
  status: QuestionHistoryStatus
  delivered_at: ISODate | null
  answered_at: ISODate | null
  updated_at: ISODate
}

export interface Entitlement {
  entitlement_id: string
  purchaser_id: UserId
  product_id: 'storybook_unlock'
  status: EntitlementStatus
  payment_reference: string
  purchased_at: ISODate
}

export interface AppNotification {
  id: string
  user_id: UserId
  type: NotificationType
  /** Generic copy only. Never question or answer text. */
  body: string
  category: CategoryId | null
  created_at: ISODate
  deliver_at: ISODate
  read: boolean
  /** Dedup key so a notification is created at most once per (type, target). */
  dedupe_key: string
}

export interface AuditLog {
  actor: string
  action: string
  target: string
  timestamp: ISODate
}

/** Metadata-only analytics event: IDs, categories and booleans. Never answer text. */
export interface AnalyticsEvent {
  id: string
  name: string
  at: ISODate
  props: Record<string, string | number | boolean | null>
}

// ---------- Prototype-only ----------

export interface FeatureFlags {
  cap_enabled: boolean
  daily_cap: number
  show_pacing_label: boolean
  free_window_days: 5 | 30
  game_enabled: boolean
  suggestions_per_day: number
  expiry_days: number
  recent_days: number
  invite_expiry_days: number
  reminder_delay_hours: number
}

export type DeviceSlot = 'A' | 'B'

/** One simulated device per partner; each has its own session. */
export interface SlotSession {
  user_id: UserId | null
  /** Pending OTP challenge for this slot. */
  otp: {
    identifier: string
    mode: 'signup' | 'login'
    issued_at: ISODate
    expires_at: ISODate
    failed_attempts: number
    locked_until: ISODate | null
  } | null
  /** Local-only drafts, keyed by question/interaction. Never visible to the partner. */
  drafts: Record<string, string>
}

// ---------- Service results ----------

export interface ApiError {
  code: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500
  message: string
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError }
