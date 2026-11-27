import type { CategoryId } from '../domain/types'

// Simple inline SVG illustrations. No remote images.
// Families shown: two mums, two dads, a single parent, and a mum and dad,
// with varied skin tones. Never only a mother-and-father structure.

const SKIN = ['#F5D0B5', '#D9A47E', '#A86B47', '#6E4630', '#E8B894']
const HAIR = ['#3B2A20', '#1E1B1A', '#7A4B2A', '#C99A5B']

interface PersonProps {
  x: number
  skin: string
  hair: string
  top: string
  long?: boolean
  scale?: number
}

function Person({ x, skin, hair, top, long, scale = 1 }: PersonProps) {
  return (
    <g transform={`translate(${x} ${100 - 100 * scale}) scale(${scale})`}>
      <path d={`M${-16} 100 q0 -34 16 -34 q16 0 16 34 z`} fill={top} />
      <circle cx={0} cy={50} r={13} fill={skin} />
      {long ? (
        <path d="M-14 50 q0 -18 14 -18 q14 0 14 18 v14 h-5 v-16 q-9 -4 -18 0 v16 h-5 z" fill={hair} />
      ) : (
        <path d="M-13 48 q0 -16 13 -16 q13 0 13 16 q-6 -6 -13 -6 q-7 0 -13 6 z" fill={hair} />
      )}
    </g>
  )
}

function Baby({ x, skin }: { x: number; skin: string }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <ellipse cx={0} cy={92} rx={11} ry={9} fill="#FFFFFF" stroke="#EADBCD" strokeWidth={1.5} />
      <circle cx={0} cy={78} r={8} fill={skin} />
    </g>
  )
}

export function HeroFamilies({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 120"
      role="img"
      aria-label="Illustration of four families: two mums with a baby, two dads with a baby, a single parent with a baby, and a mum and dad with a baby"
      className={className}
    >
      <rect x="0" y="104" width="360" height="16" rx="8" fill="#F8EBDD" />
      {/* Two mums */}
      <Person x={22} skin={SKIN[2]} hair={HAIR[1]} top="#F2765D" long />
      <Person x={58} skin={SKIN[0]} hair={HAIR[3]} top="#8FB0DE" long />
      <Baby x={40} skin={SKIN[4]} />
      {/* Two dads */}
      <Person x={112} skin={SKIN[3]} hair={HAIR[1]} top="#86C29C" />
      <Person x={148} skin={SKIN[1]} hair={HAIR[0]} top="#DDBF63" />
      <Baby x={130} skin={SKIN[2]} />
      {/* Single parent */}
      <Person x={208} skin={SKIN[4]} hair={HAIR[2]} top="#B39BD9" long />
      <Baby x={232} skin={SKIN[4]} />
      {/* Mum and dad */}
      <Person x={286} skin={SKIN[1]} hair={HAIR[1]} top="#E9A48C" />
      <Person x={322} skin={SKIN[3]} hair={HAIR[0]} top="#8FB0DE" long />
      <Baby x={304} skin={SKIN[1]} />
    </svg>
  )
}

const CATEGORY_ICON_LABEL: Record<CategoryId, string> = {
  remember_us: 'Illustration of a photo with a heart',
  our_journey: 'Illustration of a winding path to a small house',
  little_appreciations: 'Illustration of a small gift with a sparkle',
  what_we_need: 'Illustration of a steaming cup of tea',
  lets_play: 'Illustration of a playful star and ball',
}

export function CategoryIllustration({ category, size = 56 }: { category: CategoryId; size?: number }) {
  return (
    <svg viewBox="0 0 56 56" width={size} height={size} role="img" aria-label={CATEGORY_ICON_LABEL[category]}>
      <circle cx="28" cy="28" r="28" fill="#FFFFFF" opacity="0.7" />
      {category === 'remember_us' && (
        <g>
          <rect x="13" y="14" width="30" height="26" rx="3" fill="#FFF" stroke="#E9A48C" strokeWidth="2" />
          <path d="M28 35s-8-4.8-8-10a4 4 0 0 1 8-1.6A4 4 0 0 1 36 25c0 5.2-8 10-8 10z" fill="#F2765D" />
        </g>
      )}
      {category === 'our_journey' && (
        <g>
          <path d="M10 44c10-2 6-12 16-14s8-10 14-12" fill="none" stroke="#8FB0DE" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 5" />
          <path d="M36 14l6-5 6 5v8h-12z" fill="#F2765D" />
        </g>
      )}
      {category === 'little_appreciations' && (
        <g>
          <rect x="15" y="24" width="26" height="18" rx="3" fill="#DDBF63" />
          <rect x="13" y="19" width="30" height="7" rx="2" fill="#F2765D" />
          <rect x="26" y="19" width="4" height="23" fill="#FFF8F0" />
          <path d="M42 10l1.5 3.5L47 15l-3.5 1.5L42 20l-1.5-3.5L37 15l3.5-1.5z" fill="#DDBF63" />
        </g>
      )}
      {category === 'what_we_need' && (
        <g>
          <path d="M15 26h22v8a9 9 0 0 1-9 9h-4a9 9 0 0 1-9-9z" fill="#86C29C" />
          <path d="M37 29h3a4 4 0 0 1 0 8h-3" fill="none" stroke="#86C29C" strokeWidth="3" />
          <path d="M22 21c-2-3 2-4 0-8M29 21c-2-3 2-4 0-8" fill="none" stroke="#B9A89F" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
      {category === 'lets_play' && (
        <g>
          <circle cx="21" cy="34" r="9" fill="#B39BD9" />
          <path d="M14 30c5 3 9 3 14 0" fill="none" stroke="#FFF" strokeWidth="2" />
          <path d="M37 11l3 6 6.5 1-4.7 4.6 1.1 6.4-5.9-3.1-5.9 3.1 1.1-6.4L27.5 18l6.5-1z" fill="#F2765D" />
        </g>
      )}
    </svg>
  )
}
