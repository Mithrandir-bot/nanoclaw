#!/usr/bin/env python3
"""Analyze GSA listings for shipping availability and save FBA scores.
Reads from the live API and saves shipping data for the dashboard.
Run hourly after the GSA monitor scan."""

import json, re, os, sys

API_KEY = os.environ.get('GSA_API_KEY', 'DEMO_KEY')
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
OUTPUT = os.path.join(DATA_DIR, 'gsa-shipping-data.json')
CACHE = '/tmp/gsa-all.json'

# Use cached data if less than 30 min old
import time
if os.path.exists(CACHE) and time.time() - os.path.getmtime(CACHE) < 1800:
    with open(CACHE) as f:
        data = json.load(f)
    results = data.get('Results', [])
    print(f'Using cached data: {len(results)} listings')
else:
    import urllib.request
    url = f'https://api.gsa.gov/assets/gsaauctions/v2/auctions?api_key={API_KEY}&format=JSON'
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    # Follow redirects
    try:
        resp = urllib.request.urlopen(req)
        raw = resp.read().decode()
    except urllib.error.HTTPError as e:
        if e.code == 303:
            redirect_url = e.headers.get('Location', url)
            resp = urllib.request.urlopen(redirect_url)
            raw = resp.read().decode()
        else:
            raise
    data = json.loads(raw)
    results = data.get('Results', [])
    with open(CACHE, 'w') as f:
        json.dump(data, f)
    print(f'Fetched from API: {len(results)} listings')

ship_data = {}
stats = {'shippable': 0, 'pickup': 0, 'unclear': 0, 'total': len(results)}

for r in results:
    name = (r.get('itemName', '') or '').strip()
    instruction = (r.get('instruction', '') or '').lower()
    lot_raw = r.get('lotInfo', '')
    if isinstance(lot_raw, list):
        lot_info = ' '.join(str(l.get('LotDescript', '') or l.get('lotDescript', '')) for l in lot_raw).lower()
    else:
        lot_info = re.sub(r'<[^>]+>', ' ', str(lot_raw or '')).lower()

    desc_url = r.get('itemDescURL', '')
    m = re.search(r'/(\d+)', desc_url or '')
    aid = m.group(1) if m else ''
    if not aid:
        continue

    combined = instruction + ' ' + lot_info
    # Shipping detection - check lotInfo deeply, not just instruction
    ship_positive = bool(re.search(r'will be shipped|shipping (is )?available|can be shipped|ship(ped)? (via|by|to|through)|freight (will|can|available)|common carrier|ups|fedex|usps|parcel ship|f\.?o\.?b\.?\s*destination|we will ship|shipping included|shipping at buyer|buyer.*shipping', combined))
    # Hard NO shipping - explicit statements that shipping is impossible
    ship_hard_no = bool(re.search(
        r'no\s*ship(ping)?\s*(option|available|will be)|'
        r'will not (be )?ship|'
        r'cannot (be )?ship|'
        r'pick\s*-?\s*up\s*only|'
        r'pickup\s*only|'
        r'local\s*pick\s*-?\s*up\s*only|'
        r'on[\s-]*site\s*(pick\s*-?\s*up|removal)\s*only|'
        r'must (be picked up|pick up)|'
        r'in[\s-]*person\s*(pick|remov|only)',
        combined
    ))

    # "Responsible for removal" is standard GSA boilerplate = buyer arranges own shipping
    # This does NOT mean pickup only - it means GSA won't ship FOR you
    # Only flag as pickup if ALSO one of the hard-no patterns matches

    # Also check if listing mentions packing/crating (implies large item, buyer arranges freight)
    needs_freight = bool(re.search(r'packing.*crating|crating.*banding|loading.*dock|forklift|palletiz|freight|flatbed|heavy.*lift', combined))

    if ship_hard_no:
        shippable = False
    elif ship_positive:
        shippable = True
    elif needs_freight:
        # Large item requiring packing/crating/loading dock = technically shippable via freight
        # but NOT FBA-friendly, treat as local-preferred
        shippable = 'freight'
    else:
        # Standard boilerplate — small/medium items are likely parcel-shippable
        uname = name.upper()
        if re.search(r'LAPTOP|TABLET|IPAD|PHONE|GPS|CAMERA|TOOL|RADIO|METER|BATTERY|CHARGER|CASE|BAG|BOOK|SMALL|PORTABLE', uname):
            shippable = True  # Small items — definitely shippable
        elif re.search(r'VEHICLE|TRUCK|CAR|VAN|BUS|BOAT|TRAILER|FORKLIFT|CRANE|TRACTOR|AIRCRAFT|HELICOPTER', uname):
            shippable = False  # Vehicles — pickup/transport only
        else:
            shippable = None  # Unknown

    # FBA score
    uname = name.upper()
    if re.search(r'LAPTOP|COMPUTER|DELL|HP\s|LENOVO|SERVER|MONITOR|PRINTER|IPAD|TABLET|PHONE|SCANNER|SWITCH|ROUTER|CISCO|CPU|HEWLETT|TOUGHBOOK|SURFACE', uname):
        fba = 85
    elif re.search(r'CLOTHING|UNIFORM|BOOT|JACKET|VEST|BODY ARMOR', uname):
        fba = 80
    elif re.search(r'TOOL|DRILL|SAW|WRENCH|SOCKET|DEWALT|MILWAUKEE', uname):
        fba = 75
    elif re.search(r'CAMERA|PROJECTOR|GPS|METER|TEST|MULTIMETER|OSCILLOSCOPE|SPECTRUM|ANALYZER|SIGNAL', uname):
        fba = 70
    elif re.search(r'PARTS|COMPONENTS|ACCESSORIES|SUPPLIES|KIT', uname):
        fba = 60
    elif re.search(r'MEDICAL|SURGICAL|DEFIBRILLATOR|VENTILATOR|WHEELCHAIR', uname):
        fba = 50
    elif re.search(r'FURNITURE|DESK|CHAIR|TABLE|CABINET|SHELVING|LOCKER', uname):
        fba = 10
    elif re.search(r'FORD|CHEVY|CHEVROLET|DODGE|RAM|TOYOTA|HONDA|GMC|JEEP|SEDAN|TRUCK|SUV|VAN|BUS|HUMVEE', uname):
        fba = 5
    elif re.search(r'ENGINE|MOTOR|TURBINE|GENERATOR|FORKLIFT|CRANE|TRACTOR|BACKHOE|BLACKHAWK|AIRCRAFT|HELICOPTER|BOAT', uname):
        fba = 5
    elif re.search(r'SCRAP|TERM CONTRACT|BULK|DEMOLITION|HAZMAT|WASTE', uname):
        fba = 0
    else:
        fba = 30

    # Condition detection - read lotInfo carefully for condition language
    hard_broken_kw = (
        r'not working|not operational|broken|inoperable|non-functional|defective|'
        r'does not work|does not run|does not start|does not power|no power|non-working|'
        r'for parts\s*(only)?|parts only|salvage\s*(only|condition)?|'
        r'beyond (economical )?repair|beyond repair|condemned|'
        r'unserviceable|non-?serviceable|inoperative'
    )
    needs_work_kw = (
        r'needs repair|needs work|'
        r'repairable condition|'
        r'significant(ly)? damage|heavily damaged|'
        r'believed to be serviceable|'
        r'has not been (used|operated) in (years|months|a long)|not been used in years|'
        r'rust(ed|ing)\b|corroded|corrosion'
    )
    # NOTE: "repairs may be required" and "parts may be missing" are standard GSA boilerplate
    # on nearly every listing — do NOT treat as condition issues

    # Access friction — security clearance, licensing, special requirements
    has_access_friction = bool(re.search(
        r'real id|homeland security|security clearance|security requirement|'
        r'statement of intent|proof of licens|valid licens|'
        r'background check|escort(ed)? (by|at all times)|military (base|installation)|'
        r'restricted (area|access|facility)|classified|'
        r'hazmat certif|dot certif|epa (certif|licens)|'
        r'payment will be blocked',
        combined
    ))

    # Apply access friction penalty to FBA score
    if has_access_friction:
        fba = max(0, fba - 20)
    untested_kw = (
        r'not tested|untested|not been tested|unable to test|'
        r'condition unknown|condition not (verified|known|determined)|'
        r'sold as[- ]is|as[- ]is (condition|basis|sale)|'
        r'no guarantee|no warranty|without warranty'
    )

    if re.search(hard_broken_kw, combined):
        condition = 'broken'
    elif re.search(needs_work_kw, combined):
        condition = 'needs_work'
    elif re.search(untested_kw, combined):
        condition = 'untested'
    else:
        condition = 'ok'

    # Override with explicitly stated condition (e.g. "condition is listed as repairable")
    # This is more authoritative than keyword matching
    stated_cond = re.search(r'condition\s+(?:is\s+)?(?:listed\s+as|rated|classified\s+(?:as|in))\s+(\w+)', combined)
    if stated_cond:
        cond_word = stated_cond.group(1).lower()
        if cond_word in ('salvage', 'scrap', 'condemned', 'unserviceable'):
            condition = 'broken'
        elif cond_word in ('repairable', 'fair', 'poor'):
            condition = 'needs_work'
        # 'usable', 'good', 'excellent' don't override — keep current condition

    # De-prioritize based on shipping
    if shippable == False:
        fba = max(0, fba - 50)    # True pickup only — heavy penalty
    elif shippable == 'freight':
        fba = max(0, fba - 30)    # Needs freight — not FBA, still sellable
    elif shippable is None:
        fba = max(0, fba - 10)    # Unknown — mild penalty

    # De-prioritize broken/damaged items
    if condition == 'broken':
        fba = max(0, fba - 40)
    elif condition == 'needs_work':
        fba = max(0, fba - 25)
    elif condition == 'untested':
        fba = max(0, fba - 10)

    ship_data[aid] = {'shippable': shippable, 'fba_adjusted': fba, 'condition': condition, 'access_friction': has_access_friction}

    if shippable == True: stats['shippable'] += 1
    elif shippable == False: stats['pickup'] += 1
    else: stats['unclear'] += 1

with open(OUTPUT, 'w') as f:
    json.dump(ship_data, f, indent=2)

print(f'Saved: {len(ship_data)} items')
print(f'Shippable: {stats["shippable"]} | Pickup: {stats["pickup"]} | Unclear: {stats["unclear"]}')
