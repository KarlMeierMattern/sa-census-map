#!/usr/bin/env python3
"""Build 2022 province tiles and enrich municipality tiles with Census 2022 stats."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_2022 import parse_profiles  # noqa: E402
from build_tiles import (  # noqa: E402
    TILES,
    code_key,
    feature_props,
    load_muni_tables,
    tippecanoe,
    write_geojsonl,
)
from catalog import (  # noqa: E402
    EDUCATION_GROUPS,
    LIGHTING_GROUPS,
    LANGUAGES,
    MARITAL_GROUPS,
    RELIGION_GROUPS,
    TENURE_GROUPS,
)
from parse_2022_stats import MUNI_METRICS, parse_all_profiles  # noqa: E402

METRIC_GROUPS = {
    "marital": MARITAL_GROUPS,
    "education": EDUCATION_GROUPS,
    "tenure": TENURE_GROUPS,
    "lighting": LIGHTING_GROUPS,
}

RELIGION_LABEL_MAP = {row["label"]: row["id"] for row in RELIGION_GROUPS}
RELIGION_LABEL_MAP.update(
    {
        "Christianity": "chr",
        "Islam": "isl",
        "Traditional African": "tra",
        "Hinduism": "hin",
        "Judaism": "jud",
        "Other beliefs": "bel",
        "Atheism/Agnosticism": "ath",
        "No affiliation": "nrp",
        "Other": "rot",
    }
)


def metric_label_map(metric: str) -> dict[str, str]:
    labels = [row["id"] for row in METRIC_GROUPS[metric]]
    return {spec[0]: labels[idx] for idx, spec in enumerate(MUNI_METRICS[metric]["cats"]) if idx < len(labels)}


def remap_counts(row: dict[str, int], mapping: dict[str, str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for label, count in row.items():
        key = mapping.get(label)
        if key:
            out[key] = int(count)
    return out


def aggregate_2011_lang_by_province() -> dict[str, dict[str, int]]:
    muni = load_muni_tables()
    prov_lang: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    reader = shapefile.Reader(str(RAW / "MN_SA_20.shp"), encoding="latin-1", encodingErrors="replace")
    for rec in reader.iterRecords():
        row = rec.as_dict()
        code = code_key(row.get("MN_CODE"))
        prov = str(row.get("PR_MDB_C") or "").strip().upper()
        stats = muni.get(code)
        if not prov or not stats:
            continue
        for lang_id, count in (stats.get("lang") or {}).items():
            prov_lang[prov][lang_id] += int(count)
    reader.close()
    return {prov: dict(counts) for prov, counts in prov_lang.items()}


def aggregate_popg_by_province(parsed_2022: dict[str, dict]) -> dict[str, dict[str, int]]:
    prov_popg: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    reader = shapefile.Reader(str(RAW / "MN_SA_20.shp"), encoding="latin-1", encodingErrors="replace")
    code_to_mdb: dict[str, str] = {}
    code_to_prov: dict[str, str] = {}
    for rec in reader.iterRecords():
        row = rec.as_dict()
        code = code_key(row.get("MN_CODE"))
        code_to_mdb[code] = str(row.get("MN_MDB_C") or "").strip().upper()
        code_to_prov[code] = str(row.get("PR_MDB_C") or "").strip().upper()
    reader.close()

    for code, mdb in code_to_mdb.items():
        prov = code_to_prov.get(code, "")
        popg = (parsed_2022.get(mdb) or {}).get("popg")
        if not prov or not popg:
            continue
        for group_id, count in popg.items():
            prov_popg[prov][group_id] += int(count)
    return {prov: dict(counts) for prov, counts in prov_popg.items()}


def build_province_join(stats_doc: dict, parsed_2022: dict[str, dict], lang_fallback: dict[str, dict[str, int]]) -> dict[str, dict]:
    join: dict[str, dict] = {}
    reader = shapefile.Reader(str(RAW / "PR_SA_20.shp"), encoding="latin-1", encodingErrors="replace")
    prov_popg = aggregate_popg_by_province(parsed_2022)
    for rec in reader.iterRecords():
        row = rec.as_dict()
        code = str(row.get("PR_MDB_C") or "").strip().upper()
        name = str(row.get("PR_NAME") or "").strip()
        area = int(round(float(row.get("ALBERS_ARE") or 0)))
        pop = int(stats_doc.get("population", {}).get(code) or 0)
        prov_stats = stats_doc.get("provinces", {}).get(code, {})
        lang = prov_stats.get("language") or lang_fallback.get(code) or {}
        religion_raw = prov_stats.get("religion") or {}
        religion = {}
        for label, count in religion_raw.items():
            rid = RELIGION_LABEL_MAP.get(label)
            if rid:
                religion[rid] = int(count)
        popg = prov_popg.get(code) or {}
        join[code] = {
            "name": name,
            "population": pop,
            "area": area,
            "lang": lang,
            "popg": popg,
            "religion": religion,
            "extra_mixes": [("religion", RELIGION_GROUPS)],
        }
    reader.close()
    return join


def build_muni_join(stats_doc: dict, parsed_2022: dict[str, dict]) -> dict[str, dict]:
    lang_2011 = load_muni_tables()
    reader = shapefile.Reader(str(RAW / "MN_SA_20.shp"), encoding="latin-1", encodingErrors="replace")
    code_to_mdb: dict[str, str] = {}
    for rec in reader.iterRecords():
        row = rec.as_dict()
        code_to_mdb[code_key(row.get("MN_CODE"))] = str(row.get("MN_MDB_C") or "").strip().upper()
    reader.close()

    joined: dict[str, dict] = {}
    for code, stats in lang_2011.items():
        mdb = code_to_mdb.get(code, "")
        row_2022 = parsed_2022.get(mdb, {})
        extra_metrics = stats_doc.get("municipalities", {}).get(mdb, {})
        row = {
            "name": stats.get("name"),
            "population": row_2022.get("population") or stats.get("population"),
            "lang": stats.get("lang"),
            "popg": row_2022.get("popg") or stats.get("popg"),
            "fb": row_2022.get("fb") or 0,
            "extra_mixes": [],
        }
        for metric, palette in METRIC_GROUPS.items():
            raw = extra_metrics.get(metric)
            if not raw:
                continue
            mapped = remap_counts(raw, metric_label_map(metric))
            if mapped:
                row[metric] = mapped
                row["extra_mixes"].append((metric, palette))
        joined[code] = row
    return joined


def write_province_geojsonl(join: dict[str, dict], out_path: Path) -> int:
    reader = shapefile.Reader(str(RAW / "PR_SA_20.shp"), encoding="latin-1", encodingErrors="replace")
    written = 0
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as handle:
        for sr in reader.iterShapeRecords():
            rec = sr.record.as_dict()
            code = str(rec.get("PR_MDB_C") or "").strip().upper()
            stats = join.get(code)
            if not stats:
                continue
            shape = sr.shape
            if shape.shapeType == shapefile.NULL or not shape.points:
                continue
            name = str(rec.get("PR_NAME") or stats.get("name") or code).strip()
            feature = {
                "type": "Feature",
                "properties": feature_props(
                    name,
                    {
                        "population": stats.get("population"),
                        "lang": stats.get("lang"),
                        "popg": stats.get("popg"),
                        "religion": stats.get("religion"),
                        "extra_mixes": stats.get("extra_mixes"),
                    },
                    {"pr": code, "area": int(stats.get("area") or 0), "kind": "province"},
                ),
                "geometry": shape.__geo_interface__,
            }
            handle.write(json.dumps(feature, separators=(",", ":")) + "\n")
            written += 1
    reader.close()
    print(f"PR_SA_20.shp: wrote {written} province features")
    return written


def write_meta() -> None:
    from build_tiles import META, LANGUAGES, POP_GROUPS

    TILES.mkdir(parents=True, exist_ok=True)
    payload = {
        "title": "A South African Mosaic",
        "languages": LANGUAGES,
        "populationGroups": POP_GROUPS,
        "maritalGroups": MARITAL_GROUPS,
        "educationGroups": EDUCATION_GROUPS,
        "tenureGroups": TENURE_GROUPS,
        "lightingGroups": LIGHTING_GROUPS,
        "religionGroups": RELIGION_GROUPS,
        "vintages": [],
        "attribution": (
            "Census data: Statistics South Africa (Census 2011 and Census 2022). "
            "Boundaries: Statistics South Africa / Municipal Demarcation Board. "
            "Analysis and map by this project, independent of Stats SA."
        ),
    }
    muni_2022 = TILES / "muni-2022.pmtiles"
    province_2022 = TILES / "province-2022.pmtiles"
    if muni_2022.exists():
        vintage = {
            "id": "muni-2022",
            "label": "2022 municipalities",
            "tiles": "/tiles/muni-2022.pmtiles",
            "layer": "muni",
            "source": (
                "Census 2022 municipalities for population group, foreign-born, marital status, "
                "education, tenure, and lighting. Language mix is Census 2011 on the same "
                "municipalities; Stats SA has not published 2022 household language at this grain."
            ),
            "hasForeignBorn": True,
            "hasExtendedStats": True,
        }
        if province_2022.exists():
            vintage.update(
                {
                    "provinceTiles": "/tiles/province-2022.pmtiles",
                    "provinceLayer": "province",
                    "provinceSource": (
                        "Census 2022 provinces for population, land area, language (2022 where "
                        "published; Gauteng and Mpumalanga use 2011 municipal aggregates), "
                        "population group, and religious affiliation."
                    ),
                }
            )
        payload["vintages"].append(vintage)
    META.write_text(json.dumps(payload, indent=2))
    print("wrote", META)


def main() -> None:
    PROC.mkdir(parents=True, exist_ok=True)
    TILES.mkdir(parents=True, exist_ok=True)

    stats_doc = parse_all_profiles()
    (RAW / "muni_2022_stats.json").write_text(json.dumps(stats_doc, indent=2))
    parsed_2022 = parse_profiles()
    (RAW / "muni_2022_tables.json").write_text(json.dumps(parsed_2022, indent=2))

    lang_fallback = aggregate_2011_lang_by_province()
    prov_join = build_province_join(stats_doc, parsed_2022, lang_fallback)
    muni_join = build_muni_join(stats_doc, parsed_2022)

    prov_jsonl = PROC / "province-2022.geojsonl"
    muni_jsonl = PROC / "muni-2022.geojsonl"
    write_province_geojsonl(prov_join, prov_jsonl)
    write_geojsonl(RAW / "MN_SA_20.shp", muni_jsonl, muni_join, "MN_CODE", ["MN_NAME"])

    tippecanoe(prov_jsonl, TILES / "province-2022.pmtiles", "province", 8)
    tippecanoe(muni_jsonl, TILES / "muni-2022.pmtiles", "muni", 10)
    write_meta()


if __name__ == "__main__":
    main()
