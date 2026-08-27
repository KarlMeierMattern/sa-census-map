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
