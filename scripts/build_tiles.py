#!/usr/bin/env python3
"""Join Census 2011 counts to SAL/muni polygons and build PMTiles."""

from __future__ import annotations

import json
import math
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
TILES = ROOT / "app" / "public" / "tiles"
META = ROOT / "app" / "public" / "meta.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from catalog import (  # noqa: E402
    LANGUAGES,
    LANG_BY_LABEL,
    NATIONAL_LANG_SHARE,
    NATIONAL_POP_SHARE,
    POP_BY_LABEL,
    POP_GROUPS,
)

SKIP_LANG = {"not applicable"}


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(rgb: tuple[float, float, float]) -> str:
    r, g, b = [max(0, min(255, int(round(c)))) for c in rgb]
    return f"#{r:02x}{g:02x}{b:02x}"


def blend(weights: dict[str, float], palette: dict[str, str], national: dict[str, float], boost: bool) -> str:
    items: list[tuple[float, tuple[int, int, int]]] = []
    for key, share in weights.items():
        if share < 0.02 or key not in palette:
            continue
        w = share
        if boost:
            nat = max(national.get(key, 0.02), 0.015)
            w = share * ((0.12 / nat) ** 0.55)
        items.append((w, hex_to_rgb(palette[key])))
    if not items:
        return "#3a3a38"
    total = sum(w for w, _ in items)
    r = sum(w * c[0] for w, c in items) / total
    g = sum(w * c[1] for w, c in items) / total
    b = sum(w * c[2] for w, c in items) / total
    return rgb_to_hex((r, g, b))


def code_key(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        return str(int(value))
    text = str(value).strip()
    if not text:
        return ""
    try:
        return str(int(float(text)))
    except ValueError:
        return text


def values_to_map(values: list[dict], lookup: dict[str, dict], skip: set[str] | None = None) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for row in values or []:
        label = (row.get("label") or "").strip()
        if not label or (skip and label.lower() in skip):
            continue
        meta = lookup.get(label.lower())
        if not meta:
            meta = lookup.get("other")
        if not meta:
            continue
        out[meta["id"]] += int(row.get("value") or 0)
    return dict(out)


def load_sal_tables() -> dict[str, dict]:
    lang_doc = json.loads((RAW / "sal_language.json").read_text())
    pop_doc = json.loads((RAW / "sal_popgroup.json").read_text())
    table: dict[str, dict] = {}
    for place in lang_doc["data"]["places"]:
        table[place["code"]] = {
            "name": place.get("name") or "",
            "population": int(place.get("population") or 0),
            "lang": values_to_map(place.get("variable", {}).get("values"), LANG_BY_LABEL, SKIP_LANG),
            "popg": {},
        }
    for place in pop_doc["data"]["places"]:
        row = table.setdefault(place["code"], {"name": "", "population": 0, "lang": {}, "popg": {}})
        row["popg"] = values_to_map(place.get("variable", {}).get("values"), POP_BY_LABEL)
    return table


def load_muni_tables() -> dict[str, dict]:
    table: dict[str, dict] = {}
    for filename in ("local_2011.json", "metro_2011.json"):
        doc = json.loads((RAW / filename).read_text())
        for place in doc["data"]["places"]:
            lang_vals = []
            pop_vals = []
            for block in place.get("variables") or []:
                name = (block.get("variable") or {}).get("name")
                if name == "First language":
                    lang_vals = block.get("values") or []
                elif name == "Population group":
                    pop_vals = block.get("values") or []
            table[place["code"]] = {
                "name": place.get("name") or "",
                "population": int(place.get("population") or 0),
                "lang": values_to_map(lang_vals, LANG_BY_LABEL, SKIP_LANG),
                "popg": values_to_map(pop_vals, POP_BY_LABEL),
            }
    return table


def feature_props(name: str, stats: dict, extra: dict | None = None) -> dict:
    lang = stats.get("lang") or {}
    popg = stats.get("popg") or {}
    lang_total = sum(lang.values()) or 1
    popg_total = sum(popg.values()) or 1
    lang_share = {k: v / lang_total for k, v in lang.items()}
    pop_share = {k: v / popg_total for k, v in popg.items()}
    lang_palette = {row["id"]: row["color"] for row in LANGUAGES}
    pop_palette = {row["id"]: row["color"] for row in POP_GROUPS}

    ranked_lang = sorted(lang.items(), key=lambda kv: kv[1], reverse=True)
    ranked_pop = sorted(popg.items(), key=lambda kv: kv[1], reverse=True)
    mix = [[k, v, round(100 * v / lang_total, 1)] for k, v in ranked_lang[:8] if v > 0]
    rmix = [[k, v, round(100 * v / popg_total, 1)] for k, v in ranked_pop[:6] if v > 0]

    props = {
        "name": name,
        "pop": int(stats.get("population") or lang_total),
        "c0": blend(lang_share, lang_palette, NATIONAL_LANG_SHARE, True),
        "c1": blend(lang_share, lang_palette, NATIONAL_LANG_SHARE, False),
        "rc0": blend(pop_share, pop_palette, NATIONAL_POP_SHARE, True),
        "rc1": blend(pop_share, pop_palette, NATIONAL_POP_SHARE, False),
        "mix": json.dumps(mix, separators=(",", ":")),
        "rmix": json.dumps(rmix, separators=(",", ":")),
        "fb": int(stats.get("fb") or 0),
    }
    for row in LANGUAGES:
        props[f"s_{row['id']}"] = int(round(1000 * lang_share.get(row["id"], 0)))
    for row in POP_GROUPS:
        props[f"r_{row['id']}"] = int(round(1000 * pop_share.get(row["id"], 0)))

    for mix_key, palette in stats.get("extra_mixes") or []:
        weights = stats.get(mix_key) or {}
        total = sum(weights.values()) or 1
        share = {k: v / total for k, v in weights.items()}
        colors = {row["id"]: row["color"] for row in palette}
        ranked = sorted(weights.items(), key=lambda kv: kv[1], reverse=True)
        props[f"{mix_key}mix"] = json.dumps(
            [[k, v, round(100 * v / total, 1)] for k, v in ranked if v > 0],
            separators=(",", ":"),
        )
        props[f"{mix_key}c0"] = blend(share, colors, {row["id"]: 1 / len(palette) for row in palette}, True)
        props[f"{mix_key}c1"] = blend(share, colors, {row["id"]: 1 / len(palette) for row in palette}, False)
        for row in palette:
            props[f"{mix_key}_{row['id']}"] = int(round(1000 * share.get(row["id"], 0)))

    if extra:
        props.update(extra)
    return props


def write_geojsonl(shp_path: Path, out_path: Path, join: dict[str, dict], code_field: str, name_fields: list[str]) -> int:
    reader = shapefile.Reader(str(shp_path), encoding="latin-1", encodingErrors="replace")
    written = 0
    missed = 0
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as handle:
        for sr in reader.iterShapeRecords():
            rec = sr.record.as_dict()
            key = code_key(rec.get(code_field))
            stats = join.get(key)
            if not stats:
                missed += 1
                continue
            shape = sr.shape
            if shape.shapeType == shapefile.NULL or not shape.points:
                continue
            geom = shape.__geo_interface__
            name = ""
            for field in name_fields:
                value = rec.get(field)
                if value and str(value).strip():
                    name = str(value).strip()
                    break
            if not name:
                name = stats.get("name") or key
            extra = {}
            if rec.get("MN_NAME"):
                extra["mn"] = str(rec["MN_NAME"]).strip()
            if rec.get("PR_NAME"):
                extra["pr"] = str(rec["PR_NAME"]).strip()
            feature = {
                "type": "Feature",
                "properties": feature_props(name, stats, extra),
                "geometry": geom,
            }
            handle.write(json.dumps(feature, separators=(",", ":")) + "\n")
            written += 1
    reader.close()
    print(f"{shp_path.name}: wrote {written} features, missed {missed}")
    return written


def tippecanoe(src: Path, dest: Path, layer: str, maxzoom: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        dest.unlink()
    cmd = [
        "tippecanoe",
        "-o",
        str(dest),
        "-l",
        layer,
        "-Z5",
        f"-z{maxzoom}",
        "--maximum-tile-bytes=2500000",
        "--drop-densest-as-needed",
        "--extend-zooms-if-still-dropping",
        "--coalesce-densest-as-needed",
        "--simplification=12",
        str(src),
    ]
    print(" ".join(cmd))
    subprocess.run(cmd, check=True)


def write_meta() -> None:
    TILES.mkdir(parents=True, exist_ok=True)
    payload = {
        "title": "A South African Mosaic",
        "languages": LANGUAGES,
        "populationGroups": POP_GROUPS,
        "vintages": [],
        "attribution": (
            "Census data: Statistics South Africa (Census 2011 and Census 2022). "
            "Boundaries: Statistics South Africa / Municipal Demarcation Board. "
            "Analysis and map by this project, independent of Stats SA."
        ),
    }
    muni_2022 = TILES / "muni-2022.pmtiles"
    if muni_2022.exists():
        payload["vintages"].append(
            {
                "id": "muni-2022",
                "label": "2022 municipalities",
                "tiles": "/tiles/muni-2022.pmtiles",
                "layer": "muni",
                "source": (
                    "Census 2022 municipalities for population group and foreign-born share. "
                    "Language mix is Census 2011 on the same municipalities; Stats SA has not "
                    "published 2022 household language at this grain."
                ),
                "hasForeignBorn": True,
            }
        )
    META.write_text(json.dumps(payload, indent=2))
    print("wrote", META)


def main() -> None:
    PROC.mkdir(parents=True, exist_ok=True)
    TILES.mkdir(parents=True, exist_ok=True)
    sal_join = load_sal_tables()
    muni_join = load_muni_tables()
    sal_jsonl = PROC / "sal-2011.geojsonl"
    muni_jsonl = PROC / "muni-2011.geojsonl"
    write_geojsonl(
        RAW / "SAL_APRI.shp",
        sal_jsonl,
        sal_join,
        "SAL_CODE",
        ["SP_NAME", "MP_NAME", "MN_NAME"],
    )
    write_geojsonl(
        RAW / "MN_SA_20.shp",
        muni_jsonl,
        muni_join,
        "MN_CODE",
        ["MN_NAME"],
    )
    tippecanoe(sal_jsonl, TILES / "sal-2011.pmtiles", "sal", 12)
    tippecanoe(muni_jsonl, TILES / "muni-2011.pmtiles", "muni", 10)
    write_meta()


if __name__ == "__main__":
    main()
