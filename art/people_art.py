"""The park's people, 11 x 22 art pixels (head 6 rows, body 8, legs 8; feet on row 21), built from
shared parts. Each part is drawn once as a template whose colours are CSS variables (--H hair,
--J jacket, ...); a person is a few <use>s of templates under a group that sets their colours.

Letters: H hair, S skin, E eye, M mouth, G glasses, C hat, c its shade, J jacket/top, j its shade,
a sleeve, W shirt, T tie/ribbon, K collar/scarf, Y buttons, Z zip, Q print, A strap, N name card,
P pants, p shade, L skirt, l shade, O legs/socks, B shoes, X backpack, x shade, R bag, r shade,
U umbrella, u its shade, I umbrella shaft, D phone, d screen, F flash, V can.
"""

# letters drawn in a fixed colour, the same for everyone
FIXED = {"E": "#1a1220", "M": "#c98a70", "G": "#c9f6ff", "I": "#3a4058", "D": "#1a1220", "d": "#9ff0ff",
         "F": "#fff6c9", "V": "#ff4040", "e": "#c9f6ff"}

HEADS = {
    "short":   ["...HHHH....", "..HHHHHH...", "..HHHSSSS..", "..HHSSESE..", "...HSSSSS..", "....SSMS..."],
    "glasses": ["...HHHH....", "..HHHHHH...", "..HHHSSSS..", "..HHSGEGE..", "...HSSSSS..", "....SSMS..."],
    "elder":   ["...SSSS....", "..HSSSSSS..", "..HHSSSSS..", "..HHSGEGE..", "...HSSSSS..", "....SSMS..."],
    "bob":     ["...HHHHH...", "..HHHHHHH..", "..HHHSSSH..", "..HHSSESE..", "..HHSSSSS..", "..HH.SMS..."],
    "pony":    ["...HHHHH...", ".HHHHHHHH..", "HH.HHSSSS..", "H..HSSESE..", "...HSSSSS..", "....SSMS..."],
    "spiky":   ["..H.H.H....", "..HHHHHHH..", "..HHHSSSS..", "..HHSSESE..", "...HSSSSS..", "....SSMS..."],
    "long":    ["...HHHHH...", "..HHHHHHH..", "..HHHSSSS..", "..HHSSESE..", "..HHSSSSS..", "..HHHSMS...",
                "..HH.......", "..H........"],
    "bun":     ["HH.HHHH....", "HHHHHHHH...", "..HHHSSSS..", "..HHSSESE..", "...HSSSSS..", "....SSMS..."],
    "cap":     ["...CCCC....", "..CCCCCCcc.", "..HHHSSSS..", "..HHSSESE..", "...HSSSSS..", "....SSMS..."],
    "beanie":  ["...CCCC....", "..CCCCCC...", "..ccccSSS..", "..HHSSESE..", "...HSSSSS..", "....SSMS..."],
    "helmet":  ["...CCCCC...", "..CCCcCCCC.", "..HHHSSSS..", "..HHSSESE..", "...HSSSSS..", "....SSMS..."],
}
FRONT_HEADS = {
    "short":    ["...HHHHH...", "..HHHHHHH..", "..HSSSSSH..", "..HSESESH..", "...SSSSS...", "....SMS...."],
    "spiky":    ["..H.H.H.H..", "..HHHHHHH..", "..HSSSSSH..", "..HSESESH..", "...SSSSS...", "....SMS...."],
    "glasses":  ["...HHHHH...", "..HHHHHHH..", "..HSSSSSH..", "..GEGSGEG..", "...SSSSS...", "....SMS...."],
    "cap_down": ["...CCCCC...", "..CCCCCCC..", "..ccccccc..", "..HSSSSSH..", "...SESES...", "....SSS...."],
}
TORSOS = {
    "suit":     ["....SSS....", "..aJWTWJa..", "..aJWTWJa..", "..aJjTjJa..", "..aJJJJJa..", "..aJJJJJa..", "..aJJYJJa..", "..SJJJJJS.."],
    "lanyard":  ["....SSS....", "..aJWAWJa..", "..aJAWAJa..", "..aJJNJJa..", "..aJJNJJa..", "..aJJJJJa..", "..aJJJJJa..", "..SJJJJJS.."],
    "gakuran":  ["....KKK....", "..aJJJJJa..", "..aJJYJJa..", "..aJJJJJa..", "..aJJYJJa..", "..aJJJJJa..", "..aJJYJJa..", "..SJJJJJS.."],
    "sailor":   ["....SSS....", "..KKKSKKK..", "..aKKTKKa..", "..aWTTTWa..", "..aWWTWWa..", "..aWWWWWa..", "..aWWWWWa..", "..SWWWWWS.."],
    "blazer":   ["....SSS....", "..aJWTWJa..", "..aJWTWJa..", "..aJjWjJa..", "..aJJYJJa..", "..aJJJJJa..", "..aJJJJJa..", "..SJJJJJS.."],
    "tee":      ["....SSS....", "..JJJJJJJ..", "..JJJJJJJ..", "..aJJQJJa..", "..aJJJJJa..", "..aJJJJJa..", "..aJJJJJa..", "..SjjjjjS.."],
    "hoodie":   ["..jjSSS....", "..aJWJWJa..", "..aJWJWJa..", "..aJJJJJa..", "..aJJJJJa..", "..aJjjjJa..", "..aJjjjJa..", "..SJJJJJS.."],
    "bomber":   ["....KKK....", "..aJJZJJa..", "..aJJZJJa..", "..aJJZJJa..", "..aJJZJJa..", "..aJJZJJa..", "..aKKKKKa..", "..SPPPPPS.."],
    "coat":     ["....SSS....", "..aKKKKJa..", "..aJKKJJa..", "..aJJKJJa..", "..aJJJYJa..", "..aJJJJJa..", "..aJJJYJa..", "..SJJJJJS.."],
    "cardigan": ["....SSS....", "..aJWWWJa..", "..aJWWWJa..", "..aJWWWJa..", "..aJWWWJa..", "..aJWWWJa..", "..aJWWWJa..", "..SJWWWJS.."],
    "dress":    ["....SSS....", "..JJJJJJJ..", "..JJJJJJJ..", "..aJJJJJa..", "..aJJjJJa..", "..aJJJJJa..", "..aJJJJJa..", "..SJJJJJS.."],
}
COAT_HEM = {"a": ["...JJJJJ...", "..JJJjJJJ.."], "b": ["...JJJJJ...", "...JJjJJ..."], "s": ["...JJJJJ...", "...JJjJJ..."]}
LEGS = {
    ("pants", "a"): ["...PPPPP...", "...PPpPP...", "..PP...PP..", "..PP...PP..", "..PP...PP..", "..PP...PP..", ".PP.....PP.", ".BB.....BBB"],
    ("pants", "b"): ["...PPPPP...", "....PPP....", "....PPP....", "....PpP....", "....PPP....", "....PPP....", "....PPP....", "....BBBB..."],
    ("pants", "s"): ["...PPPPP...", "...PPpPP...", "...PP.PP...", "...PP.PP...", "...PP.PP...", "...PP.PP...", "...PP.PP...", "...BB.BBB.."],
    ("skirt", "a"): ["...LLLLL...", "..LlLlLlL..", "...OO.OO...", "..OO...OO..", "..OO...OO..", "..OO...OO..", ".OO.....OO.", ".BB.....BBB"],
    ("skirt", "b"): ["...LLLLL...", "..LlLlLlL..", "....OOO....", "....OOO....", "....OOO....", "....OOO....", "....OOO....", "....BBBB..."],
    ("skirt", "s"): ["...LLLLL...", "..LlLlLlL..", "...OO.OO...", "...OO.OO...", "...OO.OO...", "...OO.OO...", "...OO.OO...", "...BB.BBB.."],
    ("long", "a"):  ["...LLLLL...", "..LlLlLlL..", "..LlLlLlL..", ".LlLlLlLlL.", "..SS...SS..", "..OO...OO..", "..OO...OO..", ".BBB...BBB."],
    ("long", "b"):  ["...LLLLL...", "..LlLlLlL..", "..LlLlLlL..", "..LlLlLlL..", "....SSS....", "....OOO....", "....OOO....", "....BBBB..."],
    ("long", "s"):  ["...LLLLL...", "..LlLlLlL..", "..LlLlLlL..", "..LlLlLlL..", "...SS.SS...", "...OO.OO...", "...OO.OO...", "...BB.BBB.."],
}
UMBRELLA = {
    **{(x, -5): "U" for x in range(7, 12)},
    **{(x, -4): "U" for x in range(5, 14)},
    **{(x, -3): ("u" if x in (6, 9, 12) else "U") for x in range(4, 15)},
    (4, -2): "u", (14, -2): "u",
    **{(9, y): "I" for y in range(-2, 10)},
}
# arms: the back one (column 2) and the front one (column 8), rows 9 down; the shoulders are the body's
ARMS = {
    "b_down":  {(2, 9): "a", (2, 10): "a", (2, 11): "a", (2, 12): "a", (2, 13): "S"},
    "b_swing": {(2, 9): "a", (2, 10): "a", (2, 11): "a", (1, 12): "a", (1, 13): "S"},
    "f_down":  {(8, 9): "a", (8, 10): "a", (8, 11): "a", (8, 12): "a", (8, 13): "S"},
    "f_swing": {(8, 9): "a", (8, 10): "a", (8, 11): "a", (9, 12): "a", (9, 13): "S"},
    "f_umb":   {(8, 9): "a", (9, 10): "S", **UMBRELLA},
    "f_talk":  {(9, 9): "a", (10, 8): "S"},
    "f_reach": {(9, 9): "a", (10, 9): "a", (11, 9): "S"},
    "f_drink": {(8, 9): "a", (9, 8): "a", (9, 7): "S", (9, 5): "V", (9, 6): "V", (10, 5): "V"},
    "f_photo": {(9, 8): "a", (10, 7): "a", (10, 6): "S", (10, 4): "D", (10, 5): "D", (11, 4): "d"},
    "flash":   {(11, 3): "F", (12, 2): "F", (12, 4): "F", (13, 3): "F"},
    "f_read":  {(8, 10): "a", (8, 11): "S", (9, 10): "D", (9, 11): "D", (9, 9): "d", (8, 4): "e"},
    "readlit": {(9, 9): "F"},
    "f_rest":  {(8, 9): "a", (9, 10): "a", (9, 11): "S"},             # a hand on the knee, sitting
    "f_lead":  {(8, 9): "a", (9, 10): "a", (9, 11): "a", (10, 12): "S"},
}
GEAR = {
    "briefcase": {(8, 14): "r", (9, 14): "r", **{(x, y): "R" for x in range(7, 11) for y in (15, 16)},
                  **{(x, 17): "r" for x in range(7, 11)}},
    "handbag": {(9, 11): "A", (9, 12): "R", (10, 12): "R", (9, 13): "R", (10, 13): "R", (9, 14): "r", (10, 14): "r"},
    "backpack": {**{(x, y): "X" for x in (0, 1) for y in range(7, 13)}, (0, 10): "x", (0, 12): "x", (1, 12): "x",
                 (4, 7): "A", (4, 8): "A"},
    "satchel": {(7, 7): "A", (6, 8): "A", (5, 9): "A", (4, 10): "A", (4, 11): "A", (3, 12): "A",
                (0, 12): "R", (1, 12): "R", (2, 12): "R", (0, 13): "R", (1, 13): "R", (2, 13): "R",
                (0, 14): "r", (1, 14): "r", (2, 14): "r"},
}
FRONT_HAND = {"briefcase", "handbag"}
BACK_HIP = {"satchel"}

DOG = ["........d.d.", ".T......DDD.", "TT......DEDN", ".DDDDDDDDDW.", ".DDDDDDDDW..", ".D.D...D.D..", ".d.d...d.d.."]
DOG_B = DOG[:5] + [".D..D.D..D..", ".d..d.d..d.."]
DOG_COL = {"D": "#e4defc", "d": "#8a80c4", "E": "#1a1220", "N": "#1a1220", "T": "#e4defc", "W": "#ffffff"}


def grid(rows, dy=0, dx=0):
    return {(x + dx, y + dy): ch for y, row in enumerate(rows) for x, ch in enumerate(row) if ch != "."}


def line(f, a, b, ch):
    (x0, y0), (x1, y1) = a, b
    n = max(abs(x1 - x0), abs(y1 - y0))
    for k in range(n + 1):
        f[(round(x0 + (x1 - x0) * k / n), round(y0 + (y1 - y0) * k / n))] = ch


# ---------- templates ----------
TEMPLATES = {}


def _body(rows):
    f = grid(rows, 6)
    for y in range(9, 14):                     # the arms are parts of their own
        f.pop((2, y), None)
        f.pop((8, y), None)
    return f


for k, v in HEADS.items():
    TEMPLATES[f"head_{k}"] = grid(v)
for k, v in FRONT_HEADS.items():
    TEMPLATES[f"fhead_{k}"] = grid(v)
for k, v in TORSOS.items():
    TEMPLATES[f"body_{k}"] = _body(v)
for (kind, step), v in LEGS.items():
    TEMPLATES[f"legs_{kind}_{step}"] = grid(v, 14)
for step, v in COAT_HEM.items():
    TEMPLATES[f"hem_{step}"] = grid(v, 14)
for k, v in ARMS.items():
    TEMPLATES[f"arm_{k}"] = dict(v)
for k, v in GEAR.items():
    TEMPLATES[f"gear_{k}"] = dict(v)
    TEMPLATES[f"gear_{k}_m"] = {(10 - x, y): c for (x, y), c in v.items()}   # in the back hand
# sitting side-on: thighs along the seat, shins down
for kind, (thigh, shin) in (("pants", ("P", "P")), ("skirt", ("L", "O"))):
    f = {(x, y): thigh for x in range(3, 10) for y in (12, 13)}
    f.update({(x, y): shin for x in (8, 9) for y in (14, 15, 16)})
    f.update({(8, 17): "B", (9, 17): "B", (10, 17): "B"})
    TEMPLATES[f"sit_{kind}"] = f
# sitting up straight, facing out
_fbody = ["....SSS....", "..aJJJJJa..", "..aJJJJJa..", "..aJJJJJa..", "..aJJJJJa..", "..aJJJJJa..", "..SJJJJJS.."]
_fhood = list(_fbody)
_fhood[1] = _fhood[2] = "..aJWJWJa.."
_fhood[4] = _fhood[5] = "..aJjjjJa.."
_fzip = ["....KKK...."] + [r[:5] + "Z" + r[6:] for r in _fbody[1:6]] + [_fbody[6]]
TEMPLATES["fbody_plain"] = grid(_fbody, 6)
TEMPLATES["fbody_hoodie"] = grid(_fhood, 6)
TEMPLATES["fbody_bomber"] = grid(_fzip, 6)
TEMPLATES["flegs"] = grid(["..PPPPPPP..", "..PP...PP..", "..PP...PP..", "..PP...PP..", "..PP...PP..", ".BBB...BBB."], 13)
# standing, seen from behind and from the front (the drink buyer at the machine)
BACK_HEADS = {"spiky": ["..H.H.H.H..", "..HHHHHHH..", "..HHHHHHH..", "..SHHHHHS..", "...HHHHH...", "....SSS...."]}
for k, v in BACK_HEADS.items():
    TEMPLATES[f"bhead_{k}"] = grid(v)


def _back_head(rows):
    """A side-on head seen from behind: each row's hair (or hat) spread evenly about the middle,
    the neck below a short head; long hair falls over it."""
    out = []
    for y, row in enumerate(rows):
        xs = [x for x, ch in enumerate(row) if ch != "."]
        if not xs:
            out.append("." * 11)
            continue
        if y == 5 and len(rows) == 6:
            out.append("....SSS....")
            continue
        lo = max(2, min(min(xs), 10 - max(xs)))
        ch = "C" if "C" in row else "n" if "n" in row else "c" if "c" in row and y > 0 else "H"
        out.append("." * lo + ch * (11 - 2 * lo) + "." * lo)
    return out


for k, v in HEADS.items():
    if f"bhead_{k}" not in TEMPLATES:
        TEMPLATES[f"bhead_{k}"] = grid(_back_head(v))
TEMPLATES["bhead_bun"] = grid(["....HHH....", "...HHHHH...", "..HHHHHHH..", "..HHHHHHH..", "..HHHHHHH..", "....SSS...."])
TEMPLATES["bhead_pony"] = grid(["...HHHHH...", "..HHHHHHH..", "..HHHHHHH..", "..HHHHHHH..", "..HHHHHHH..", "....SHS....",
                                ".....H....."])
# a back without the front's details, arms down at the sides
TEMPLATES["bbody_plain"] = grid(["....SSS...."] + ["..aJJJJJa.."] * 6 + ["..SJJJJJS.."], 6)
_sbomber = ["....KKK....", "..aJJJJJ...", "..aJJJJJ...", "..aJJJJJ...", "..aJjjjJ...", "..aJJJJJ...", "..aKKKKK...",
            "..SPPPPP..."]
TEMPLATES["bbody_bomber"] = grid(_sbomber, 6)                                  # the right arm its own part
TEMPLATES["sbody_bomber"] = grid(["....KKK....", "...JJZJJa..", "...JJZJJa..", "...JJZJJa..", "...JJZJJa..",
                                  "...JJZJJa..", "...KKKKKa..", "...PPPPPS.."], 6)   # the left arm its own part
TEMPLATES["legs_stand"] = grid(["...PPPPP...", "...PPpPP...", "...PP.PP...", "...PP.PP...", "...PP.PP...",
                                "...PP.PP...", "...PP.PP...", "..BBB.BBB.."], 14)
TEMPLATES["barm_down"] = {**{(8, y): "a" for y in range(7, 13)}, (8, 13): "S"}
TEMPLATES["barm_press"] = {(8, 7): "a", (9, 6): "a", (9, 5): "a", (9, 4): "S"}
TEMPLATES["farm_hold"] = {(2, 7): "a", (2, 8): "a", (2, 9): "a", (3, 10): "S", (3, 8): "V", (3, 9): "V"}
TEMPLATES["farm_drink"] = {(2, 7): "a", (3, 7): "a", (4, 6): "S", (4, 4): "V", (4, 5): "V", (5, 5): "V"}
TEMPLATES["fphone"] = {(3, 11): "a", (4, 11): "S", (6, 11): "S", (7, 11): "a", (5, 11): "D", (5, 10): "d"}
TEMPLATES["fscreen"] = {(5, 10): "F"}
# a white dog on a lead, two steps
for step, rows in (("a", DOG), ("b", DOG_B)):
    f = {k: DOG_COL[ch] for k, ch in grid(rows, 15, 12).items()}
    line(f, (11, 12), (20, 17), "#ff4fa3")
    TEMPLATES[f"dog_{step}"] = f


# ---------- winter: the same templates dressed for the cold ----------
# In winter the band swaps these in for the templates of the same name, so everyone keeps their
# shape, hair and colours but wears a knitted hat (n, its bobble w), a scarf (w), long sleeves
# and tights (the style does those two). Hats with a crown of their own (cap, beanie, helmet) stay.
WINTER = {}
_HATS = {   # rows 0 and 1 of each head under a knitted hat, and whether it has a bobble on top
    "short":   (["...nnnn....", "..nnnnnnn.."], True),
    "glasses": (["...nnnn....", "..nnnnnnn.."], True),
    "elder":   (["...nnnn....", "..nnnnnnn.."], True),
    "bob":     (["...nnnnn...", "..nnnnnnn.."], True),
    "long":    (["...nnnnn...", "..nnnnnnn.."], True),
    "pony":    (["...nnnnn...", ".Hnnnnnnn.."], True),
    "spiky":   (["..nnnnn....", "..nnnnnnn.."], True),
    "bun":     (["HH.nnnn....", "HHnnnnnnn.."], False),
}
_FRONT_HATS = {"short": "...nnnnn...", "glasses": "...nnnnn...", "spiky": "...nnnnn..."}


def _hatted(rows, top, bobble):
    f = grid(top + rows[2:])
    if bobble:
        f[(5, -1)] = "w"
    return f


for k, (top, bobble) in _HATS.items():
    WINTER[f"head_{k}"] = _hatted(HEADS[k], top, bobble)
    if k not in ("spiky", "bun", "pony"):
        WINTER[f"bhead_{k}"] = grid(_back_head(top + HEADS[k][2:])) | {(5, -1): "w"}
for k, row0 in _FRONT_HATS.items():
    WINTER[f"fhead_{k}"] = _hatted(FRONT_HEADS[k], [row0, "..nnnnnnn.."], True)
WINTER["bhead_spiky"] = grid(["...nnnnn...", "..nnnnnnn..", "..HHHHHHH..", "..SHHHHHS..", "...HHHHH...", "....SSS...."]) | {(5, -1): "w"}
WINTER["bhead_bun"] = grid(["....HHH....", "..nnnnnnn..", "..HHHHHHH..", "..HHHHHHH..", "..HHHHHHH..", "....SSS...."])
WINTER["bhead_pony"] = grid(["...nnnnn...", "..nnnnnnn..", "..HHHHHHH..", "..HHHHHHH..", "..HHHHHHH..", "....SHS....",
                             ".....H....."]) | {(5, -1): "w"}


def _scarfed(name, tail):
    """The template with a scarf wound round the neck (row 6) and its end hanging at `tail`."""
    f = {k: c for k, c in TEMPLATES[name].items() if k[1] != 6 or c not in "SK"}
    for x in range(3, 8):
        if (x, 6) not in f or f[(x, 6)] in "SK":
            f[(x, 6)] = "w"
    for x, y in tail:
        f[(x, y)] = "w"
    return f


for k in TORSOS:
    WINTER[f"body_{k}"] = _scarfed(f"body_{k}", [(3, 7), (3, 8)])
for k in ("plain", "hoodie", "bomber"):
    WINTER[f"fbody_{k}"] = _scarfed(f"fbody_{k}", [(4, 7), (4, 8)])
for k in ("bbody_plain", "bbody_bomber", "sbody_bomber"):
    WINTER[k] = _scarfed(k, [])
for step in ("a", "b", "s"):                     # a long skirt's bare shins in tights
    WINTER[f"legs_long_{step}"] = {k: ("O" if c == "S" else c) for k, c in TEMPLATES[f"legs_long_{step}"].items()}
# each person's knitted hat and scarf: a scarf unlike their jacket, the hat a darker wool
SCARVES = ["#e84a4a", "#ffd84a", "#36c8d8", "#ff7ab8", "#f3f0fb", "#5fd39a", "#ff8a3a", "#a58bff"]
WOOLS = ["#2b3a6a", "#8a2a3a", "#e6e2f0", "#2f6a50", "#c87a20", "#4a3290", "#3a3448", "#a03a6a"]


def winter_colours(p, k):
    """--w2 (scarf) and --n2 (hat) for person p, the k-th drawn."""
    jacket = p["pal"].get("J", "")
    scarf = next(s for n in range(8) if (s := SCARVES[(k * 3 + n) % 8]) != jacket)
    return f"--w2:{scarf};--n2:{WOOLS[(k * 5 + 2) % 8]}"


# winter's clothes a fifth darker: the colours of what they wear (not skin, hair or shoes)
CLOTHES = "JjaWKTPpLlXxRr"


def darker(c, f=0.8):
    return "#" + "".join(f"{round(int(c[i:i + 2], 16) * f):02x}" for i in (1, 3, 5))


def cyclist_scarf():
    """The cyclist's winter scarf: round the collar, its end streaming back in the wind."""
    c = next(s for s in SCARVES if s != CYCLIST["pal"]["J"])
    return {xy: c for xy in ((10, 3), (11, 3), (12, 3), (13, 3), (9, 3), (8, 3), (7, 4))}


def cyclist_clothes():
    """The cyclist's clothing colours, drawn plainly: winter darkens them by their colour."""
    return sorted({c for ch, c in CYCLIST["pal"].items() if ch in CLOTHES})


# ---------- people ----------
SKIN =["#f2c9a0", "#d9a07a", "#b97a56"]


def P(head, torso, legs, gear, skin, **pal):
    return dict(head=head, torso=torso, legs=legs, gear=gear, fhead=pal.pop("fhead", "short"),
                pal=dict(pal, S=SKIN[skin]))


# Walkers (by WALKERS index): six strollers, the dog walker, the cyclist, seven commuters.
STROLLERS = [
    P("pony", "hoodie", "pants", "", 0, H="#4a2a30", J="#ff4fa3", j="#c83a7a", W="#f3f0fb",
      P="#3a4a7a", p="#2b3a6a", B="#f3f0fb", U="#36e3ff", u="#1fa8c0"),
    P("cap", "bomber", "pants", "", 1, H="#1a1220", C="#ff4fa3", c="#c83a7a", J="#36e3ff",
      j="#1fa8c0", K="#1d153a", Z="#f3f0fb", P="#1d153a", p="#141030", B="#ff4fa3", U="#ffd84a", u="#d0a820"),
    P("short", "tee", "pants", "", 2, H="#4a2a30", J="#ffd84a", j="#d0a820", a="#b97a56",
      Q="#ff4fa3", P="#3a3160", p="#2b2450", B="#1a1220", U="#ff4fa3", u="#c83a7a"),
    P("long", "dress", "skirt", "", 0, H="#1a1220", J="#a58bff", j="#8066d8", a="#f2c9a0", L="#a58bff",
      l="#8066d8", O="#f2c9a0", B="#36e3ff", U="#5fd39a", u="#3fa878"),
    P("elder", "cardigan", "pants", "satchel", 1, H="#c4c0d0", J="#5fd39a", j="#3fa878",
      W="#f3f0fb", P="#2b2150", p="#211a40", B="#ffd84a", R="#ff7a45", r="#c85a30", A="#c85a30"),
    P("beanie", "hoodie", "pants", "", 2, H="#1a1220", C="#f3f0fb", c="#c4cfe2", J="#ff7a45",
      j="#c85a30", W="#f3f0fb", P="#1a1220", p="#0c0812", B="#f3f0fb", U="#a58bff", u="#8066d8"),
]
DOG_WALKER = P("short", "hoodie", "pants", "", 2, H="#4a2a30", J="#3a8fd8", j="#2a6aa8", W="#f3f0fb",
               P="#1a1220", p="#0c0812", B="#ffd84a")
CYCLIST = P("helmet", "bomber", "pants", "", 2, H="#1a1220", C="#ffd84a", c="#d0a820", J="#2fb59a",
            j="#1f8a74", K="#1d153a", Z="#f3f0fb", P="#3a5a9a", p="#2a4070", B="#ffd84a")
COMMUTERS = [  # in the order of the generator's COMMUTERS list (outfits 16, 19, 17, 20, 18, 21, 22)
    P("short", "suit", "pants", "briefcase", 0, H="#1a1220", J="#4a4f60", j="#353a48", W="#f3f0fb",
      T="#c83a3a", P="#2e3240", p="#24283a", B="#120c18", R="#7a4a30", r="#5a3420", Y="#8a8fa0", U="#1d2440", u="#141a30"),
    P("spiky", "gakuran", "pants", "satchel", 0, H="#1a1220", K="#1d2440", J="#1d2440", j="#141a30",
      Y="#ffd84a", P="#1d2440", p="#141a30", B="#120c18", A="#6a4030", R="#7a4a30", r="#5a3420", U="#5fd39a", u="#3fa878"),
    P("glasses", "suit", "pants", "briefcase", 1, H="#3a2418", J="#2b3a6a", j="#1f2b52", W="#f3f0fb",
      T="#ffd84a", P="#1d2440", p="#151a30", B="#120c18", R="#1a1220", r="#0c0812", Y="#4a5a8a", U="#c4cfe2", u="#8a96b0"),
    P("pony", "sailor", "long", "backpack", 0, H="#2a1a14", K="#2b3a6a", W="#f3f0fb", a="#f3f0fb",
      T="#c83a3a", L="#2b3a6a", l="#1f2b52", O="#f3f0fb", B="#3a2418", X="#c83a3a", x="#9a2a2a", A="#9a2a2a",
      U="#ff4fa3", u="#c83a7a"),
    P("bob", "suit", "skirt", "handbag", 0, H="#2a1a14", J="#8a8070", j="#6c6456", W="#f3f0fb",
      T="#f3f0fb", L="#3a3442", l="#2a2632", O="#d9b090", B="#ff4fa3", R="#ff4fa3", r="#c83a7a", A="#ff4fa3",
      Y="#6c6456", U="#ffb7d5", u="#e090b0"),
    P("short", "blazer", "pants", "backpack", 1, H="#3a2418", J="#2b2150", j="#1f1840",
      W="#f3f0fb", T="#ffd84a", Y="#ffd84a", P="#6a6a7a", p="#55556a", B="#1a1220", X="#36e3ff", x="#1fa8c0",
      A="#1fa8c0", U="#ffd84a", u="#d0a820"),
    P("short", "lanyard", "pants", "", 2, H="#5a3a20", J="#5a6488", j="#454e6e", W="#f3f0fb",
      A="#36e3ff", N="#f3f0fb", P="#2b2150", p="#211a40", B="#3a2418", U="#36e3ff", u="#1fa8c0"),
]
VISITORS = {
    "bench_coat": P("bob", "coat", "pants", "", 0, H="#4a2a30", J="#c4cfe2", j="#9aa4bc", K="#ff7a45",
                    Y="#6a7088", P="#1d153a", p="#141030", B="#ff7a45"),
    "bench_tee": P("cap", "tee", "pants", "", 0, H="#1a1220", C="#2b2150", c="#1d153a", J="#b8e070",
                   j="#90b850", a="#f2c9a0", Q="#2b2150", P="#2b2150", p="#211a40", B="#1a1220"),
    "drink": P("spiky", "bomber", "pants", "", 1, fhead="spiky", H="#1a1220", J="#ff4a4a", j="#c83030", K="#1d153a",
               Z="#f3f0fb", P="#241b44", p="#1a1238", B="#f3f0fb"),
    "toilet": P("glasses", "coat", "pants", "satchel", 1, fhead="glasses", H="#1a1220", J="#8a5a3a", j="#6a4028", K="#f0e0b0",
                Y="#5a3a20", P="#1d153a", p="#141030", B="#f3f0fb", R="#36e3ff", r="#1fa8c0", A="#1fa8c0"),
    "photo": P("bun", "tee", "skirt", "", 0, H="#4a2a30", J="#f3f0fb", j="#c4c0d8", a="#f2c9a0",
               Q="#ff4fa3", L="#3a3160", l="#2b2450", O="#1a1220", B="#ff4fa3"),
    "read": P("bob", "cardigan", "pants", "", 2, H="#1a1220", J="#ffb7d5", j="#e090b0", W="#f3f0fb",
              P="#2b2150", p="#211a40", B="#1a1220"),
    "front": P("short", "hoodie", "pants", "", 1, H="#4a2a30", J="#6a4ab0", j="#4a3290",
               W="#f3f0fb", P="#1a1220", p="#0c0812", B="#c9f6ff"),
    "phone": P("cap", "bomber", "pants", "", 0, fhead="cap_down", H="#1a1220", C="#1d153a",
               c="#2b2150", J="#e0a030", j="#b07a20", K="#1d153a", Z="#f3f0fb", P="#241b44", p="#1a1238", B="#f3f0fb"),
}
TALKERS = [
    P("short", "bomber", "pants", "", 0, H="#1a1220", J="#d06a40", j="#a85030", K="#241b44", Z="#f3f0fb",
      P="#241b44", p="#1a1238", B="#f3f0fb", U="#a58bff", u="#8066d8"),
    P("glasses", "cardigan", "pants", "", 1, H="#4a2a30", J="#4a6ab8", j="#3a5090", W="#f3f0fb", P="#2b2150",
      p="#211a40", B="#1a1220", U="#5fd39a", u="#3fa878"),
    P("long", "coat", "pants", "", 2, H="#c4c0d0", J="#f0e0b0", j="#c8b888", K="#ff4fa3", Y="#a89870",
      P="#1d153a", p="#141030", B="#ff4fa3", U="#ff7a45", u="#c85a30"),
    P("pony", "hoodie", "skirt", "", 0, H="#ff9cc8", J="#9a3a6a", j="#7a2a50", W="#f3f0fb", L="#3a3160",
      l="#2b2450", O="#1a1220", B="#36e3ff", U="#f3f0fb", u="#c4cfe2"),
    P("cap", "tee", "pants", "", 1, H="#1a1220", C="#f3f0fb", c="#c4cfe2", J="#4a8a4a", j="#386a38",
      a="#d9a07a", Q="#ffd84a", P="#241b44", p="#1a1238", B="#f3f0fb", U="#c83a3a", u="#9a2a2a"),
    P("bun", "dress", "skirt", "", 0, H="#4a2a30", J="#c8a0f0", j="#a080d0", a="#f2c9a0", L="#c8a0f0", l="#a080d0",
      O="#f2c9a0", B="#ffd84a", U="#36e3ff", u="#1fa8c0"),
    P("beanie", "coat", "pants", "", 2, H="#1a1220", C="#c83a3a", c="#9a2a2a", J="#303848", j="#232a38",
      K="#c83a3a", Y="#5a6070", P="#3a3160", p="#2b2450", B="#ff4fa3", U="#ffd84a", u="#d0a820"),
]


# ---------- parts: the templates a pose is made of, in drawing order ----------
def _base(p, step):
    out = [f"body_{p['torso']}", f"legs_{p['legs']}_{step}"]
    if p["torso"] == "coat":
        out.append(f"hem_{step}")
    out.append(f"head_{p['head']}")
    return out


def walk_parts(p, step, rain=False):
    gear = p["gear"]
    busy = gear in FRONT_HAND
    out = _base(p, step)
    if rain and busy:
        return out + ["arm_b_down", "arm_f_umb", f"gear_{gear}_m"]
    swing = step == "a"
    out.append("arm_b_swing" if swing and gear not in BACK_HIP else "arm_b_down")
    out.append("arm_f_umb" if rain else "arm_f_swing" if swing and not busy else "arm_f_down")
    if gear:
        out.append(f"gear_{gear}")
    return out


def stand_parts(p, front=None):
    """Standing still; `front` the front arm's part (None: none, for an arm drawn elsewhere)."""
    out = _base(p, "s") + ["arm_b_down"]
    if front:
        out.append(front)
    if p["gear"]:
        out.append(f"gear_{p['gear']}")
    return out


def back_parts(p):
    """Standing with their back to us: facing a door or the gate, about to go in."""
    return ["bbody_plain", f"legs_{p['legs']}_s", f"bhead_{p['head']}"]


def side_sit_parts(p):
    return [f"body_{p['torso']}", f"sit_{'pants' if p['legs'] == 'pants' else 'skirt'}",
            f"head_{p['head']}", "arm_b_down", "arm_f_rest"]


def front_sit_parts(p, phone=False):
    body = {"hoodie": "fbody_hoodie", "bomber": "fbody_bomber"}.get(p["torso"], "fbody_plain")
    return [body, "flegs", f"fhead_{p['fhead']}"] + (["fphone"] if phone else [])


def dog_parts(step):
    return walk_parts(DOG_WALKER, step)[:-2] + ["arm_b_swing" if step == "a" else "arm_b_down", "arm_f_lead", f"dog_{step}"]


WHEEL = [(-2, -4), (-1, -4), (0, -4), (1, -4), (2, -4), (-3, -3), (3, -3), (-4, -2), (4, -2), (-4, -1), (4, -1),
         (-4, 0), (4, 0), (-4, 1), (4, 1), (-4, 2), (4, 2), (-3, 3), (3, 3), (-2, 4), (-1, 4), (0, 4), (1, 4), (2, 4)]
BIKE_COLOURS = {"k": "#1a1220", "g": "#c4cfe2", "s": "#6a7094", "n": "#3a4058", "Yl": "#ffd84a", "Rd": "#ff4040"}


def bike_pixels(step, frame, cy, rider=False):
    """A bike facing right, 23 wide: wheels 9 across on hubs (5, cy) and (18, cy), spokes turning
    with the step, a cyan-or-other frame, chainring and chain, saddle, bars, lamp and reflector.
    Returns {(x, y): colour letter or #hex}; `frame` is the frame's colour."""
    f = {}
    for hx in (5, 18):
        for dx, dy in WHEEL:
            f[(hx + dx, cy + dy)] = "k"
        spokes = ((-2, -2), (-1, -1), (1, 1), (2, 2)) if step == "a" else ((-2, 2), (-1, 1), (1, -1), (2, -2))
        for dx, dy in spokes + ((0, -3), (0, 3), (-3, 0), (3, 0))[: 0 if step == "a" else 0]:
            f[(hx + dx, cy + dy)] = "s"
        f[(hx, cy)] = "g"
    for x in range(6, 10):
        f[(x, cy + 1)] = "n"                                   # the chain's lower run
    for a, b in (((5, cy), (10, cy)), ((5, cy), (9, cy - 5)), ((10, cy), (9, cy - 5)), ((9, cy - 5), (16, cy - 5)),
                 ((10, cy), (16, cy - 4)), ((16, cy - 5), (18, cy))):
        line(f, a, b, frame)
    f[(16, cy - 6)] = frame                                    # head tube
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        f[(10 + dx, cy + dy)] = "g"                            # chainring
    f[(10, cy)] = "k"
    for x in range(7, 11):
        f[(x, cy - 6)] = "k"                                   # saddle
    f[(16, cy - 7)] = "g"                                      # stem
    f[(16, cy - 8)] = "g"; f[(17, cy - 8)] = "g"               # bars
    if not rider:
        f[(15, cy - 8)] = "k"                                  # grip
    f[(19, cy - 5)] = "Yl"                                     # lamp
    f[(4, cy - 4)] = "Rd"                                      # reflector
    if step == "a":                                            # cranks and pedals
        f[(11, cy - 1)] = "n"; f[(12, cy - 1)] = "k"; f[(13, cy - 1)] = "k"
        f[(9, cy + 1)] = "n"; f[(8, cy + 2)] = "k"; f[(7, cy + 2)] = "k"
    else:
        f[(11, cy + 1)] = "n"; f[(11, cy + 2)] = "k"; f[(12, cy + 2)] = "k"
        f[(9, cy - 1)] = "n"; f[(9, cy - 2)] = "k"; f[(8, cy - 2)] = "k"
    return f


def cyclist_pixels(step):
    """The rider and bike, 23 wide, coloured (drawn as plain paths): a rider as full in the body
    as the walkers, leaning to the bars, knees going round with the pedals."""
    pal = dict(CYCLIST["pal"], F2="#36e3ff", a=CYCLIST["pal"]["j"], **BIKE_COLOURS)
    cy = 17
    f = {}
    # the far leg, behind the bike
    far = ([(8, 11), (9, 11), (9, 12), (9, 13), (9, 14), (8, 15), (8, 16), (8, 17)], [(7, 18), (8, 18)]) if step == "a" else           ([(8, 11), (9, 11), (9, 12), (10, 12), (10, 13), (9, 14)], [(8, 15), (9, 15)])
    for xy in far[0]:
        f[xy] = "p"
    for xy in far[1]:
        f[xy] = "B"
    f.update(bike_pixels(step, "F2", cy, rider=True))
    f.update(grid(HEADS["helmet"], -3, 6))                     # head as high as a walker's, a little forward
    for y, cells in ((3, "j10 K11 K12 K13 J14"), (4, "j9 J10 J11 Z12 J13 J14"), (5, "j8 J9 J10 J11 Z12 J13"),
                     (6, "j8 J9 J10 J11 Z12 J13"), (7, "j7 J8 J9 J10 Z11 J12"), (8, "j7 J8 J9 J10 Z11 J12"),
                     (9, "K6 K7 K8 K9 K10 K11 K12"), (10, "P6 P7 P8 P9 P10 P11")):
        for cell in cells.split():
            f[(int(cell[1:]), y)] = cell[0]
    # the near leg, over the bike: a thigh two pixels thick, the knee, the shin to the pedal
    if step == "a":
        leg = [(10, 11), (11, 11), (12, 11), (11, 12), (12, 12), (13, 12), (13, 13), (13, 14), (12, 15)]
        foot = [(12, 16), (13, 16)]
    else:
        leg = [(10, 11), (11, 11), (11, 12), (12, 12), (12, 13), (12, 14), (12, 15), (11, 16), (11, 17), (11, 18)]
        foot = [(11, 19), (12, 19)]
    for xy in leg:
        f[xy] = "P"
    for xy in foot:
        f[xy] = "B"
    for xy in ((14, 5), (15, 5), (14, 6), (15, 6), (15, 7), (15, 8)):
        f[xy] = "a"                                                       # the arm to the grip
    f[(15, 9)] = "S"
    return {k: (ch if ch.startswith("#") else FIXED.get(ch) or pal[ch]) for k, ch in f.items()}


# ---------- emitting ----------
def colour_of(ch, pal):
    if ch.startswith("#"):
        return ch
    if ch in FIXED:
        return FIXED[ch]
    pal = dict(pal)
    pal.setdefault("j", pal.get("J"))
    pal.setdefault("a", pal.get("j"))
    return pal[ch]


def flatten(parts, pal):
    """The pixels of a pose, coloured, for previews."""
    out = {}
    for name in parts:
        for k, ch in TEMPLATES[name].items():
            out[k] = colour_of(ch, pal)
    return out


def var_style(p, parts):
    """The colour variables a person's parts use."""
    pal = dict(p["pal"])
    pal.setdefault("j", pal.get("J"))
    pal.setdefault("a", pal.get("j"))
    used = {ch for name in parts for ch in TEMPLATES[name].values()
            if not ch.startswith("#") and ch not in FIXED}
    if "a" in used and "a" not in p["pal"]:        # sleeves in the jacket's shade: the style's fallback
        used = (used - {"a"}) | {"j"}
    used = sorted(used)
    return ";".join(f"--{ch}:{pal[ch]}" for ch in used)
