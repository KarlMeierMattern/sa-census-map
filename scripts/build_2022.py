#!/usr/bin/env python3
"""Build 2022 municipality tiles from provincial profile tables.

Population group and foreign-born come from Census 2022 provincial profiles.
Household language is not published at municipality grain in those PDFs, so
language shares are joined from Census 2011 municipality tables on the same
polygons. The map footnote states that split.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_tiles import (  # noqa: E402
    TILES,
    code_key,
    load_muni_tables,
    tippecanoe,
    write_geojsonl,
    write_meta,
)

REPORTS = {
    "70": "https://www.statssa.gov.za/publications/Report-03-01-70/Report-03-01-702022.pdf",
    "71": "https://www.statssa.gov.za/publications/Report-03-01-71/Report-03-01-712022.pdf",
    "72": "https://www.statssa.gov.za/publications/Report-03-01-72/Report-03-01-722022.pdf",
    "73": "https://www.statssa.gov.za/publications/Report-03-01-73/Report-03-01-732022.pdf",
    "74": "https://www.statssa.gov.za/publications/Report-03-01-74/Report-03-01-742022.pdf",
    "75": "https://www.statssa.gov.za/publications/Report-03-01-75/Report-03-01-752022.pdf",
    "76": "https://www.statssa.gov.za/publications/Report-03-01-76/Report-03-01-762022.pdf",
    "77": "https://www.statssa.gov.za/publications/Report-03-01-77/Report-03-01-772022.pdf",
    "78": "https://www.statssa.gov.za/publications/Report-03-01-78/Report-03-01-782022.pdf",
}

CODE_RE = re.compile(
    r"\b((?:WC|EC|NC|FS|KZN|NW|GT|GP|MP|LP|LIM)\d{3}|BUF|NMA|MAN|ETH|JHB|TSH|EKU|CPT)\b",
    re.I,
)
NEXT_TABLE = re.compile(r"\nTable \d+\.\d+[:.]")
PCT_RE = re.compile(r"\d{1,3},\d")
COUNT_RE = re.compile(r"\d{1,3}(?: \d{3})+|\d+")
METRO_NAMES = {
    "city of cape town": "CPT",
    "buffalo city": "BUF",
    "nelson mandela bay": "NMA",
    "mangaung": "MAN",
    "ethekwini": "ETH",
    "city of johannesburg": "JHB",
    "city of tshwane": "TSH",
    "ekurhuleni": "EKU",
    "city of ekurhuleni": "EKU",
}


def normalize_code(code: str) -> str:
    code = code.upper()
    if code.startswith("LP") and len(code) == 5:
        return "LIM" + code[2:]
    if code.startswith("GP") and len(code) == 5:
        return "GT" + code[2:]
    return code


def parse_counts(text: str) -> list[int]:
    stripped = PCT_RE.sub(" ", text)
    return [int(token.replace(" ", "")) for token in COUNT_RE.findall(stripped)]


def parse_pcts(text: str) -> list[float]:
    return [float(token.replace(",", ".")) for token in PCT_RE.findall(text)]


def download_pdfs() -> list[Path]:
    dest = RAW / "pdfs"
    dest.mkdir(parents=True, exist_ok=True)
    paths = []
    for num, url in REPORTS.items():
        path = dest / f"profile-{num}.pdf"
        if not path.exists() or path.stat().st_size < 10_000:
            print("download", url)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req) as response:
                path.write_bytes(response.read())
        paths.append(path)
    return paths


def pdf_text(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def longest_table(text: str, heading: str) -> str:
    low = text.lower()
    needle = heading.lower()
    best = ""
    start = 0
    while True:
        idx = low.find(needle, start)
        if idx < 0:
            break
        rest = text[idx:]
        match = NEXT_TABLE.search(rest[len(heading) :])
        chunk = rest[: len(heading) + match.start()] if match else rest[:20_000]
        if len(chunk) > len(best):
            best = chunk
        start = idx + 8
    return best


def norm_name(value: str) -> str:
    text = value.lower().replace("â", "a").replace("ê", "e").replace("ô", "o")
    text = text.replace("!", "")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    for extra in (
        "local municipality",
        "metropolitan municipality",
        "metro municipality",
        "the ",
    ):
        text = text.replace(extra, " ")
    return " ".join(text.split())


def shapefile_names() -> list[tuple[str, str]]:
    import shapefile

    reader = shapefile.Reader(str(RAW / "MN_SA_20.shp"), encoding="latin-1", encodingErrors="replace")
    rows = []
    for rec in reader.iterRecords():
        data = rec.as_dict()
        mdb = str(data.get("MN_MDB_C") or "").strip().upper()
        name = str(data.get("MN_NAME") or "").strip()
        if mdb and name:
            rows.append((name, mdb))
    reader.close()
    extras = [
        ("Rand West City", "GT485"),
        ("Walter Sisulu", "EC145"),
        ("City of Ekurhuleni", "EKU"),
        ("Dr Beyers Naude", "EC101"),
        ("Dr Beyers Naudé", "EC101"),
    ]
    rows.extend(extras)
    return rows


def match_place(line: str, names: list[tuple[str, str]]) -> str | None:
    code_hit = CODE_RE.search(line)
    if code_hit:
        return normalize_code(code_hit.group(1))
    nline = norm_name(line)
    best = None
    best_len = 0
    for name, mdb in names:
        nn = norm_name(name)
        if len(nn) < 4 or nn not in nline:
            continue
        if len(nn) > best_len:
            best = mdb
            best_len = len(nn)
    if best:
        return best
    for label, mdb in METRO_NAMES.items():
        if label in nline or norm_name(label) in nline:
            return mdb
    return None


def foreign_permille(window: str) -> int | None:
    pcts = parse_pcts(window)
    if len(pcts) >= 4:
        value = pcts[3]
    else:
        vals = [p for p in pcts if abs(p - 100) > 0.05]
        if not vals:
            return None
        value = vals[-1]
    if value < 0 or value > 80:
        return None
    return int(round(value * 10))


def best_table(text: str, headings: list[str], needles: list[str]) -> str:
    best = ""
    for heading in headings:
        chunk = longest_table(text, heading)
        low = chunk.lower()
        if all(n in low for n in needles) and len(chunk) > len(best):
            best = chunk
    return best


def take_popg(window: str) -> dict | None:
    counts = parse_counts(window)
    if len(counts) < 6:
        return None
    black, coloured, indian, white, other, total = counts[:6]
    if total < black + coloured or total < 200:
        return None
    return {
        "popg": {"bl": black, "co": coloured, "in": indian, "wh": white, "ot": other},
        "population": total,
    }


def parse_profiles() -> dict[str, dict]:
    names = shapefile_names()
    tables: dict[str, dict] = {}
    for path in download_pdfs():
        try:
            text = pdf_text(path)
        except Exception as exc:
            print("parse fail", path.name, exc)
            continue
        pop_sections = [
            longest_table(text, heading)
            for heading in ("Table 2.8", "Table 2.9")
        ]
        born_sections = [longest_table(text, "Table 3.2")]
        pop_n = 0
        born_n = 0
        for pop_section in pop_sections:
            header = pop_section[:900].lower()
            if "black african" not in header:
                continue
            for match in CODE_RE.finditer(pop_section):
                code = normalize_code(match.group(1))
                if tables.get(code, {}).get("popg"):
                    continue
                row = take_popg(pop_section[match.end() : match.end() + 240])
                if not row:
                    continue
                tables.setdefault(code, {})
                tables[code].update(row)
                tables[code]["mdb"] = code
                pop_n += 1
            for raw in pop_section.splitlines():
                line = raw.strip()
                if len(line) < 8:
                    continue
                code = match_place(line, names)
                if not code or (code in tables and tables[code].get("popg")):
                    continue
                row = take_popg(line)
                if not row:
                    continue
                tables.setdefault(code, {})
                tables[code].update(row)
                tables[code]["mdb"] = code
                pop_n += 1
        for born_section in born_sections:
            if "born" not in born_section.lower():
                continue
            for match in CODE_RE.finditer(born_section):
                code = normalize_code(match.group(1))
                fb = foreign_permille(born_section[match.end() : match.end() + 120])
                if fb is None:
                    continue
                tables.setdefault(code, {})
                tables[code]["mdb"] = code
                tables[code]["fb"] = fb
                born_n += 1
            for raw in born_section.splitlines():
                line = raw.strip()
                if len(line) < 8:
                    continue
                code = match_place(line, names)
                if not code or tables.get(code, {}).get("fb") is not None:
                    continue
                fb = foreign_permille(line)
                if fb is None:
                    continue
                tables.setdefault(code, {})
                tables[code]["mdb"] = code
                tables[code]["fb"] = fb
                born_n += 1
        print(path.name, "popg rows", pop_n, "born rows", born_n)
    print("parsed mdb codes", len(tables))
    return tables


def main() -> None:
    parsed = parse_profiles()
    (RAW / "muni_2022_tables.json").write_text(json.dumps(parsed, indent=2))
    lang_2011 = load_muni_tables()
    import shapefile

    reader = shapefile.Reader(str(RAW / "MN_SA_20.shp"), encoding="latin-1", encodingErrors="replace")
    code_to_mdb = {}
    for rec in reader.iterRecords():
        row = rec.as_dict()
        code_to_mdb[code_key(row.get("MN_CODE"))] = str(row.get("MN_MDB_C") or "").strip().upper()
    reader.close()

    joined: dict[str, dict] = {}
    matched = 0
    for code, stats in lang_2011.items():
        mdb = code_to_mdb.get(code, "")
        row_2022 = parsed.get(mdb, {})
        if row_2022.get("popg") or row_2022.get("fb") is not None:
            matched += 1
        joined[code] = {
            "name": stats.get("name"),
            "population": row_2022.get("population") or stats.get("population"),
            "lang": stats.get("lang"),
            "popg": row_2022.get("popg") or stats.get("popg"),
            "fb": row_2022.get("fb") or 0,
        }

    print(f"joined {matched} of {len(joined)} 2011 munis to 2022 tables")
    out = ROOT / "data" / "processed" / "muni-2022.geojsonl"
    write_geojsonl(RAW / "MN_SA_20.shp", out, joined, "MN_CODE", ["MN_NAME"])
    tippecanoe(out, TILES / "muni-2022.pmtiles", "muni", 10)
    write_meta()


if __name__ == "__main__":
    main()
