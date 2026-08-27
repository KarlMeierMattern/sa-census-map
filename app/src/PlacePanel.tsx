import { useState } from 'react'
import type { Language, PlaceInfo } from './types'

function lookup(id: string, catalog: Language[]) {
  return catalog.find((item) => item.id === id)
}

type Props = {
  place: PlaceInfo
  mode: 'language' | 'group' | 'born'
  languages: Language[]
  groups: Language[]
  mobile: boolean
  onClose: () => void
}

export function PlacePanel({ place, mode, languages, groups, mobile, onClose }: Props) {
  const catalog = mode === 'language' ? languages : groups
  const rows = mode === 'language' ? place.mix : place.rmix
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
        </p>
      </div>
      <div className="panel-body">
        {mode === 'born' ? (
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
