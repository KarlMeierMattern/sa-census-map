# Agent instructions

## Git workflow

Commit directly to `main`. Do not create feature branches or open pull requests for this repository unless the user explicitly asks.

- Stage, commit, and push to `origin/main`
- Use clear, descriptive commit messages
- One logical change per commit when practical

## Running the app

```bash
cd app
npm install
npm run dev
```

Tiles are served from Cloudflare R2 by default (`VITE_TILES_BASE_URL` in `app/.env`). Set it empty to use locally built tiles in `app/public/tiles/`.

## Rebuilding tiles

```bash
source .venv/bin/activate
python scripts/build_2022_stats.py
```

Upload `app/public/tiles/*.pmtiles` to R2 after rebuilding.
