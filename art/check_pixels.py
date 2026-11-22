"""Checks the park generator's pixel encoding: every call to paths() is decoded back and compared
with the pixels it was given, and every colour in the output is one a browser can draw.

    python check_pixels.py            (next to make_park.py; writes nothing to the mod)
"""
import re
import runpy
import sys
import tempfile
import os

HEX = re.compile(r"#[0-9a-f]{3}(?:[0-9a-f]{3})?$", re.I)
CHECKED = {"calls": 0, "pixels": 0}
PROBLEMS = []


def decode(svg):
    """Pixels drawn by paths()' output: {(x, y): colour}."""
    out = {}
    for attr, d in re.findall(r'<path ((?:stroke|style|class)="[^"]*") d="([^"]*)"', svg):
        kind, val = re.match(r'(\w+)="([^"]*)"', attr).groups()
        if kind == "style":
            colour, fill = val[len("fill:"):], True
        else:
            colour, fill = (val if kind == "stroke" else "@" + val[1:]), False
        toks = re.findall(r"[MmhvzZ]|-?\d+(?:\.\d+)?", d)
        x = y = sx = sy = 0.0
        i = 0
        cmd = None
        while i < len(toks):
            t = toks[i]
            if t in "MmhvzZ":
                cmd = t
                i += 1
                if t in "zZ":
                    x, y = sx, sy
                continue
            if cmd in "Mm":
                a, b = float(toks[i]), float(toks[i + 1]); i += 2
                x, y = (a, b) if cmd == "M" else (x + a, y + b)
                sx, sy = x, y
                cmd = "l" if cmd == "M" else "m"
                if fill:
                    # a block: h w v h h-w z
                    w = float(toks[i + 1]); h = float(toks[i + 3])
                    for yy in range(int(y), int(y + h)):
                        for xx in range(int(x), int(x + w)):
                            if (xx, yy) in out:
                                PROBLEMS.append(f"pixel drawn twice at {(xx, yy)}")
                            out[(xx, yy)] = colour
                    i += 6   # h w v h h -w   (z handled next loop)
                    cmd = None
                continue
            if cmd == "h":
                n = float(t); i += 1
                yy = int(y - 0.5)
                for xx in range(int(x), int(x + n)):
                    out[(xx, yy)] = colour
                x += n
                continue
            raise ValueError(f"unexpected {cmd} {t} in {d[:80]}")
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, here)
    src = open(os.path.join(here, "make_park.py"), encoding="utf-8").read()
    real = {}

    def checked(pixels):
        svg = real["paths"](pixels)
        CHECKED["calls"] += 1
        CHECKED["pixels"] += len(pixels)
        got = decode(svg)
        want = {k: v for k, v in pixels.items()}
        if got != want:
            missing = [k for k in want if k not in got]
            extra = [k for k in got if k not in want]
            wrong = [k for k in want if k in got and got[k] != want[k]]
            PROBLEMS.append(f"paths() call {CHECKED['calls']}: {len(want)} px in, missing {len(missing)} "
                            f"{missing[:5]}, extra {len(extra)} {extra[:5]}, wrong colour {len(wrong)} {wrong[:5]}")
        return svg

    # wrap paths() as soon as it is defined: run the generator with a hook after the definition
    marker = "\ndef runs_d(runs):"
    assert src.count(marker) == 1
    hook = "\n_real_paths = paths\npaths = __checked_paths__\n"
    src = src.replace(marker, hook + marker, 1)
    with tempfile.TemporaryDirectory() as tmp:
        g = {"__name__": "__main__", "__checked_paths__": checked}
        sys.argv = ["make_park.py", os.path.join(tmp, "park.ts"), os.path.join(tmp, "park.png")]

        class Late(dict):
            pass
        # paths() is referenced through the module globals, so the swap reaches every call
        code = compile(src, "make_park.py", "exec")
        real_holder = {}

        def checked_late(pixels):
            return checked(pixels)
        g["__checked_paths__"] = checked_late
        # real paths comes from the module once defined
        orig_exec_globals = g

        class Getter:
            pass
        real["paths"] = lambda px: orig_exec_globals["_real_paths"](px)
        old_out = sys.stdout
        sys.stdout = open(os.devnull, "w")
        try:
            exec(code, g)
        finally:
            sys.stdout.close()
            sys.stdout = old_out
        ts = open(os.path.join(tmp, "park.ts"), encoding="utf-8").read()

    # every colour in the output is drawable
    for kind, val in re.findall(r'(stroke|fill)[=:]"?([^";}>\s)]+)', ts):
        v = val.strip('"')
        if v.startswith("#") and not HEX.match(v):
            PROBLEMS.append(f"bad {kind} colour {v!r}")
        if v.startswith("@"):
            PROBLEMS.append(f"unresolved colour {kind} {v!r}")
    # every template class has its colour rule
    used = set(re.findall(r'class="(c\w+)"', ts))
    ruled = set(re.findall(r"\.(c\w+)\{stroke:", ts))
    for c in sorted(u for u in used if re.fullmatch(r"c[A-Za-z]\d?", u) and u not in ruled and u != "c0"):
        PROBLEMS.append(f"class {c} has no colour rule")

    print(f"checked {CHECKED['calls']} encodings, {CHECKED['pixels']} pixels")
    print("\n".join(PROBLEMS[:40]) if PROBLEMS else "no problems")
    return 1 if PROBLEMS else 0


sys.exit(main())
