import { useState } from 'react'
import type { Language, MapMode, PlaceInfo } from './types'

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
  if (place.tenure?.length) tabs.push({ id: 'tenure', label: 'Tenure', rows: place.tenure })
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
  const [expanded, setExpanded] = useState(false)
  const visibleRows = mobile && !expanded ? rows.slice(0, 5) : rows
  const hiddenCount = rows.length - visibleRows.length

  return (
    <aside className={`panel ${mobile ? 'mobile' : 'desk'}`}>
      {mobile && <div className="panel-handle" aria-hidden="true" />}
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
                setExpanded(false)
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
            {mobile && hiddenCount > 0 && (
              <button type="button" className="panel-more" onClick={() => setExpanded(true)}>
                Show {hiddenCount} more
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
