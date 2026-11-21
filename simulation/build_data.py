# -*- coding: utf-8 -*-
"""
build_data.py — φτιάχνει το data.js για το demo «Ψηφιακός Τροχονόμος».

Διαβάζει ΜΟΝΟ (read-only) τα καταγεγραμμένα δεδομένα ανιχνευτών της Περιφέρειας Αττικής
από το ../data/traffic/ και γράφει  window.DATA = {...}  στο ../app/data.js.

Τι είναι μετρημένο: ροή (οχ/ώρα), κατάληψη (%), ταχύτητα (km/h) ανά ανιχνευτή, ανά 5 λεπτά.
Τι είναι παραδοχή:  η αντιστοίχιση ανιχνευτή -> πρόσβαση κόμβου (από το κείμενο θέσης),
                    οι θέσεις των κόμβων (εκτίμηση από τις συντεταγμένες των ανιχνευτών),
                    οι λωρίδες (= πλήθος ανιχνευτών), και οι προσβάσεις χωρίς ανιχνευτή.

Εκτέλεση:  python build_data.py        (μόνο stdlib)
"""
import csv, glob, gzip, json, math, os, statistics, sys
import datetime as dt
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
TRAFFIC = os.path.join(ROOT, 'data', 'traffic')
META_GLOB = os.path.join(TRAFFIC, 'stations', '*_stations.jsonl.gz')
BIN_MIN = 5
NB = 24 * 60 // BIN_MIN
DST_SWITCH = '2026-10-25T01:00'      # πριν: UTC+3, μετά: UTC+2

# ---------------------------------------------------------------- κόμβοι
# dir   = φορά κίνησης στο ΣΧΗΜΑΤΙΚΟ (E: προς τα δεξιά, W: προς τα αριστερά, S: προς τα κάτω, N: προς τα πάνω)
# phase = 0 κύριος άξονας, 1 κάθετη οδός
# det   = ανιχνευτής που τροφοδοτεί την πρόσβαση, ή None -> ζήτηση-παραδοχή
#         (assume = [ανιχνευτής αναφοράς, ποσοστό της ροής του])
# up    = η πρόσβαση του ανάντη κόμβου που τροφοδοτεί αυτήν (μόνο στον διάδρομο)
SITES = [
  dict(
    id='alex', name='Λ. Αλεξάνδρας — διάδρομος 3 κόμβων', short='Λ. Αλεξάνδρας (διάδρομος)', kind='corridor',
    mainName='Λ. Αλεξάνδρας',
    axis={'E': 'προς Λ. Κηφισίας (Α)', 'W': 'προς Πατησίων (Δ)'},
    note='Ανάμεσα στην Ιπποκράτους και την Πανόρμου (≈850 m) υπάρχουν κι άλλοι σηματοδοτούμενοι κόμβοι που ΔΕΝ μοντελοποιούνται.',
    junctions=[
      dict(id='xt', name='Χαρ. Τρικούπη', pos=('MS415', 100, 'MS416', 85), approaches=[
        dict(id='xt_E', dir='E', phase=0, det='MS415', label='Λ. Αλεξάνδρας → Κηφισίας'),
        dict(id='xt_W', dir='W', phase=0, det='MS416', label='Λ. Αλεξάνδρας → Πατησίων', up='ip_W'),
        dict(id='xt_S', dir='S', phase=1, det=None, lanes=2, assume=['MS416', 0.30], label='Χαρ. Τρικούπη (κάθετη)'),
      ]),
      dict(id='ip', name='Ιπποκράτους', pos=('MS418', 80, 'MS419', 165), approaches=[
        dict(id='ip_E', dir='E', phase=0, det='MS418', label='Λ. Αλεξάνδρας → Κηφισίας', up='xt_E'),
        dict(id='ip_W', dir='W', phase=0, det='MS419', label='Λ. Αλεξάνδρας → Πατησίων', up='pn_W'),
        dict(id='ip_N', dir='N', phase=1, det=None, lanes=2, assume=['MS419', 0.30], label='Ιπποκράτους (κάθετη)'),
      ]),
      dict(id='pn', name='Πανόρμου / Σούτσου', pos=('MS421', 150, 'MS423', 80), approaches=[
        dict(id='pn_E', dir='E', phase=0, det='MS421', label='Λ. Αλεξάνδρας → Κηφισίας', up='ip_E'),
        dict(id='pn_W', dir='W', phase=0, det='MS423', label='Λ. Αλεξάνδρας → Πατησίων'),
        dict(id='pn_S', dir='S', phase=1, det='MS422', label='Πανόρμου → κέντρο'),
      ], unmodelled=['Σούτσου (από νότο): χωρίς ανιχνευτή — δεν μοντελοποιείται']),
    ]),
  dict(
    id='kif', name='Λ. Κηφισίας × Πανόρμου', short='Λ. Κηφισίας × Πανόρμου', kind='single',
    mainName='Λ. Κηφισίας',
    axis={'E': 'προς Κηφισιά (Β)', 'W': 'προς κέντρο (Ν)'},
    note='Το σχηματικό είναι στραμμένο: η Λ. Κηφισίας σχεδιάζεται οριζόντια.',
    junctions=[
      dict(id='kp', name='Λ. Κηφισίας × Πανόρμου', latlon=('MS500', 'MS503'), approaches=[
        dict(id='kp_E', dir='E', phase=0, det='MS260', label='Λ. Κηφισίας → Κηφισιά'),
        dict(id='kp_W', dir='W', phase=0, det='MS261', label='Λ. Κηφισίας → κέντρο'),
        dict(id='kp_S', dir='S', phase=1, det='MS262', label='Πανόρμου → Λ. Κηφισίας'),
      ], unmodelled=['Ερυθρού Σταυρού: ο μόνος ανιχνευτής (MS502) μετρά έξοδο από τον κόμβο — δεν μοντελοποιείται είσοδος']),
    ]),
  dict(
    id='iera', name='Κωνσταντινουπόλεως × Ιερά Οδός', short='Κων/πόλεως × Ιερά Οδός', kind='single',
    mainName='Κωνσταντινουπόλεως',
    axis={'E': 'προς Στ. Λαρίσης (ΒΑ)', 'W': 'προς Π. Ράλλη (ΝΔ)'},
    note='Το σχηματικό είναι στραμμένο: η Κωνσταντινουπόλεως σχεδιάζεται οριζόντια.',
    junctions=[
      dict(id='io', name='Κωνσταντινουπόλεως × Ιερά Οδός', pos=('MS655', 100, 'MS656', 140), approaches=[
        dict(id='io_E', dir='E', phase=0, det='MS658', label='Κωνσταντινουπόλεως → Στ. Λαρίσης'),
        dict(id='io_W', dir='W', phase=0, det='MS657', label='Κωνσταντινουπόλεως → Π. Ράλλη'),
        dict(id='io_N', dir='N', phase=1, det='MS655', label='Ιερά Οδός → Λ. Κηφισού'),
        dict(id='io_S', dir='S', phase=1, det=None, lanes=2, assume=['MS655', 1.00],
             label='Ιερά Οδός → Πειραιώς (ο MS656 υπάρχει αλλά δεν δίνει δεδομένα)'),
      ]),
    ]),
]
EXTRA_DETS = ['MS656', 'MS500', 'MS503']     # μόνο για θέση/χάρτη

DAYS = [
  dict(key='wk', type='wk', typical=True, label='Τυπική καθημερινή (διάμεσος)'),
  dict(key='we', type='we', typical=True, label='Τυπικό Σαββατοκύριακο (διάμεσος)'),
  dict(key='2026-11-03', type='wk', label='Τρίτη 3/11/2026'),
  dict(key='2026-11-06', type='wk', label='Παρασκευή 6/11/2026'),
  dict(key='2026-11-01', type='we', label='Κυριακή 1/11/2026 (κανονική)'),
  dict(key='2026-11-08', type='we', label='Κυριακή 8/11/2026 — Μαραθώνιος'),
]
WK_DATES = ['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03',
            '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10']   # χωρίς 28/10 (αργία)
WE_DATES = ['2026-10-25', '2026-10-31', '2026-11-01', '2026-11-07']                 # χωρίς 8/11 (Μαραθώνιος)


def local(ts):
    t = dt.datetime.strptime(ts[:19], '%Y-%m-%dT%H:%M:%S')
    return t + dt.timedelta(hours=3 if ts < DST_SWITCH else 2)


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def main():
    det_ids = set(EXTRA_DETS)
    for s in SITES:
        for j in s['junctions']:
            for a in j['approaches']:
                if a['det']:
                    det_ids.add(a['det'])
                if a.get('assume'):
                    det_ids.add(a['assume'][0])

    meta_file = sorted(glob.glob(META_GLOB), key=lambda p: os.path.basename(p))[-1]
    meta = {}
    with gzip.open(meta_file, 'rt', encoding='utf-8') as fh:
        for line in fh:
            r = json.loads(line)
            if r.get('id') in det_ids:
                meta[r['id']] = r

    # raw[det][date][bin] -> [sum_flow, n_flow, sum_occ, n_occ, sum_speed, n_speed]
    raw = {d: defaultdict(lambda: defaultdict(lambda: [0.0, 0, 0.0, 0, 0.0, 0])) for d in det_ids}
    files = sorted(glob.glob(os.path.join(TRAFFIC, '*.csv.gz')))
    nrows = 0
    for f in files:
        with gzip.open(f, 'rt', encoding='utf-8', newline='') as fh:
            rd = csv.reader(fh)
            next(rd)
            for row in rd:
                if len(row) < 6 or row[0] not in det_ids or row[1] != 'all' or row[2] < '2026-10-21':
                    continue
                c = num(row[3])
                if c is None:
                    continue
                t = local(row[2])
                cell = raw[row[0]][t.strftime('%Y-%m-%d')][(t.hour * 60 + t.minute) // BIN_MIN]
                cell[0] += c; cell[1] += 1
                o = num(row[4]); v = num(row[5])
                if o is not None: cell[2] += o; cell[3] += 1
                if v is not None and v > 0: cell[4] += v; cell[5] += 1
                nrows += 1
    print('αρχεία:', len(files), ' γραμμές που χρησιμοποιήθηκαν:', nrows, file=sys.stderr)

    def day_series(det, date):
        cells = raw[det].get(date, {})
        f = [None] * NB; o = [None] * NB; v = [None] * NB
        for b, c in cells.items():
            if c[1]: f[b] = c[0] / c[1]
            if c[3]: o[b] = c[2] / c[3]
            if c[5]: v[b] = c[4] / c[5]
        return f, o, v

    def fill(arr):
        """γραμμική παρεμβολή στα κενά· επιστρέφει (σειρά, πλήθος κενών 5λέπτων)"""
        idx = [i for i, x in enumerate(arr) if x is not None]
        gaps = NB - len(idx)
        if not idx:
            return [0.0] * NB, NB
        out = list(arr)
        for i in range(NB):
            if out[i] is None:
                lo = max([k for k in idx if k < i], default=None)
                hi = min([k for k in idx if k > i], default=None)
                if lo is None: out[i] = arr[hi]
                elif hi is None: out[i] = arr[lo]
                else: out[i] = arr[lo] + (arr[hi] - arr[lo]) * (i - lo) / (hi - lo)
        return out, gaps

    def median_series(det, dates):
        per = [day_series(det, d) for d in dates]
        res = []
        for k in range(3):
            arr = []
            for b in range(NB):
                vals = [p[k][b] for p in per if p[k][b] is not None]
                arr.append(statistics.median(vals) if vals else None)
            res.append(arr)
        return res

    detectors = {}
    for d in sorted(det_ids):
        m = meta.get(d, {})
        entry = dict(
            odos=m.get('odos'), thesi=m.get('perigrafi_thesis'), kat=m.get('kat_si'),
            n=int(m['anichneytes']) if m.get('anichneytes') else None,
            lat=m.get('latitude'), lon=m.get('longitude'), prof={}, gaps={})
        has_any = bool(raw[d])
        if has_any:
            for day in DAYS:
                if day['key'] == 'wk': f, o, v = median_series(d, WK_DATES)
                elif day['key'] == 'we': f, o, v = median_series(d, WE_DATES)
                else: f, o, v = day_series(d, day['key'])
                f, g = fill(f); o, _ = fill(o); v, _ = fill(v)
                entry['prof'][day['key']] = dict(f=[round(x) for x in f], o=[round(x, 1) for x in o], v=[round(x) for x in v])
                entry['gaps'][day['key']] = g
        entry['hasData'] = has_any
        detectors[d] = entry
        print(d, m.get('odos'), 'δεδομένα' if has_any else 'ΧΩΡΙΣ ΔΕΔΟΜΕΝΑ', entry['gaps'], file=sys.stderr)

    M_LAT = 111_320.0

    def interp(d1, m1, d2, m2):
        a, b = detectors[d1], detectors[d2]
        fr = m1 / (m1 + m2)
        return a['lat'] + (b['lat'] - a['lat']) * fr, a['lon'] + (b['lon'] - a['lon']) * fr

    def dist(p, q):
        dy = (p[0] - q[0]) * M_LAT
        dx = (p[1] - q[1]) * M_LAT * math.cos(math.radians(p[0]))
        return math.hypot(dx, dy)

    sites = []
    for s in SITES:
        js = []
        for j in s['junctions']:
            if 'pos' in j:
                lat, lon = interp(*j['pos'])
            else:
                a, b = detectors[j['latlon'][0]], detectors[j['latlon'][1]]
                lat, lon = (a['lat'] + b['lat']) / 2, (a['lon'] + b['lon']) / 2
            apps = []
            for a in j['approaches']:
                det = a['det']
                apps.append(dict(
                    id=a['id'], dir=a['dir'], phase=a['phase'], label=a['label'], det=det,
                    lanes=a.get('lanes') or detectors[det]['n'] or 2,
                    assume=a.get('assume'), up=a.get('up'),
                    detDist=round(dist((lat, lon), (detectors[det]['lat'], detectors[det]['lon']))) if det else None))
            js.append(dict(id=j['id'], name=j['name'], lat=round(lat, 6), lon=round(lon, 6),
                           approaches=apps, unmodelled=j.get('unmodelled', [])))
        pos = {j['id']: (j['lat'], j['lon']) for j in js}
        owner = {a['id']: j['id'] for j in js for a in j['approaches']}
        for j in js:
            for a in j['approaches']:
                if a['up']:
                    a['upDist'] = round(dist(pos[j['id']], pos[owner[a['up']]]))
        sites.append(dict(id=s['id'], name=s['name'], short=s['short'], kind=s['kind'], mainName=s['mainName'],
                          axis=s['axis'], note=s['note'], junctions=js))

    out = dict(
        generated=dt.datetime.now().strftime('%Y-%m-%d %H:%M'),
        source='Ανιχνευτές κυκλοφορίας Περιφέρειας Αττικής (Κέντρο Διαχείρισης Κυκλοφορίας) — καταγραφή 21/10–11/11/2026',
        binMin=BIN_MIN, days=DAYS, wkDates=WK_DATES, weDates=WE_DATES,
        detectors=detectors, sites=sites)
    js_path = os.path.join(ROOT, 'app', 'data.js')
    with open(js_path, 'w', encoding='utf-8') as fh:
        fh.write('// Παράγεται από το build_data.py — μην το επεξεργάζεστε με το χέρι.\n')
        fh.write('window.DATA = ')
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')
    print('έγραψα', js_path, os.path.getsize(js_path) // 1024, 'KB', file=sys.stderr)
    for s in sites:
        for j in s['junctions']:
            print(' ', s['id'], j['id'], j['name'], j['lat'], j['lon'],
                  [(a['id'], a['det'], a['lanes'], a.get('detDist'), a.get('upDist')) for a in j['approaches']], file=sys.stderr)


if __name__ == '__main__':
    main()
