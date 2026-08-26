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
}

export type Meta = {
  title: string
  languages: Language[]
  populationGroups: Language[]
  vintages: Vintage[]
  attribution: string
}

export type MixRow = [string, number, number]

export type PlaceInfo = {
  name: string
  mn?: string
  pr?: string
  pop: number
  mix: MixRow[]
  rmix: MixRow[]
  fb?: number
}

export type Suggest = {
  kind: 'language' | 'group' | 'place'
  id: string
  label: string
  lng?: number
  lat?: number
}
