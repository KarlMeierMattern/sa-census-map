# A South African Mosaic

Full-viewport language map of South Africa, modelled on the New York Times ancestry explorer. The map shows **household first language**, not ancestry.

## Run the map

The map tiles are hosted on Cloudflare R2 (see `VITE_TILES_BASE_URL` in `app/.env`), so a
fresh clone runs with no data build step — it streams tiles over HTTP range requests:

```bash
cd app
npm install
npm run dev
```

Then open http://localhost:5173/. (An internet connection is needed to reach the tiles.)

### Serve tiles locally instead of R2

Set `VITE_TILES_BASE_URL=` (empty) in `app/.env`, then build the tiles (below) so they are
served from `app/public/tiles/` on the app's own origin.

## Rebuild / host the tiles

Regenerating tiles needs [`tippecanoe`](https://github.com/felt/tippecanoe)
(`brew install tippecanoe` on macOS) and Python:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python scripts/fetch_data.py     # downloads shapefiles + Census 2011 counts into data/raw/
python scripts/build_tiles.py    # builds sal-2011 + muni-2011 PMTiles
python scripts/build_2022.py     # optional: adds 2022 municipality layer (see note)
```

Then upload the resulting `app/public/tiles/*.pmtiles` to your R2 bucket under a `tiles/`
prefix (the bucket needs public read + CORS allowing `GET`/`HEAD` and the `Range` header).

`scripts/fetch_data.py` downloads the boundary shapefiles from the Census 2011 GIS mirror
and the Census 2011 first-language and population-group counts from the
[frith census GraphQL API](https://census-api.frith.dev/graphql). `scripts/build_tiles.py`
joins those counts to the polygons, blends colours, and writes PMTiles.
`scripts/build_2022.py` adds 2022 municipality population-group and foreign-born shares from
Stats SA provincial profiles; language on the 2022 view stays Census 2011 until Stats SA
publishes that table at municipality grain.

**Note on 2022 data:** the Stats SA publications site is behind bot protection
(Imperva/Incapsula), so `build_2022.py` cannot download the provincial-profile PDFs
automatically. Download Reports 03-01-70 to 03-01-78 (2022) manually into `data/raw/pdfs/`
as `profile-70.pdf` … `profile-78.pdf`, then re-run the script.

## Data

- Census 2011 small areas and municipalities: Statistics South Africa, via [census-api.frith.dev](https://census-api.frith.dev/graphql) and [Census 2011 GIS](https://stuff.adrianfrith.com/Census2011-GIS/).
- Census 2022 municipalities: Statistics South Africa provincial profiles (Reports 03-01-70 to 03-01-78) for population group and place of birth.

The map credits Stats SA as the source and states that the processing is independent. Do not sell the extracts.

## Interaction

- Pan and zoom. Zoomed out, rarer languages are boosted so the national view is not only isiZulu, isiXhosa, and Afrikaans.
- Tap a place for the language mix (or population group).
- Search a suburb, city, or language.
- Toggle 2011 small areas, 2011 municipalities, and 2022 municipalities. Foreign-born is a 2022 municipality layer.
