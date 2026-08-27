import { useCallback, useEffect, useRef, useState } from 'react'
import type { Language, MapMode, MixRow, PlaceInfo } from './types'
import { isMuniOnlyMode, MODE_LABELS } from './types'

const PEEK_HEIGHT_RATIO = 0.38
const PEEK_HEIGHT_MAX = 320
const EXPANDED_HEIGHT_RATIO = 0.88
const EXPANDED_HEIGHT_TOP_GAP = 72
const SNAP_THRESHOLD = 48
const DISMISS_HEIGHT_RATIO = 0.55

function sheetHeights() {
  const viewport = window.innerHeight
  const safeTop = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--safe-top'),
  ) || 0
  return {
    peek: Math.min(viewport * PEEK_HEIGHT_RATIO, PEEK_HEIGHT_MAX),
    expanded: Math.min(viewport * EXPANDED_HEIGHT_RATIO, viewport - EXPANDED_HEIGHT_TOP_GAP - safeTop),
  }
}

function useMobileSheet(enabled: boolean, onDismiss: () => void) {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  const [snap, setSnap] = useState<'peek' | 'expanded'>('peek')
  const [height, setHeight] = useState(() => sheetHeights().peek)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ startY: 0, startHeight: sheetHeights().peek, moved: false })

  const resetSnap = useCallback(() => {
    const { peek } = sheetHeights()
    setSnap('peek')
    setHeight(peek)
    setDragging(false)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const onResize = () => {
      const heights = sheetHeights()
      setHeight(snap === 'expanded' ? heights.expanded : heights.peek)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [enabled, snap])

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!enabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const heights = sheetHeights()
    const startHeight = snap === 'expanded' ? heights.expanded : heights.peek
    dragRef.current = { startY: event.clientY, startHeight, moved: false }
    setDragging(true)
    setHeight(startHeight)
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!enabled || !dragging) return
    const delta = dragRef.current.startY - event.clientY
    if (Math.abs(delta) > 6) dragRef.current.moved = true
    const { expanded } = sheetHeights()
    setHeight(Math.max(0, Math.min(expanded, dragRef.current.startHeight + delta)))
  }

  function finishDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!enabled || !dragging) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const { peek, expanded } = sheetHeights()
    const delta = dragRef.current.startY - event.clientY
    const releasedHeight = Math.max(0, Math.min(expanded, dragRef.current.startHeight + delta))

    if (releasedHeight < peek * DISMISS_HEIGHT_RATIO) {
      setDragging(false)
      onDismissRef.current()
      return
    }

    let nextSnap = snap
    if (dragRef.current.moved) {
      if (delta > SNAP_THRESHOLD) nextSnap = 'expanded'
      else if (delta < -SNAP_THRESHOLD) nextSnap = 'peek'
      else nextSnap = releasedHeight > (peek + expanded) / 2 ? 'expanded' : 'peek'
    } else {
      nextSnap = snap === 'peek' ? 'expanded' : 'peek'
    }
    setSnap(nextSnap)
    setHeight(nextSnap === 'expanded' ? expanded : peek)
    setDragging(false)
  }

  function expand() {
    const { expanded } = sheetHeights()
    setSnap('expanded')
    setHeight(expanded)
  }

  return {
    snap,
    height,
    dragging,
    resetSnap,
    expand,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerMoveCapture: onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
    },
  }
}

function lookup(id: string, catalog: Language[]) {
  return catalog.find((item) => item.id === id)
}

type Props = {
  place: PlaceInfo
  mode: MapMode
  languages: Language[]
  groups: Language[]
  marital?: Language[]
  education?: Language[]
  tenure?: Language[]
  lighting?: Language[]
  religion?: Language[]
  mobile: boolean
  onClose: () => void
}

function rowsForMode(place: PlaceInfo, mode: MapMode): MixRow[] {
  switch (mode) {
    case 'group':
      return place.rmix
    case 'religion':
      return place.religion || []
    case 'marital':
      return place.marital || []
    case 'education':
      return place.education || []
    case 'tenure':
      return place.tenure || []
    case 'lighting':
      return place.lighting || []
    default:
      return place.mix
  }
}

function catalogForMode(mode: MapMode, props: Props): Language[] {
  switch (mode) {
    case 'group':
      return props.groups
    case 'marital':
      return props.marital || []
    case 'education':
      return props.education || []
    case 'tenure':
      return props.tenure || []
    case 'lighting':
      return props.lighting || []
    case 'religion':
      return props.religion || []
    default:
      return props.languages
  }
}

function unavailableMessage(place: PlaceInfo, mode: MapMode): string | null {
  if (mode === 'born') {
    if (place.kind === 'province') {
      return 'Foreign-born share is only available for municipalities. Zoom in and tap a municipality.'
    }
    return null
  }
  if (mode === 'religion' && place.kind !== 'province') {
    return 'Religion is shown at province level. Zoom out to see it on the map.'
  }
  if (isMuniOnlyMode(mode) && place.kind === 'province') {
    return `${MODE_LABELS[mode]} is only available for municipalities. Zoom in and tap a municipality.`
  }
  if (!rowsForMode(place, mode).length) {
    return `No ${MODE_LABELS[mode].toLowerCase()} data is available for this place.`
  }
  return null
}

export function PlacePanel(props: Props) {
  const { place, mode, mobile, onClose } = props
  const where = [place.mn, place.pr].filter(Boolean).join(' · ')
  const bornPct = ((place.fb || 0) / 10).toFixed(1)
  const unavailable = unavailableMessage(place, mode)
  const rows = unavailable || mode === 'born' ? [] : rowsForMode(place, mode)
  const catalog = catalogForMode(mode, props)
  const maxPct = Math.max(...rows.map((row) => row[2]), 1)
  const { snap, height, dragging, resetSnap, expand, dragHandlers } = useMobileSheet(mobile, onClose)

  useEffect(() => {
    resetSnap()
  }, [place.name, place.mn, place.pr, place.kind, mode, resetSnap])

  const showAllRows = !mobile || snap === 'expanded'
  const visibleRows = showAllRows ? rows : rows.slice(0, 5)
  const hiddenCount = rows.length - visibleRows.length

  const head = (
    <>
      <h2>{place.name}</h2>
      <p className="where">
        {where}
        {place.pop ? ` · ${place.pop.toLocaleString()} people` : ''}
        {place.area ? ` · ${place.area.toLocaleString()} km²` : ''}
      </p>
      <p className="panel-mode">{MODE_LABELS[mode]}</p>
    </>
  )

  return (
    <aside
      className={`panel ${mobile ? 'mobile' : 'desk'}${mobile && dragging ? ' is-dragging' : ''}`}
      style={mobile ? { height: `${height}px` } : undefined}
      aria-expanded={mobile ? snap === 'expanded' : undefined}
    >
      {mobile && (
        <div className="panel-sheet-top" {...dragHandlers}>
          <div className="panel-drag-zone" aria-label="Drag to resize or dismiss panel">
            <div className="panel-handle" aria-hidden="true" />
          </div>
          <div className="panel-head">{head}</div>
        </div>
      )}
      <button className="close" type="button" onClick={onClose} aria-label="Close">
        ×
      </button>
      {!mobile && <div className="panel-head">{head}</div>}
      <div className="panel-body">
        {unavailable ? (
          <p className="dek panel-unavailable">{unavailable}</p>
        ) : mode === 'born' ? (
          <p className="dek panel-born">About {bornPct}% of people here were born outside South Africa.</p>
        ) : (
          <>
            <div className="rows">
              {visibleRows.map(([id, count, pct]) => {
                const item = lookup(id, catalog)
                return (
                  <div className={`row ${mobile ? 'row-compact' : ''}`} key={id}>
                    <span className="swatch" style={{ background: item?.color || '#888' }} />
                    <span className="row-label">{item?.label || id}</span>
                    {!mobile && <span className="row-count">{count.toLocaleString()}</span>}
                    <span className="row-pct">{pct}%</span>
                    <div className="bar-wrap">
                      <div
                        className="bar"
                        style={{ width: `${(100 * pct) / maxPct}%`, background: item?.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            {mobile && hiddenCount > 0 && snap === 'peek' && (
              <button type="button" className="panel-more" onClick={() => expand()}>
                Show {hiddenCount} more
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
