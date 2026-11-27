import type { AgeBand, CategoryId, Depth, FeatureFlags, NotificationPrefs, Preferences } from './types'

export interface CategoryMeta {
  id: CategoryId
  name: string
  description: string
  /** Pastel accent, used as background behind dark text. */
  accent: string
  /** Slightly deeper tone for borders and illustration strokes. */
  accentStrong: string
}

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  remember_us: {
    id: 'remember_us',
    name: 'Remember Us',
    description: 'Little memories from before, and the bits you still smile about.',
    accent: '#FDE2D8',
    accentStrong: '#E9A48C',
  },
  our_journey: {
    id: 'our_journey',
    name: 'Our Journey',
    description: 'The road to becoming a family, one moment at a time.',
    accent: '#E1ECFB',
    accentStrong: '#8FB0DE',
  },
  little_appreciations: {
    id: 'little_appreciations',
    name: 'Little Appreciations',
    description: 'Noticing the small, kind things you do for each other.',
    accent: '#FCEFC7',
    accentStrong: '#DDBF63',
  },
  what_we_need: {
    id: 'what_we_need',
    name: 'What We Need',
    description: 'A gentle space to say what would help right now.',
    accent: '#DDF1E4',
    accentStrong: '#86C29C',
  },
  lets_play: {
    id: 'lets_play',
    name: "Let's Play",
    description: 'Light, silly and playful. Guesses welcome.',
    accent: '#EDE3F8',
    accentStrong: '#B39BD9',
  },
}

export const CATEGORY_ORDER: CategoryId[] = [
  'remember_us',
  'our_journey',
  'little_appreciations',
  'what_we_need',
  'lets_play',
]

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  '1_6': '1–6 months',
  '7_12': '7–12 months',
  '13_18': '13–18 months',
  other: 'Other / prefer not to say',
}

export const DEPTH_LABELS: Record<Depth, string> = {
  light: 'Mostly light and playful',
  mix: 'A mix',
  deeper: 'Comfortable with deeper conversations too',
}

/** Presets offered on the Family profile screen. Never hard-code these elsewhere. */
export const PARENT_LABEL_PRESETS = ['Mumma', 'Papa', 'Mama', 'Ammi', 'Dad', 'Baba'] as const
export const PARENT_LABEL_MAX = 20

export const ANSWER_MAX = 500

export const DEFAULT_FLAGS: FeatureFlags = {
  cap_enabled: false,
  daily_cap: 3,
  show_pacing_label: false,
  free_window_days: 30,
  game_enabled: true,
  suggestions_per_day: 1,
  expiry_days: 7,
  recent_days: 5,
  invite_expiry_days: 7,
  reminder_delay_hours: 24,
}

export const DEFAULT_PREFERENCES: Preferences = {
  categories: [],
  depth: null,
  muted_categories: [],
  paused: false,
  snoozed_until: null,
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  window: { start: '09:00', end: '21:00' },
  quiet_hours: { start: '22:00', end: '07:00' },
  toggles: { app_suggestions: true, partner_invitations: true, pending_reminders: true },
}

export const STORYBOOK_PRICE_INR = 299

// Timing rules (spec Sections 6, 7, 9, 11)
export const OTP_CODE = '123456'
export const OTP_TTL_MIN = 10
export const OTP_MAX_FAILS = 5
export const OTP_LOCK_MIN = 15
export const OTP_RESEND_SEC = 30
export const SKIP_LIMIT_PER_CATEGORY_PER_DAY = 5
export const SKIP_COOLDOWN_DAYS = 30
export const RAW_ANSWER_RETENTION_HOURS = 24
export const DISTRESS_FLAG_RETENTION_DAYS = 30
export const ACCOUNT_RECOVERY_DAYS = 7
export const REGENERATE_WINDOW_HOURS = 24
export const TIMEZONE_CHANGE_COOLDOWN_HOURS = 24
