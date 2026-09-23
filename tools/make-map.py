# Natural Earth（パブリックドメイン）の admin-1 から、都道府県クイズ用の簡略 SVG を作る
import json, math, sys
# 元データ: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
# 使い方: python3 tools/make-map.py <上の geojson> map.svg
d = json.load(open(sys.argv[1]))
feats = {f['properties']['iso_3166_2']: f for f in d['features'] if f['properties'].get('adm0_a3') == 'JPN'}
assert len(feats) == 47, len(feats)

def polys(g):
    return g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]

# 北方領土（歯舞群島・色丹島・国後島・択捉島）: ロシア側の地物から、この範囲にある多角形を取り出して北海道に足す
NT = (145.35, 43.20, 149.10, 45.60)
nt = []
for f in d['features']:
    if f['properties'].get('adm0_a3') != 'RUS':
        continue
    for poly in polys(f['geometry']):
        xs = [p[0] for p in poly[0]]; ys = [p[1] for p in poly[0]]
        if NT[0] <= min(xs) and max(xs) <= NT[2] and NT[1] <= min(ys) and max(ys) <= NT[3]:
            nt.append(poly)
print('northern territories polygons:', len(nt), file=sys.stderr)

LAT0 = math.radians(36)
def proj(lon, lat):
    return (lon * math.cos(LAT0), -lat)

def area(ring):
    a = 0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(a) / 2

def dp(pts, tol):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1e-12
    imax, dmax = 0, 0
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        dd = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / L
        if dd > dmax:
            imax, dmax = i, dd
    if dmax > tol:
        return dp(pts[:imax + 1], tol)[:-1] + dp(pts[imax:], tol)
    return [pts[0], pts[-1]]

TOL = 0.012          # 度（投影後）。小さいほど細かい
MIN_AREA = 0.0025    # これより小さい島は省く（度²）
# 沖縄と奄美（鹿児島の北緯 29 度より南）は左上の枠に移す
INSET = {'dx': 2.2, 'dy': -14.2}  # 投影後の平行移動量。沖縄を北緯 40 度・東経 130 度あたり（日本海の左上）へ

shapes = {}
for iso, f in feats.items():
    ps = polys(f['geometry'])
    if iso == 'JP-01':
        ps = ps + nt
    out = []
    for poly in ps:
        ring = poly[0]
        lat_c = sum(p[1] for p in ring) / len(ring)
        if iso == 'JP-13' and lat_c < 35:   # 東京都の島しょ部（伊豆諸島・小笠原）は省く
            continue
        pr = [proj(*p) for p in ring]
        if area(pr) < MIN_AREA:
            continue
        inset = iso == 'JP-47' or (iso == 'JP-46' and lat_c < 29)
        # 閉じた輪は始点と終点が同じなので、始点からいちばん遠い点で 2 つに分けて簡略化する
        far = max(range(len(pr)), key=lambda i: (pr[i][0] - pr[0][0]) ** 2 + (pr[i][1] - pr[0][1]) ** 2)
        s = dp(pr[:far + 1], TOL)[:-1] + dp(pr[far:], TOL)
        if len(s) < 4:
            continue
        if inset:
            s = [(x + INSET['dx'], y + INSET['dy']) for x, y in s]
        out.append((s, inset))
    shapes[iso] = (f['properties'], out)

allpts = [p for _, (_, out) in shapes.items() for s, _ in out for p in s]
minx = min(p[0] for p in allpts); maxx = max(p[0] for p in allpts)
miny = min(p[1] for p in allpts); maxy = max(p[1] for p in allpts)
W = 1000
sc = W / (maxx - minx)
H = (maxy - miny) * sc
pad = 10
def tx(p):
    return ((p[0] - minx) * sc + pad, (p[1] - miny) * sc + pad)

# 沖縄の枠は小さくてタッチしにくいので、枠の中身を INSET_SCALE 倍にして左上に寄せる
INSET_SCALE = 1.4
ins = [tx(p) for _, (_, out) in shapes.items() for s, inset in out if inset for p in s]
icx = (min(p[0] for p in ins) + max(p[0] for p in ins)) / 2
icy = (min(p[1] for p in ins) + max(p[1] for p in ins)) / 2
iw = (max(p[0] for p in ins) - min(p[0] for p in ins)) * INSET_SCALE
ih = (max(p[1] for p in ins) - min(p[1] for p in ins)) * INSET_SCALE
ncx, ncy = pad + 14 + iw / 2, pad + 14 + ih / 2 + 40
def txi(p):
    x, y = tx(p)
    return ((x - icx) * INSET_SCALE + ncx, (y - icy) * INSET_SCALE + ncy)

paths = []
inset_pts = []
for iso in sorted(shapes, key=lambda k: int(k[3:])):
    props, out = shapes[iso]
    dstr = ''
    for s, inset in out:
        pts = [txi(p) if inset else tx(p) for p in s]
        if inset:
            inset_pts += pts
        dstr += 'M' + ' '.join('%.1f,%.1f' % p for p in pts) + 'Z'
    code = int(iso[3:])
    paths.append('<path id="p%02d" data-code="%d" d="%s"/>' % (code, code, dstr))
ix = [p[0] for p in inset_pts]; iy = [p[1] for p in inset_pts]
box = (min(ix) - 12, min(iy) - 12, max(ix) - min(ix) + 24, max(iy) - min(iy) + 24)
svg = ('<!-- 地図: Natural Earth（パブリックドメイン, naturalearthdata.com）を tools/make-map.py で簡略化。北方領土の島は同じデータから北海道に含めた -->' + '\n' + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d">' % (W + 2 * pad, H + 2 * pad) +
       '<rect class="inset-frame" x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6"/>' % box +
       '<g class="prefs">' + ''.join(paths) + '</g></svg>')
open(sys.argv[2], 'w').write(svg)
print('size', len(svg), 'viewBox', W + 2 * pad, round(H + 2 * pad), 'inset box', [round(v) for v in box], file=sys.stderr)
