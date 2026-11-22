"""Tạo hooks/cat-frames.ts (hình con mèo) từ gói "Cat 50+ Animations" của Bow.Pixel.

Hình mèo không được chia sẻ kèm mod (giấy phép của gói không cho phân phối lại), nên mỗi người
tự tải gói về rồi chạy tool này một lần:

    python make_cat_frames.py "<đường dẫn tới Cat 50+ Animations.zip>"

Có thể đưa file .zip, thư mục đã giải nén, hoặc thẳng file Cat-Sheet.png. Mặc định ghi ra
hooks/cat-frames.ts nằm cạnh thư mục tools này; muốn ghi chỗ khác thì thêm đường dẫn thứ hai.
Cần Python 3 và Pillow (pip install pillow).

Mọi khung hình dùng chung một khung (hợp của tất cả khung, chân mèo ở hàng dưới cùng) để con mèo
không bị lệch khi đổi động tác. Mod ghép các khung thành chuỗi có thời gian.
"""
import io
import sys
import zipfile
from pathlib import Path

# Console Windows có thể không dùng UTF-8: in tiếng Việt mà không bị lỗi.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

try:
    from PIL import Image
except ImportError:
    sys.exit("Thiếu thư viện Pillow. Cài bằng:  python -m pip install pillow")

SHEET_NAME = "Cat-Sheet.png"
CELL = 32
# tên -> danh sách (hàng, số khung) trong Cat-Sheet.png
ANIMS = {
    "idle": [(2, 8)],          # Idle_1: đứng, thở
    "run": [(6, 4)],           # W_3: chạy tại chỗ
    "look": [(25, 4), (26, 4), (27, 4)],  # R_A_1..3: quay ra nhìn rồi quay lại
    "sitDown": [(15, 4)],      # Sit_Down: đứng -> ngồi
    "lieHead": [(9, 4)],       # Rest_1: nằm, ngẩng đầu
    "sleep": [(10, 8)],        # Rest_2: cuộn tròn ngủ, đuôi ve vẩy
    "sitUp": [(14, 4)],        # Sit_Up: ngồi -> đứng
    "idle2": [(3, 8)],         # Idle_2: đứng, kiểu thở khác
    "sit1": [(0, 8)],          # Sit_1: ngồi vẫy đuôi
    "sit2": [(1, 8)],          # Sit_2: ngồi, đuôi quét đất
    "stop": [(16, 4)],         # Stop: phanh lại sau khi chạy
    "jump": [(18, 8)],         # J_1: nhảy mừng
    "lookLeft": [(28, 4), (29, 4), (30, 4)],  # R_A_4..6: quay sang trái nhìn rồi quay lại
    "dream": [(11, 8)],        # Dream: ngủ say
    "rise": [(46, 8)],         # On_2_Paws: đứng lên hai chân
    "scratch": [(48, 8)],      # Scratching: gãi
    "lower": [(47, 8)],        # On_4_Paws: hạ xuống bốn chân
    "walk": [(4, 8)],          # W_1: đi bộ
    "bowDown": [(23, 4)],      # B_I_1: đang đứng thì cúi rạp vươn vai
    "bowUp": [(24, 4)],        # B_I_2: vươn vai xong đứng lên
    "hurt": [(33, 2)],         # Dmg: lóe đỏ một nhịp
}


def open_sheet(src: Path) -> Image.Image:
    """Mở Cat-Sheet.png từ file .zip, thư mục, hoặc chính file png."""
    if not src.exists():
        sys.exit(f"Không tìm thấy: {src}")
    if src.is_dir():
        found = sorted(src.rglob(SHEET_NAME))
        if not found:
            sys.exit(f"Không thấy {SHEET_NAME} trong thư mục {src}")
        return Image.open(found[0])
    if src.suffix.lower() == ".zip":
        with zipfile.ZipFile(src) as z:
            names = [n for n in z.namelist() if n.replace("\\", "/").split("/")[-1] == SHEET_NAME]
            if not names:
                sys.exit(f"Không thấy {SHEET_NAME} trong file zip {src}")
            return Image.open(io.BytesIO(z.read(names[0])))
    return Image.open(src)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1]).expanduser()
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "hooks" / "cat-frames.ts"

    sheet = open_sheet(src).convert("RGBA")
    rows_needed = max(r for rows in ANIMS.values() for r, _ in rows) + 1
    if sheet.height < rows_needed * CELL or sheet.width < 8 * CELL:
        sys.exit(f"{SHEET_NAME} nhỏ hơn mong đợi ({sheet.width}x{sheet.height}); có phải đúng gói Cat 50+ Animations không?")

    frames = {name: [sheet.crop((c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL)) for r, n in rows for c in range(n)]
              for name, rows in ANIMS.items()}
    boxes = [f.getbbox() for fs in frames.values() for f in fs]
    if any(b is None for b in boxes):
        sys.exit("Có khung hình trống: file sheet không khớp với gói Cat 50+ Animations.")
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    w, h = x1 - x0, y1 - y0

    def markup(f: Image.Image) -> str:
        """Mỗi dải điểm ảnh cùng màu thành một nét 1 px chạy giữa hàng."""
        pix = f.load()
        by = {}
        for y in range(y0, y1):
            x = x0
            while x < x1:
                px = pix[x, y]
                if px[3] == 0:
                    x += 1
                    continue
                s = x
                while x + 1 < x1 and pix[x + 1, y] == px:
                    x += 1
                by.setdefault(px, []).append((s - x0, y - y0, x - s + 1))
                x += 1
        parts = []
        for (r, g, b, a), runs in by.items():
            # The first run absolute, each next one a short relative move from where the last ended.
            d, at = [], None
            for rx, ry, n in runs:
                if at is None:
                    d.append(f"M{rx} {ry}.5h{n}")
                else:
                    dx, dy = rx - at[0], ry - at[1]
                    d.append(f"m{dx}{'' if dy < 0 else ' '}{dy}h{n}")
                at = (rx + n, ry)
            op = "" if a == 255 else f' stroke-opacity="{a / 255:.2f}"'
            parts.append(f'<path stroke="#{r:02x}{g:02x}{b:02x}"{op} d="{"".join(d)}"/>')
        return "".join(parts)

    lines = [
        "// Generated by tools/make_cat_frames.py from Bow.Pixel's Cat 50+ Animations (Cat-Sheet.png).",
        "// Each frame is SVG path markup in one shared box, feet on the bottom row: one 1 px stroke",
        "// per run of pixels, along the row's middle (the scene's style sets fill none).",
        f"export const CAT_W = {w}",
        f"export const CAT_H = {h}",
        "// Where the box's left edge sat in the 32 px cell, to keep the cat's old spot.",
        f"export const CAT_CELL_X = {x0}",
        "export const CAT_FRAMES = {",
    ]
    for name, fs in frames.items():
        lines.append(f"  {name}: [" + ", ".join(repr(markup(f)) for f in fs) + "],")
    lines.append("} as const")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Xong: đã tạo {out} ({sum(len(fs) for fs in frames.values())} khung hình, khung {w}x{h} px).")


if __name__ == "__main__":
    main()
