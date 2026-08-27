#!/usr/bin/env python3
"""Parse Census 2022 statistics from the Stats SA provincial-profile PDFs.

Municipality-level metrics (keyed by MDB code): marital status, highest level of
education, tenure status, energy source for lighting.
Province-level metrics: language (Census 2022) and religious affiliation.

Every municipal row is validated so its category counts reconcile to the printed
total. The PDFs are inconsistent across provinces (varying table numbers/titles,
`100` vs `100,0` vs bare-number totals, 1-2 decimal and dropped-decimal
percentages, wrapped rows, renamed/missing categories, and name-keyed rows), and
this parser handles all of those cases.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_2022 import pdf_text, CODE_RE, normalize_code, shapefile_names, match_place  # noqa: E402

PROV_NAME = {'EC': 'Eastern Cape', 'FS': 'Free State', 'GT': 'Gauteng', 'KZN': 'KwaZulu-Natal',
             'LIM': 'Limpopo', 'MP': 'Mpumalanga', 'NW': 'North West', 'NC': 'Northern Cape',
             'WC': 'Western Cape'}

PCT = r'-?\d{1,3},\d{1,2}'
HDR = r'(?:N|Number)\s+(?:%|Percent)'   # data-header cell: "N %" or "Number Percent"

# --- municipal metrics: canonical categories (label, [header synonyms], colour) ---
MUNI_METRICS = {
    'marital': {
        'anchors': ['Never married', 'Widowed'],
        'cats': [
            ('Legally married', ['legally married'], '#e2b33a'),
            ('Living together', ['living together'], '#8fbf3a'),
            ('Divorced', ['divorced'], '#c44f9a'),
            ('Separated', ['separated'], '#d45a6a'),
            ('Widowed', ['widowed'], '#7a8894'),
            ('Never married', ['never married'], '#4c7bd9'),
        ],
    },
    'education': {
        'anchors': ['No schooling', 'Some primary'],
        'cats': [
            ('No schooling', ['no schooling'], '#8a2f2f'),
            ('Some primary', ['some primary'], '#c47a3a'),
            ('Completed primary', ['completed primary'], '#e0a63a'),
            ('Some secondary', ['some secondary'], '#e2c94a'),
            ('Completed secondary', ['completed secondary', 'grade 12', 'matric'], '#8fbf3a'),
            ('Higher education', ['tertiary', 'higher'], '#2f8f5b'),
            ('Other', ['other'], '#b9b3a8'),
        ],
    },
    'tenure': {
        'anchors': ['Rented', 'Occupied rent'],
        'cats': [
            ('Owned, fully paid', ['fully paid'], '#2f8f5b'),
            ('Owned, not paid off', ['not yet paid'], '#8fbf3a'),
            ('Rented', ['rented'], '#4c7bd9'),
            ('Occupied rent-free', ['rent-free', 'rent free'], '#e2b33a'),
            ('Other', ['other'], '#c47a3a'),
            ('Do not know', ['do not know'], '#b9b3a8'),
        ],
    },
    'lighting': {
        'anchors': ['Candles'],
        'cats': [
            ('Electricity', ['electricity'], '#e2b33a'),
            ('Gas', ['gas'], '#4c7bd9'),
            ('Paraffin', ['paraffin'], '#c44f9a'),
            ('Candles', ['candles'], '#e0702e'),
            ('Solar', ['solar'], '#2f8f5b'),
            ('Other', ['other'], '#8fbf3a'),
            ('None', ['none'], '#7a8894'),
        ],
    },
}

# --- province language (Census 2022) maps onto the existing language catalog ---
LANG_SYNS = {
    'zul': ['isizulu'], 'xho': ['isixhosa'], 'afr': ['afrikaans'], 'eng': ['english'],
    'nso': ['sepedi'], 'sot': ['sesotho'], 'tsn': ['setswana'], 'ssw': ['siswati'],
    'ven': ['tshivenda'], 'tso': ['xitsonga'], 'nbl': ['isindebele'],
    'sgn': ['sign language'], 'oth': ['other'],
}

# --- province religion palette (Census 2022 Table 2.12) ---
RELIGION = [
    ('Christianity', ['christianity'], '#4c7bd9'),
    ('Islam', ['islam'], '#2f8f5b'),
    ('Traditional African', ['traditional african'], '#e0702e'),
    ('Hinduism', ['hinduism'], '#c44f9a'),
    ('Judaism', ['judaism'], '#e2b33a'),
    ('Other beliefs', ['other beliefs', 'bahaism', 'buddhism'], '#8a5ac8'),
    ('Atheism/Agnosticism', ['atheism', 'agnosticism'], '#7a8894'),
    ('No affiliation', ['no religious'], '#b9b3a8'),
    ('Other', ['other'], '#9aa0a6'),
]


def detect_province(text):
    counts = {}
    for m in CODE_RE.finditer(text):
        pref = re.match(r'[A-Z]+', normalize_code(m.group(1))).group(0)
        if pref in PROV_NAME:
            counts[pref] = counts.get(pref, 0) + 1
    return max(counts, key=counts.get) if counts else None


def last_run(s):
    runs = re.findall(r'\d(?:[ \d]*\d)?', s)
    return int(runs[-1].replace(' ', '')) if runs else None


def get_tables(text, anchors):
    """All fragments (a paginated table repeats its 'N %' header per page)."""
    anch = [re.compile(r'\s+'.join(re.escape(w) for w in a.split()), re.I) for a in anchors]
    out = []
    for hm in re.finditer(r'(?:' + HDR + r'\s*){2,}', text):
        pre = text[max(0, hm.start() - 430): hm.start()]
        if not all(r.search(pre) for r in anch):
            continue
        rows, miss = [], 0
        for ln in text[hm.end():].split('\n'):
            s = ln.strip()
            if s == '':
                continue
            if re.match(r'(?:Table|Figure|Source|Note)\b', s) or re.search(r'N\s+%\s+N\s+%', s):
                break
            if len(re.findall(PCT, s)) >= 2 or re.search(r'\b100(?:,\d)?\s*$', s):
                if len(s) >= 6:
                    rows.append(ln)
                miss = 0
            else:
                miss += 1
                if miss >= 8:
                    break
        if sum(1 for r in rows if len(re.findall(PCT, r)) >= 2 or re.search(r'\b100(?:,\d)?\s*$', r.strip())) >= 1:
            out.append(pre[-430:] + '\nN % \n' + '\n'.join(rows))
    return out


def header_categories(chunk, cats):
    m = re.search(r'\bN\s+%\b', chunk)
    header = chunk[:m.start()] if m else chunk[:700]
    dm = re.search(r'District|Municipality|Province', header)
    if dm:
        header = header[dm.start():]
    hl = re.sub(r'\s+', ' ', header).lower()
    present = []
    for entry in cats:
        key, syns = entry[0], entry[1]
        best = -1
        for s in syns:
            pat = re.compile(r'[\s-]*'.join(re.escape(w) for w in s.split()))
            mm = pat.search(hl)
            if mm and (best < 0 or mm.start() < best):
                best = mm.start()
        if best >= 0:
            present.append((best, key))
    present.sort()
    return [k for _, k in present]


def row_values(tail):
    if len(re.findall(PCT, tail)) < 2:
        return None
    pieces = re.split(PCT, tail)
    if re.search(r'\b100,\d\s*$', tail.strip()):
        cat_pieces, total_region = pieces[:-2], pieces[-2]
    else:
        cat_pieces, total_region = pieces[:-1], pieces[-1]
    cats = [c for c in (last_run(p) for p in cat_pieces) if c is not None]
    total = last_run(re.sub(r'\s+100\s*$', ' ', total_region))
    if not cats or total is None:
        return None
    return cats, total


def row_values_fs(tail):
    """Fallback for PDFs that drop the decimal on some percentages (Free State)."""
    toks = re.findall(r'\d{1,3}(?: \d{3})+|\d+,\d{1,2}|\d+', tail)
    counts, i, expect_count, guard = [], 0, True, 0
    while i < len(toks) and guard < 500:
        guard += 1
        t = toks[i]
        if t == '':
            i += 1; continue
        if expect_count:
            if ',' in t:
                i += 1; continue
            counts.append(int(t.replace(' ', ''))); expect_count = False; i += 1
        else:
            if ',' in t:
                expect_count = True; i += 1
            elif ' ' not in t and int(t) <= 100:
                expect_count = True; i += 1
            else:
                rest = ' '.join(t.split()[1:])
                toks[i] = rest
                expect_count = True
                if rest == '':
                    i += 1
    if len(counts) < 2:
        return None
    cats, total = counts[:-1], counts[-1]
    if str(total).endswith('100'):
        cand = int(str(total)[:-3] or 0)
        if cand and abs(cand - sum(cats)) <= 0.02 * sum(cats):
            total = cand
    return cats, total


def _clean(rv):
    return bool(rv and rv[1] and abs(sum(rv[0]) - rv[1]) / rv[1] <= 0.01)


def parse_muni_metric(text, metric, names):
    """Return {mdb_code: {category_label: count}} for a municipal metric. Category
    counts are validated (reconcile to the printed total) and mapped positionally
    to the metric's canonical column order (Stats SA keeps a consistent order;
    any extra trailing column is dropped)."""
    spec = MUNI_METRICS[metric]
    labels = [c[0] for c in spec['cats']]
    out = {}
    for chunk in get_tables(text, spec['anchors']):
        for line in chunk.split('\n'):
            s = line.strip()
            if len(s) < 8:
                continue
            cm = CODE_RE.search(s)
            if cm:
                code, tail = normalize_code(cm.group(1)), s[cm.end():]
            elif re.match(r'DC\d', s):
                continue
            else:
                mdb = match_place(s, names)
                if not mdb:
                    continue
                code, tail = mdb, s
            if code.startswith('DC'):
                continue
            rv = row_values(tail)
            if not _clean(rv):
                rv2 = row_values_fs(tail)
                if rv2 is not None:
                    rv = rv2
            if not rv or not _clean(rv):
                continue
            cats, _ = rv
            n = min(len(cats), len(labels))
            out[code] = {labels[i]: cats[i] for i in range(n)}
    return out


def _prov_nums(s):
    """Counts from a province category row, tolerant of integer (dropped-decimal)
    percentages: alternate count,%,count,%,… and return the counts."""
    toks = re.findall(r'\d{1,3}(?: \d{3})+|\d+,\d{1,2}|\d+', s)
    counts, i, expect_count, guard = [], 0, True, 0
    while i < len(toks) and guard < 100:
        guard += 1
        t = toks[i]
        if expect_count:
            if ',' in t:
                i += 1; continue
            counts.append(int(t.replace(' ', ''))); expect_count = False; i += 1
        else:
            if ',' in t:
                expect_count = True; i += 1
            elif ' ' not in t and int(t) <= 100:
                expect_count = True; i += 1
            else:
                rest = ' '.join(t.split()[1:]); toks[i] = rest; expect_count = True
                if rest == '':
                    i += 1
    return counts


def _prov_rows(text, row_anchors):
    """Province category tables list categories as ROWS (e.g. languages, religions).
    Find the 'N %' header whose following rows contain the anchor labels, then read
    those rows. Returns {row_text_lower: [N per column]}."""
    best = {}
    for hm in re.finditer(r'(?:' + HDR + r'\s*){1,}', text):
        seg = text[hm.end(): hm.end() + 5000]
        if sum(1 for a in row_anchors if re.search(re.escape(a), seg, re.I)) < 2:
            continue
        rows, miss = {}, 0
        for line in seg.split('\n'):
            s = line.strip()
            if s == '':
                continue
            if re.match(r'(?:Table|Figure|Source|Note)\b', s) or re.search(r'N\s+%\s+N\s+%', s):
                break
            if not re.match(r'[A-Za-z]', s):     # category rows start with a label
                miss += 1
                if miss >= 6:
                    break
                continue
            nums = _prov_nums(s)
            if nums:
                rows[re.sub(r'\s+', ' ', s).lower()] = nums
                miss = 0
            else:
                miss += 1
                if miss >= 6:
                    break
        # require anchor labels to be actual data rows (>=2 of 3, tolerating a
        # missing category), not just prose nearby
        if sum(1 for a in row_anchors if any(a.lower() in low for low in rows)) < 2:
            continue
        if len(rows) > len(best):
            best = rows
    return best


def parse_province_language(text):
    """{lang_id: count_2022} for the province this PDF covers."""
    rows = _prov_rows(text, ['IsiZulu', 'Afrikaans', 'IsiXhosa'])
    out = {}
    for lid, syns in LANG_SYNS.items():
        for low, vals in rows.items():
            if any(low.startswith(sy) for sy in syns) and len(vals) >= 2:
                out[lid] = vals[1]        # Census 2022 column
                break
    return out


def parse_province_religion(text):
    """{religion_label: count} for the province this PDF covers."""
    rows = _prov_rows(text, ['Christianity', 'Hinduism', 'Islam'])
    out = {}
    used = set()
    for label, syns, _color in RELIGION:
        for low, vals in rows.items():
            if low in used:
                continue
            if any(low.startswith(sy) for sy in syns) and vals:
                out[label] = vals[0]
                used.add(low)
                break
    return out


PROV_POP_NAMES = {
    "western cape": "WC",
    "eastern cape": "EC",
    "northern cape": "NC",
    "free state": "FS",
    "kwazulu-natal": "KZN",
    "north west": "NW",
    "gauteng": "GT",
    "mpumalanga": "MP",
    "limpopo": "LIM",
}


def parse_province_population(text: str) -> dict[str, int]:
    """National Table 2.1: {province_code: Census 2022 population}."""
    from build_2022 import longest_table

    chunk = longest_table(text, "Table 2.1:")
    out: dict[str, int] = {}
    for line in chunk.splitlines():
        low = line.strip().lower()
        code = None
        for name, prov in PROV_POP_NAMES.items():
            if low.startswith(name):
                code = prov
                break
        if not code:
            continue
        nums = [int(n.replace(" ", "")) for n in re.findall(r"\d{1,3}(?: \d{3})+|\d+", line)]
        if len(nums) >= 4:
            out[code] = nums[3]
    return out


def parse_profile(path: Path, names: list[tuple[str, str]]) -> dict:
    text = pdf_text(path)
    prov = detect_province(text)
    if not prov:
        return {}
    return {
        "province": prov,
        "marital": parse_muni_metric(text, "marital", names),
        "education": parse_muni_metric(text, "education", names),
        "tenure": parse_muni_metric(text, "tenure", names),
        "lighting": parse_muni_metric(text, "lighting", names),
        "language": parse_province_language(text),
        "religion": parse_province_religion(text),
        "population": parse_province_population(text),
    }


def parse_all_profiles(pdf_dir: Path | None = None) -> dict:
    from build_2022 import REPORTS

    pdf_dir = pdf_dir or Path(__file__).resolve().parents[1] / "data" / "raw" / "pdfs"
    names = shapefile_names()
    muni: dict[str, dict] = {}
    provinces: dict[str, dict] = {}
    national_pop: dict[str, int] = {}

    for num in REPORTS:
        path = pdf_dir / f"profile-{num}.pdf"
        if not path.exists():
            continue
        parsed = parse_profile(path, names)
        prov = parsed.get("province")
        if not prov:
            continue
        national_pop.update(parsed.get("population") or {})
        provinces.setdefault(prov, {})
        provinces[prov]["language"] = parsed.get("language") or provinces[prov].get("language") or {}
        provinces[prov]["religion"] = parsed.get("religion") or provinces[prov].get("religion") or {}
        for metric in MUNI_METRICS:
            for mdb, row in (parsed.get(metric) or {}).items():
                muni.setdefault(mdb, {})
                muni[mdb][metric] = row

    return {"municipalities": muni, "provinces": provinces, "population": national_pop}


def main() -> None:
    import json
    from build_2022 import REPORTS

    parsed = parse_all_profiles()
    out = Path(__file__).resolve().parents[1] / "data" / "raw" / "muni_2022_stats.json"
    out.write_text(json.dumps(parsed, indent=2))
    names = shapefile_names()
    print("wrote", out)
    total = 0
    for num in REPORTS:
        path = Path(__file__).resolve().parents[1] / "data" / "raw" / "pdfs" / f"profile-{num}.pdf"
        if not path.exists():
            continue
        parsed_one = parse_profile(path, names)
        prov = parsed_one.get("province", "?")
        counts = [len(parsed_one.get(m, {})) for m in MUNI_METRICS]
        total += sum(counts)
        lang = parsed_one.get("language") or {}
        rel = parsed_one.get("religion") or {}
        top_lang = max(lang, key=lang.get) if lang else None
        top_rel = max(rel, key=rel.get) if rel else None
        print(
            f"{prov}: muni{counts} | lang={len(lang)} top={top_lang} | relig={len(rel)} top={top_rel}"
        )
    print("muni total", total)


if __name__ == "__main__":
    main()
