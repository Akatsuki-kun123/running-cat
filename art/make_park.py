"""A Neon Tokyo night park in scrolling layers, with people walking, written as a TS module.

usage: python make_park.py <out.ts> <preview.png> [cat_sheet.png]

    python make_park.py ../running-cat/hooks/park.ts preview.png

It draws everything but the cat: the park, its people (from people_art.py, next to this file) and
the weather's art, and writes the mod's hooks/park.ts. The same script always writes the same
park.ts, byte for byte. The preview is a still picture of the scene, to look at; with a cat sheet
(Bow.Pixel's Cat-Sheet.png) it has the cat in it too. Needs Python 3 and Pillow.

Layers, back to front:
  sky   : fixed (gradient, stars, moon)
  far   : city towers with windows and neon, a seamless tile of FAR_P px
  near  : pitched-roof houses, a tile of NEAR_P px
  park  : hedge, path, lamps, bench, cherry tree in a planter with falling petals, a tile of PARK_P px
  people: walkers on the path, on their own clock
Each tile lives in a <pattern> and is painted on a rect wider than the scene by one tile, so a
translate of 0..-P scrolls it with no seam. The TS side writes the translate (moving or held).
"""
import json
import math
import random
import re
import sys

from PIL import Image

out_ts, preview_png = sys.argv[1], sys.argv[2]
cat_sheet = sys.argv[3] if len(sys.argv) > 3 else None

W, H = 960, 44
GROUND = 36
TOP = 12   # sky above row 0: the band is drawn from y = -TOP, so it stands taller
CAT_X, CAT_Y = 340, 29          # the cat's 360 x 14 strip (its own inner x offset is 8)
FAR_P, NEAR_P, PARK_P = 320, 360, 640
FAR_V, NEAR_V, PARK_V = 4, 9, 18  # art px per second while the cat runs

rnd = random.Random(7)
lrnd = random.Random(11)   # who turns in early: its own draws, so the town's layout stays as it was


def late(layer, x, y, w, h, c):
    """A lit window; most go dark late at night (groups lw0..lw2), a quarter stay lit all night."""
    r = lrnd.random()
    if r < 0.75:
        layer.anim(f"lw{int(r / 0.25)}", x, y, w, h, c)
    else:
        layer.rect(x, y, w, h, c)

SKY = ["#0c0a18", "#100b21", "#140f2a", "#1a1333", "#21173d", "#2a1d4a"]
STAR = "#c9f6ff"
MOON, MOON_SHADE = "#fff1c9", "#e4defc"
FAR_BLDG, FAR_EDGE = "#1d153a", "#2b2150"
NEAR_HOUSE, NEAR_ROOF, NEAR_ROOF_HI = "#140f26", "#241b44", "#3a3160"
WIN_WARM, WIN_GOLD, WIN_CYAN = "#ffd84a", "#ffb547", "#36e3ff"
NEON_PINK, NEON_CYAN = "#ff4fa3", "#36e3ff"
HEDGE, HEDGE_HI = "#0f2a2e", "#17403f"
PATH, PATH_TILE, PATH_EDGE = "#211b3c", "#2b2350", "#3a3260"
METAL, METAL_HI = "#3a4058", "#4a5068"
LAMP_LIGHT, LAMP_GLOW = "#fff0c0", "#ffd9a8"
WOOD, WOOD_HI, WOOD_DK = "#6a3a48", "#8a4a58", "#4a2630"
BARK, BARK_HI, BARK_DK = "#4a2a30", "#6a3a48", "#341c24"
BLOSSOM = ["#e86aa6", "#ff9cc8", "#ffb7d5", "#ffd6e8"]
PETAL = "#ffb7d5"
LANTERN, LANTERN_HI = "#ff4a4a", "#ffb070"
BRICK, BRICK_HI, BRICK_LINE, SOIL = "#3a3260", "#665d9f", "#241b44", "#2a1818"
RING_TOP, RING_FACE, RING_JOINT, RING_BACK = "#9a94c8", "#56508a", "#3c3668", "#6c66a0"


class Layer:
    """Pixels of one layer; x wraps at `period` (None: no wrap, clipped to W)."""

    def __init__(self, period=None):
        self.period = period
        self.grid = {}
        self.anims = {}

    def _x(self, x):
        if self.period:
            return x % self.period
        return x if 0 <= x < W else None

    def put(self, x, y, c):
        x = self._x(x)
        if x is not None and -TOP <= y < H:
            self.grid[(x, y)] = c

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, c)

    def anim(self, name, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                xw = self._x(xx)
                if xw is not None and -TOP <= yy < H:
                    self.anims.setdefault(name, {})[(xw, yy)] = c


def paths(pixels):
    pixels = dict(pixels)
    blocks = {}
    for (x, y) in sorted(pixels, key=lambda p: (p[1], p[0])):
        c = pixels.get((x, y))
        if c is None or (x, y) not in pixels:
            continue
        w = 1
        while pixels.get((x + w, y)) == c:
            w += 1
        h = 1
        while all(pixels.get((x + i, y + h)) == c for i in range(w)):
            h += 1
        if h >= 3 and not c.startswith("@"):   # a person's own colour stays a stroke (class set later)
            blocks.setdefault(c, []).append((x, y, w, h))
            for j in range(h):
                for i in range(w):
                    del pixels[(x + i, y + j)]
    by = {}
    rows = {}
    for (x, y), c in pixels.items():
        rows.setdefault(y, {})[x] = c
    for y in sorted(rows):
        row = rows[y]
        xs = sorted(row)
        i = 0
        while i < len(xs):
            s = xs[i]
            c = row[s]
            e = s
            while e + 1 in row and row[e + 1] == c:
                e += 1
            by.setdefault(c, []).append((s, y, e - s + 1))
            i = xs.index(e) + 1
    # Each run of pixels is a 1 px stroke along its row's middle (fill none, set in the style);
    # each tall block one filled rectangle.
    out = "".join(f'<path stroke="{c}" d="{runs_d(d)}"/>' for c, d in by.items())
    return out + "".join(f'<path style="fill:{c}" d="{blocks_d(b)}"/>' for c, b in blocks.items())


def blocks_d(blocks):
    out, at = [], None
    for x, y, w, h in blocks:
        out.append(f"M{x} {y}" if at is None else f"m{x - at[0]}{'' if y - at[1] < 0 else ' '}{y - at[1]}")
        out.append(f"h{w}v{h}h-{w}z")
        at = (x, y)
    return "".join(out)


def runs_d(runs):
    """Path data for runs (x, y, length) in row order: the first absolute, each next one a short
    relative move from where the last ended."""
    out = []
    at = None
    for x, y, n in runs:
        if at is None:
            out.append(f"M{x} {y + 0.5:g}h{n}")       # the row's middle, above row 0 too
        else:
            dx, dy = x - at[0], y - at[1]
            out.append(f"m{dx}{'' if dy < 0 else ' '}{dy}h{n}")
        at = (x + n, y)
    return "".join(out)


OPACITY = {"shd": 0.32, "fglow": 0.16, "wcglow": 0.22, "rail": 0.6, "tlit": 0.85, "tdeck": 0.9, "vglow": 0.1, "vpool": 0.12, "vlit": 0.35, "glow": 0.35, "lampglow": 0.24, "lampglow2": 0.11, "pool": 0.18, "pool2": 0.09, "lantern": 0.3}
ORDER = ["tw0", "tw1", "tw2", "tlit", "tdeck", "beacon", "rail", "win", "shd", "flw", "fjet", "lw0", "lw1", "lw2", "vglow", "vpool", "wcglow", "fglow", "talk0", "talk1", "talk2", "talk0r", "talk1r", "talk2r", "tumb", "glow", "neon", "neon2", "lampglow2", "lampglow", "pool2", "pool", "bulb", "fw0", "fw1", "fw2", "lantern", "vlit"]
GROUPED = ["lampglow2", "lampglow", "pool2", "pool", "bulb"]  # drawn per lamp, in this order


def anim_order(layer):
    """The layer's animated pixel sets in drawing order: (name, base name, group or None)."""
    out = []
    groups = sorted({n.split("@")[1] for n in layer.anims if "@" in n}, key=int)
    for n in ORDER:
        if n in GROUPED:
            if n == GROUPED[0]:
                for g in groups:
                    out += [(f"{b}@{g}", b, g) for b in GROUPED if f"{b}@{g}" in layer.anims]
            continue
        if n in layer.anims:
            out.append((n, n, None))
    return out


def ground(layer):
    """Rows the layer covers end to end are laid first as one band of their commonest colour, and
    only what differs is drawn over: the path and the hedge, cut up by all that stands on them,
    cost a fraction. Returns the bands' markup and the pixels left to draw."""
    span = layer.period or W
    grid = dict(layer.grid)
    rows = {}
    for (x, y), c in layer.grid.items():
        rows.setdefault(y, {}).setdefault(c, []).append(x)
    bands = []
    for y in sorted(rows):
        if sum(len(xs) for xs in rows[y].values()) < span:
            continue
        c = max(rows[y], key=lambda k: len(rows[y][k]))
        for x in rows[y][c]:
            del grid[(x, y)]
        if bands and bands[-1][2] == c and bands[-1][0] + bands[-1][1] == y:
            bands[-1][1] += 1
        else:
            bands.append([y, 1, c])
    return "".join(f'<path style="fill:{c}" d="M0 {y}h{span}v{h}h-{span}z"/>' for y, h, c in bands), grid


def layer_svg(layer):
    under, rest = ground(layer)
    out = under + paths(rest)
    open_group = None
    for name, base, group in anim_order(layer):
        if group != open_group:
            if open_group is not None:
                out += "</g></g>"
            if group is not None:
                out += f'<g class="nl dn"><g class="lamp lamp{group}">'
            open_group = group
        op = f' opacity="{OPACITY[base]}"' if base in OPACITY else ""
        day = " dn" if base.startswith("lw") else " wx" if base == "tumb" else ""   # on the day's or the weather's clock
        out += f'<g class="{base}{day}"{op}>{paths(layer.anims[name])}</g>'
    if open_group is not None:
        out += "</g></g>"
    return out


# ---------- sky (fixed) ----------
sky = Layer()
band_h = GROUND // len(SKY) + 1
for y in range(GROUND):
    sky.rect(0, y, W, 1, SKY[min(y // band_h, len(SKY) - 1)])
MOON_X = 620
for i in range(70):
    x, y = rnd.randrange(W), rnd.randrange(0, 13)
    if MOON_X - 8 <= x <= MOON_X + 8 and y <= 9:
        continue
    (sky.anim(f"tw{i % 3}", x, y, 1, 1, STAR) if i % 2 else sky.put(x, y, "#6a6a9a"))


# ---------- a day: DAY seconds, an hour a minute ----------
DAY = 1440
HORIZON = 2 * DAY      # the TS side plans who is out this far ahead: a whole weather cycle, so it all repeats


def hour_pct(h):
    return f"{h / 24 * 100:.3f}%"


def keyframes(name, points):
    """points: (hour, css) in order; written as one @keyframes over the day."""
    return f"@keyframes {name}{{" + "".join(f"{hour_pct(h)}{{{css}}}" for h, css in points) + "}"


DAY_SKY = ["#3f7fc8", "#4f8fd2", "#62a2dc", "#78b4e4", "#90c6ea", "#a8d6ee"]
day_sky = "".join(
    f'<rect y="{k * band_h}" width="{W}" height="{band_h if k < len(DAY_SKY) - 1 else GROUND - k * band_h}" fill="{c}"/>'
    for k, c in enumerate(DAY_SKY)
)
day_sky = f'<rect y="-{TOP}" width="{W}" height="{TOP}" fill="{DAY_SKY[0]}"/>' + day_sky
dusk = "".join(
    f'<rect y="{y}" width="{W}" height="1" fill="#ff8a5a" fill-opacity="{max(0.0, 1 - abs(y - 26) / 16) * 0.95:.2f}"/>' for y in range(11, GROUND)
)
sun = {}
moon = {}
for dy in range(-3, 4):
    for dx in range(-3, 4):
        d = dx * dx + dy * dy
        if d <= 10:
            sun[(dx, dy)] = "#fff6c8" if d <= 4 else "#ffd84a"
            moon[(dx, dy)] = MOON if dx + dy < 2 else MOON_SHADE
SUN_GLOW = {(dx, dy): "#fff1a8" for dx in range(-6, 7) for dy in range(-6, 7) if 10 < dx * dx + dy * dy <= 34}


def arc(h0, h1):
    """(hour, transform) along an arc over the sky, rising at h0 and setting at h1."""
    pts = []
    for k in range(13):
        f = k / 12
        x = 300 + 360 * f
        y = -6 + 42 * (2 * f - 1) ** 2
        pts.append((h0 + (h1 - h0) * f, f"translate:{x:.0f}px {round(y, 1):g}px"))
    return pts


HIDE = "translate:480px 60px"
sun_kf = [(0, HIDE), (5.99, HIDE)] + arc(6, 18) + [(18.01, HIDE), (24, HIDE)]
moon_arc = arc(18, 30)
moon_kf = [(h - 24, t) for h, t in moon_arc if h >= 24] + [(6.01, HIDE), (17.99, HIDE)] + [(h, t) for h, t in moon_arc if h < 24]
moon_kf = [(0, moon_arc[6][1])] + [pt for pt in moon_kf if pt[0] > 0] + [(24, moon_arc[6][1])]

# A clock in the sky, HH:M0: strips of digits behind a window, stepped round with the day.
FONT = {
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
    "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
}
CLOCK_X, CLOCK_Y, ROW = 380, -7, 6   # clear of the band's top edge, and of the sun at noon


def glyphs(text, x0, y0):
    px = {}
    for n, ch in enumerate(text):
        for y, row in enumerate(FONT[ch]):
            for x, bit in enumerate(row):
                if bit == "1":
                    px[(x0 + n * 4 + x, y0 + y)] = "#c9f6ff"
    return px


hours_strip = {}
for hh in range(24):
    hours_strip.update(glyphs(f"{hh:02d}", 0, hh * ROW))
mins_strip = {}
for m in range(6):
    mins_strip.update(glyphs(f"{m}0", 0, m * ROW))
colon = {(CLOCK_X + 8, CLOCK_Y + 1): "#c9f6ff", (CLOCK_X + 8, CLOCK_Y + 3): "#c9f6ff"}
CLOCK_SVG = (
    f'<clipPath id="clk"><rect x="{CLOCK_X}" y="{CLOCK_Y}" width="18" height="5"/></clipPath>'
    f'<g clip-path="url(#clk)" opacity="0.8">'
    f'<g transform="translate({CLOCK_X},{CLOCK_Y})"><g class="hrs dn">{paths(hours_strip)}</g></g>'
    f'<g transform="translate({CLOCK_X + 10},{CLOCK_Y})"><g class="mns dn">{paths(mins_strip)}</g></g></g>'
    f'<g opacity="0.8">{paths(colon)}</g>'
)
# ---------- weather: a two-day cycle with two showers ----------
WEATHER = 2 * DAY
RAIN = [(15, 19), (30.5, 33.5)]     # hours into the cycle (0..48)


def wkeyframes(name, points):
    """points: (hour of the cycle, css) in order; one @keyframes over the weather's cycle."""
    return f"@keyframes {name}{{" + "".join(f"{h / 48 * 100:.3f}%{{{css}}}" for h, css in points) + "}"


def spans(fade, on, off="opacity:0"):
    pts = [(0, off)]
    for a, b in RAIN:
        pts += [(a - fade, off), (a, on), (b, on), (b + fade, off)]
    return pts + [(48, off)]


CLOUD_SVG = f'<rect class="rcl wx" y="-{TOP}" width="{W}" height="{GROUND + TOP}" fill="#3e4058"/>'
_rr = random.Random(23)
rain_far = {}
for _ in range(10):
    x, y = _rr.randrange(40), _rr.randrange(44)
    rain_far[(x, y)] = "#9ab8e8"; rain_far[(x, (y + 1) % 44)] = "#9ab8e8"
rain_near = {}
for _ in range(7):
    x, y = _rr.randrange(56), _rr.randrange(44)
    for d in range(4):
        rain_near[(x, (y + d) % 44)] = "#cfe0ff"
splash = {0: {}, 1: {}, 2: {}}
for n in range(9):
    x, y = _rr.randrange(1, 63), _rr.randrange(GROUND + 3, H - 1)
    k = n % 3
    splash[k][(x, y)] = "#a8c8f0"
    splash[k][(x - 1, y - 1)] = "#a8c8f0"
    splash[k][(x + 1, y - 1)] = "#a8c8f0"
RAIN_DEFS = (
    f'<pattern id="rf" width="40" height="44" patternUnits="userSpaceOnUse">{paths(rain_far)}</pattern>'
    f'<pattern id="rn" width="56" height="44" patternUnits="userSpaceOnUse">{paths(rain_near)}</pattern>'
    f'<pattern id="spl" width="64" height="44" patternUnits="userSpaceOnUse">'
    + "".join(f'<g class="sp{k}">{paths(splash[k])}</g>' for k in range(3)) + '</pattern>'
)
RAIN_FRONT = (
    f'<g class="rain wx"><g opacity="0.35"><g class="rfa"><rect y="-88" width="{W}" height="132" fill="url(#rf)"/></g></g>'
    f'<g opacity="0.55"><g class="rna"><rect y="-88" width="{W}" height="132" fill="url(#rn)"/></g></g></g>'
)
RAIN_STYLE = (
    f".wx{{animation-duration:{WEATHER}s;animation-iteration-count:infinite;animation-timing-function:linear}}"
    ".rain{opacity:0;animation-name:rain}" + wkeyframes("rain", spans(0.25, "opacity:1"))
    + ".rcl{opacity:0;animation-name:rcl}" + wkeyframes("rcl", spans(1, "opacity:.7"))
    + ".rfa{animation:rfa .5s steps(11,end) infinite}.rna{animation:rfa .32s steps(11,end) infinite}"
    "@keyframes rfa{0%{transform:translateY(0)}100%{transform:translateY(44px)}}"
    ".sp0,.sp1,.sp2{animation:spl .6s steps(1,end) infinite}.sp1{animation-delay:-.2s}.sp2{animation-delay:-.4s}"
    "@keyframes spl{0%{opacity:.7}33.3%{opacity:0}}"
    ".ww{opacity:0}"
)

DAY_SVG = (
    f'<g class="moon dn">{paths(moon)}</g>'
    f'<g class="dsky dn">{day_sky}</g>'
    f'<g class="dusk dn">{dusk}</g>'
    f'<g class="sun dn"><g opacity="0.35">{paths(SUN_GLOW)}</g>{paths(sun)}</g>'
    + CLOUD_SVG
    + CLOCK_SVG
)
DAY_STYLE = (
    f".dn{{animation-duration:{DAY}s;animation-iteration-count:infinite;animation-timing-function:linear}}"
    ".moon{animation-name:moon}" + keyframes("moon", moon_kf)
    + ".sun{animation-name:sun}" + keyframes("sun", sun_kf)
    + ".dsky{opacity:0;animation-name:dsky}" + keyframes("dsky", [(0, "opacity:0"), (5, "opacity:0"), (7, "opacity:1"), (17, "opacity:1"), (19, "opacity:0"), (24, "opacity:0")])
    + ".dusk{opacity:0;animation-name:dusk}" + keyframes("dusk", [(0, "opacity:0"), (4.5, "opacity:0"), (6, "opacity:.8"), (7.5, "opacity:0"), (16.5, "opacity:0"), (18, "opacity:.8"), (19.5, "opacity:0"), (24, "opacity:0")])
    + ".dlt{opacity:0;mix-blend-mode:screen;animation-name:dlt}" + keyframes("dlt", [(0, "opacity:0"), (5, "opacity:0"), (7.5, "opacity:.5"), (16.5, "opacity:.5"), (19, "opacity:0"), (24, "opacity:0")])
    # the lamps come on at dusk and go off in the morning
    + ".nl{animation-name:nl;animation-timing-function:steps(1,end)}" + keyframes("nl", [(0, "opacity:1"), (6.5, "opacity:0"), (17.5, "opacity:1")])
    + f".hrs{{animation-name:hrs;animation-timing-function:steps(24,end)}}@keyframes hrs{{0%{{transform:translateY(0)}}100%{{transform:translateY(-{24 * ROW}px)}}}}"
    + f".mns{{animation-name:mns;animation-duration:60s;animation-timing-function:steps(6,end)}}@keyframes mns{{0%{{transform:translateY(0)}}100%{{transform:translateY(-{6 * ROW}px)}}}}"
)

# Who is about when: (from, to) in hours, or None for all day and night.
RUSH = [(6.75, 8.25), (16.75, 18.25)]   # 7-8 and 17-18, a quarter hour either side so all get by
WALK_HOURS = {0: [(8, 17), (18, 23)], 1: None, 2: [(8, 17), (18, 20)], 3: [(8, 17), (18, 22)],
              4: [(6, 7), (8, 17), (18, 19)], 5: None, 6: [(6, 7), (8, 17), (18, 21)], 7: [(5, 23)]}


def snap_walk(seconds):
    """A crossing time that goes into HORIZON exactly, so the night's gaps repeat in step."""
    return min((d for d in range(20, 400) if HORIZON % d == 0), key=lambda d: abs(d - seconds))


# ---------- Tokyo Tower: a silhouette far off, its lattice traced in dim orange lights ----------
TOWER_X = 556
TOWER_DARK, TOWER_EDGE = "#2b2150", "#3d3270"
tower = Layer()
TOWER_LIGHT, TOWER_DECK = "#ff7a3a", "#ffb070"


def tower_half(y):
    """Half-width of the tower at row y (0 for the antenna), or None above it."""
    if y < 2:
        return None
    if y < 9:
        return 0                      # antenna
    if y < 12:
        return 1                      # top deck
    if y < 20:
        return 1 + (y - 12) // 4      # upper shaft
    if y < 23:
        return 5 if y < 22 else 4     # main deck
    return 4 + (y - 23) * 7 // 13     # legs splaying out to the ground


# Drawn taller than the shape above: its rows stretched from the antenna's tip at TOWER_TIP down
# to the ground, and a little wider, so it stands well above the far towers.
TOWER_TIP = -10


def tower_old_y(y):
    """The row of the shape above that row y of the tall tower is drawn from."""
    return 1 + round((y - TOWER_TIP) * (GROUND - 1 - 1) / (GROUND - 1 - TOWER_TIP))


def tall_half(y):
    hw = tower_half(tower_old_y(y))
    return None if hw is None else round(hw * 1.25)


for y in range(TOWER_TIP, GROUND):
    oy = tower_old_y(y)
    hw = tall_half(y)
    if hw is None:
        continue
    for dx in range(-hw, hw + 1):
        x = TOWER_X + dx
        edge = abs(dx) == hw
        arch = oy >= 29 and abs(dx) < (oy - 28) * 0.9 * 1.25   # the open arch between the legs
        if arch and not edge:
            continue
        if edge or (x + y) % 2 == 0:              # lattice: edges solid, a checker inside
            tower.put(x, y, TOWER_EDGE if edge else TOWER_DARK)
    if oy >= 9 and y % 3 == 0:                      # lights up the edges
        for side in (-hw, hw):
            tower.anim("tlit", TOWER_X + side, y, 1, 1, TOWER_LIGHT)
_decks = [y for y in range(TOWER_TIP, GROUND) if tower_old_y(y) in (10, 20, 21)]
for y in _decks:                                    # the decks' lit windows
    hw = tall_half(y)
    for dx in range(-hw + 1, hw):
        if dx % 2 == 0:
            tower.anim("tdeck", TOWER_X + dx, y, 1, 1, TOWER_DECK)
tower.anim("beacon", TOWER_X, TOWER_TIP, 1, 1, "#ff4040")    # the red light on the antenna
tower.anim("beacon", TOWER_X, next(y for y in range(TOWER_TIP, GROUND) if tower_old_y(y) >= 11), 1, 1, "#ff4040")

# ---------- far city (tile) ----------
far = Layer(FAR_P)
_far_start = rnd.getstate()
_old_far = Layer(FAR_P)          # the old, shorter towers: drawn only to use up their draws
x, signs = 0, 0
while x < FAR_P:
    bw = min(rnd.randrange(8, 18), FAR_P - x) if FAR_P - x >= 8 else FAR_P - x
    bh = rnd.randrange(8, 22)
    top = GROUND - bh
    _old_far.rect(x, top, bw, bh, FAR_BLDG)
    _old_far.rect(x, top, bw, 1, FAR_EDGE)
    if rnd.random() < 0.3 and bw > 4:
        _old_far.rect(x + bw // 2, top - 3, 1, 3, FAR_EDGE)
        _old_far.anim("beacon", x + bw // 2, top - 4, 1, 1, "#ff4040")
    for wy in range(top + 2, GROUND - 2, 3):
        for wx in range(x + 2, x + bw - 2, 3):
            r = rnd.random()
            if r < 0.22:
                late(_old_far, wx, wy, 1, 1, rnd.choice([WIN_WARM, WIN_GOLD, WIN_GOLD]))
            elif r < 0.27:
                late(_old_far, wx, wy, 1, 1, WIN_CYAN)
            elif r < 0.30:
                _old_far.anim("win", wx, wy, 1, 1, WIN_WARM)
    if bh > 14 and bw > 6 and rnd.random() < 0.5:
        c = NEON_PINK if signs % 2 == 0 else NEON_CYAN
        sx, sy = x + bw - 3, top + 3
        _old_far.anim("glow", sx - 1, sy - 1, 3, 9, c)
        _old_far.anim("neon" if signs % 3 else "neon2", sx, sy, 1, 7, c)
        signs += 1
    x += bw + rnd.randrange(0, 3)


# The towers as drawn: the same widths and gaps, half as tall again and more, from row 6 at the
# highest; windows a little sparser up there, so there are about as many as before.
frnd = random.Random()
frnd.setstate(_far_start)
x, signs = 0, 0
while x < FAR_P:
    bw = min(frnd.randrange(8, 18), FAR_P - x) if FAR_P - x >= 8 else FAR_P - x
    short = frnd.randrange(8, 22)
    bh = 12 + (short - 8) * 18 // 13
    top = GROUND - bh
    far.rect(x, top, bw, bh, FAR_BLDG)
    far.rect(x, top, bw, 1, FAR_EDGE)
    if frnd.random() < 0.3 and bw > 4:
        far.rect(x + bw // 2, top - 3, 1, 3, FAR_EDGE)
        far.anim("beacon", x + bw // 2, top - 4, 1, 1, "#ff4040")
    sparse = short / bh
    for wy in range(top + 2, GROUND - 2, 3):
        for wx in range(x + 2, x + bw - 2, 3):
            r = frnd.random() / sparse
            if r < 0.22:
                late(far, wx, wy, 1, 1, frnd.choice([WIN_WARM, WIN_GOLD, WIN_GOLD]))
            elif r < 0.27:
                late(far, wx, wy, 1, 1, WIN_CYAN)
            elif r < 0.30:
                far.anim("win", wx, wy, 1, 1, WIN_WARM)
    if short > 14 and bw > 6 and frnd.random() < 0.5:
        c = NEON_PINK if signs % 2 == 0 else NEON_CYAN
        sx, sy = x + bw - 3, top + 3
        far.anim("glow", sx - 1, sy - 1, 3, 9, c)
        far.anim("neon" if signs % 3 else "neon2", sx, sy, 1, 7, c)
        signs += 1
    x += bw + frnd.randrange(0, 3)

# A railway on a viaduct, in front of the far towers and behind the near houses: the girder and
# rail run the whole tile, piers every 32 px, small signal lights along it.
RAIL_Y = 23
far.rect(0, RAIL_Y, FAR_P, 1, "#5a6488")           # the rail
far.rect(0, RAIL_Y + 1, FAR_P, 2, "#2b2150")       # the girder
far.rect(0, RAIL_Y + 3, FAR_P, 1, "#1d153a")
for px in range(8, FAR_P, 32):
    far.rect(px, RAIL_Y + 4, 2, GROUND - RAIL_Y - 4, "#241b44")
    far.rect(px - 1, RAIL_Y + 3, 4, 1, "#3a3160")
for px in range(24, FAR_P, 64):
    far.anim("rail", px, RAIL_Y + 1, 1, 1, "#36e3ff")

# ---------- near houses (tile) ----------
near = Layer(NEAR_P)
x = 0
while x < NEAR_P - 10:
    hw = rnd.randrange(14, 24)
    wall = rnd.randrange(5, 8)
    top = GROUND - wall
    near.rect(x, top, hw, wall, NEAR_HOUSE)
    for step in range(hw // 2 + 1):
        rx0, rx1 = x - 1 + step, x + hw - step
        if rx1 <= rx0:
            break
        near.rect(rx0, top - 1 - step // 2, rx1 - rx0 + 1, 1, NEAR_ROOF if step else NEAR_ROOF_HI)
    near.rect(x - 1, top - 1, hw + 2, 1, NEAR_ROOF_HI)
    if rnd.random() < 0.8:
        late(near, x + rnd.randrange(3, max(4, hw - 4)), top + 2, 2, 2, rnd.choice([WIN_WARM, WIN_GOLD]))
    x += hw + rnd.randrange(4, 12)

# ---------- park (tile) ----------
park = Layer(PARK_P)
park.rect(0, GROUND, PARK_P, 2, HEDGE)
for hx in range(0, PARK_P, 3):
    park.put(hx + rnd.randrange(0, 2), GROUND, HEDGE_HI)
park.rect(0, GROUND + 2, PARK_P, 1, PATH_EDGE)
park.rect(0, GROUND + 3, PARK_P, H - GROUND - 3, PATH)
for tx in range(0, PARK_P, 6):
    park.rect(tx + (2 if (tx // 6) % 2 else 0), GROUND + 5, 3, 1, PATH_TILE)


LAMPS = []
LAMP_OFF = "#5a5040"


SHADOW = "#05030c"


def box3d(x, top, w, bottom, d, side, lid):
    """Depth for a box whose front is x..x+w-1, rows top..bottom: a side face `d` px going back
    up to the right, and a top face over it, in the oblique view."""
    for i in range(d):
        park.rect(x + w + i, top - 1 - i, 1, bottom - top + 1, side)
    for j in range(d):
        park.rect(x + 1 + j, top - 1 - j, w, 1, lid)


def shadow(x0, x1, rows=2):
    """A soft shadow on the path, from x0 to x1, a little to the right of whatever stands there."""
    park.anim("shd", x0, H - 3, x1 - x0 + 1, 1, SHADOW)
    if rows > 1:
        park.anim("shd", x0 + 2, H - 2, x1 - x0 - 1, 1, SHADOW)


def lamp(lx):
    """A street lamp. Its light (bulb, glow, pool on the path) goes in the lamp's own group, so it
    can flicker off and on by itself; the dark bulb stays underneath."""
    k = len(LAMPS)
    LAMPS.append(lx)
    park.rect(lx, 12, 1, GROUND + 4 - 12, METAL)
    park.rect(lx + 1, 13, 1, GROUND + 4 - 13, METAL_HI)
    park.rect(lx - 2, 10, 6, 1, METAL_HI)
    park.rect(lx - 1, 11, 4, 2, LAMP_OFF)
    park.anim(f"bulb@{k}", lx - 1, 11, 4, 2, LAMP_LIGHT)
    park.rect(lx - 1, GROUND + 4, 4, 1, METAL_HI)
    shadow(lx - 1, lx + 5, 1)
    for dy in range(-9, 10):
        for dx in range(-9, 10):
            d = math.hypot(dx, dy * 1.1)
            if d <= 9:
                park.anim(("lampglow" if d <= 5.5 else "lampglow2") + f"@{k}", lx + 1 + dx, 11 + dy, 1, 1, LAMP_GLOW)
    for dx in range(-14, 16):
        f = abs(dx) / 15
        park.anim(("pool" if f < 0.6 else "pool2") + f"@{k}", lx + dx, GROUND + 3, 1, 3 if f < 0.6 else 2, LAMP_GLOW)


def bench(bx):
    """A bench for two, 30 wide: three slats of back, the seat on row 35, legs to the path."""
    w = 30
    for y in (26, 28, 30):
        park.rect(bx, y, w, 1, WOOD_HI if y == 26 else WOOD)
    for p in (bx + 2, bx + w - 3):
        park.rect(p, 26, 1, 9, METAL)
    park.rect(bx - 1, 35, w + 2, 1, WOOD_HI)
    park.rect(bx - 1, 36, w + 2, 1, WOOD_DK)
    park.rect(bx, 34, w + 1, 1, WOOD)                    # the seat's top, going back
    for p in (bx, bx + w - 1):
        park.rect(p, 37, 1, 4, METAL)
        park.put(p + 1, 40, METAL_HI)
    shadow(bx, bx + w + 3)


petals = []


WHITE_DOTS = 28   # white blossoms dotted over the cherry tree
WINTER_TREE = {}  # the bare tree's limbs and twigs, drawn over the crown in winter (class wtr)
TREE_SNOW = {}    # the snow on them, which comes and goes with the snow lying elsewhere
SNOW_ON = "#eef3fb"

def cherry(tx):
    """A big cherry tree in full blossom over a ring of stones: a leaning trunk forking into limbs,
    the crown a heap of blossom clumps, each lit from the upper left and the far ones darker, with
    the limbs showing through its gaps; lanterns hung from the lowest branches."""
    crnd = random.Random(13)   # its own draws: the rest of the park stays as it was
    BL = ["#b04080", "#d65c98", "#f07cb4", "#ff9cc8", "#ffb7d5", "#ffd6e8"]

    def line(x0, y0, x1, y1, c, w=1):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for k in range(n + 1):
            x, y = round(x0 + (x1 - x0) * k / n), round(y0 + (y1 - y0) * k / n)
            for d in range(w):
                park.put(x + d, y, c)

    # the trunk, leaning a little to the right as it rises, wide at the foot, bark streaked
    lean = lambda y: round((GROUND - y) * 0.09)
    for y in range(12, GROUND + 1):
        w = 4 if y < 24 else 5
        x0 = tx - w // 2 + lean(y)
        park.rect(x0, y, w, 1, BARK)
        park.put(x0, y, BARK_HI)
        park.put(x0 + w - 1, y, BARK_DK)
        if y % 5 == 2:
            park.put(x0 + 2, y, BARK_DK)                     # a knot in the bark
    # limbs: from the trunk at (height), out to (end x, end y), 2 px then 1 px; and twigs off them
    limbs = [(22, -19, 6), (18, 17, 2), (15, -8, -5), (13, 8, -8), (20, 26, 11), (24, -27, 12)]
    ends = []
    for at, dx, ey in limbs:
        sx, sy = tx + lean(at) + (2 if dx > 0 else -2), at
        mx, my = sx + dx * 2 // 3, sy + (ey - sy) * 2 // 3
        line(sx, sy, mx, my, BARK, 2)
        line(mx, my, sx + dx, ey, BARK_DK, 1)
        ends.append((sx + dx, ey))
        ends.append((mx + (4 if dx > 0 else -4), my - 3))
    top = (tx + lean(12), 12)
    line(top[0], top[1], top[0] + 2, top[1] - 12, BARK, 2)
    ends.append((top[0] + 2, top[1] - 12))
    # the crown: clumps round the limbs' ends and along them, far ones first
    clumps = []
    for ex, ey in ends:
        for _ in range(3):
            clumps.append((ex + crnd.randint(-5, 5), ey + crnd.randint(-4, 3), crnd.randint(5, 8), crnd.random()))
    clumps += [(tx + crnd.randint(-22, 22), crnd.randint(-8, 12), crnd.randint(5, 7), crnd.random()) for _ in range(8)]
    clumps.sort(key=lambda c: c[3])                         # depth: 0 far (dark) .. 1 near (light)
    crown = {}
    for cx, cy, r, depth in clumps:
        ry = r * 0.75
        for yy in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for xx in range(cx - r - 1, cx + r + 2):
                d = ((xx - cx) / r) ** 2 + ((yy - cy) / ry) ** 2
                if d > 0.95:
                    continue
                if yy > 23 or yy < -TOP:
                    continue
                lit = -0.8 * (yy - cy) / ry - 0.5 * (xx - cx) / r      # upper left of each clump lit
                lit += 0.9 * (depth - 0.5) - 0.025 * (yy - 4)           # near and high ones brighter
                tone = 1 if lit < -0.5 else 2 if lit < 0.2 else 3 if lit < 0.9 else 4
                crown[(xx, yy)] = tone
    for (xx, yy) in list(crown):                            # the crown's underside in its own shade
        if (xx, yy + 1) not in crown and crown[(xx, yy)] > 1:
            crown[(xx, yy)] = 1
    # gaps in the lower crown, a limb showing through some
    for (xx, yy), tone in list(crown.items()):
        if yy > 8 and tone <= 1 and False:
            crown.pop((xx, yy))
    for (xx, yy), tone in crown.items():
        c = BL[tone]
        if tone >= 3 and False:
            c = BL[5]                                       # a bloom catching the light
        elif tone >= 1 and False:
            c = BL[tone - 1]                                # the blossom's texture
        park.put(xx, yy, c)
    # white blossoms dotted over the crown, more on its lit side, none touching another
    wrnd = random.Random(31)
    spots = sorted(crown)
    dots = set()
    for _ in range(400):
        if len(dots) >= WHITE_DOTS:
            break
        xx, yy = wrnd.choice(spots)
        if crown[(xx, yy)] < 2 or (crown[(xx, yy)] == 2 and wrnd.random() < 0.6):
            continue
        if any((xx + i, yy + j) in dots for i in (-2, -1, 0, 1, 2) for j in (-2, -1, 0, 1, 2)):
            continue
        dots.add((xx, yy))
        park.put(xx, yy, "#fff4f9")
    for ex, ey in ends[::3]:                               # twig tips poking out under the bloom
        if (ex, ey + 3) not in crown:
            park.put(ex, ey + 3, BARK_DK)
    for lx, ly in ((tx - 17, 18), (tx + 20, 19)):
        for yy in range(ly - 4, ly):                        # hung on a cord from the limb above
            if (lx, yy) not in crown:
                park.put(lx, yy, BARK_DK)
        park.rect(lx - 1, ly, 3, 3, LANTERN)
        park.put(lx, ly + 1, LANTERN_HI)
        park.anim("lantern", lx - 2, ly - 1, 5, 5, LANTERN_HI)
    # winter: the band hides the crown's colours, and this draws what it hid, the trunk's top and
    # the limbs, with bare twigs off their ends and snow lying along their tops
    crown_cols = set(BL[1:5]) | {"#fff4f9"}
    bare = {}

    def bline(x0, y0, x1, y1, c, w=1):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for k in range(n + 1):
            x, y = round(x0 + (x1 - x0) * k / n), round(y0 + (y1 - y0) * k / n)
            for d in range(w):
                bare[(x + d, y)] = c

    for y in range(12, 24):
        x0 = tx - 2 + lean(y)
        for d, c in enumerate((BARK_HI, BARK, BARK_DK if y % 5 == 2 else BARK, BARK_DK)):
            bare[(x0 + d, y)] = c
    for at, dx, ey in limbs:
        sx, sy = tx + lean(at) + (2 if dx > 0 else -2), at
        mx, my = sx + dx * 2 // 3, sy + (ey - sy) * 2 // 3
        bline(sx, sy, mx, my, BARK, 2)
        bline(mx, my, sx + dx, ey, BARK_DK, 1)
    bline(top[0], top[1], top[0] + 2, top[1] - 12, BARK, 2)
    trnd = random.Random(17)
    for ex, ey in ends:
        for _ in range(2):
            side = 1 if trnd.random() < 0.5 else -1
            bline(ex, ey, ex + side * trnd.randint(2, 4), ey - trnd.randint(2, 4), BARK_DK)
    free = lambda xy: xy[1] >= -TOP and park.grid.get(xy) in crown_cols | {None}
    bare = {xy: c for xy, c in bare.items() if free(xy)}
    snow = {}
    for (x, y) in sorted(bare):
        if (x, y - 1) not in bare and free((x, y - 1)) and trnd.random() < 0.6:
            snow[(x, y - 1)] = SNOW_ON
    WINTER_TREE.update(bare)
    TREE_SNOW.update(snow)     # lying on the limbs like the rest: drawn with the snow (sg1, sg2)
    # a low ring of stones round the foot of the tree, seen from a little above: the back of the
    # ring behind the trunk, earth inside, the front kerb with its lit top and darker face
    rx, cy, ry = 13, 37, 2.5
    p0, p1 = tx - rx, tx + rx
    arcs = {}
    for dx in range(-rx, rx + 1):
        dy = ry * math.sqrt(max(0.0, 1 - (dx / rx) ** 2))
        arcs[dx] = (round(cy - dy), round(cy + dy))
    for dx, (back, front) in arcs.items():
        park.put(tx + dx, back, RING_BACK)
        park.rect(tx + dx, back + 1, 1, max(0, front - back - 1), SOIL)
    for y in range(GROUND, cy + 2):                         # the trunk down into the earth, roots flaring
        flare = max(0, y - cy)
        park.rect(tx - 2 - flare, y, 5 + 2 * flare, 1, BARK)
        park.put(tx - 2 - flare, y, BARK_HI)
        park.put(tx + 2 + flare, y, BARK_DK)
    for dx, (back, front) in arcs.items():
        park.put(tx + dx, front, RING_TOP)
        park.put(tx + dx, front + 1, RING_JOINT if (dx + rx) % 5 == 4 else RING_FACE)
    for dx in (-rx, rx):                                    # the ring's two ends, round
        park.put(tx + dx, cy, RING_TOP)
        park.put(tx + dx, cy + 1, RING_FACE)
    shadow(p0 + 2, p1 + 5, 1)
    for _ in range(10):
        park.put(rnd.randrange(p0 - 14, p1 + 16), rnd.choice([GROUND + 2, GROUND + 3, GROUND + 4, GROUND + 6]), PETAL)
    for _ in range(12):
        sx, sy = rnd.randrange(tx - 28, tx + 32), rnd.randrange(0, 20)
        dur = rnd.uniform(5.5, 9.0)
        petals.append((sx % PARK_P, sy, dur, rnd.uniform(0, dur), -rnd.randrange(18, 40), GROUND + 5 - sy,
                       rnd.choice([PETAL, BLOSSOM[3], BLOSSOM[1]])))


VEND_SIDE = ["#8a96b0", "#a03a40", "#2c58a8"]
VEND_TOP = ["#e6eef8", "#ff8a8a", "#7aa8ff"]
VENDING = [  # body, trim
    ("#c4cfe2", "#8a96b0"),
    ("#e8443a", "#a82a20"),
    ("#2c6fd1", "#1d4a94"),
]
DRINKS = ["#ff4fa3", "#36e3ff", "#ffd84a", "#5fd39a", "#ff7a45", "#a58bff", "#f3f0fb"]


_drnd = random.Random(5)   # the drinks on show: their own draws, so the rest of the park stays as it was


def vending(vx, style):
    """A 16 x 26 drink machine standing on the path's back edge, a head taller than the people."""
    body, trim = VENDING[style]
    w, top, bottom = 16, 13, 38
    park.anim("vglow", vx - 2, top - 2, w + 4, bottom - top + 3, "#c9f6ff")
    for dx in range(-6, w + 6):
        park.anim("vpool", vx + dx, GROUND + 3, 1, 2, "#c9f6ff")
    park.rect(vx, top, w, bottom - top + 1, body)
    park.rect(vx, top, w, 1, trim)
    park.rect(vx + w - 1, top, 1, bottom - top + 1, trim)
    park.rect(vx + 1, top + 1, w - 3, 3, "#e6f4ff")      # lit header
    park.put(vx + 3, top + 2, "#ff4fa3")
    park.put(vx + 6, top + 2, "#36e3ff")
    park.put(vx + 8, top + 2, "#ffd84a")
    park.rect(vx + 1, top + 5, w - 3, 13, "#100b21")     # display window
    for row in range(3):
        for col in range(5):
            park.rect(vx + 2 + col * 2, top + 6 + row * 4, 1, 3, _drnd.choice(DRINKS))
    for row in range(3):                                  # a price button under each row
        for col in range(5):
            park.put(vx + 2 + col * 2, top + 9 + row * 4, "#ff4040" if row == 2 else "#3a3160")
    park.put(vx + w - 3, top + 19, "#c4cfe2")             # coin slot
    park.rect(vx + w - 3, top + 20, 1, 2, "#3a4058")
    park.rect(vx + 1, top + 20, 9, 4, "#1a1220")          # where the can drops
    park.rect(vx + 1, top + 20, 9, 1, trim)
    park.anim("vlit", vx + 1, top + 5, w - 3, 1, "#ffffff")   # a light sweeping the window
    park.rect(vx, bottom + 1, w, 1, METAL)                # base
    box3d(vx, top, w, bottom + 1, 3, VEND_SIDE[style], VEND_TOP[style])
    shadow(vx + 1, vx + w + 5)


BED_FACE, BED_TOP, BED_SIDE = "#4a4078", "#7a70b8", "#2b2450"
LEAF, LEAF_HI, LEAF_DK = "#2f7a52", "#4fb07a", "#1f5a3c"
FLOWERS = ["#ff7ab8", "#ffd84a", "#f3f0fb", "#a58bff", "#ff7a45"]
_brnd = random.Random(23)   # the beds' own draws


def flower_bed(bx, w):
    """A brick bed of flowers, w wide, in the oblique view: a front face with brick courses and a
    lit rim, a shaded side going back up to the right, the earth inside, and a mound of leaves and
    flowers standing up out of it, lit from the upper left. Shadow on the path."""
    d = 4
    park.rect(bx, 36, w, 5, BED_FACE)
    park.rect(bx, 38, w, 1, BED_SIDE)                       # a brick course
    for x in range(bx + 2, bx + w - 1, 4):
        park.put(x, 37, BED_SIDE)
        park.put(x + 2, 39, BED_SIDE)
    box3d(bx, 36, w, 40, d, BED_SIDE, SOIL)                 # the side, and the earth going back
    for j in range(d):
        park.put(bx + w + j, 35 - j, BED_TOP)               # the side's top edge
        park.put(bx + 1 + j, 35 - j, BED_TOP)               # the left rim going back
    park.rect(bx + d, 32, w, 1, BED_TOP)                     # the back rim
    park.rect(bx, 36, w, 1, BED_TOP)                         # the front rim, lit
    park.put(bx + w - 1, 36, BED_FACE)
    # leaves: a mound inside the rims, higher toward the back and the middle
    span = range(bx + 2, bx + w + d - 1)
    for x in span:
        mid = 1 - abs((x - bx - (w + d) / 2) / ((w + d) / 2))
        top = 33 - round(2 * mid) - _brnd.randrange(0, 2)
        park.put(x, top, LEAF_HI)
        park.rect(x, top + 1, 1, 34 - top, LEAF if x < bx + w + d - 4 else LEAF_DK)
    for x in span:                                          # flowers over them, some with a bud lower
        if _brnd.random() < 0.65:
            mid = 1 - abs((x - bx - (w + d) / 2) / ((w + d) / 2))
            y = 31 - round(2 * mid) + _brnd.randrange(0, 2)
            c = _brnd.choice(FLOWERS)
            park.anim("flw", x, y, 1, 1, c)
            if _brnd.random() < 0.35:
                park.anim("flw", x, y + 2, 1, 1, c)
    shadow(bx + 1, bx + w + d + 3)


FOUNTAIN_X = 520
WATER, WATER_HI, STONE, STONE_HI, STONE_DK = "#36b8e3", "#c9f6ff", "#4a4f6e", "#6a7094", "#2e3150"


RIMS = set()        # kerbs whose own top whitens under deep snow


def fountain(fx):
    """A round stone fountain, seen from the side: a wide basin, a column with a small bowl, and
    water arcing out and falling back, in two frames that take turns."""
    # basin: a round stone bowl seen from a little above, like the machines are, the light from
    # the upper left: the water's surface an ellipse inside the rim, the wall below curving round,
    # lit on the left and in shade on the right
    rx, cy, ry = 13, 34, 3
    tone = lambda dx: STONE_HI if dx < -rx // 3 else STONE_DK if dx > rx // 3 else STONE
    for dx in range(-rx, rx + 1):
        dy = ry * math.sqrt(max(0.0, 1 - (dx / rx) ** 2))
        back, front = round(cy - dy), round(cy + dy)
        park.put(fx + dx, back, STONE_HI)                       # the back of the rim
        park.rect(fx + dx, back + 1, 1, max(0, front - back - 1), WATER)
        RIMS.add((fx + dx, front))
        park.put(fx + dx, front, STONE_HI if dx < rx // 3 else STONE)   # the front of the rim, its top
        park.rect(fx + dx, front + 1, 1, 40 - front, tone(dx))  # the wall down to the path
        if dx % 5 == 0 and abs(dx) < rx - 1:
            park.rect(fx + dx, front + 2, 1, 39 - front - 1, STONE_DK if dx <= rx // 3 else "#24273e")
    for dx in (-8, -3, 2, 7):
        park.put(fx + dx, cy - 1, WATER_HI)                   # glints on the water
    park.rect(fx - rx, 40, 2 * rx + 1, 1, STONE_DK)
    shadow(fx - 10, fx + 17)
    # column and upper bowl, round too
    park.rect(fx - 1, 26, 3, cy - 26, STONE)
    park.rect(fx - 1, 26, 1, cy - 26, STONE_HI)
    park.rect(fx + 1, 26, 1, cy - 26, STONE_DK)
    for dx in range(-5, 6):
        park.put(fx + dx, 24 if abs(dx) < 4 else 25, STONE_HI)   # the bowl's rim, going round
        park.put(fx + dx, 26, STONE_HI if dx < -1 else STONE_DK if dx > 1 else STONE)
        if abs(dx) < 4:
            park.put(fx + dx, 25, WATER)
    for dx in range(-3, 4):
        park.put(fx + dx, 27, STONE_DK)                         # its underside
    park.put(fx, 24, STONE_HI)                                  # the spout
    # a cyan underglow on the stone, Neon Tokyo style
    park.anim("fglow", fx - 16, 31, 33, 9, "#36e3ff")
    # water: a jet up from the spout to the crown, then an unbroken arc down each side into the
    # basin, drawn solid; a brighter glint runs along the water in three frames, so it flows
    flow = [(0, y) for y in range(24, 19, -1)]        # the jet, bottom to top
    top, last = 20, 20
    for dx in range(1, 10):                          # each side: a parabola from the crown to the basin
        y = top + round(14 * (dx / 9) ** 2)
        for yy in range(last + 1 if y > last else y, y + 1):
            flow.append((dx, yy))                    # fill the steep part so the arc never breaks
        last = y
    for i, (dx, y) in enumerate(flow):
        for side in ((1,) if dx == 0 else (-1, 1)):
            park.anim("fjet", fx + side * dx, y, 1, 1, WATER)
            park.anim(f"fw{i % 3}", fx + side * dx, y, 1, 1, WATER_HI)
    for k in range(3):                               # ripples where the arcs land, and around the column
        for dx in (-9, -4, 4, 9):
            park.anim(f"fw{k}", fx + dx + k - 1, 35, 1, 1, WATER_HI)


WC_X = 594
WC_WALL, WC_TILE, WC_ROOF = "#2b2350", "#3a3260", "#1a1333"
WC_DOOR_C, WC_DOOR_HI, WC_DOOR_EDGE, WC_LIGHT = "#3c3470", "#4c4488", "#6a62a8", "#fff0c0"


def toilet(wx):
    """A small public toilet: a tiled box with a flat roof, a lit sign with the two figures, two
    doors, and a cyan strip light under the eave."""
    w, top = 34, 10
    park.rect(wx, top, w, 40 - top, WC_WALL)
    for ty in range(top + 2, 40, 3):               # tile courses
        park.rect(wx, ty, w, 1, WC_TILE)
    park.rect(wx - 2, top - 2, w + 4, 2, WC_ROOF)  # the roof and its eave
    park.rect(wx - 2, top - 3, w + 4, 1, "#3a3160")
    box3d(wx, top, w, 39, 4, "#1d1740", "#1d1740")      # the side wall (the roof covers its top)
    for ty in range(top + 2, 40, 3):
        for i in range(4):
            park.put(wx + w + i, ty - 1 - i, "#26204c")  # its tile courses
    box3d(wx - 2, top - 3, w + 4, top - 1, 4, "#120d26", "#4a4278")   # the roof's side and top
    park.rect(wx - 1, top, w + 2, 1, "#36e3ff")   # strip light
    park.anim("wcglow", wx - 3, top, w + 6, 4, "#36e3ff")
    # sign: a lit panel over the middle with a blue and a pink figure
    sx = wx + w // 2 - 5
    park.rect(sx, top + 3, 11, 7, "#e6f4ff")
    for fx, c in ((sx + 3, "#2c6fd1"), (sx + 7, "#e8443a")):
        park.put(fx, top + 4, c)                   # head
        park.rect(fx - 1, top + 5, 3, 2, c)        # body (the pink one a dress)
        if c == "#e8443a":
            park.rect(fx - 1, top + 7, 3, 1, c)
        else:
            park.put(fx - 1, top + 7, c); park.put(fx + 1, top + 7, c)
    # two doors, 9 x 25 (taller than anyone going in), both left ajar: a line of light at the
    # gap. The left one opens and shuts with whoever goes in (see the toilet visit).
    for dx, hand, gap in ((2, 6, 8), (w - 11, 2, 0)):
        park.rect(wx + dx - 1, 14, 11, 1, "#3a4058")      # the frame
        park.rect(wx + dx, 15, 9, 25, WC_DOOR_C)
        park.rect(wx + dx + (1 if gap == 0 else 0), 15, 8, 1, WC_DOOR_HI)
        park.put(wx + dx + hand, 28, "#c4cfe2")          # handle
        park.rect(wx + dx + gap, 15, 1, 25, WC_LIGHT)
    park.rect(wx - 1, 40, w + 2, 1, "#1d153a")
    shadow(wx, wx + w + 7)


GATE_X, GATE_W = 82, 30


def gate(gx):
    """The park's gate, over a way down to the subway: two stone posts under a vermilion beam
    with a lit sign, open between them (the stairs go down below the path, out of sight). Whoever
    leaves walks down them; whoever comes climbs up out of them."""
    w = GATE_W
    for px in (gx, gx + w - 3):
        park.rect(px, 11, 3, 29, "#4a4278")          # posts
        park.rect(px, 11, 1, 29, "#6a5fa8")          # their lit edge
        park.rect(px + 2, 11, 1, 29, "#2b2450")      # and shade
        park.rect(px - 1, 39, 5, 1, "#2b2450")       # feet
    park.rect(gx - 3, 6, w + 6, 1, "#c83a3a")        # the beam's upturned top
    park.rect(gx - 2, 7, w + 4, 2, "#e0503a")        # the beam
    park.rect(gx - 2, 9, w + 4, 1, "#9a2a2a")
    park.rect(gx - 1, 11, w + 2, 1, "#c83a3a")       # the tie beam under it
    sx = gx + w // 2 - 5
    park.rect(sx, 9, 10, 2, "#1d1740")               # the sign board, lit
    park.rect(sx + 1, 10, 8, 1, "#36e3ff")
    park.anim("vglow", sx - 1, 8, 12, 4, "#36e3ff")
    park.rect(gx + 3, GROUND, w - 6, 3, PATH)        # no hedge between the posts: the way is open
    shadow(gx - 1, gx + w + 1)


for bx, bw in ((143, 14), (247, 26), (412, 11), (567, 20)):
    flower_bed(bx, bw)
lamp(60)
gate(GATE_X)
bench(120)
vending(164, 1)
vending(180, 2)
cherry(230)
vending(280, 0)
lamp(330)
bench(390)
vending(428, 2)
vending(444, 1)
fountain(FOUNTAIN_X)
lamp(560)
toilet(WC_X)

# ---------- winter: snow lying on things, the beds asleep, the fountain frozen ----------
# Snow lies on every top with open sky two rows above it (so not between a bench's slats), not
# on the path, the stairs' opening or the cherry tree (it has its own). Two layers: a dusting
# (sg1: the caps drawn dashed), then the full cover (sg2: the same caps solid, piled a row higher
# on wide tops, and the kerbs' own tops white), as it gets deep. The beds' leaves turn to dark
# bushes and the fountain's water to ice by their colours (PARK_WINTER_PAINT); register.tsx cuts
# the flowers and the jet out of a winter drawing.
_crown = [x for (x, y), c in park.grid.items() if c in ("#b04080", "#d65c98", "#f07cb4", "#ff9cc8", "#ffb7d5", "#ffd6e8", "#fff4f9") and y < GROUND]
_open = lambda x, y: park.grid.get((x % PARK_P, y)) is None
SNOW_CAPS = set()
for (x, y), c in park.grid.items():
    if y > GROUND or y - 2 < -TOP or not (_open(x, y - 1) and _open(x, y - 2)):
        continue
    if min(_crown) <= x <= max(_crown) and y < GROUND - 3:
        continue
    if GATE_X + 3 <= x < GATE_X + GATE_W - 3 and y >= GROUND:
        continue
    SNOW_CAPS.add((x, y - 1))
RIMS |= {xy for xy, c in park.grid.items() if c == RING_TOP or (c == BED_TOP and xy[1] == GROUND)}
SNOW_DEEP = {xy: SNOW_ON for xy in RIMS}
for x, y in SNOW_CAPS:                   # a row higher on wide tops, all but their ends
    if all((x + k, y) in SNOW_CAPS for k in (-2, -1, 1, 2)):
        SNOW_DEEP[(x, y - 1)] = SNOW_ON
_snrd = random.Random(41)
SNOW_DUST = {}
for n in range(40):                      # a few specks blown onto the path's back edge
    xy = (_snrd.randrange(PARK_P), _snrd.choice([GROUND + 2, GROUND + 2, GROUND + 3]))
    (SNOW_DUST if n < 12 else SNOW_DEEP)[xy] = SNOW_ON
_caps_svg = paths({xy: SNOW_ON for xy in SNOW_CAPS}).replace('" d="', '" id="scp" d="', 1)
# the snow on the tree's limbs: every other flake with the first dusting, the rest once it lies deep
_limbs = sorted(TREE_SNOW)
_limbs1 = {xy: TREE_SNOW[xy] for xy in _limbs[0::2]}
_limbs2 = {xy: TREE_SNOW[xy] for xy in _limbs[1::2]}
SNOW_SVG = (f'<g class="sg1">{_caps_svg}{paths({**SNOW_DUST, **_limbs1})}</g><g class="sg2"><use href="#scp"/>{paths({**SNOW_DEEP, **_limbs2})}</g>')
WINTER_PAINT = [(LEAF, "#1c3a2c", ""), (LEAF_HI, "#2a5038", ""), (LEAF_DK, "#132a22", ""), (WATER, "#a8d4e8", "")]


# ---------- summer nights: fireflies ----------
# A few fireflies over the hedge, the flower beds, round the cherry tree and the fountain, most of
# them low: each a dot with a faint glow, blinking at its own pace and drifting a few pixels to
# and fro. One set per park tile (class ffl, used once per tile like the petals); register.tsx
# draws them only in summer, and lets them out at night (ffy, on the day's clock) and not in rain.
FF_CORE, FF_GLOW = "#f4ff9a", "#c8f050"
_frnd = random.Random(53)
_busy = [(GATE_X - 3, GATE_X + GATE_W + 3), (160, 200), (276, 300), (424, 464), (WC_X - 4, WC_X + 42)]
_spots = ([(lambda: (_frnd.randrange(PARK_P), _frnd.randrange(29, 35)))] * 6
          + [(lambda bx=bx, bw=bw: (_frnd.randrange(bx, bx + bw + 4), _frnd.randrange(24, 31))) for bx, bw in ((143, 14), (247, 26), (412, 11), (567, 20))]
          + [(lambda: (_frnd.randrange(208, 256), _frnd.randrange(6, 28)))] * 4
          + [(lambda: (_frnd.randrange(FOUNTAIN_X - 14, FOUNTAIN_X + 15), _frnd.randrange(16, 30)))] * 2)
FIREFLIES = []
for n, spot in enumerate(_spots):
    while True:
        fx, fy = spot()
        if not any(a <= fx <= b for a, b in _busy):
            break
    FIREFLIES.append((fx, fy, n % 4))
# one firefly drawn once (fg), used at each place; four paces of blinking and drifting, taken in turn
FF_PACES = [(3.1, 8.3, 0.4), (4.4, 11.6, 2.9), (2.7, 9.7, 5.3), (3.8, 12.9, 7.6)]
FIREFLY_DEF = f'<g id="fg"><rect x="-1" y="-1" width="3" height="3" fill="{FF_GLOW}" opacity=".3"/><rect width="1" height="1" fill="{FF_CORE}"/></g>'
FIREFLY_SVG = ("".join(f'<use class="ff fp{k}" href="#fg" x="{fx}" y="{fy}"/>' for fx, fy, k in FIREFLIES))
FIREFLY_STYLE = (
    ".ff{animation:ffb 3s linear infinite,ffd 9s ease-in-out infinite alternate}"
    + "".join(f".fp{k}{{animation-duration:{b}s,{d}s;animation-delay:-{dl}s}}" for k, (b, d, dl) in enumerate(FF_PACES))
    + "@keyframes ffb{0%{opacity:0}15%{opacity:1}35%{opacity:1}55%{opacity:0}100%{opacity:0}}"
    "@keyframes ffd{0%{translate:0 0}25%{translate:2px -2px}50%{translate:4px 0}75%{translate:1px -3px}100%{translate:-2px -1px}}"
    ".ffy{opacity:0;animation-name:ffy}" + keyframes("ffy", [(0, "opacity:1"), (1, "opacity:.6"), (2, "opacity:0"), (19.5, "opacity:0"), (21, "opacity:1"), (24, "opacity:1")])
)


# ---------- people ----------
# Rain gear: person(i, rain=True) adds an umbrella, these two their own, the rest one of UMBRELLAS.
WALKERS_N = 6   # the first six outfits walk the path
STAY_IN = {4, 6, 7}   # walkers who stay home in the rain: the green stroller, the dog walker, the cyclist






def small_paths(pixels):
    return paths(pixels)


# ---------- people: templates drawn once, each person a few <use>s in their own colours ----------
import people_art as PA

TPL_IDS = {}        # template name -> id, in the order first used
CLS_USED = set()    # colour letters drawn through a variable


def pcode(ch):
    return ch if ch.isupper() else ch + "2"     # j -> j2: no two names differ only in case


def use(name):
    if name not in TPL_IDS:
        TPL_IDS[name] = f"{len(TPL_IDS)}"     # a token: short_ids() gives the real id
    return f'<use href="#{TPL_IDS[name]}"/>'


def uses(parts):
    return "".join(use(n) for n in parts)


SHADES = {PA.FIXED["k"]: "kb", PA.FIXED["t"]: "kf"}


def template_markup(tid, pixels, track=True):
    pix = {}
    for k, ch in pixels.items():
        if ch.startswith("#"):
            pix[k] = ch
        elif ch in PA.FIXED:
            pix[k] = PA.FIXED[ch]
        else:
            if track:
                CLS_USED.add(ch)
            pix[k] = "@" + pcode(ch)
    # (a step's shades see-through, so never laid one under the other)
    shades = set(pix.values()) <= SHADES.keys()
    under = "" if shades else underpaint(pix)
    out = re.sub(r'stroke="@(\w+)"', r'class="c\1"', under + paths(pix))
    # a step's shades over the legs (people_art: k, t)
    for colour, cls in SHADES.items():
        out = out.replace(f'stroke="{colour}"', f'class="{cls}"').replace(f'style="fill:{colour}"', f'class="{cls}" style="fill:#000;stroke:none"')
    return f'<g id="{tid}">' + out + "</g>"


# Colours every person has, laid under a row of several first; else the row's commonest colour,
# never one a season may leave out (autumn's scarf ends are no colour for those without a scarf).
UNDER = ["S", "H", "B"]
NOT_UNDER = {"@v2"}


def underpaint(pix):
    """Each unbroken row of several colours laid first in one of them end to end, and those pixels
    left out of the rest: while the band glides the runs' edges blur, and the background no longer
    shows through between them, as it did round the eyes. Takes them out of `pix`."""
    under = ["@" + pcode(ch) for ch in UNDER]
    runs = {}
    rows = {}
    for (x, y) in pix:
        rows.setdefault(y, []).append(x)
    for y in sorted(rows):
        xs = sorted(rows[y])
        i = 0
        while i < len(xs):
            j = i
            while j + 1 < len(xs) and xs[j + 1] == xs[j] + 1:
                j += 1
            seg = xs[i:j + 1]
            colours = {pix[(x, y)] for x in seg}
            row = [pix[(x, y)] for x in seg]
            fits = sorted(colours - NOT_UNDER, key=lambda c: (-row.count(c), c))
            base = next((c for c in under if c in colours), fits[0] if fits else None)
            if len(colours) > 1 and base is not None:
                runs.setdefault(base, []).append((seg[0], y, len(seg)))
                for x in seg:
                    if pix[(x, y)] == base:
                        del pix[(x, y)]
            i = j + 1
    return "".join(f'<path stroke="{c}" d="{runs_d(r)}"/>' for c, r in runs.items())


def template_defs():
    return "".join(template_markup(tid, PA.TEMPLATES[name]) for name, tid in TPL_IDS.items())


def season_defs(dressed):
    """The templates a season dresses differently, under the same ids: the band swaps them in."""
    return "".join(template_markup(tid, dressed[name], False) for name, tid in TPL_IDS.items() if name in dressed)


def winter_defs():
    return season_defs(PA.WINTER)


def colour_css():
    return "".join(f".c{pcode(ch)}{{stroke:var(--{pcode(ch)}{',var(--j2)' if ch == 'a' else ''})}}" for ch in sorted(CLS_USED))


def vars_of(person, parts):
    return re.sub(r"--(\w)(?=:)", lambda m: "--" + pcode(m.group(1)), PA.var_style(person, parts))


def split(frames):
    """Parts every frame shares, then each frame's own: {key: parts} -> (shared, {key: own})."""
    lists = list(frames.values())
    shared = [n for n in lists[0] if all(n in other for other in lists[1:])]
    return shared, {k: [n for n in v if n not in shared] for k, v in frames.items()}


def steps_svg(pa, pb):
    shared, own = split({"pa": pa, "pb": pb})
    return uses(shared) + f'<g class="pa">{uses(own["pa"])}</g><g class="pb">{uses(own["pb"])}</g>'


# A person's walk, four steps to a stride: a step (pa), their feet passing (pb), a step on the
# other foot (pa again, the far leg, the darker, now the one in front: --kb and --kf),
# passing again. On each step, the legs apart, they sink a pixel (wb, round the whole of them), and
# rise as the feet pass: the step's legs are drawn a row shorter, so their feet stay on the ground.
STEPS = ("pa", "pb")
STEP_OF = {"pa": "a", "pb": "b"}


def stride_svg(where):
    """`where`: [(part, group path)], each part's place: () for drawn in every step, else the
    classes of the groups it sits in (a step's, then dry or wet)."""
    def emit():
        tree = {}
        for n, path in where:
            node = tree
            for cls in path:
                node = node.setdefault(cls, {})
            node.setdefault(None, []).append(n)

        def draw(node):
            text = uses(node.get(None, []))
            for cls, sub in node.items():
                if cls is not None:
                    text += f'<g class="{cls}">{draw(sub)}</g>'
            return text
        return draw(tree)
    return emit()


def walk_svg(person):
    frames = {k: PA.walk_parts(person, STEP_OF[k]) for k in STEPS}
    shared, own = split(frames)
    where = [(n, ()) for n in shared] + [(n, (k,)) for k in STEPS for n in own[k]]
    return stride_svg(where), list(dict.fromkeys(n for v in frames.values() for n in v))


def walker_body(i, person, rain):
    """A walker's two steps, and if they go out in the rain the same with an umbrella: what all
    four share drawn once, each step's own in pa/pb, and in there what only dry or only wet shows."""
    if not rain:
        return walk_svg(person)
    dry = {k: PA.walk_parts(person, STEP_OF[k]) for k in STEPS}
    wet = {k: PA.walk_parts(person, STEP_OF[k], True) for k in STEPS}
    every = list(dict.fromkeys([n for v in dry.values() for n in v] + [n for v in wet.values() for n in v]))
    shared, out_dry, out_wet = [], [], []
    step = {k: {"both": [], "dry": [], "wet": []} for k in STEPS}
    for n in every:
        d = {k: n in dry[k] for k in step}
        w = {k: n in wet[k] for k in step}
        if all(d.values()) and all(w.values()):
            shared.append(n)
        elif all(d.values()) and not any(w.values()):
            out_dry.append(n)
        elif all(w.values()) and not any(d.values()):
            out_wet.append(n)
        else:
            for k in step:
                if d[k] and w[k]:
                    step[k]["both"].append(n)
                elif d[k]:
                    step[k]["dry"].append(n)
                elif w[k]:
                    step[k]["wet"].append(n)

    dry_g, wet_g = f"wd{i}", f"ww ww{i}"
    where = ([(n, ()) for n in shared] + [(n, (dry_g,)) for n in out_dry] + [(n, (wet_g,)) for n in out_wet])
    for k in STEPS:
        where += ([(n, (k,)) for n in step[k]["both"]] + [(n, (k, dry_g)) for n in step[k]["dry"]]
                  + [(n, (k, wet_g)) for n in step[k]["wet"]])
    return stride_svg(where), every


def walker_svg(i, direction, y, body, width, style="", bob=True):
    flip = f' transform="translate({width},0) scale(-1,1)"' if direction < 0 else ""
    st = f' style="{style}"' if style else ""
    wb = ' class="wb"' if bob else ""
    return (f'<g class="w w{i}"><g class="wn{i}" transform="translate(0,{y})"><g{wb}{flip}{st}>'
            f'{body}</g></g></g>')


PERSON_H = 22
FEET_Y = 42
# Walkers loop from WALK_PAD px off the left edge to 4 px off the right: the widest of them (the
# dog walker, 24) is wholly off screen at both ends, so nobody pops in or out at the turn of a lap.
WALK_PAD = 28
WALK_LOOP = W + WALK_PAD + 4
walkers = []  # (index, direction, duration_s)
people_svg = ""
for i in range(WALKERS_N):
    direction = 1 if i % 2 == 0 else -1
    speed = rnd.uniform(7, 11)
    dur = snap_walk((W + 20) / speed)
    y = FEET_Y - PERSON_H + 1 - (i % 2)  # two lanes, one row apart
    body, parts = walker_body(i, PA.STROLLERS[i], i not in STAY_IN)
    people_svg += walker_svg(i, direction, y, body, 11, vars_of(PA.STROLLERS[i], parts))
    walkers.append((i, direction, dur))


# A dog walker and a cyclist join the walkers.




for i, (kind, direction, speed, width) in enumerate((("dog", 1, 6.5, 24), ("bike", -1, 24, 23)), start=WALKERS_N):
    dur = snap_walk((W + 20) / speed)
    y = FEET_Y - PERSON_H + 1 - (i % 2)
    if kind == "dog":
        pa, pb = PA.dog_parts("a"), PA.dog_parts("b")
        people_svg += walker_svg(i, direction, y, steps_svg(pa, pb), width, vars_of(PA.DOG_WALKER, pa + pb))
    else:
        a, b = PA.cyclist_pixels("a"), PA.cyclist_pixels("b")
        same = {k: c for k, c in a.items() if b.get(k) == c}
        steps = (small_paths(same) + f'<g class="pa">{small_paths({k: c for k, c in a.items() if k not in same})}</g>'
                 f'<g class="pb">{small_paths({k: c for k, c in b.items() if k not in same})}</g>'
                 f'<g class="wsc">{small_paths(PA.cyclist_scarf())}</g>')
        people_svg += walker_svg(i, direction, y, steps, width, bob=False)
    walkers.append((i, direction, dur))


# Office workers and students, briskly, in the rush hours only.
COMMUTERS = [(16, 1, 72), (19, -1, 80), (17, -1, 90), (20, 1, 72), (18, 1, 80), (21, -1, 90), (22, -1, 80)]
for k, (outfit, direction, dur) in enumerate(COMMUTERS):
    i = len(walkers)
    y = FEET_Y - PERSON_H + 1 - (i % 2)
    body, parts = walker_body(i, PA.COMMUTERS[k], True)
    people_svg += walker_svg(i, direction, y, body, 11, vars_of(PA.COMMUTERS[k], parts))
    walkers.append((i, direction, snap_walk(dur)))
    WALK_HOURS[i] = RUSH


# ---------- bench visitors: walk up, sit a while, walk on (they move with the park) ----------
# The first way the park drew its visitors. The stages further down (everyone comes and goes by
# the gate) draw them now; this part still runs because it sets up the helpers they use, and the
# order it first uses the people's parts in names the shared templates in park.ts.


# Visitors walk a whole tile in to their spot, stay a while, and walk a whole tile on (or back).
VISIT_SPEED = 9                       # art px per second, like the walkers
visit_plan = {}  # index -> (seconds stopped, turns back)
visitor_svg = ""
WALK_Y = GROUND + 4 - 21                 # visitors' feet on the path's back edge (row 40)


def visitor_walk(person):
    return walk_svg(person)


def styled(body, x, y, extra=""):
    return f'<g transform="translate({x},{y}){extra}">{body}</g>'


def visit_group(vi, person, parts, inner, back=False):
    """A visitor's group (the class the visit's timing hangs on), their colours set once inside."""
    return f'<g class="v {"vb " if back else ""}v{vi}"><g style="{vars_of(person, parts)}">{inner}</g></g>'


for vi, (bx, who, period) in enumerate(((120, "bench_coat", 60), (390, "bench_tee", 74))):
    person = PA.VISITORS[who]
    steps, wparts = visitor_walk(person)
    seat = PA.side_sit_parts(person)
    sit_x, sit_y = bx + 3, 36 - 14     # thighs on the seat (rows 34 and 35)
    visitor_svg += visit_group(vi, person, wparts + seat,
                               f'<g class="vw">{styled(steps, sit_x, WALK_Y)}</g>'
                               f'<g class="vs">{styled(uses(seat), sit_x, sit_y)}</g>')
    visit_plan[vi] = (round(period * 0.35, 1), False)






DRINK_SPOT = 282          # square in front of the machine at 280


def drink_act(person):
    """At the machine: from behind (a hand down, then up at a button), then turned round with the
    can (held, then up to the lips). Each pose its own group, timed by drink_css()."""
    legs = ["legs_stand"]
    back = [f"bhead_{person['head']}", f"bbody_{person['torso']}"]
    front = [f"fhead_{person['fhead']}", f"sbody_{person['torso']}"]
    poses = {"kb0": back + ["barm_down"], "kb1": back + ["barm_press"],
             "kf0": front + ["farm_hold"], "kf1": front + ["farm_drink"]}
    svg = uses(legs) + "".join(f'<g class="{k}">{uses(v)}</g>' for k, v in poses.items())
    return svg, legs + [n for v in poses.values() for n in v]


ACTIONS = [
    # (spot x, who, seconds per visit, the front arm while stopped, what blinks on (and off))
    (DRINK_SPOT, "drink", 52, None, (None, None)),             # see drink_act()
    (199, "photo", 66, "arm_f_photo", ("arm_flash", None)),          # phone up at the blossom, the flash
    (44, "read", 80, "arm_f_read", ("arm_readlit", None)),           # reading a phone, its screen lit
]
# Whoever stops right beside a machine turns round and goes back the way they came, rather
# than walking on across the machine's front.
TURNS_BACK = {DRINK_SPOT}
for vi, (spot, who, period, front, (on, off)) in enumerate(ACTIONS, start=len(visit_plan)):
    person = PA.VISITORS[who]
    steps, wparts = visitor_walk(person)
    if who == "drink":
        act, aparts = drink_act(person)
        DRINK_VI = vi
    else:
        still = PA.stand_parts(person, front)
        act = uses(still) + f'<g class="blink">{use(on)}</g>' + (f'<g class="blinkr">{use(off)}</g>' if off else "")
        aparts = still + [on] + ([off] if off else [])
    if spot in TURNS_BACK:
        visitor_svg += visit_group(vi, person, wparts + aparts,
                                   f'<g class="vin">{styled(steps, spot, WALK_Y)}</g>'
                                   f'<g class="vs">{styled(act, spot, WALK_Y)}</g>'
                                   f'<g class="vout">{styled(steps, spot + 11, WALK_Y, " scale(-1,1)")}</g>', back=True)
    else:
        visitor_svg += visit_group(vi, person, wparts + aparts,
                                   f'<g class="vw">{styled(steps, spot, WALK_Y)}</g>'
                                   f'<g class="vs">{styled(act, spot, WALK_Y)}</g>')
    visit_plan[vi] = (round(period * 0.35, 1), spot in TURNS_BACK)


# Someone walks up to the toilet, goes in through the left door (gone while inside), comes out
# and walks on.
WC_DOOR = WC_X + 2                   # the left door's first column


def door_state(open_cols):
    """The left door swung `open_cols` of its 9 columns open: 0 shut tight, else the panel seen
    narrower, its edge lit, the lit room behind."""
    px = {}
    if open_cols == 0:
        for y in range(15, 40):
            px[(WC_DOOR + 8, y)] = WC_DOOR_C              # the gap closed
        px[(WC_DOOR + 8, 15)] = WC_DOOR_HI
        return px
    keep = 9 - open_cols
    for y in range(15, 40):
        px[(WC_DOOR + keep - 1, y)] = WC_DOOR_EDGE
        for x in range(WC_DOOR + keep, WC_DOOR + 9):
            px[(x, y)] = WC_LIGHT if y < 39 else "#d8c48a"   # the floor inside
    return px






# Someone sits up straight at the other end of the first bench for a long while, on their phone.
person = PA.VISITORS["phone"]
phone_x = 120 + 15
steps, wparts = visitor_walk(person)
seat = PA.front_sit_parts(person, phone=True)
screen = '<g class="blink">' + use("fscreen") + "</g>"     # the screen flickering as they play
visitor_svg += visit_group(vi, person, wparts + seat + ["fscreen"],
                           f'<g class="vw">{styled(steps, phone_x, WALK_Y)}</g>'
                           f'<g class="vs">{styled(uses(seat) + screen, phone_x, 23)}</g>')

# Someone sits up straight at the far end of the second bench, facing out.
person = PA.VISITORS["front"]
front_x = 390 + 15
steps, wparts = visitor_walk(person)
seat = PA.front_sit_parts(person)
visitor_svg += visit_group(vi, person, wparts + seat,
                           f'<g class="vw">{styled(steps, front_x, WALK_Y)}</g>'
                           f'<g class="vs">{styled(uses(seat), front_x, 23)}</g>')


# ---------- the cast (v0.34): who can do what, where ----------
# People, by index p (the order cast.ts knows them in), and the art each is drawn with.
CAST = [("coat", "bench_coat"), ("tee", "bench_tee"), ("red", "drink"), ("bun", "photo"),
        ("pink", "read"), ("satchel", "toilet"), ("cap", "phone"), ("hoodie", "front")]
# The stages, in visit_plan order, each with its action and who can do it there (variant n + 1 is
# the n-th in the list; whoever the stage was drawn for first). A bench is two stages: its side
# seat and its front seat, so it never seats more than two.







def side_sit(person):
    seat = PA.side_sit_parts(person)
    return uses(seat), seat


FRONT_SIT_Y = 22   # sitting up straight on a bench's front edge, feet on the walk line (row 40)


def front_sit(phone):
    def make(person):
        seat = PA.front_sit_parts(person, phone=phone)
        return uses(seat), seat
    return make


def standing(front, on):
    def make(person):
        still = PA.stand_parts(person, front)
        return uses(still), still
    return make


def stage_group(vi, inner, back=False):
    return f'<g class="v {"vb " if back else ""}v{vi}">{inner}</g>'


# ---------- v0.36: everyone comes and goes by the gate ----------
# Nobody walks in from a tile away any more: a visitor steps out of the gate, walks to the stop,
# stays, walks back and goes down the gate's stairs, out of sight. So a visit keeps to its own copy of the tile
# (or the gate just past its edge), and who it is changes only while nobody is there.
GATE_AT = GATE_X + GATE_W // 2 - 5   # a walker standing in the gate's way down (their x)
TURN = 1.2                      # turned to a door before going in
SINK = 2.0                      # going down the gate's stairs out of sight, or coming up them
DEEP = 22                       # how far down: their head below the path's back edge
BACK = 4                        # the stairs go down at the path's back edge, this far behind the walk
GAP = 1.5                       # nobody there at either end of a visit
GATES = [GATE_AT + k * PARK_P for k in (-1, 0, 1, 2)]

# Everyone the stages draw: the cast by index, then the talkers (talker t is person 8 + t).
PEOPLE = [PA.VISITORS[who] for _, who in CAST] + list(PA.TALKERS)
# Who talks with whom: pair n is variant n + 1 at the talk stage, (left, right) by talker.
PAIRS = [(0, 1), (5, 6)]
TALK_A, TALK_B = 466, 477
# The stages: action, who (variant n + 1 is the n-th), and their stop's x. The toilet's men use
# the left door, its women the right (variants 3 and 4).
STAGES = [("bench", [0, 1, 2, 3]), ("bench", [1, 0, 3, 2]), ("drink", [2]), ("photo", [3, 1, 2, 4]),
          ("read", [4, 0, 3, 5, 6, 7]), ("toilet", [5, 7, 4, 3]), ("bench", [6, 7, 5]), ("bench", [7, 6, 5]),
          ("talk", [8 + n for n in range(len(PAIRS))])]
# how long each stage's stop lasts (s), and its period: the old ones, the talk's 180
STOP = [120, 120, 45, 60, 90, 45, 170, 100, 100]
PERIODS = [period_of for period_of in (120, 180, 120, 120, 120, 120, 160, 180, 180)]

_used = sorted({q for _, ppl in STAGES[:-1] for q in ppl} | {8 + t for pair in PAIRS for t in pair})
_parts = {q: [] for q in _used}
WALK_DEFS = ""
for _q in _used:
    _steps, _wparts = visitor_walk(PEOPLE[_q])
    _back = PA.back_parts(PEOPLE[_q])
    # the walk, or (while --bk is 1) their back, turned to a door or the gate
    WALK_DEFS += f'<g id="wk{_q}" class="pp{_q}"><g class="wks wb">{_steps}</g><g class="bkp">{uses(_back)}</g></g>'
    _parts[_q] += _wparts + _back


# Each stage's span of a visit in view (s into its period): out of the gate to back in.
SHOWN = {}


def to_gate(x):
    """From a stop at x to the nearest gate, in px (negative: the gate is to the left)."""
    return min((g - x for g in GATES), key=abs)


def walks_n(pairs, x, y=WALK_Y):
    return styled("".join(f'<use class="k{n}" href="#wk{q}"/>' for n, q in pairs), x, y)


def poses_n(pairs, make, x, y, lit=None, extra=""):
    out = f'<g class="kn"><g class="blink">{use(lit)}</g></g>' if lit else ""
    for n, q in pairs:
        svg, parts = make(PEOPLE[q])
        _parts[q] += parts
        out = f'<g class="k{n} pp{q}">{svg}</g>' + out
    return styled(out, x, y, extra)


def numbered(ppl):
    return [(n + 1, q) for n, q in enumerate(ppl)]


def talking(gesture):
    def make(person):
        still = PA.stand_parts(person, None)
        return (uses(still) + f'<g class="{gesture}">{use("arm_f_talk")}</g><g class="{gesture}r">{use("arm_f_down")}</g>',
                still + ["arm_f_talk", "arm_f_down"])
    return make


def stop_times(period, w, stop, turns):
    """When the stop starts and ends, the visit centred in its period; w the longer walk."""
    stop = min(stop, period - 2 * GAP - 2 * w - turns * TURN - 2 * SINK)
    t1 = (period - (2 * w + turns * TURN + 2 * SINK + stop)) / 2 + w + SINK
    return t1, t1 + stop


def leg_css(sel, period, x, d, t1, t2, door=False):
    """One walker's visit, the group `sel` moving them: up the gate's stairs d px from the stop at
    x, there at t1, off at t2, back to the gate, turned to it and down the stairs, gone. With `door`, they turn to a
    door at the stop and go in, and come out of it at t2. Its .vw walks, its .vs is the stop."""
    w = abs(d) / VISIT_SPEED
    t0, t3 = t1 - w, t2 + w
    tu, t4 = t0 - SINK, t3 + SINK
    assert tu >= GAP - 0.01 and t4 <= period - GAP + 0.01, (sel, t0, t4, period)
    vi = int(sel[2:].split(" ")[0])
    lo, hi = SHOWN.get(vi, (tu, t4))
    SHOWN[vi] = (min(lo, tu), max(hi, t4))
    flip = f"matrix(-1,0,0,1,{2 * x + 11},0)"
    tin, tout = (flip, "none") if d > 0 else ("none", flip)
    n = "".join(ch for ch in sel if ch.isalnum())

    def p(t):
        return f"{round(t / period * 100, 1):g}%"

    # (held from one mark to the next: each names only what changes there) --o shows the walk,
    # --f turns it the way they go, --bk shows their back, --s shows the stop
    # (before the first mark, none is set: all hidden, the stop too)
    frames = f"{p(tu)}{{--o:1;--f:{tin}}}"
    frames += f"{p(t1)}{{--bk:1}}{p(t1 + TURN)}{{--o:0;--bk:0}}" if door else f"{p(t1)}{{--o:0;--s:1}}"
    frames += f"{p(t2)}{{--o:1;--f:{tout};--s:0}}{p(t3)}{{--bk:1}}{p(t4)}{{--o:0}}"
    # Up the stairs at the path's back edge, in the gate's opening, a step straight down onto the
    # path's walk line and along it to the stop; back along it into the opening, a step straight up
    # to the edge, turned to the gate, and down the stairs (never a slant, nor a walk along the
    # edge). The group moves them along and up and down the step; its .vw goes up and down the
    # stairs, cut off (clip gk, only while on them) just under their feet: so below the edge they
    # are out of sight, and on the path in the opening all of them shows. The walk's time is
    # shared out by the distance, the step counted in.
    k = (t1 - t0) / (abs(d) + BACK)
    ts = BACK * k
    frames = frames.replace(f"{p(tu)}{{--o:1;", f"{p(tu)}{{--k:url(#gk);--o:1;", 1)
    frames = frames.replace(f"{p(t1)}{{", f"{p(t0)}{{--k:none}}{p(t1)}{{", 1)
    frames = frames.replace(f"{p(t3)}{{--bk:1}}", f"{p(t3)}{{--bk:1;--k:url(#gk)}}", 1)
    return (f"{sel}{{animation:m{n} {period}s linear var(--vd) infinite,w{n} {period}s steps(1,end) var(--vd) infinite;clip-path:var(--k,none)}}"
            f"{sel} .vw{{animation:s{n} {period}s linear var(--vd) infinite}}"
            f"@keyframes m{n}{{0%,{p(t0)}{{translate:{d}px -{BACK}px}}{p(t0 + ts)}{{translate:{d}px 0}}{p(t1)},{p(t2)}{{translate:0}}"
            f"{p(t3 - ts)}{{translate:{d}px 0}}{p(t3)},100%{{translate:{d}px -{BACK}px}}}}"
            f"@keyframes s{n}{{0%,{p(tu)}{{translate:0 {DEEP + BACK}px}}{p(t0)},{p(t3)}{{translate:0}}{p(t4)},100%{{translate:0 {DEEP + BACK}px}}}}"
            f"@keyframes w{n}{{{frames}}}")




visitor_svg = ""
VISIT_CSS = ""


def simple(vi, x, pose_svg):
    """A stage of one walker: in from the gate to x, the pose, back out."""
    global visitor_svg, VISIT_CSS
    period, d = PERIODS[vi], to_gate(x)
    t1, t2 = stop_times(period, abs(d) / VISIT_SPEED, STOP[vi], 1)
    visitor_svg += stage_group(vi, f'<g class="vw">{walks_n(numbered(STAGES[vi][1]), x)}</g><g class="vs">{pose_svg}</g>')
    VISIT_CSS += leg_css(f".v{vi}", period, x, d, t1, t2)
    return t1, t2


for vi, bx in ((0, 123), (1, 393)):
    simple(vi, bx, poses_n(numbered(STAGES[vi][1]), side_sit, bx, 36 - 14))
_t1, _t2 = simple(2, DRINK_SPOT, poses_n(numbered(STAGES[2][1]), drink_act, DRINK_SPOT, WALK_Y))


def drink_css2(vi, period, t1, t2):
    """The drink buyer's poses through the stop: looking at the machine, a hand up at a button, a
    hand down at the slot for the can, then turned round, holding it and drinking twice."""
    def pc(f):
        return f"{(t1 + f * (t2 - t1)) / period * 100:.2f}%"
    plan = {"kb0": [(0, 0.12), (0.22, 0.32)], "kb1": [(0.12, 0.22)],
            "kf0": [(0.32, 0.44), (0.58, 0.68), (0.82, 1.01)], "kf1": [(0.44, 0.58), (0.68, 0.82)]}
    run = f"{period}s steps(1,end) var(--vd) infinite"
    css = ".kb0,.kb1,.kf0,.kf1{opacity:0}"
    for k, spans_ in plan.items():
        keys = "".join(f"{pc(a)}{{opacity:1}}{pc(b)}{{opacity:0}}" for a, b in spans_)
        css += f".v{vi} .{k}{{animation:{k}{vi} {run}}}@keyframes {k}{vi}{{0%{{opacity:0}}{keys}}}"
    return css + "@media (prefers-reduced-motion: reduce){.kb0,.kb1,.kf1{animation:none!important}.kf0{animation:none!important;opacity:1}}"


VISIT_CSS += drink_css2(2, PERIODS[2], _t1, _t2)
for vi, (spot, _, _, front, (on, _)) in ((3, ACTIONS[1]), (4, ACTIONS[2])):
    simple(vi, spot, poses_n(numbered(STAGES[vi][1]), standing(front, on), spot, WALK_Y, on))
for vi, bx, phone in ((6, phone_x, True), (7, front_x, False)):
    simple(vi, bx, poses_n(numbered(STAGES[vi][1]), front_sit(phone), bx, FRONT_SIT_Y, "fscreen" if phone else None))

# The toilet: men to the left door, women to the right; each turns to it, it opens, they go in;
# a while later it opens and out they come. Only the door of whoever is in it moves.
WC_RDOOR = WC_X + 34 - 11
_men, _women = numbered(STAGES[5][1])[:2], numbered(STAGES[5][1])[2:]
_xm, _xf = WC_DOOR - 3, WC_RDOOR - 3
_dm, _df = to_gate(_xm), to_gate(_xf)
_period = PERIODS[5]
_t1, _t2 = stop_times(_period, max(abs(_dm), abs(_df)) / VISIT_SPEED, STOP[5], 2)


def _door_r(open_cols):
    return {(WC_RDOOR + 8 - (x - WC_DOOR), y): c for (x, y), c in door_state(open_cols).items()}


_states = lambda f: f'<g class="dh">{paths(f(4))}</g><g class="do">{paths(f(7))}</g><g class="ds">{paths(f(0))}</g>'
visitor_svg += stage_group(5, f'<g class="dl">{_states(door_state)}</g><g class="dr">{_states(_door_r)}</g>'
                              f'<g class="tm"><g class="vw">{walks_n(_men, _xm)}</g></g>'
                              f'<g class="tf"><g class="vw">{walks_n(_women, _xf)}</g></g>')
VISIT_CSS += leg_css(".v5 .tm", _period, _xm, _dm, _t1, _t2, door=True)
VISIT_CSS += leg_css(".v5 .tf", _period, _xf, _df, _t1, _t2, door=True)


def _door_keys(name, spans_):
    pc = lambda t: f"{t / _period * 100:.2f}%"
    return f"@keyframes {name}{{0%{{opacity:0}}" + "".join(f"{pc(a)}{{opacity:1}}{pc(b)}{{opacity:0}}" for a, b in spans_) + "}"


_run = f"{_period}s steps(1,end) var(--vd) infinite"
VISIT_CSS += (
    ".dh,.do,.ds{opacity:0}"
    f".v5 .dh{{animation:dh5 {_run}}}" + _door_keys("dh5", [(_t1 + .1, _t1 + .5), (_t1 + 1.4, _t1 + 1.8), (_t2 - .8, _t2 - .4), (_t2 + .5, _t2 + .9)])
    + f".v5 .do{{animation:do5 {_run}}}" + _door_keys("do5", [(_t1 + .5, _t1 + 1.4), (_t2 - .4, _t2 + .5)])
    + f".v5 .ds{{animation:ds5 {_run}}}" + _door_keys("ds5", [(_t1 + 1.8, _t2 - .8)])
    # only the door of whoever comes: the left for variants 1 and 2, the right for 3 and 4
    + ".dl{opacity:clamp(0,(3 - var(--w))*var(--w),1)}.dr{opacity:clamp(0,var(--w) - 2,1)}"
)

# Talking: one of a pair comes out of the gate on the left, the other out of the one on the right,
# timed to meet; they talk a while, then part, each back the way they came.
_pa = [(n + 1, 8 + a) for n, (a, _) in enumerate(PAIRS)]
_pb = [(n + 1, 8 + b) for n, (_, b) in enumerate(PAIRS)]
_da = min((g - TALK_A for g in GATES if g < TALK_A), key=abs)
_db = min((g - TALK_B for g in GATES if g > TALK_B), key=abs)
_period = PERIODS[8]
_t1, _t2 = stop_times(_period, max(abs(_da), abs(_db)) / VISIT_SPEED, STOP[8], 1)
visitor_svg += stage_group(8, f'<g class="ta"><g class="vw">{walks_n(_pa, TALK_A)}</g>'
                              f'<g class="vs">{poses_n(_pa, talking("talk0"), TALK_A, WALK_Y)}</g></g>'
                              f'<g class="tb"><g class="vw">{walks_n(_pb, TALK_B)}</g>'
                              f'<g class="vs">{poses_n(_pb, talking("talk1"), TALK_B + 11, WALK_Y, extra=" scale(-1,1)")}</g></g>')
VISIT_CSS += leg_css(".v8 .ta", _period, TALK_A, _da, _t1, _t2) + leg_css(".v8 .tb", _period, TALK_B, _db, _t1, _t2)
VISIT_CSS += ".wks{opacity:calc(1 - var(--bk,0))}.bkp{opacity:var(--bk,0)}.vw{opacity:var(--o,0);transform:var(--f,none)}"
visitors = [(vi, PERIODS[vi]) for vi in range(len(STAGES))]
# Whoever is on the gate's stairs is cut off just under their feet (in their own group's space:
# feet on row WALK_Y + 21), so they go down out of sight. (See leg_css.)
VIS_FRONT = f'<clipPath id="gk"><rect x="-999" y="-99" width="2999" height="{WALK_Y + 21 + 1 + 99}"/></clipPath>'

# Each person's colours once, as a class; a variant shows when its stage's --w is its number.
CAST_CSS = "".join(f".pp{q}{{{vars_of(PEOPLE[q], _parts[q])}}}" for q in _used)
CAST_CSS += ".kn{opacity:var(--w)}" + "".join(f".k{n}{{opacity:calc(1 - (var(--w) - {n})*(var(--w) - {n}))}}"
                    for n in range(1, max(len(ppl) for _, ppl in STAGES) + 1))

# ---------- bicycles by the lamps ----------
BIKES = ["#36e3ff", "#ff4fa3", "#ffd84a"]


def bicycle(bx, color, facing=1):
    """A bike standing by a lamp, the riders' own kind (23 wide), wheels on the path's back edge."""
    for (x, y), c in PA.bike_pixels("a", color, 36).items():
        park.put(bx + (x if facing > 0 else 22 - x), y, PA.BIKE_COLOURS.get(c, c))


bicycle(63, BIKES[0])
bicycle(334, BIKES[1])
bicycle(360, BIKES[2], -1)


# ---------- people standing and talking ----------






# a pair by the vending machine, a trio past the last machines, a pair before the first lamp
TALKERS_SVG = ""   # (v0.36: talking is a visit, at the talk stage)

# ---------- a train on the far viaduct ----------
TRAIN_GAP = 45             # seconds between trains
TRAIN_PERIOD = 2 * TRAIN_GAP  # one train each way
TRAIN_CROSS = 7            # seconds to cross the scene
CAR, CARS = 22, 3
train = {}
for c in range(CARS):
    x0 = c * (CAR + 1)
    front = c == CARS - 1
    for x in range(x0, x0 + CAR):
        nose = x - x0 - (CAR - 4) if front else -1   # 0..3 across the rounded nose
        top = RAIL_Y - 6 + (1 if nose >= 1 else 0) + (1 if nose >= 3 else 0)
        for y in range(top, RAIL_Y - 1):
            train[(x, y)] = "#c4cfe2"
        train[(x, top)] = "#8a96b0"                     # roof
        train[(x, RAIL_Y - 2)] = "#ff4fa3"              # the line's pink stripe
        if (x - x0) % 3 != 0 and 1 <= x - x0 < CAR - (4 if front else 1):
            train[(x, RAIL_Y - 4)] = "#ffd84a"          # lit windows
        if (x - x0) in (2, 3, CAR - 4, CAR - 3):
            train[(x, RAIL_Y - 1)] = "#1a1220"          # bogies
    if front:
        train[(x0 + CAR - 1, RAIL_Y - 3)] = "#fff1c9"   # headlight
TRAIN_LEN = CARS * (CAR + 1) - 1
TRAIN_DEF = (
    f'<g id="trn">{paths(train)}'
    f'<g opacity="0.25">{paths({(TRAIN_LEN + d, RAIL_Y - 3 + dy): "#fff1c9" for d in range(0, 6) for dy in (-1, 0, 1) if abs(dy) <= d // 3})}</g></g>'
)
# the same train, nose first each way
TRAIN_SVG = (
    '<g class="ntr dn"><g class="tr"><use href="#trn"/></g>'
    f'<g class="trb"><use href="#trn" transform="translate({TRAIN_LEN},0) scale(-1,1)"/></g></g>'
)
assert DAY % TRAIN_PERIOD == 0 and (6 * DAY // 24) % TRAIN_PERIOD == 0
LATE_STYLE = (
    ".ntr,.lw0,.lw1,.lw2{animation-timing-function:steps(1,end)}"
    ".ntr{animation-name:ntr}" + keyframes("ntr", [(0, "opacity:0"), (6, "opacity:1"), (24, "opacity:1")])
    # each group: dark late at night, lit for the early morning, dark by day, lit from evening
    + ".lw0{animation-name:lw0}" + keyframes("lw0", [(0, "opacity:0"), (5.5, "opacity:1"), (7, "opacity:0"), (17.5, "opacity:1"), (23.5, "opacity:0"), (24, "opacity:0")])
    + ".lw1{animation-name:lw1}" + keyframes("lw1", [(0, "opacity:1"), (0.25, "opacity:0"), (6.25, "opacity:1"), (7.5, "opacity:0"), (18, "opacity:1"), (24, "opacity:1")])
    + ".lw2{animation-name:lw2}" + keyframes("lw2", [(0, "opacity:1"), (1, "opacity:0"), (5, "opacity:1"), (8, "opacity:0"), (17, "opacity:1"), (24, "opacity:1")])
)

# ---------- assemble ----------
defs = (
    f'<defs><pattern id="far" width="{FAR_P}" height="{H}" patternUnits="userSpaceOnUse">{layer_svg(far)}</pattern>'
    f'<pattern id="near" width="{NEAR_P}" height="{H}" patternUnits="userSpaceOnUse">{layer_svg(near)}</pattern>'
    f'<pattern id="park" y="-{TOP}" width="{PARK_P}" height="{H + TOP}" patternUnits="userSpaceOnUse">'
    f'<g transform="translate(0,{TOP})">{layer_svg(park)}<g class="wtr">{paths(WINTER_TREE)}</g>{SNOW_SVG}{TALKERS_SVG}</g></pattern>'
)
petal_svg = "".join(
    f'<rect class="pt" x="{sx}" y="{sy}" width="1" height="1" fill="{c}" '
    f'style="--dx:{dx}px;--dy:{dy}px;animation-duration:{dur:.1f}s;animation-delay:-{dl:.1f}s"/>'
    for sx, sy, dur, dl, dx, dy, c in petals
)
# The petals ride with the park: drawn once per tile across the scene's width plus one tile.
petals_all = "".join(f'<use href="#pet" x="{k * PARK_P}"/>' for k in range(math.ceil((W + PARK_P) / PARK_P)))
# Each visitor walks a tile either side of their spot, so copies from one tile before to one after
# the scene's reach are all needed for someone always to be where the walk has got to.
VISIT_COPIES = range(-1, math.ceil((W + PARK_P) / PARK_P))
# a visitor who is not out at all hours sits in a group the TS side shows or hides, per copy
import re as _re
_parts = _re.split(r'(?=<g class="v (?:vb )?v\d+">)', visitor_svg)
# whoever sits on a bench drawn first: anyone walking by on the path passes in front of them,
# never between them and the bench
SITS = {vi for vi, (action, _) in enumerate(STAGES) if action == "bench"}
_stage = lambda part: int(_re.match(r'<g class="v (?:vb )?v(\d+)">', part).group(1)) if part.startswith('<g class="v ') else -1
_parts = sorted(_parts, key=lambda part: (_stage(part) >= 0, _stage(part) not in SITS))
visitor_svg = ""
for _part in _parts:
    _m = _re.match(r'<g class="v (?:vb )?v(\d+)">', _part)
    if _m:
        _part = f'<g class="h{_m.group(1)}">{_part}</g>'
    visitor_svg += _part
defs += f'{WALK_DEFS}<g id="vis">{visitor_svg}{VIS_FRONT}</g><g id="pet">{petal_svg}</g>{FIREFLY_DEF}<g id="ffl">{FIREFLY_SVG}</g>{TRAIN_DEF}{RAIN_DEFS}{template_defs()}</defs>'
WINTER_TPL = winter_defs()
# winter's own colours: the scarf and hat (each person's, below), long sleeves in the jacket's
# shade, and dark tights
WINTER_STYLE = (".cw2{stroke:var(--w2,#e84a4a)}.cn2{stroke:var(--n2,#2b3a6a)}"
                ".cO{stroke:#3a3048}"
                ".wsc{display:inline}")
_walker_people = {**dict(enumerate(PA.STROLLERS)), WALKERS_N: PA.DOG_WALKER,
                  **{WALKERS_N + 2 + k: c for k, c in enumerate(PA.COMMUTERS)}}
WINTER_STYLE += "".join(f".w{i}{{{PA.winter_colours(p, i)}}}" for i, p in _walker_people.items())
WINTER_STYLE += "".join(f".pp{q}{{{PA.winter_colours(PEOPLE[q], 20 + q)}}}" for q in _used)
# what everyone wears a fifth darker: each clothing colour mixed with a fifth of black
_dark = lambda v: f"color-mix(in srgb,{v} 80%,#000)"
WINTER_STYLE += "".join(f".c{pcode(ch)}{{stroke:{_dark(f'var(--{pcode(ch)})')}}}" for ch in sorted(CLS_USED)
                        if ch in PA.CLOTHES and ch != "a")
WINTER_STYLE += f".ca2{{stroke:{_dark('var(--j2,var(--J,var(--a2)))')}}}"
WINTER_PAINT += [(c, PA.darker(c), f".w{WALKERS_N + 1} ") for c in PA.cyclist_clothes()]
# Summer: short sleeves (the templates), and the office workers' white shirts: their sleeves white
# too, and white for whoever has no white of their own (the gakuran student)
SUMMER_TPL = season_defs(PA.SUMMER)
SUMMER_STYLE = (".cW{stroke:var(--W,#f3f0fb)}"
                + ",".join(f".w{WALKERS_N + 2 + k} use" for k, c in enumerate(PA.COMMUTERS) if c["torso"] in PA.COOL_BIZ)
                + "{--a2:#f3f0fb}")
# Autumn: long sleeves in the jacket's shade, and a thin scarf for every other person (the rest
# keep a bare neck: the scarf in their skin)
AUTUMN_TPL = season_defs(PA.AUTUMN)
AUTUMN_STYLE = ".cw2{stroke:var(--w2,var(--S))}.cv2{stroke:var(--w2,none)}.ca2{stroke:var(--j2,var(--J,var(--a2)))}"
AUTUMN_STYLE += "".join(f".w{i}{{{c}}}" for i, p in _walker_people.items() if (c := PA.autumn_colours(p, i)))
AUTUMN_STYLE += "".join(f".pp{q}{{{c}}}" for q in _used if (c := PA.autumn_colours(PEOPLE[q], 20 + q)))



_srnd = random.Random(31)
TOP_STARS = {(_srnd.randrange(W), _srnd.randrange(-TOP, 0)): "#e4defc" for _ in range(30)}
BACK = (
    f'<rect y="-{TOP}" width="{W}" height="{TOP}" fill="{SKY[0]}"/><g class="tw1">{paths(TOP_STARS)}</g>'
    + layer_svg(sky)
    + DAY_SVG
    + layer_svg(tower)
    + f'<rect class="lf" width="{W + FAR_P}" height="{H}" fill="url(#far)"/>'
    + TRAIN_SVG
    + f'<rect class="ln" width="{W + NEAR_P}" height="{H}" fill="url(#near)"/>'
    + f'<g class="lp"><rect y="-{TOP}" width="{W + PARK_P}" height="{H + TOP}" fill="url(#park)"/>'
    + f'<rect class="dlt dn" y="-{TOP}" width="{W + PARK_P}" height="{H + TOP}" fill="#56688f"/>'
    + f'<g class="rain wx"><rect width="{W + PARK_P}" height="{H}" fill="url(#spl)"/></g>'   # splashes on the path
    + '<g class="ffy dn"><g class="ffr">' + "".join(f'<use href="#ffl" x="{k * PARK_P}"/>' for k in range(math.ceil((W + PARK_P) / PARK_P))) + "</g></g>"
)
# Bench visitors ride with the park, one copy per tile; the park group closes after them.
visitors_all = "".join(f'<use class="u{k + 1}" href="#vis" x="{k * PARK_P}"/>' for k in VISIT_COPIES)
MID = visitors_all + "</g>" + people_svg  # walkers on the path, in front of the park
FRONT = f'<g class="lp">{petals_all}</g>' + RAIN_FRONT  # petals over the cat, moving with the park; then the rain

STYLE = (
    "path{fill:none;stroke-width:1px}" + colour_css() +
    ".tw0,.tw1,.tw2{animation:tw 4s steps(1,end) infinite}.tw1{animation-delay:-1.3s}.tw2{animation-delay:-2.6s}"
    "@keyframes tw{0%{opacity:1}50%{opacity:.25}}"
    ".beacon{animation:tw 2.2s steps(1,end) infinite}"
    ".win{animation:win 11s steps(1,end) infinite}@keyframes win{0%{opacity:1}60%{opacity:0}85%{opacity:1}}"
    ".neon2{animation:fl 6s steps(1,end) infinite}@keyframes fl{0%{opacity:1}88%{opacity:.3}89%{opacity:1}91%{opacity:.3}92%{opacity:1}}"
    ".lampglow{animation:hum 5s steps(5,end) infinite alternate}@keyframes hum{0%{opacity:.18}100%{opacity:.28}}"
    # each lamp flickers now and then: a few quick blinks, sometimes a while dark
    ".lamp{animation:flk 13s steps(1,end) infinite}"
    ".lamp1{animation-name:flk2;animation-duration:9.4s;animation-delay:-4s}"
    ".lamp2{animation-duration:17s;animation-delay:-9s}"
    "@keyframes flk{0%{opacity:1}78%{opacity:0}79%{opacity:1}80.5%{opacity:0}81%{opacity:1}83%{opacity:0}88%{opacity:1}}"
    "@keyframes flk2{0%{opacity:1}30%{opacity:0}31%{opacity:1}32%{opacity:0}33.5%{opacity:1}70%{opacity:0}71%{opacity:1}72%{opacity:0}80%{opacity:1}81%{opacity:0}81.5%{opacity:1}}"
    # the fountain's glint: three frames in turn, so it runs along the arcs
    ".fw0,.fw1,.fw2{animation:f3 .45s steps(1,end) infinite}.fw1{animation-delay:-.3s}.fw2{animation-delay:-.15s}"
    "@keyframes f3{0%{opacity:1}33.33%{opacity:0}}"
    ".rail{animation:tw 3s steps(1,end) infinite}"
    # the train crosses in TRAIN_CROSS s, then the line is empty until the next one
    ".tr{animation:train " + str(TRAIN_PERIOD) + "s linear infinite}"
    "@keyframes train{0%{translate:-" + str(TRAIN_LEN + 8) + "px}" + f"{TRAIN_CROSS / TRAIN_PERIOD * 100:.2f}" + "%{translate:" + str(W + 2) + "px}100%{translate:" + str(W + 2) + "px}}"
    # half a cycle on, it comes back the other way
    ".trb{animation:trainb " + str(TRAIN_PERIOD) + "s linear infinite}"
    "@keyframes trainb{0%{translate:" + str(W + 8) + "px}50%{translate:" + str(W + 8) + "px}" + f"{50 + TRAIN_CROSS / TRAIN_PERIOD * 100:.2f}" + "%{translate:-" + str(TRAIN_LEN + 8) + "px}100%{translate:-" + str(TRAIN_LEN + 8) + "px}}"
    + DAY_STYLE + LATE_STYLE + RAIN_STYLE +
    ".pt{animation-name:fall;animation-timing-function:steps(40,end);animation-iteration-count:infinite}"
    "@keyframes fall{0%{transform:translate(0,0);opacity:0}8%{opacity:1}85%{opacity:1}100%{transform:translate(var(--dx),var(--dy));opacity:0}}"
    ".pa{animation:pa .5s steps(1,end) infinite,sw 1s steps(1,end) infinite}.pb{animation:pa .5s steps(1,end) infinite;animation-delay:-.25s}"
    "@keyframes pa{0%{opacity:1}50%{opacity:0}}@keyframes sw{0%{--kb:.28;--kf:0}50%{--kb:0;--kf:.28}}"
    # a step's shades: black, as see-through as --kb and --kf say (none where they are not set)
    ".kb,.kf{stroke:#000}.kb{opacity:var(--kb,0)}.kf{opacity:var(--kf,0)}"
    ".wb{animation:wb .5s steps(1,end) infinite}@keyframes wb{0%{translate:0 1px}50%{translate:none}}"
    "@keyframes wr{0%{translate:-" + str(WALK_PAD) + "px}100%{translate:" + str(W + 4) + "px}}"
    "@keyframes wl{0%{translate:" + str(W + 4) + "px}100%{translate:-" + str(WALK_PAD) + "px}}"
    ".talk0,.talk1{opacity:0;animation:talk 5s steps(1,end) infinite}.talk0r,.talk1r{animation:talkr 5s steps(1,end) infinite}"
    ".talk1,.talk1r{animation-delay:-1.7s;animation-duration:6.2s}"
    "@keyframes talkr{0%{opacity:1}35%{opacity:0}55%{opacity:1}70%{opacity:0}80%{opacity:1}}"
    "@keyframes talk{0%{opacity:0}35%{opacity:1}55%{opacity:0}70%{opacity:1}80%{opacity:0}}"
    ".blink{animation:blink 2.4s steps(1,end) infinite}@keyframes blink{0%{opacity:0}55%{opacity:1}75%{opacity:0}}"
    ".tlit{animation:hum 6s steps(6,end) infinite alternate}"
    ".vlit{animation:vlit 7s steps(7,end) infinite}@keyframes vlit{0%{transform:translateY(0);opacity:0}10%{opacity:1}70%{transform:translateY(12px);opacity:1}71%{opacity:0}}"
    ".vs{opacity:var(--s,0)}.wsc{display:none}.sg1{stroke-dasharray:2 1 1 2}"
    + VISIT_CSS + CAST_CSS + FIREFLY_STYLE +
    "@media (prefers-reduced-motion: reduce){.pt{animation:none;opacity:0}.tw0,.tw1,.tw2,.beacon,.win,.neon2,.lampglow,.lamp,.fw0,.fw1,.fw2,.rail,.pa,.pb,.wb,.w,.vlit,.v,.vw,.vs,.talk0,.talk1,.talk0r,.talk1r,.blink,.tlit,.rfa,.rna,.sp0,.sp1,.sp2,.ff{animation:none}.v,.v .vw,.v .vs,.ta,.tb,.tm,.tf,.dh,.do,.ds{animation:none!important}.v{--s:1}.pb,.vlit,.vw,.fw1,.fw2,.tr,.trb{opacity:0}.tr,.trb{animation:none}.vs{opacity:1}}"
)

def hours_ts(h):
    return "[" + ", ".join(f"[{a}, {b}]" for a, b in h) + "]" if h else "null"


walkers_ts = ", ".join(
    f"{{ i: {i}, dir: {d}, dur: {dur}, hours: {hours_ts(WALK_HOURS.get(i))}, rain: '{'home' if i in STAY_IN else 'umbrella'}' }}"
    for i, d, dur in walkers
)
visitors_ts = ", ".join(f"{{ i: {i}, period: {t}, action: '{STAGES[i][0]}', people: [{', '.join(map(str, STAGES[i][1]))}], shown: [{SHOWN[i][0]:.1f}, {SHOWN[i][1]:.1f}] }}"
                       for i, t in visitors)
cast_ts = ", ".join(f"'{cid}'" for cid in [c for c, _ in CAST] + [f"pair{n}" for n in range(len(PAIRS))])
def short_ids(texts, extra=()):
    """The templates' ids, shortest for the most used: one letter, then two."""
    import collections
    import string
    count = collections.Counter(t for text in texts for t in re.findall("\d+", text))
    letters = string.ascii_letters
    names = list(letters) + [a + b for a in letters for b in letters + string.digits]
    taken = set(re.findall(r'id="([^"]+)"', "".join(texts)))
    names = [n for n in names if n not in taken]
    ids = {tok: names[n] for n, (tok, _) in enumerate(count.most_common())}
    return [re.sub("\d+", lambda m: ids[m.group(0)], text) for text in [*texts, *extra]]


# Each ambient loop keeps its own offset in --d, and the band adds the wall clock, --t, which
# register.tsx writes at each redraw: so a redraw carries every loop on from where it was.
AMBIENT = (".tw0,.tw1,.tw2,.beacon,.win,.neon2,.lampglow,.lamp,.fw0,.fw1,.fw2,.rail,.pt,.pa,.pb,.wb,"
           ".talk0,.talk1,.talk0r,.talk1r,.blink,.tlit,.vlit,.rfa,.rna,.sp0,.sp1,.sp2,.ff,.fp0,.fp1,.fp2,.fp3")
STYLE = re.sub(r"animation-delay:(-[\d.]+s)", r"--d:\g<1>", STYLE) + AMBIENT + "{animation-delay:calc(var(--d,0s) - var(--t,0s))}"
defs = re.sub(r"animation-delay:(-[\d.]+s)", r"--d:\g<1>", defs)
STYLE, defs, BACK, MID, FRONT, WINTER_TPL, SUMMER_TPL, AUTUMN_TPL = short_ids([STYLE, defs, BACK, MID, FRONT], [WINTER_TPL, SUMMER_TPL, AUTUMN_TPL])
ts = f"""// Generated by make_park.py (running-cat-art): a Neon Tokyo night park in scrolling layers, with walkers.
// Original pixel art in the Neon Tokyo palette.
export const PARK_W = {W}
export const PARK_H = {H}
// rows of sky above row 0: the band shows y = -PARK_TOP .. PARK_H
export const PARK_TOP = {TOP}
// walkers loop from WALK_PAD px off the left edge, WALK_LOOP px in all
export const WALK_PAD = {WALK_PAD}
export const WALK_LOOP = {WALK_LOOP}
export const CAT_X = {CAT_X}
export const CAT_Y = {CAT_Y}
// Scrolling layers: CSS class, tile width (art px) and speed (art px/s) while the cat runs.
export const LAYERS = [
  {{ cls: 'lf', tile: {FAR_P}, speed: {FAR_V} }},
  {{ cls: 'ln', tile: {NEAR_P}, speed: {NEAR_V} }},
  {{ cls: 'lp', tile: {PARK_P}, speed: {PARK_V} }},
] as const
// Walkers: class w<i>, direction (1 right, -1 left), seconds to cross, and the hours they are
// out (from, to), or null for all day and night.
export const WALKERS = [{walkers_ts}] as const
// The cast: the people who visit the park, by index (cast.ts says when they are out and what
// they would do).
export const CAST = [{cast_ts}] as const
// Stages: class v<i>, seconds per visit (out of the gate, a stop, back in at the gate),
// the action done there and who can do it: variant k<n + 1> is people[n], shown while the
// stage's --w is n + 1 (0: nobody). One copy of them per tile, class u<k + 1> at x = k tiles.
export const VISITORS = [{visitors_ts}] as const
// The train on the far viaduct: seconds for one train across and one back (classes tr, trb).
export const TRAIN_PERIOD = {TRAIN_PERIOD}
// A day, in seconds (class dn runs on it), and how far ahead each redraw plans who is out.
export const DAY = {DAY}
export const HORIZON = {HORIZON}
// The weather: a cycle of WEATHER seconds (class wx runs on it) and its showers, (from, to) in
// hours into the cycle. Walkers go out in the rain with an umbrella (wd<i>/ww<i>: dry and wet
// frames), or stay home; visitors all stay home.
export const WEATHER = {WEATHER}
export const RAIN = [{", ".join(f"[{a}, {b}]" for a, b in RAIN)}] as const
export const VISIT_COPIES = [{", ".join(str(k) for k in VISIT_COPIES)}] as const
export const PARK_STYLE = {STYLE!r}
export const PARK_DEFS = {defs!r}
export const PARK_BACK = {BACK!r}
export const PARK_MID = {MID!r}
export const PARK_FRONT = {FRONT!r}
// Winter: the templates it dresses for the cold (the same ids, swapped in for PARK_DEFS' own),
// and the style for them; the bare cherry tree is the park's class wtr, shown only then.
export const PARK_WINTER_DEFS = {WINTER_TPL!r}
export const PARK_WINTER_STYLE = {WINTER_STYLE!r}
// and the colours it turns, [drawn, winter's, within]: the beds' leaves to bushes, the
// fountain's water to ice, the cyclist's clothes darker
export const PARK_WINTER_PAINT = {json.dumps(WINTER_PAINT)} as const
// Summer and autumn dress the same way: short sleeves, no coats' hems and the office in white
// shirts; long sleeves and thin scarves
export const PARK_SUMMER_DEFS = {SUMMER_TPL!r}
export const PARK_SUMMER_STYLE = {SUMMER_STYLE!r}
export const PARK_AUTUMN_DEFS = {AUTUMN_TPL!r}
export const PARK_AUTUMN_STYLE = {AUTUMN_STYLE!r}
"""
open(out_ts, "w", encoding="utf-8", newline="\n").write(ts)   # LF on every machine
total = len(STYLE) + len(defs) + len(BACK) + len(MID) + len(FRONT)
print("defs", len(defs), "back", len(BACK), "mid", len(MID), "front", len(FRONT), "total", total)


# ---------- preview: layers at offset 0, walkers spread out, one cat frame ----------
def hexrgb(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


img = Image.new("RGBA", (W, H), (0, 0, 0, 255))


def blit(layer, offset=0):
    span = layer.period or W
    for k in (range(-1, W // span + 2) if layer.period else [0]):
        for (x, y), c in layer.grid.items():
            X = x + k * span - offset
            if 0 <= X < W and 0 <= y < H:
                img.putpixel((X, y), hexrgb(c) + (255,))
        for n, base, _ in anim_order(layer):
            a = int(255 * OPACITY.get(base, 1))
            for (x, y), c in layer.anims.get(n, {}).items():
                X = x + k * span - offset
                if 0 <= X < W and 0 <= y < H:
                    base = img.getpixel((X, y))
                    r = [int(base[j] + (hexrgb(c)[j] - base[j]) * a / 255) for j in range(3)]
                    img.putpixel((X, y), tuple(r) + (255,))
        if not layer.period:
            break


for layer in (sky, far):
    blit(layer)
for (x, y), c in train.items():                     # a train mid-crossing
    img.putpixel((150 + x, y), hexrgb(c) + (255,))
for layer in (near, park):
    blit(layer)
WALKER_FRAMES = {i: (PA.flatten(PA.walk_parts(PA.STROLLERS[i], "a"), PA.STROLLERS[i]["pal"]), 11)
                 for i in range(WALKERS_N)}
WALKER_FRAMES[WALKERS_N] = (PA.flatten(PA.dog_parts("a"), PA.DOG_WALKER["pal"]), 24)
WALKER_FRAMES[WALKERS_N + 1] = (PA.cyclist_pixels("a"), 23)
for _k, _p in enumerate(PA.COMMUTERS, start=WALKERS_N + 2):
    WALKER_FRAMES[_k] = (PA.flatten(PA.walk_parts(_p, "a"), _p["pal"]), 11)
for i, d, dur in walkers:
    a, width = WALKER_FRAMES[i]
    px0 = (80 + i * 125) % (W - 20)
    y0 = FEET_Y - PERSON_H + 1 - (i % 2)
    for (x, y), c in a.items():
        X = px0 + (x if d > 0 else width - 1 - x)
        if 0 <= X < W and 0 <= y0 + y < H:
            img.putpixel((X, y0 + y), hexrgb(c) + (255,))
# the first visitor sitting on each copy of their bench
for k in range(W // PARK_P + 1):
    _p = PA.VISITORS["bench_coat"]
    for (x, y), c in PA.flatten(PA.side_sit_parts(_p), _p["pal"]).items():
        X = k * PARK_P + 120 + 3 + x
        if 0 <= X < W:
            img.putpixel((X, 22 + y), hexrgb(c) + (255,))
if cat_sheet:
    sheet = Image.open(cat_sheet).convert("RGBA")
    frame = sheet.crop((0, 2 * 32, 32, 3 * 32)).crop((5, 18, 25, 32))
    img.alpha_composite(frame, (CAT_X + 8, CAT_Y))
img.resize((W * 2, H * 2), Image.NEAREST).save(preview_png)
