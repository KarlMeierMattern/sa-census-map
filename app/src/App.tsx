import { useEffect, useMemo, useState } from 'react'
import { MapCanvas } from './MapCanvas'
import { PlacePanel } from './PlacePanel'
import type { Language, Meta, PlaceInfo, Suggest, Vintage } from './types'

function useMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 721)
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 721)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return mobile
}

function matchesLanguage(query: string, item: Language) {
  const q = query.toLowerCase()
  if (item.label.toLowerCase().startsWith(q) || item.id === q) return true
  return (item.aliases || []).some((alias) => alias.toLowerCase().startsWith(q))
}

async function searchPlaces(query: string): Promise<Suggest[]> {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('lat', '-28.8')
  url.searchParams.set('lon', '24.8')
  url.searchParams.set('limit', '6')
  url.searchParams.set('bbox', '16.3,-35.0,33.0,-22.1')
  const response = await fetch(url)
  if (!response.ok) return []
  const data = (await response.json()) as {
    features?: {
      properties?: { name?: string; city?: string; country?: string; countrycode?: string }
      geometry?: { coordinates?: number[] }
    }[]
  }
  const places: Suggest[] = []
  for (const feature of data.features || []) {
    const code = (feature.properties?.countrycode || '').toUpperCase()
    const country = (feature.properties?.country || '').toLowerCase()
    if (code && code !== 'ZA' && !country.includes('south africa')) continue
    const [lng, lat] = feature.geometry?.coordinates || []
    if (lng == null || lat == null) continue
    const label = [feature.properties?.name, feature.properties?.city].filter(Boolean).join(', ')
    if (!label) continue
    places.push({ kind: 'place', id: `${lng},${lat}`, label, lng, lat })
  }
  return places
}

export default function App() {
  const mobile = useMobile()
  const [chromeOpen, setChromeOpen] = useState(() => window.innerWidth >= 721)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [error, setError] = useState('')
  const [vintageId, setVintageId] = useState('sal-2011')
  const [mode, setMode] = useState<'language' | 'group' | 'born'>('language')
  const [highlight, setHighlight] = useState<Language | null>(null)
  const [place, setPlace] = useState<PlaceInfo | null>(null)
  const [query, setQuery] = useState('')
  const [suggests, setSuggests] = useState<Suggest[]>([])
  const [flyTo, setFlyTo] = useState<{ lng: number; lat: number } | null>(null)

  useEffect(() => {
    fetch('/meta.json')
      .then((res) => {
        if (!res.ok) throw new Error('Map metadata is missing. Run the tile build.')
        return res.json()
      })
      .then((data: Meta) => {
        setMeta(data)
        setVintageId(data.vintages[0]?.id || 'sal-2011')
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  const vintage: Vintage | undefined = meta?.vintages.find((item) => item.id === vintageId) || meta?.vintages[0]

  const catalog = mode === 'language' ? meta?.languages || [] : meta?.populationGroups || []

  const languageSuggestions = useMemo(() => {
    const q = query.trim()
    if (q.length < 2 || !meta) return []
    const langs = meta.languages.filter((item) => matchesLanguage(q, item)).map((item) => ({
      kind: 'language' as const,
      id: item.id,
      label: item.label,
    }))
    const groups = meta.populationGroups.filter((item) => matchesLanguage(q, item)).map((item) => ({
      kind: 'group' as const,
      id: item.id,
      label: item.label,
    }))
    return [...langs, ...groups].slice(0, 6)
  }, [query, meta])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setSuggests(languageSuggestions)
      return
    }
    const handle = window.setTimeout(() => {
      searchPlaces(q)
        .then((places) => setSuggests([...languageSuggestions, ...places].slice(0, 8)))
        .catch(() => setSuggests(languageSuggestions))
    }, 220)
    return () => window.clearTimeout(handle)
  }, [query, languageSuggestions])

  function choose(item: Suggest) {
    setQuery(item.label)
    setSuggests([])
    if (item.kind === 'language') {
      setMode('language')
      setHighlight(meta?.languages.find((row) => row.id === item.id) || null)
      return
    }
    if (item.kind === 'group') {
      setMode('group')
      setHighlight(meta?.populationGroups.find((row) => row.id === item.id) || null)
      return
    }
    if (item.lng != null && item.lat != null) {
      setHighlight(null)
      setFlyTo({ lng: item.lng, lat: item.lat })
    }
  }

  if (error) {
    return <div className="loading">{error}</div>
  }
  if (!meta || !vintage) {
    return <div className="loading">Loading the mosaic…</div>
  }

  return (
    <div className="shell">
      <MapCanvas
        vintage={vintage}
        mode={mode}
        highlight={highlight}
        onPlace={setPlace}
        flyTo={flyTo}
      />
      <div className="chrome">
        {mobile && !chromeOpen ? (
          <button type="button" className="chrome-toggle" onClick={() => setChromeOpen(true)}>
            Search &amp; filters
          </button>
        ) : (
        <div className="card">
          {mobile && (
            <button
              className="close"
              type="button"
              onClick={() => setChromeOpen(false)}
              aria-label="Hide panel"
            >
              ×
            </button>
          )}
          <h1 className="title">A South African Mosaic</h1>
          <p className="dek">
            This map shows the language people most often spoke in the household. It is not ancestry,
            ethnicity, or mother tongue.
          </p>
          <p className="prompt">Tap a place to see how people there identify.</p>
          <div className="search">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                if (!event.target.value) setHighlight(null)
              }}
              placeholder="Search a place or a language"
              aria-label="Search a place or a language"
            />
            {suggests.length > 0 && query.trim().length >= 2 && (
              <ul className="suggest">
                {suggests.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <button type="button" onClick={() => choose(item)}>
                      <span className="kind">{item.kind}</span>
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="controls">
            {meta.vintages.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === vintage.id ? 'active' : ''}
                onClick={() => {
                  setVintageId(item.id)
                  setPlace(null)
                  if (mode === 'born' && !item.hasForeignBorn) {
                    setMode('language')
                    setHighlight(null)
                  }
                }}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className={mode === 'language' && !highlight ? 'active' : ''}
              onClick={() => {
                setMode('language')
                setHighlight(null)
              }}
            >
              Language mix
            </button>
            <button
              type="button"
              className={mode === 'group' && !highlight ? 'active' : ''}
              onClick={() => {
                setMode('group')
                setHighlight(null)
              }}
            >
              Population group
            </button>
            {vintage.hasForeignBorn && (
              <button
                type="button"
                className={mode === 'born' && !highlight ? 'active' : ''}
                onClick={() => {
                  setMode('born')
                  setHighlight(null)
                }}
              >
                Foreign-born
              </button>
            )}
            {highlight && (
              <button type="button" className="active" onClick={() => setHighlight(null)}>
                Showing {highlight.label}
              </button>
            )}
          </div>
          <div className="legend">
            {mode === 'born' ? (
              <>
                <span>
                  <i style={{ background: '#2a2a28' }} />
                  Few born abroad
                </span>
                <span>
                  <i style={{ background: '#f3e6b0' }} />
                  More born abroad
                </span>
              </>
            ) : (
              catalog.slice(0, 12).map((item) => (
                <span key={item.id}>
                  <i style={{ background: item.color }} />
                  {item.label}
                </span>
              ))
            )}
          </div>
          <p className="foot">
            Census 2011 small areas (two languages allowed on the form; this map uses first language).
            Census 2022 municipalities (one language). Percentages may not add to 100 on the 2011
            view. {meta.attribution}
          </p>
        </div>
        )}
      </div>
      {place && (
        <PlacePanel
          place={place}
          mode={mode}
          languages={meta.languages}
          groups={meta.populationGroups}
          mobile={mobile}
          onClose={() => setPlace(null)}
        />
      )}
    </div>
  )
}
