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

  return (
    <aside className={`panel ${mobile ? 'mobile' : 'desk'}`}>
      <button className="close" type="button" onClick={onClose} aria-label="Close">
        ×
      </button>
      <h2>{place.name}</h2>
      <p className="where">
        {where}
        {place.pop ? ` · ${place.pop.toLocaleString()} people` : ''}
      </p>
      {mode === 'born' ? (
        <p className="dek">About {bornPct}% of people here were born outside South Africa.</p>
      ) : (
        rows.map(([id, count, pct]) => {
          const item = lookup(id, catalog)
          return (
            <div className="row" key={id}>
              <span className="swatch" style={{ background: item?.color || '#888' }} />
              <span>{item?.label || id}</span>
              <span>{pct}%</span>
              <span>{count.toLocaleString()}</span>
              <div className="bar-wrap">
                <div className="bar" style={{ width: `${(100 * pct) / maxPct}%`, background: item?.color }} />
              </div>
            </div>
          )
        })
      )}
    </aside>
  )
}
