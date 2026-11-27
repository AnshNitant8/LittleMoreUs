/**
 * A QR-style placeholder (spec Section 10). It is decorative only and encodes
 * nothing: no UPI string, no payee, no amount.
 */
const N = 21

function cells(): boolean[][] {
  // Fixed pseudo-random pattern so the image never changes between renders.
  let seed = 299
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  return Array.from({ length: N }, () => Array.from({ length: N }, () => rnd() > 0.55))
}

const GRID = cells()
const inFinder = (r: number, c: number) => [[0, 0], [0, N - 7], [N - 7, 0]].some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7)

export function QrPlaceholder() {
  return (
    <figure className="mx-auto w-56 space-y-2 text-center">
      <svg viewBox={`-2 -2 ${N + 4} ${N + 4}`} role="img" aria-label="Scan to pay INR 299 (prototype)" className="w-full rounded-2xl bg-white">
        {GRID.flatMap((row, r) =>
          row.map((on, c) => (on && !inFinder(r, c) ? <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill="#3D2C29" /> : null)),
        )}
        {[[0, 0], [0, N - 7], [N - 7, 0]].map(([r, c]) => (
          <g key={`${r}-${c}`} fill="none" stroke="#3D2C29">
            <rect x={c + 0.5} y={r + 0.5} width="6" height="6" strokeWidth="1" />
            <rect x={c + 2} y={r + 2} width="3" height="3" fill="#3D2C29" stroke="none" />
          </g>
        ))}
      </svg>
      <figcaption className="font-bold">Scan to pay INR 299 (prototype)</figcaption>
    </figure>
  )
}
