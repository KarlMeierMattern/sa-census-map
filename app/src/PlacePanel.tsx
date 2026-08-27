import { useCallback, useEffect, useRef, useState } from 'react'
import type { Language, MapMode, PlaceInfo } from './types'

const PEEK_HEIGHT_RATIO = 0.38
const PEEK_HEIGHT_MAX = 320
const EXPANDED_HEIGHT_RATIO = 0.88
const EXPANDED_HEIGHT_TOP_GAP = 72
const SNAP_THRESHOLD = 48

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

function useMobileSheet(enabled: boolean) {
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
    const { peek, expanded } = sheetHeights()
    setHeight(Math.max(peek, Math.min(expanded, dragRef.current.startHeight + delta)))
  }

  function finishDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!enabled || !dragging) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const { peek, expanded } = sheetHeights()
    const delta = dragRef.current.startY - event.clientY
    let nextSnap = snap
    if (dragRef.current.moved) {
      if (delta > SNAP_THRESHOLD) nextSnap = 'expanded'
      else if (delta < -SNAP_THRESHOLD) nextSnap = 'peek'
      else nextSnap = height > (peek + expanded) / 2 ? 'expanded' : 'peek'
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

type StatTab = {
  id: string
  label: string
  rows?: PlaceInfo['mix']
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

function statTabs(place: PlaceInfo): StatTab[] {
  const tabs: StatTab[] = []
  if (place.kind === 'province') {
    tabs.push({ id: 'language', label: 'Language', rows: place.mix })
    tabs.push({ id: 'group', label: 'Population group', rows: place.rmix })
    if (place.religion?.length) tabs.push({ id: 'religion', label: 'Religion', rows: place.religion })
    return tabs
  }
  tabs.push({ id: 'language', label: 'Language', rows: place.mix })
  tabs.push({ id: 'group', label: 'Population group', rows: place.rmix })
  if (place.marital?.length) tabs.push({ id: 'marital', label: 'Marital status', rows: place.marital })
  if (place.education?.length) tabs.push({ id: 'education', label: 'Education', rows: place.education })
  if (place.tenure?.length) tabs.push({ id: 'tenure', label: 'Property', rows: place.tenure })
  if (place.lighting?.length) tabs.push({ id: 'lighting', label: 'Lighting', rows: place.lighting })
  return tabs
}

function catalogFor(tab: string, props: Props): Language[] {
  switch (tab) {
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

export function PlacePanel(props: Props) {
  const { place, mode, mobile, onClose } = props
  const tabs = statTabs(place)
  const defaultTab = tabs.find((tab) => tab.id === mode)?.id || tabs[0]?.id || 'language'
  const [activeTab, setActiveTab] = useState(defaultTab)
  const tab = tabs.find((item) => item.id === activeTab) || tabs[0]
  const catalog = catalogFor(tab?.id || 'language', props)
  const rows = tab?.rows || []
  const where = [place.mn, place.pr].filter(Boolean).join(' · ')
  const maxPct = Math.max(...rows.map((row) => row[2]), 1)
  const bornPct = ((place.fb || 0) / 10).toFixed(1)
  const { snap, height, dragging, resetSnap, expand, dragHandlers } = useMobileSheet(mobile)

  useEffect(() => {
    resetSnap()
  }, [place.name, place.mn, place.pr, place.kind, resetSnap])

  const showAllRows = !mobile || snap === 'expanded'
  const visibleRows = showAllRows ? rows : rows.slice(0, 5)
  const hiddenCount = rows.length - visibleRows.length

  return (
    <aside
      className={`panel ${mobile ? 'mobile' : 'desk'}${mobile && dragging ? ' is-dragging' : ''}`}
      style={mobile ? { height: `${height}px` } : undefined}
      aria-expanded={mobile ? snap === 'expanded' : undefined}
    >
      {mobile && (
        <div className="panel-drag-zone" aria-label="Drag to resize panel" {...dragHandlers}>
          <div className="panel-handle" aria-hidden="true" />
        </div>
      )}
      <button className="close" type="button" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="panel-head">
        <h2>{place.name}</h2>
        <p className="where">
          {where}
          {place.pop ? ` · ${place.pop.toLocaleString()} people` : ''}
          {place.area ? ` · ${place.area.toLocaleString()} km²` : ''}
        </p>
      </div>
      {tabs.length > 1 && (
        <div className="panel-tabs">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeTab ? 'active' : ''}
              onClick={() => {
                setActiveTab(item.id)
                resetSnap()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="panel-body">
        {mode === 'born' && place.kind !== 'province' ? (
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
