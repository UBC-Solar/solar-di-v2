export const CHART = {
  grid: '#ffffff0a',
  axis: '#ffffff18',
  label: '#7a8fa3',
  font: 'IBM Plex Mono,monospace',
  fontSize: 10,
  fontSmall: 9,
  // Axis-column geometry shared with the old canvas renderer (PlotCanvas).
  axisW: 44,
  gridBottom: 26,
  gridTop: 10,
} as const

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const n = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function fmtVal(v: number, decimals: number): string {
  return v.toFixed(decimals <= 1 ? 1 : 2)
}

export function fmtClock(t: number): string {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export const TOOLTIP_CSS =
  'background:var(--navy2);border:1px solid var(--border3);padding:8px 12px;' +
  'box-shadow:0 4px 16px rgba(0,0,0,.5);min-width:150px'
