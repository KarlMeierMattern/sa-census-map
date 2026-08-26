# A South African Mosaic

Full-viewport language map of South Africa, modelled on the New York Times ancestry explorer. The map shows **household first language**, not ancestry.

## Run the map

```bash
cd app
npm install
npm run dev
```

Tiles must exist first:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/build_tiles.py
python scripts/build_2022.py
```

`scripts/build_tiles.py` joins Census 2011 small-area and municipality counts to polygons, blends colours, and writes PMTiles. `scripts/build_2022.py` adds 2022 municipality population-group and foreign-born shares from Stats SA provincial profiles. Language on the 2022 view stays Census 2011 until Stats SA publishes that table at municipality grain.

## Data

- Census 2011 small areas and municipalities: Statistics South Africa, via [census-api.frith.dev](https://census-api.frith.dev/graphql) and [Census 2011 GIS](https://stuff.adrianfrith.com/Census2011-GIS/).
- Census 2022 municipalities: Statistics South Africa provincial profiles (Reports 03-01-70 to 03-01-78) for population group and place of birth.

The map credits Stats SA as the source and states that the processing is independent. Do not sell the extracts.

## Interaction

- Pan and zoom. Zoomed out, rarer languages are boosted so the national view is not only isiZulu, isiXhosa, and Afrikaans.
- Tap a place for the language mix (or population group).
- Search a suburb, city, or language.
- Toggle 2011 small areas, 2011 municipalities, and 2022 municipalities. Foreign-born is a 2022 municipality layer.
