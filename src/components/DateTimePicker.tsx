import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

// Port of js/datetime-widget.js. A controlled picker of six number segments
// (y-mo-d h:mi:s) with wheel / vertical-drag / arrow-key stepping. The parent
// owns the committed ms value; edits here are committed immediately via
// onChange, and external `value` changes (e.g. pan/zoom prefills) resync the
// displayed segments.

interface SegDef {
  key: 'y' | 'mo' | 'd' | 'h' | 'mi' | 's'
  w: number
  min: number
  max: number
  pad: number
}

const SEGS: SegDef[] = [
  { key: 'y',  w: 42, min: 2020, max: 2099, pad: 4 },
  { key: 'mo', w: 24, min: 1,    max: 12,   pad: 2 },
  { key: 'd',  w: 24, min: 1,    max: 31,   pad: 2 },
  { key: 'h',  w: 24, min: 0,    max: 23,   pad: 2 },
  { key: 'mi', w: 24, min: 0,    max: 59,   pad: 2 },
  { key: 's',  w: 24, min: 0,    max: 59,   pad: 2 },
]

// Separator rendered BEFORE each segment except the first.
const SEP_BEFORE: Record<string, string> = { mo: '-', d: '-', h: ' ', mi: ':', s: ':' }

type Segs = Record<SegDef['key'], number>

function segsFromMs(ms: number): Segs {
  const d = new Date(ms)
  return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() }
}

function msFromSegs(s: Segs): number {
  return new Date(s.y, s.mo - 1, s.d, s.h, s.mi, s.s, 0).getTime()
}

function SegmentInput({ def, value, onCommit }: {
  def: SegDef
  value: number
  onCommit: (v: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragY = useRef<number | null>(null)
  const padded = String(value).padStart(def.pad, '0')
  const [text, setText] = useState(padded)

  // Resync the draft text when the committed value changes externally (or after
  // our own commit rounds a typed value). Uses the "adjust state during render"
  // pattern so the edit draft is preserved while the user is mid-edit.
  const [prevPadded, setPrevPadded] = useState(padded)
  if (prevPadded !== padded) {
    setPrevPadded(padded)
    setText(padded)
  }

  useEffect(() => {
    const el = inputRef.current
    if (!el) return

    const step = (delta: number) => {
      const span = def.max - def.min + 1
      let v = value + delta
      v = def.min + (((v - def.min) % span) + span) % span
      onCommit(v)
    }

    const onWheel = (e: WheelEvent) => { e.preventDefault(); step(e.deltaY < 0 ? 1 : -1) }
    const onMouseDown = (e: MouseEvent) => { dragY.current = e.clientY; el.focus(); e.preventDefault() }
    const onMouseMove = (e: MouseEvent) => {
      if (dragY.current === null) return
      const delta = Math.round((dragY.current - e.clientY) / 5)
      if (delta !== 0) { dragY.current = e.clientY; step(delta) }
    }
    const endDrag = () => { dragY.current = null }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); step(1) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); step(-1) }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('mouseleave', endDrag)
    el.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', endDrag)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('mouseleave', endDrag)
      el.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', endDrag)
    }
  }, [value, onCommit, def])

  const commitText = () => {
    const v = parseInt(text, 10)
    if (!isNaN(v)) onCommit(Math.max(def.min, Math.min(def.max, v)))
    else setText(padded)
  }

  return (
    <input
      ref={inputRef}
      type="number"
      className="dt-seg"
      style={{ width: def.w }}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commitText}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

function DateTimePicker({ value, onChange, flash }: {
  value: number
  onChange: (ms: number) => void
  flash?: boolean
}) {
  const [segs, setSegs] = useState<Segs>(() => segsFromMs(value))
  const lastCommitted = useRef(value)

  // External value change (e.g. pan/zoom or static-mode entry prefills the
  // picker): resync segments. Self-committed values are skipped via the ref.
  useEffect(() => {
    if (value !== lastCommitted.current) {
      lastCommitted.current = value
      setSegs(segsFromMs(value))
    }
  }, [value])

  const commitSeg = useCallback((key: SegDef['key'], v: number) => {
    setSegs(prev => {
      const next = { ...prev, [key]: v }
      const ms = msFromSegs(next)
      lastCommitted.current = ms
      onChange(ms)
      return next
    })
  }, [onChange])

  const wrapStyle: CSSProperties = flash ? { borderColor: 'var(--red)' } : {}

  const segments = useMemo(
    () => SEGS.map(def => ({ def, onCommit: (v: number) => commitSeg(def.key, v) })),
    [commitSeg],
  )

  return (
    <span className="dt-picker" style={wrapStyle}>
      {segments.map(({ def, onCommit }, i) => (
        <span key={def.key} style={{ display: 'inline-flex', alignItems: 'center' }}>
          {i > 0 && (SEP_BEFORE[def.key] === ' '
            ? <span className="dt-sep-space" />
            : <span className="dt-sep">{SEP_BEFORE[def.key]}</span>)}
          <SegmentInput def={def} value={segs[def.key]} onCommit={onCommit} />
        </span>
      ))}
    </span>
  )
}

export default DateTimePicker
