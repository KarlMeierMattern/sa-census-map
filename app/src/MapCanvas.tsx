import { useEffect, useRef, useState } from 'react'
import {
  Map,
  NavigationControl,
  AttributionControl,
  addProtocol,
  setWorkerUrl,
} from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { ExpressionSpecification, FilterSpecification, MapLayerMouseEvent, MapMouseEvent } from 'maplibre-gl'
import type { Language, MapMode, PlaceInfo, Vintage } from './types'
import { isMuniOnlyMode, isProvinceOnlyMode, MUNI_LAYER_MIN_ZOOM, MUNI_ZOOM, PROVINCE_LAYER_MAX_ZOOM } from './types'

setWorkerUrl(
  import.meta.env.DEV
    ? '/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'
    : maplibreWorkerUrl,
)

let protocolReady = false

function ensureProtocol() {
  if (protocolReady) return
  const protocol = new Protocol()
  addProtocol('pmtiles', (request, abortController) => protocol.tilev4(request, abortController))
  protocolReady = true
}

/** Public read-only R2 bucket for municipality tiles (not shipped in the app bundle). */
const PUBLIC_TILES_BASE_URL = 'https://pub-1b16e6dbfbeb4116b4cc74d50cc39952.r2.dev'

function municipalityTilesBaseUrl() {
  const fromEnv = import.meta.env.VITE_TILES_BASE_URL
  if (fromEnv !== undefined) {
    const trimmed = String(fromEnv).replace(/\/$/, '')
    return trimmed || window.location.origin
  }
  return PUBLIC_TILES_BASE_URL
}

function tilesUrl(path: string) {
  if (/^https?:\/\//.test(path)) return `pmtiles://${path}`
  const base = municipalityTilesBaseUrl()
  return `pmtiles://${base.replace(/\/$/, '')}${path}`
}

/** Province tile is small enough to ship with the app; keeps population fixes off stale R2 copies. */
function provinceTilesUrl(path: string) {
  if (/^https?:\/\//.test(path)) return `pmtiles://${path}`
  const base = window.location.origin
  return `pmtiles://${base.replace(/\/$/, '')}${path}`
}

const SA_BOUNDS: [[number, number], [number, number]] = [[15.8, -35.8], [33.5, -21.5]]
const DESKTOP_CENTER: [number, number] = [24.7, -28.5]
const DESKTOP_ZOOM = 4.75
const DESKTOP_MIN_ZOOM = 3.2
const MOBILE_MIN_ZOOM = 3.2

function countryPadding(mobile: boolean) {
  if (mobile) return mobileMapPadding()
  return { top: 28, bottom: 28, left: 28, right: 28 }
}

function mobileMapPadding() {
  const safeTop = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--safe-top'),
  ) || 0
  const safeBottom = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom'),
  ) || 0
  return { top: 76 + safeTop, bottom: 32 + safeBottom, left: 16, right: 16 }
}

function fitCountryOverview(map: Map, mobile: boolean, animated = false) {
  map.resize()
  map.fitBounds(SA_BOUNDS, {
    padding: countryPadding(mobile),
    duration: animated ? 1000 : 0,
    essential: true,
  })
}

function parseMix(raw: unknown): PlaceInfo['mix'] {
  if (typeof raw !== 'string') return []
  try {
    return JSON.parse(raw) as PlaceInfo['mix']
  } catch {
    return []
  }
}

function highlightPaint(field: string, color: string): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['get', field],
    0,
    '#2a2a28',
    40,
    '#4a4034',
    120,
    color,
    1000,
    color,
  ]
}

function mosaicPaint(zoomOut: string, zoomIn: string): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    3,
    ['to-color', ['get', zoomOut]],
    11,
    ['to-color', ['get', zoomIn]],
  ]
}

function placeFilter(place: { name: string; mn?: string; pr?: string }): FilterSpecification {
  const filters: ExpressionSpecification[] = [['==', ['get', 'name'], place.name]]
  if (place.mn) filters.push(['==', ['get', 'mn'], place.mn])
  if (place.pr && !place.mn) filters.push(['==', ['get', 'pr'], place.pr])
  return ['all', ...filters] as FilterSpecification
}

const EMPTY_FILTER: FilterSpecification = ['==', ['get', 'name'], '']

function placeLabel(name: string, mn?: string, pr?: string) {
  return [name, mn, pr].filter(Boolean).join(', ')
}

function isPointerDevice() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

const EXTENDED_MODES: Record<string, { out: string; inn: string; prefix: string }> = {
  marital: { out: 'maritalc0', inn: 'maritalc1', prefix: 'marital' },
  education: { out: 'educationc0', inn: 'educationc1', prefix: 'education' },
  tenure: { out: 'tenurec0', inn: 'tenurec1', prefix: 'tenure' },
  lighting: { out: 'lightingc0', inn: 'lightingc1', prefix: 'lighting' },
  religion: { out: 'religionc0', inn: 'religionc1', prefix: 'religion' },
}

function sanePop(raw: unknown): number {
  const n = Number(raw || 0)
  if (!Number.isFinite(n) || n < 1_000 || n > 50_000_000) return 0
  return Math.round(n)
}

function propsToPlace(p: Record<string, unknown> | null | undefined): PlaceInfo {
  const kind = p?.kind === 'province' ? 'province' : 'municipality'
  return {
    name: String(p?.name || 'This place'),
    mn: p?.mn ? String(p.mn) : undefined,
    pr: p?.pr ? String(p.pr) : undefined,
    pop: sanePop(p?.pop),
    area: p?.area ? Number(p.area) : undefined,
    kind,
    mix: parseMix(p?.mix),
    rmix: parseMix(p?.rmix),
    fb: Number(p?.fb || 0),
    marital: parseMix(p?.maritalmix),
    education: parseMix(p?.educationmix),
    tenure: parseMix(p?.tenuremix),
    lighting: parseMix(p?.lightingmix),
    religion: parseMix(p?.religionmix),
  }
}

type Props = {
  vintage: Vintage
  mode: MapMode
  highlight: Language | null
  selectedPlace: PlaceInfo | null
  onPlace: (place: PlaceInfo | null) => void
  flyTo: { lng: number; lat: number } | null
  mobile?: boolean
  onZoomChange?: (zoom: number) => void
  zoomToMunicipalitiesTick?: number
  zoomToProvincesTick?: number
}

export function MapCanvas({
  vintage,
  mode,
  highlight,
  selectedPlace,
  onPlace,
  flyTo,
  mobile = false,
  onZoomChange,
  zoomToMunicipalitiesTick,
  zoomToProvincesTick,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const onPlaceRef = useRef(onPlace)
  const onZoomChangeRef = useRef(onZoomChange)
  const modeRef = useRef(mode)
  const highlightRef = useRef(highlight)
  const selectedPlaceRef = useRef(selectedPlace)
  const [fail, setFail] = useState('')
  const [hoverTip, setHoverTip] = useState<{ label: string; x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(DESKTOP_ZOOM)
  onPlaceRef.current = onPlace
  onZoomChangeRef.current = onZoomChange
  modeRef.current = mode
  highlightRef.current = highlight
  selectedPlaceRef.current = selectedPlace
  const interactiveVintage = vintage.id === 'muni-2022'
  const hasProvinces = Boolean(vintage.provinceTiles)
  const muniModeActive = isMuniOnlyMode(mode)
  const provinceModeActive = isProvinceOnlyMode(mode)
  const showMuniZoomHint = hasProvinces && muniModeActive && zoom < MUNI_ZOOM
  const showProvZoomHint = hasProvinces && provinceModeActive && zoom >= MUNI_ZOOM

  function applyPaint(map: Map, layerId = 'mosaic-fill') {
    if (!map.getLayer(layerId)) return
    const current = highlightRef.current
    const currentMode = modeRef.current
    const isProvinceLayer = layerId === 'province-fill'

    if (isProvinceLayer && isMuniOnlyMode(currentMode)) {
      map.setPaintProperty(layerId, 'fill-color', '#3a3834')
      map.setPaintProperty(layerId, 'fill-opacity', 0.55)
      return
    }
    if (layerId === 'mosaic-fill' && isProvinceOnlyMode(currentMode) && zoom >= MUNI_ZOOM) {
      map.setPaintProperty(layerId, 'fill-color', '#3a3834')
      map.setPaintProperty(layerId, 'fill-opacity', 0.55)
      return
    }
    if (isProvinceLayer) {
      map.setPaintProperty(layerId, 'fill-opacity', 0.94)
    }
    if (layerId === 'mosaic-fill') {
      map.setPaintProperty(layerId, 'fill-opacity', 0.94)
    }

    const extended = EXTENDED_MODES[currentMode]
    if (current) {
      if (extended) {
        map.setPaintProperty(layerId, 'fill-color', highlightPaint(`${extended.prefix}_${current.id}`, current.color))
        return
      }
      const field = currentMode === 'language' ? `s_${current.id}` : `r_${current.id}`
      map.setPaintProperty(layerId, 'fill-color', highlightPaint(field, current.color))
      return
    }
    if (currentMode === 'born') {
      map.setPaintProperty(layerId, 'fill-color', [
        'interpolate',
        ['linear'],
        ['get', 'fb'],
        0,
        '#2a2a28',
        20,
        '#4a3a28',
        50,
        '#c47a3a',
        120,
        '#e2b33a',
        250,
        '#f3e6b0',
      ])
      return
    }
    if (extended) {
      map.setPaintProperty(layerId, 'fill-color', mosaicPaint(extended.out, extended.inn))
      return
    }
    if (currentMode === 'group') {
      map.setPaintProperty(layerId, 'fill-color', mosaicPaint('rc0', 'rc1'))
      return
    }
    map.setPaintProperty(layerId, 'fill-color', mosaicPaint('c0', 'c1'))
  }

  useEffect(() => {
    const container = rootRef.current
    if (!container) return
    ensureProtocol()
    setFail('')
    let map: Map
    try {
      map = new Map({
        container,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'bg',
              type: 'background',
              paint: { 'background-color': '#1c1c1a' },
            },
          ],
        },
        center: DESKTOP_CENTER,
        zoom: DESKTOP_ZOOM,
        minZoom: mobile ? MOBILE_MIN_ZOOM : DESKTOP_MIN_ZOOM,
        maxZoom: 13,
        attributionControl: false,
      })
    } catch (err) {
      console.error(err)
      setFail('This browser cannot draw the map. Open the page in Chrome, Firefox, or Safari.')
      return
    }
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    mapRef.current = map
    map.resize()

    map.on('error', (event) => {
      console.error(event.error)
    })
    const reportZoom = () => {
      const next = map.getZoom()
      setZoom(next)
      onZoomChangeRef.current?.(next)
    }
    map.on('zoom', reportZoom)
    map.on('zoomend', reportZoom)
    map.on('load', () => {
      map.resize()
      if (hasProvinces && vintage.provinceTiles && vintage.provinceLayer) {
        map.addSource('provinces', {
          type: 'vector',
          url: provinceTilesUrl(vintage.provinceTiles),
        })
        map.addLayer({
          id: 'province-fill',
          type: 'fill',
          source: 'provinces',
          'source-layer': vintage.provinceLayer,
          maxzoom: PROVINCE_LAYER_MAX_ZOOM,
          paint: {
            'fill-color': mosaicPaint('c0', 'c1'),
            'fill-opacity': 0.94,
          },
        })
        map.addLayer({
          id: 'province-line',
          type: 'line',
          source: 'provinces',
          'source-layer': vintage.provinceLayer,
          maxzoom: PROVINCE_LAYER_MAX_ZOOM,
          paint: {
            'line-color': '#0e0e0d',
            'line-opacity': 0.35,
            'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, MUNI_ZOOM, 1.2],
          },
        })
      }
      map.addSource('mosaic', {
        type: 'vector',
        url: tilesUrl(vintage.tiles),
      })
      map.addLayer({
        id: 'mosaic-fill',
        type: 'fill',
        source: 'mosaic',
        'source-layer': vintage.layer,
        minzoom: hasProvinces ? MUNI_LAYER_MIN_ZOOM : 0,
        paint: {
          'fill-color': mosaicPaint('c0', 'c1'),
          'fill-opacity': 0.94,
        },
      })
      map.addLayer({
        id: 'mosaic-line',
        type: 'line',
        source: 'mosaic',
        'source-layer': vintage.layer,
        minzoom: hasProvinces ? MUNI_LAYER_MIN_ZOOM : 0,
        paint: {
          'line-color': '#0e0e0d',
          'line-opacity': 0.28,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.1, 12, 0.6],
        },
      })
      if (interactiveVintage) {
        const outlineLayers = hasProvinces
          ? (['province-fill', 'mosaic-fill'] as const)
          : (['mosaic-fill'] as const)
        for (const layer of outlineLayers) {
          const suffix = layer === 'province-fill' ? 'province' : 'muni'
          map.addLayer({
            id: `mosaic-selected-line-${suffix}`,
            type: 'line',
            source: layer === 'province-fill' ? 'provinces' : 'mosaic',
            'source-layer': layer === 'province-fill' ? vintage.provinceLayer : vintage.layer,
            maxzoom: layer === 'province-fill' ? PROVINCE_LAYER_MAX_ZOOM : undefined,
            minzoom: layer === 'mosaic-fill' && hasProvinces ? MUNI_LAYER_MIN_ZOOM : undefined,
            filter: EMPTY_FILTER,
            paint: {
              'line-color': '#f8f6f0',
              'line-opacity': 0.92,
              'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2, 10, 3, 12, 4],
            },
          })
          map.addLayer({
            id: `mosaic-hover-line-${suffix}`,
            type: 'line',
            source: layer === 'province-fill' ? 'provinces' : 'mosaic',
            'source-layer': layer === 'province-fill' ? vintage.provinceLayer : vintage.layer,
            maxzoom: layer === 'province-fill' ? PROVINCE_LAYER_MAX_ZOOM : undefined,
            minzoom: layer === 'mosaic-fill' && hasProvinces ? MUNI_LAYER_MIN_ZOOM : undefined,
            filter: EMPTY_FILTER,
            paint: {
              'line-color': '#f8f6f0',
              'line-opacity': 0.72,
              'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.6, 10, 2.6, 12, 3.6],
            },
          })
        }
      }
      applyPaint(map, 'province-fill')
      applyPaint(map, 'mosaic-fill')
      if (mobile) {
        map.once('idle', () => {
          fitCountryOverview(map, true)
          reportZoom()
        })
      } else {
        map.once('idle', () => {
          fitCountryOverview(map, false)
          reportZoom()
        })
      }
    })

    const clearHover = () => {
      for (const suffix of ['province', 'muni']) {
        const id = `mosaic-hover-line-${suffix}`
        if (map.getLayer(id)) map.setFilter(id, EMPTY_FILTER)
      }
      setHoverTip(null)
    }

    const interactiveLayers = () => {
      const layers = ['mosaic-fill']
      if (map.getLayer('province-fill')) layers.unshift('province-fill')
      return layers
    }

    const onMove = (event: MapMouseEvent) => {
      const layers = interactiveLayers().filter((id) => map.getLayer(id))
      const feature = map.queryRenderedFeatures(event.point, { layers })[0]
      if (!feature?.properties) {
        clearHover()
        return
      }
      const place = propsToPlace(feature.properties)
      const suffix = place.kind === 'province' ? 'province' : 'muni'
      const hoverId = `mosaic-hover-line-${suffix}`
      if (!map.getLayer(hoverId)) return
      const selected = selectedPlaceRef.current
      const isSelected =
        selected &&
        selected.name === place.name &&
        (selected.mn || '') === (place.mn || '') &&
        (selected.pr || '') === (place.pr || '')
      if (isSelected) {
        clearHover()
        return
      }
      map.setFilter(hoverId, placeFilter(place))
      if (isPointerDevice()) {
        setHoverTip({ label: placeLabel(place.name, place.mn, place.pr), x: event.point.x, y: event.point.y })
      }
    }

    const onLeave = () => {
      clearHover()
    }

    const onFeatureClick = (event: MapLayerMouseEvent) => {
      event.originalEvent?.stopPropagation()
      clearHover()
      const feature = event.features?.[0]
      if (!feature?.properties) {
        onPlaceRef.current(null)
        return
      }
      onPlaceRef.current(propsToPlace(feature.properties))
    }

    map.on('click', 'province-fill', onFeatureClick)
    map.on('click', 'mosaic-fill', onFeatureClick)
    map.on('click', (event: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(event.point, { layers: interactiveLayers() })
      if (!hits.length) onPlaceRef.current(null)
    })
    map.on('mouseenter', 'province-fill', () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'province-fill', () => {
      map.getCanvas().style.cursor = ''
    })
    map.on('mouseenter', 'mosaic-fill', () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'mosaic-fill', () => {
      map.getCanvas().style.cursor = ''
    })
    if (interactiveVintage) {
      map.on('mousemove', onMove)
      container.addEventListener('mouseleave', onLeave)
    }

    const onResize = () => map.resize()
    const observer = new ResizeObserver(onResize)
    observer.observe(container)
    window.addEventListener('resize', onResize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onResize)
      if (interactiveVintage) {
        map.off('mousemove', onMove)
        container.removeEventListener('mouseleave', onLeave)
      }
      try {
        map.remove()
      } catch {
        // MapLibre throws if WebGL never started.
      }
      mapRef.current = null
    }
  }, [vintage, hasProvinces, interactiveVintage])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setMinZoom(mobile ? MOBILE_MIN_ZOOM : DESKTOP_MIN_ZOOM)
    if (!mobile) return
    if (!map.isStyleLoaded()) {
      map.once('load', () => fitCountryOverview(map, true))
      return
    }
    fitCountryOverview(map, true)
  }, [mobile])

  useEffect(() => {
    const map = mapRef.current
    if (!map || vintage.id !== 'muni-2022') return
    const suffix = selectedPlace?.kind === 'province' ? 'province' : 'muni'
    const layerId = `mosaic-selected-line-${suffix}`
    if (!map.getLayer(layerId)) return
    if (selectedPlace) {
      map.setFilter(layerId, placeFilter(selectedPlace))
    } else {
      map.setFilter(layerId, EMPTY_FILTER)
    }
    const other = suffix === 'province' ? 'muni' : 'province'
    const otherId = `mosaic-selected-line-${other}`
    if (map.getLayer(otherId)) map.setFilter(otherId, EMPTY_FILTER)
  }, [selectedPlace, vintage.id])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    applyPaint(map, 'province-fill')
    applyPaint(map, 'mosaic-fill')
  }, [mode, highlight, zoom])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !zoomToMunicipalitiesTick) return
    fitCountryOverview(map, mobile, true)
  }, [zoomToMunicipalitiesTick, mobile])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !zoomToProvincesTick) return
    fitCountryOverview(map, mobile, true)
  }, [zoomToProvincesTick, mobile])

  useEffect(() => {
    if (!flyTo || !mapRef.current) return
    mapRef.current.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 11, essential: true })
  }, [flyTo])

  return (
    <>
      <div className="map" ref={rootRef} />
      {showMuniZoomHint && (
        <div className="map-zoom-banner" aria-live="polite">
          Zoom in to see this by municipality
        </div>
      )}
      {showProvZoomHint && (
        <div className="map-zoom-banner" aria-live="polite">
          Zoom out to see this by province
        </div>
      )}
      {hoverTip && (
        <div className="map-tip" style={{ left: hoverTip.x, top: hoverTip.y }}>
          {hoverTip.label}
        </div>
      )}
      {fail && <p className="map-fail">{fail}</p>}
    </>
  )
}
