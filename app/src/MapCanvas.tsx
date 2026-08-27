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
import type { Language, PlaceInfo, Vintage } from './types'

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

function tilesUrl(path: string) {
  // Absolute URLs (e.g. an R2/CDN host) pass straight through; otherwise resolve
  // against VITE_TILES_BASE_URL when set, falling back to the current origin.
  if (/^https?:\/\//.test(path)) return `pmtiles://${path}`
  const base = import.meta.env.VITE_TILES_BASE_URL || window.location.origin
  return `pmtiles://${base.replace(/\/$/, '')}${path}`
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
    4,
    ['to-color', ['get', zoomOut]],
    11,
    ['to-color', ['get', zoomIn]],
  ]
}

function placeFilter(place: { name: string; mn?: string }): FilterSpecification {
  const filters: ExpressionSpecification[] = [['==', ['get', 'name'], place.name]]
  if (place.mn) filters.push(['==', ['get', 'mn'], place.mn])
  return ['all', ...filters] as FilterSpecification
}

const EMPTY_FILTER: FilterSpecification = ['==', ['get', 'name'], '']

function placeLabel(name: string, mn?: string, pr?: string) {
  return [name, mn, pr].filter(Boolean).join(', ')
}

function isPointerDevice() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

type Props = {
  vintage: Vintage
  mode: 'language' | 'group' | 'born'
  highlight: Language | null
  selectedPlace: PlaceInfo | null
  onPlace: (place: PlaceInfo | null) => void
  flyTo: { lng: number; lat: number } | null
}

export function MapCanvas({ vintage, mode, highlight, selectedPlace, onPlace, flyTo }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const onPlaceRef = useRef(onPlace)
  const modeRef = useRef(mode)
  const highlightRef = useRef(highlight)
  const selectedPlaceRef = useRef(selectedPlace)
  const [fail, setFail] = useState('')
  const [hoverTip, setHoverTip] = useState<{ label: string; x: number; y: number } | null>(null)
  onPlaceRef.current = onPlace
  modeRef.current = mode
  highlightRef.current = highlight
  selectedPlaceRef.current = selectedPlace
  const interactiveVintage = vintage.id === 'muni-2022'

  function applyPaint(map: Map) {
    if (!map.getLayer('mosaic-fill')) return
    const current = highlightRef.current
    const currentMode = modeRef.current
    if (current) {
      const field = currentMode === 'language' ? `s_${current.id}` : `r_${current.id}`
      map.setPaintProperty('mosaic-fill', 'fill-color', highlightPaint(field, current.color))
      return
    }
    if (currentMode === 'born') {
      map.setPaintProperty('mosaic-fill', 'fill-color', [
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
    if (currentMode === 'group') {
      map.setPaintProperty('mosaic-fill', 'fill-color', mosaicPaint('rc0', 'rc1'))
      return
    }
    map.setPaintProperty('mosaic-fill', 'fill-color', mosaicPaint('c0', 'c1'))
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
        center: [24.7, -28.5],
        zoom: 5.05,
        minZoom: 5,
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
    map.on('load', () => {
      map.resize()
      map.addSource('mosaic', {
        type: 'vector',
        url: tilesUrl(vintage.tiles),
      })
      map.addLayer({
        id: 'mosaic-fill',
        type: 'fill',
        source: 'mosaic',
        'source-layer': vintage.layer,
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
        paint: {
          'line-color': '#0e0e0d',
          'line-opacity': 0.28,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.1, 12, 0.6],
        },
      })
      if (interactiveVintage) {
        map.addLayer({
          id: 'mosaic-selected-line',
          type: 'line',
          source: 'mosaic',
          'source-layer': vintage.layer,
          filter: EMPTY_FILTER,
          paint: {
            'line-color': '#f8f6f0',
            'line-opacity': 0.92,
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2, 10, 3, 12, 4],
          },
        })
        map.addLayer({
          id: 'mosaic-hover-line',
          type: 'line',
          source: 'mosaic',
          'source-layer': vintage.layer,
          filter: EMPTY_FILTER,
          paint: {
            'line-color': '#f8f6f0',
            'line-opacity': 0.72,
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.6, 10, 2.6, 12, 3.6],
          },
        })
      }
      applyPaint(map)
    })

    const clearHover = () => {
      if (!map.getLayer('mosaic-hover-line')) return
      map.setFilter('mosaic-hover-line', EMPTY_FILTER)
      setHoverTip(null)
    }

    const onMove = (event: MapMouseEvent) => {
      if (!map.getLayer('mosaic-hover-line')) return
      const feature = map.queryRenderedFeatures(event.point, { layers: ['mosaic-fill'] })[0]
      if (!feature?.properties) {
        clearHover()
        return
      }
      const name = String(feature.properties.name || 'This place')
      const mn = feature.properties.mn ? String(feature.properties.mn) : undefined
      const pr = feature.properties.pr ? String(feature.properties.pr) : undefined
      const hoverPlace = { name, mn }
      const selected = selectedPlaceRef.current
      const isSelected =
        selected && selected.name === name && (selected.mn || '') === (mn || '')
      if (isSelected) {
        clearHover()
        return
      }
      map.setFilter('mosaic-hover-line', placeFilter(hoverPlace))
      if (isPointerDevice()) {
        setHoverTip({ label: placeLabel(name, mn, pr), x: event.point.x, y: event.point.y })
      }
    }

    const onLeave = () => {
      clearHover()
    }

    map.on('click', 'mosaic-fill', (event: MapLayerMouseEvent) => {
      event.originalEvent?.stopPropagation()
      clearHover()
      const feature = event.features?.[0]
      if (!feature?.properties) {
        onPlaceRef.current(null)
        return
      }
      const p = feature.properties
      onPlaceRef.current({
        name: String(p.name || 'This place'),
        mn: p.mn ? String(p.mn) : undefined,
        pr: p.pr ? String(p.pr) : undefined,
        pop: Number(p.pop || 0),
        mix: parseMix(p.mix),
        rmix: parseMix(p.rmix),
        fb: Number(p.fb || 0),
      })
    })
    map.on('click', (event: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(event.point, { layers: ['mosaic-fill'] })
      if (!hits.length) onPlaceRef.current(null)
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
  }, [vintage])

  useEffect(() => {
    const map = mapRef.current
    if (!map || vintage.id !== 'muni-2022' || !map.getLayer('mosaic-selected-line')) return
    if (selectedPlace) {
      map.setFilter('mosaic-selected-line', placeFilter(selectedPlace))
    } else {
      map.setFilter('mosaic-selected-line', EMPTY_FILTER)
    }
  }, [selectedPlace, vintage.id])

  useEffect(() => {
    const map = mapRef.current
    if (map) applyPaint(map)
  }, [mode, highlight])

  useEffect(() => {
    if (!flyTo || !mapRef.current) return
    mapRef.current.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 11, essential: true })
  }, [flyTo])

  return (
    <>
      <div className="map" ref={rootRef} />
      {hoverTip && (
        <div className="map-tip" style={{ left: hoverTip.x, top: hoverTip.y }}>
          {hoverTip.label}
        </div>
      )}
      {fail && <p className="map-fail">{fail}</p>}
    </>
  )
}
