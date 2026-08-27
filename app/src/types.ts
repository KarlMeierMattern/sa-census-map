export type Language = {
  id: string
  label: string
  color: string
  aliases?: string[]
}

export type Vintage = {
  id: string
  label: string
  tiles: string
  layer: string
  source: string
  hasForeignBorn?: boolean
  hasExtendedStats?: boolean
  provinceTiles?: string
  provinceLayer?: string
  provinceSource?: string
}

export type Meta = {
  title: string
  languages: Language[]
  populationGroups: Language[]
  maritalGroups?: Language[]
  educationGroups?: Language[]
  tenureGroups?: Language[]
  lightingGroups?: Language[]
  religionGroups?: Language[]
  vintages: Vintage[]
  attribution: string
}

export type MixRow = [string, number, number]

export type MapMode =
  | 'language'
  | 'group'
  | 'born'
  | 'marital'
  | 'education'
  | 'tenure'
  | 'lighting'
  | 'religion'

export const MODE_LABELS: Record<MapMode, string> = {
  language: 'Language mix',
  group: 'Population group',
  born: 'Foreign-born',
  marital: 'Marital status',
  education: 'Education',
  tenure: 'Property',
  lighting: 'Lighting',
  religion: 'Religion',
}

/** Municipality tiles appear from this zoom; province layer hides above it. */
export const MUNI_ZOOM = 6.5

export const MUNI_ONLY_MODES: MapMode[] = ['born', 'marital', 'education', 'tenure', 'lighting']

export const PROVINCE_ONLY_MODES: MapMode[] = ['religion']

export function isMuniOnlyMode(mode: MapMode) {
  return MUNI_ONLY_MODES.includes(mode)
}

export function isProvinceOnlyMode(mode: MapMode) {
  return PROVINCE_ONLY_MODES.includes(mode)
}

export type PlaceInfo = {
  name: string
  mn?: string
  pr?: string
  pop: number
  area?: number
  kind?: 'province' | 'municipality'
  mix: MixRow[]
  rmix: MixRow[]
  fb?: number
  marital?: MixRow[]
  education?: MixRow[]
  tenure?: MixRow[]
  lighting?: MixRow[]
  religion?: MixRow[]
}

export type Suggest = {
  kind: 'language' | 'group' | 'place'
  id: string
  label: string
  lng?: number
  lat?: number
}
