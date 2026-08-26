#!/usr/bin/env python3
"""Fetch all raw inputs needed to build the map tiles.

Downloads:
  * Boundary shapefiles (small areas + municipalities) from the Census 2011
    GIS mirror.
  * Census 2011 counts (first language + population group) from Adrian Frith's
    GraphQL API, saved in the exact shape ``build_tiles.py`` expects.

Everything lands in ``data/raw/``. Re-running skips files that already exist
(pass ``--force`` to refetch). Uses only the Python standard library.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"

GIS_BASE = "https://stuff.adrianfrith.com/Census2011-GIS"
API_URL = "https://census-api.frith.dev/graphql"

# Shapefile component extensions (served uppercase, saved lowercase).
SHP_EXTS = ("shp", "shx", "dbf", "prj")
SHAPEFILES = ("SAL_APRI", "MN_SA_20")

# Variable IDs in the census API.
VAR_LANGUAGE = "3"
VAR_POPGROUP = "2"


def download(url: str, dest: Path, force: bool) -> None:
    if dest.exists() and dest.stat().st_size > 1000 and not force:
        print(f"skip  {dest.relative_to(ROOT)} (exists)")
        return
    print(f"fetch {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "census-tile-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        data = resp.read()
    dest.write_bytes(data)
    print(f"wrote {dest.relative_to(ROOT)} ({len(data):,} bytes)")


def graphql(query: str) -> dict:
    body = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "census-tile-fetch/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        payload = json.loads(resp.read())
    if "errors" in payload:
        raise RuntimeError(f"GraphQL errors: {payload['errors']}")
    return payload


def fetch_json(dest: Path, query: str, force: bool, label: str) -> None:
    if dest.exists() and dest.stat().st_size > 1000 and not force:
        print(f"skip  {dest.relative_to(ROOT)} (exists)")
        return
    print(f"query {label} ...")
    payload = graphql(query)
    n = len(payload.get("data", {}).get("places", []) or [])
    dest.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"wrote {dest.relative_to(ROOT)} ({n:,} places, {dest.stat().st_size:,} bytes)")


def single_variable_query(place_type: str, variable_id: str) -> str:
    return (
        f'{{ places(type:"{place_type}") {{ code name population '
        f'variable(variableId:"{variable_id}") {{ values {{ label value }} }} }} }}'
    )


def all_variables_query(place_type: str) -> str:
    return (
        f'{{ places(type:"{place_type}") {{ code name population '
        f"variables {{ variable {{ name }} values {{ label value }} }} }} }}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="refetch files that already exist")
    args = parser.parse_args()

    RAW.mkdir(parents=True, exist_ok=True)

    print("== shapefiles ==")
    for base in SHAPEFILES:
        for ext in SHP_EXTS:
            download(f"{GIS_BASE}/{base}.{ext.upper()}", RAW / f"{base}.{ext}", args.force)

    print("\n== census counts (small areas) ==")
    fetch_json(RAW / "sal_language.json", single_variable_query("sa", VAR_LANGUAGE), args.force, "small-area first language")
    fetch_json(RAW / "sal_popgroup.json", single_variable_query("sa", VAR_POPGROUP), args.force, "small-area population group")

    print("\n== census counts (municipalities) ==")
    fetch_json(RAW / "local_2011.json", all_variables_query("local"), args.force, "local municipalities")
    fetch_json(RAW / "metro_2011.json", all_variables_query("metro"), args.force, "metropolitan municipalities")

    print("\nDone. Raw inputs are in", RAW.relative_to(ROOT))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print("ERROR:", exc, file=sys.stderr)
        sys.exit(1)
