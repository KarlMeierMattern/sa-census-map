"""Language and population-group colours shared by the tile build."""

LANGUAGES = [
    {"id": "zul", "label": "isiZulu", "aliases": ["zulu", "isizulu"], "color": "#e2b33a"},
    {"id": "xho", "label": "isiXhosa", "aliases": ["xhosa", "isixhosa"], "color": "#2aa3a6"},
    {"id": "afr", "label": "Afrikaans", "aliases": ["afrikaans"], "color": "#e0702e"},
    {"id": "eng", "label": "English", "aliases": ["english"], "color": "#4c7bd9"},
    {"id": "nso", "label": "Sepedi", "aliases": ["sepedi", "northern sotho", "pedi"], "color": "#3fa34a"},
    {"id": "sot", "label": "Sesotho", "aliases": ["sesotho", "sotho", "southern sotho"], "color": "#8fbf3a"},
    {"id": "tsn", "label": "Setswana", "aliases": ["setswana", "tswana"], "color": "#c4c23a"},
    {"id": "ssw", "label": "siSwati", "aliases": ["siswati", "swati", "swazi"], "color": "#d45a6a"},
    {"id": "ven", "label": "Tshivenda", "aliases": ["tshivenda", "venda"], "color": "#8a5ac8"},
    {"id": "tso", "label": "Xitsonga", "aliases": ["xitsonga", "tsonga"], "color": "#c44f9a"},
    {"id": "nbl", "label": "isiNdebele", "aliases": ["isindebele", "ndebele"], "color": "#a0673a"},
    {"id": "sgn", "label": "Sign language", "aliases": ["sign", "sasl"], "color": "#7a8894"},
    {"id": "oth", "label": "Other", "aliases": ["other"], "color": "#b9b3a8"},
]

LANG_BY_LABEL = {row["label"].lower(): row for row in LANGUAGES}
LANG_BY_ID = {row["id"]: row for row in LANGUAGES}

POP_GROUPS = [
    {"id": "bl", "label": "Black African", "aliases": ["black", "african"], "color": "#2f8f5b"},
    {"id": "co", "label": "Coloured", "aliases": ["coloured", "colored"], "color": "#e07a3d"},
    {"id": "in", "label": "Indian or Asian", "aliases": ["indian", "asian"], "color": "#7b5cc4"},
    {"id": "wh", "label": "White", "aliases": ["white"], "color": "#4f8ed6"},
    {"id": "ot", "label": "Other", "aliases": ["other"], "color": "#9aa0a6"},
]

POP_BY_LABEL = {row["label"].lower(): row for row in POP_GROUPS}

# Census 2011 first-language shares, used to boost rarer groups when zoomed out.
NATIONAL_LANG_SHARE = {
    "zul": 0.227,
    "xho": 0.160,
    "afr": 0.135,
    "eng": 0.096,
    "nso": 0.091,
    "tsn": 0.080,
    "sot": 0.076,
    "tso": 0.045,
    "ssw": 0.025,
    "ven": 0.024,
    "nbl": 0.021,
    "sgn": 0.005,
    "oth": 0.016,
}

NATIONAL_POP_SHARE = {
    "bl": 0.791,
    "co": 0.089,
    "wh": 0.089,
    "in": 0.025,
    "ot": 0.006,
}

MARITAL_GROUPS = [
    {"id": "lma", "label": "Legally married", "color": "#e2b33a"},
    {"id": "liv", "label": "Living together", "color": "#8fbf3a"},
    {"id": "div", "label": "Divorced", "color": "#c44f9a"},
    {"id": "sep", "label": "Separated", "color": "#d45a6a"},
    {"id": "wid", "label": "Widowed", "color": "#7a8894"},
    {"id": "nev", "label": "Never married", "color": "#4c7bd9"},
]

EDUCATION_GROUPS = [
    {"id": "nos", "label": "No schooling", "color": "#8a2f2f"},
    {"id": "pri", "label": "Some primary", "color": "#c47a3a"},
    {"id": "prc", "label": "Completed primary", "color": "#e0a63a"},
    {"id": "sec", "label": "Some secondary", "color": "#e2c94a"},
    {"id": "mat", "label": "Completed secondary", "color": "#8fbf3a"},
    {"id": "ter", "label": "Higher education", "color": "#2f8f5b"},
    {"id": "edu", "label": "Other", "color": "#b9b3a8"},
]

TENURE_GROUPS = [
    {"id": "own", "label": "Owned, fully paid", "color": "#2f8f5b"},
    {"id": "pay", "label": "Owned, not paid off", "color": "#8fbf3a"},
    {"id": "ren", "label": "Rented", "color": "#4c7bd9"},
    {"id": "fre", "label": "Occupied rent-free", "color": "#e2b33a"},
    {"id": "ten", "label": "Other", "color": "#c47a3a"},
    {"id": "unk", "label": "Do not know", "color": "#b9b3a8"},
]

LIGHTING_GROUPS = [
    {"id": "ele", "label": "Electricity", "color": "#e2b33a"},
    {"id": "gas", "label": "Gas", "color": "#4c7bd9"},
    {"id": "par", "label": "Paraffin", "color": "#c44f9a"},
    {"id": "can", "label": "Candles", "color": "#e0702e"},
    {"id": "sol", "label": "Solar", "color": "#2f8f5b"},
    {"id": "lig", "label": "Other", "color": "#8fbf3a"},
    {"id": "non", "label": "None", "color": "#7a8894"},
]

RELIGION_GROUPS = [
    {"id": "chr", "label": "Christianity", "color": "#4c7bd9"},
    {"id": "isl", "label": "Islam", "color": "#2f8f5b"},
    {"id": "tra", "label": "Traditional African", "color": "#e0702e"},
    {"id": "hin", "label": "Hinduism", "color": "#c44f9a"},
    {"id": "jud", "label": "Judaism", "color": "#e2b33a"},
    {"id": "bel", "label": "Other beliefs", "color": "#8a5ac8"},
    {"id": "ath", "label": "Atheism/Agnosticism", "color": "#7a8894"},
    {"id": "nrp", "label": "No affiliation", "color": "#b9b3a8"},
    {"id": "rot", "label": "Other", "color": "#9aa0a6"},
]
