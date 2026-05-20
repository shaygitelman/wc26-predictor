"""
Authoritative WC 2026 structural configuration.

Official FIFA format:
  - 12 groups: A–L
  - 4 teams per group (48 teams total)
  - Top 2 per group qualify automatically → 24 teams in R32
  - Best 8 of 12 third-place teams also qualify → 32 total in R32
  - Round of 32 knockout stage

Groups from the official FIFA draw (December 4, 2025).
"""

GROUP_ORDER: list[str] = list("ABCDEFGHIJKL")
TEAMS_PER_GROUP:    int = 4
AUTO_QUALIFY:       int = 2
BEST_THIRD_QUALIFY: int = 8

_F = "https://flagcdn.com/w40/{cc}.png"

# Official group draw.
# Each entry: (canonical_fifa_code, display_name, flag_url)
GROUPS: dict[str, list[tuple[str, str, str | None]]] = {
    "A": [
        ("CZE", "Czech Republic",       _F.format(cc="cz")),
        ("MEX", "Mexico",               _F.format(cc="mx")),
        ("RSA", "South Africa",         _F.format(cc="za")),
        ("KOR", "South Korea",          _F.format(cc="kr")),
    ],
    "B": [
        ("SUI", "Switzerland",          _F.format(cc="ch")),
        ("BIH", "Bosnia & Herzegovina", _F.format(cc="ba")),
        ("CAN", "Canada",               _F.format(cc="ca")),
        ("QAT", "Qatar",                _F.format(cc="qa")),
    ],
    "C": [
        ("SCO", "Scotland",             _F.format(cc="gb-sct")),
        ("BRA", "Brazil",               _F.format(cc="br")),
        ("HAI", "Haiti",                _F.format(cc="ht")),
        ("MAR", "Morocco",              _F.format(cc="ma")),
    ],
    "D": [
        ("TUR", "Türkiye",              _F.format(cc="tr")),
        ("PAR", "Paraguay",             _F.format(cc="py")),
        ("USA", "USA",                  _F.format(cc="us")),
        ("AUS", "Australia",            _F.format(cc="au")),
    ],
    "E": [
        ("GER", "Germany",              _F.format(cc="de")),
        ("ECU", "Ecuador",              _F.format(cc="ec")),
        ("CIV", "Ivory Coast",          _F.format(cc="ci")),
        ("CUW", "Curaçao",              _F.format(cc="cw")),
    ],
    "F": [
        ("SWE", "Sweden",               _F.format(cc="se")),
        ("NED", "Netherlands",          _F.format(cc="nl")),
        ("TUN", "Tunisia",              _F.format(cc="tn")),
        ("JPN", "Japan",                _F.format(cc="jp")),
    ],
    "G": [
        ("BEL", "Belgium",              _F.format(cc="be")),
        ("EGY", "Egypt",                _F.format(cc="eg")),
        ("IRN", "Iran",                 _F.format(cc="ir")),
        ("NZL", "New Zealand",          _F.format(cc="nz")),
    ],
    "H": [
        ("ESP", "Spain",                _F.format(cc="es")),
        ("URU", "Uruguay",              _F.format(cc="uy")),
        ("CPV", "Cape Verde",           _F.format(cc="cv")),
        ("KSA", "Saudi Arabia",         _F.format(cc="sa")),
    ],
    "I": [
        ("FRA", "France",               _F.format(cc="fr")),
        ("NOR", "Norway",               _F.format(cc="no")),
        ("SEN", "Senegal",              _F.format(cc="sn")),
        ("IRQ", "Iraq",                 _F.format(cc="iq")),
    ],
    "J": [
        ("AUT", "Austria",              _F.format(cc="at")),
        ("ARG", "Argentina",            _F.format(cc="ar")),
        ("ALG", "Algeria",              _F.format(cc="dz")),
        ("JOR", "Jordan",               _F.format(cc="jo")),
    ],
    "K": [
        ("POR", "Portugal",             _F.format(cc="pt")),
        ("COL", "Colombia",             _F.format(cc="co")),
        ("COD", "Congo DR",             _F.format(cc="cd")),
        ("UZB", "Uzbekistan",           _F.format(cc="uz")),
    ],
    "L": [
        ("CRO", "Croatia",              _F.format(cc="hr")),
        ("ENG", "England",              _F.format(cc="gb-eng")),
        ("GHA", "Ghana",                _F.format(cc="gh")),
        ("PAN", "Panama",               _F.format(cc="pa")),
    ],
}

# Canonical group lookup: our FIFA code → group letter (A–L).
# Primary authoritative source for the groups router — overrides any
# inconsistent group letters the provider sync may produce.
CODE_TO_GROUP: dict[str, str] = {
    code: g
    for g, slots in GROUPS.items()
    for (code, _, _) in slots
}

# Reverse: group → list of canonical codes (for display ordering)
GROUP_TO_CODES: dict[str, list[str]] = {
    g: [code for (code, _, _) in slots]
    for g, slots in GROUPS.items()
}

# API-Football team ID (string) → our canonical FIFA code.
# Required because API-Football's own code field has collisions and
# inconsistencies (e.g. both Australia and Austria return "AUS").
APIFOOTBALL_ID_TO_CODE: dict[str, str] = {
    "770":  "CZE",   # Czech Republic
    "16":   "MEX",   # Mexico
    "1531": "RSA",   # South Africa
    "17":   "KOR",   # South Korea
    "15":   "SUI",   # Switzerland
    "1113": "BIH",   # Bosnia & Herzegovina
    "5529": "CAN",   # Canada
    "1569": "QAT",   # Qatar
    "1108": "SCO",   # Scotland
    "6":    "BRA",   # Brazil
    "2386": "HAI",   # Haiti
    "31":   "MAR",   # Morocco
    "777":  "TUR",   # Türkiye
    "2380": "PAR",   # Paraguay
    "2384": "USA",   # USA
    "20":   "AUS",   # Australia
    "25":   "GER",   # Germany
    "2382": "ECU",   # Ecuador
    "1501": "CIV",   # Ivory Coast
    "5530": "CUW",   # Curaçao
    "5":    "SWE",   # Sweden
    "1118": "NED",   # Netherlands
    "28":   "TUN",   # Tunisia
    "12":   "JPN",   # Japan
    "1":    "BEL",   # Belgium
    "32":   "EGY",   # Egypt
    "22":   "IRN",   # Iran
    "4673": "NZL",   # New Zealand
    "9":    "ESP",   # Spain
    "7":    "URU",   # Uruguay
    "1533": "CPV",   # Cape Verde
    "23":   "KSA",   # Saudi Arabia
    "2":    "FRA",   # France
    "1090": "NOR",   # Norway
    "13":   "SEN",   # Senegal
    "1567": "IRQ",   # Iraq
    "775":  "AUT",   # Austria
    "26":   "ARG",   # Argentina
    "1532": "ALG",   # Algeria
    "1548": "JOR",   # Jordan
    "27":   "POR",   # Portugal
    "8":    "COL",   # Colombia
    "1508": "COD",   # Congo DR
    "1568": "UZB",   # Uzbekistan
    "3":    "CRO",   # Croatia
    "10":   "ENG",   # England
    "1504": "GHA",   # Ghana
    "11":   "PAN",   # Panama
}

# Convenience: flag URL by canonical code (derived from GROUPS)
CODE_TO_FLAG: dict[str, str | None] = {
    code: flag
    for slots in GROUPS.values()
    for (code, _, flag) in slots
}

# Convenience: display name by canonical code
CODE_TO_NAME: dict[str, str] = {
    code: name
    for slots in GROUPS.values()
    for (code, name, _) in slots
}

# All 16 confirmed WC 2026 host stadiums with their city and country.
WC2026_HOST_VENUES: list[dict[str, str]] = [
    # United States (11)
    {"stadium": "MetLife Stadium",          "city": "East Rutherford", "country": "USA"},
    {"stadium": "AT&T Stadium",             "city": "Arlington",       "country": "USA"},
    {"stadium": "NRG Stadium",              "city": "Houston",         "country": "USA"},
    {"stadium": "SoFi Stadium",             "city": "Inglewood",       "country": "USA"},
    {"stadium": "Levi's Stadium",           "city": "Santa Clara",     "country": "USA"},
    {"stadium": "Lincoln Financial Field",  "city": "Philadelphia",    "country": "USA"},
    {"stadium": "Mercedes-Benz Stadium",    "city": "Atlanta",         "country": "USA"},
    {"stadium": "Arrowhead Stadium",        "city": "Kansas City",     "country": "USA"},
    {"stadium": "Gillette Stadium",         "city": "Foxborough",      "country": "USA"},
    {"stadium": "Hard Rock Stadium",        "city": "Miami Gardens",   "country": "USA"},
    {"stadium": "Lumen Field",              "city": "Seattle",         "country": "USA"},
    # Canada (2)
    {"stadium": "BC Place",                 "city": "Vancouver",       "country": "Canada"},
    {"stadium": "BMO Field",                "city": "Toronto",         "country": "Canada"},
    # Mexico (3)
    {"stadium": "Estadio Azteca",           "city": "Mexico City",     "country": "Mexico"},
    {"stadium": "Estadio Akron",            "city": "Guadalajara",     "country": "Mexico"},
    {"stadium": "Estadio BBVA",             "city": "Monterrey",       "country": "Mexico"},
]

# Lookup: API-Football venue name (lowercase) → canonical city name.
# Used to recover the city when the provider supplies a stadium name but omits city.
WC2026_VENUE_CITY_MAP: dict[str, str] = {
    v["stadium"].lower(): v["city"]
    for v in WC2026_HOST_VENUES
}
