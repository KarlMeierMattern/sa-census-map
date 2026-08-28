import { useEffect, useMemo, useState } from 'react'
import { MapCanvas } from './MapCanvas'
import { PlacePanel } from './PlacePanel'
import type { Language, MapMode, Meta, PlaceInfo, Suggest, Vintage } from './types'
import { isMuniOnlyMode, isProvinceOnlyMode, MODE_LABELS, MUNI_ZOOM } from './types'

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

function isSamePlace(a: PlaceInfo, b: PlaceInfo) {
  return a.name === b.name && a.mn === b.mn && a.pr === b.pr
}

export default function App() {
  const mobile = useMobile()
  const [chromeOpen, setChromeOpen] = useState(() => window.innerWidth >= 721)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<MapMode>('language')
  const [highlight, setHighlight] = useState<Language | null>(null)
  const [place, setPlace] = useState<PlaceInfo | null>(null)
  const [query, setQuery] = useState('')
  const [suggests, setSuggests] = useState<Suggest[]>([])
  const [flyTo, setFlyTo] = useState<{ lng: number; lat: number } | null>(null)
  const [mapZoom, setMapZoom] = useState(4.75)
  const [zoomToMunicipalitiesTick, setZoomToMunicipalitiesTick] = useState(0)
  const [zoomToProvincesTick, setZoomToProvincesTick] = useState(0)

  useEffect(() => {
    fetch('/meta.json')
      .then((res) => {
        if (!res.ok) throw new Error('Map metadata is missing. Run the tile build.')
        return res.json()
      })
      .then((data: Meta) => setMeta(data))
      .catch((err: Error) => setError(err.message))
  }, [])

  const vintage: Vintage | undefined = meta?.vintages.find((item) => item.id === 'muni-2022')

  const catalog =
    mode === 'language'
      ? meta?.languages || []
      : mode === 'group'
        ? meta?.populationGroups || []
        : mode === 'marital'
          ? meta?.maritalGroups || []
          : mode === 'education'
            ? meta?.educationGroups || []
            : mode === 'tenure'
              ? meta?.tenureGroups || []
              : mode === 'lighting'
                ? meta?.lightingGroups || []
                : mode === 'religion'
                  ? meta?.religionGroups || []
                  : meta?.populationGroups || []

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

  function handlePlace(next: PlaceInfo | null) {
    setPlace((current) => {
      if (next && current && isSamePlace(current, next)) return null
      return next
    })
  }

  function selectMode(next: MapMode) {
    setMode(next)
    setHighlight(null)
    if (isMuniOnlyMode(next)) {
      setZoomToMunicipalitiesTick((tick) => tick + 1)
    }
    if (isProvinceOnlyMode(next) && mapZoom >= MUNI_ZOOM) {
      setPlace(null)
      setZoomToProvincesTick((tick) => tick + 1)
    }
  }

  function choose(item: Suggest) {
    if (item.kind === 'language') {
      setQuery(item.label)
      setSuggests([])
      setMode('language')
      setHighlight(meta?.languages.find((row) => row.id === item.id) || null)
      return
    }
    if (item.kind === 'group') {
      setQuery(item.label)
      setSuggests([])
      setMode('group')
      setHighlight(meta?.populationGroups.find((row) => row.id === item.id) || null)
      return
    }
    if (item.lng != null && item.lat != null) {
      setQuery('')
      setSuggests([])
      setHighlight(null)
      setFlyTo({ lng: item.lng, lat: item.lat })
      if (mobile) setChromeOpen(false)
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
        selectedPlace={place}
        onPlace={handlePlace}
        flyTo={flyTo}
        mobile={mobile}
        onZoomChange={setMapZoom}
        zoomToMunicipalitiesTick={zoomToMunicipalitiesTick}
        zoomToProvincesTick={zoomToProvincesTick}
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
          <div className="control-group">
            <p className="control-label">Provinces and municipalities</p>
            <div className="controls">
              <button
                type="button"
                className={mode === 'language' && !highlight ? 'active' : ''}
                onClick={() => selectMode('language')}
              >
                Language mix
              </button>
              <button
                type="button"
                className={mode === 'group' && !highlight ? 'active' : ''}
                onClick={() => selectMode('group')}
              >
                Population group
              </button>
              <button
                type="button"
                className={mode === 'religion' && !highlight ? 'active' : ''}
                onClick={() => selectMode('religion')}
              >
                Religion
              </button>
            </div>
          </div>
          <div className="control-group">
            <p className="control-label">Municipalities only — zoom in to view</p>
            <div className="controls">
              <button
                type="button"
                className={mode === 'born' && !highlight ? 'active' : ''}
                onClick={() => selectMode('born')}
              >
                Foreign-born
              </button>
              <button
                type="button"
                className={mode === 'marital' && !highlight ? 'active' : ''}
                onClick={() => selectMode('marital')}
              >
                Marital status
              </button>
              <button
                type="button"
                className={mode === 'education' && !highlight ? 'active' : ''}
                onClick={() => selectMode('education')}
              >
                Education
              </button>
              <button
                type="button"
                className={mode === 'tenure' && !highlight ? 'active' : ''}
                onClick={() => selectMode('tenure')}
              >
                Property
              </button>
              <button
                type="button"
                className={mode === 'lighting' && !highlight ? 'active' : ''}
                onClick={() => selectMode('lighting')}
              >
                {MODE_LABELS.lighting}
              </button>
            </div>
          </div>
          {isMuniOnlyMode(mode) && mapZoom < MUNI_ZOOM && (
            <p className="zoom-hint">
              {MODE_LABELS[mode]} is only available at municipality level.{' '}
              <button type="button" onClick={() => setZoomToMunicipalitiesTick((tick) => tick + 1)}>
                Zoom in
              </button>
            </p>
          )}
          {isProvinceOnlyMode(mode) && mapZoom >= MUNI_ZOOM && (
            <p className="zoom-hint">
              {MODE_LABELS[mode]} is only available at province level.{' '}
              <button type="button" onClick={() => setZoomToProvincesTick((tick) => tick + 1)}>
                Zoom out
              </button>
            </p>
          )}
          <div className="controls controls-highlight">
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
          {mobile ? (
            <details className="foot-details">
              <summary>About the data</summary>
              Municipality language mix is Census 2011; other municipality stats and province
              religion/language are Census 2022 where published. {meta.attribution}
            </details>
          ) : (
            <>
              Municipality language mix is Census 2011; other municipality stats and province
              religion/language are Census 2022 where published. {meta.attribution}
            </>
          )}
          </p>
        </div>
        )}
      </div>
      {place && (
        <>
          {mobile && (
            <button
              type="button"
              className="scrim"
              aria-label="Close place details"
              onClick={() => setPlace(null)}
            />
          )}
          <PlacePanel
            key={`${place.name}-${place.mn || ''}-${place.pr || ''}-${place.kind || ''}`}
            place={place}
            mode={mode}
            languages={meta.languages}
            groups={meta.populationGroups}
            marital={meta.maritalGroups}
            education={meta.educationGroups}
            tenure={meta.tenureGroups}
            lighting={meta.lightingGroups}
            religion={meta.religionGroups}
            mobile={mobile}
            onClose={() => setPlace(null)}
          />
        </>
      )}
    </div>
  )
}
