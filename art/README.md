# Bộ vẽ hình công viên (running-cat-art)

Các script này vẽ toàn bộ công viên của mod, trừ con mèo, rồi ghi ra file `running-cat/hooks/park.ts`. Phần vẽ gồm:

- trời, thành phố và nhà phía xa
- công viên, cây anh đào, người
- hình mưa

Mod chỉ cần file `park.ts` đã sinh sẵn để chạy, nên **chạy mod không cần đến các script này**. Bạn chỉ cần chúng khi muốn sửa hình.

## Cần có

Python 3 và thư viện Pillow:

```powershell
python -m pip install pillow
```

## Các file

| File | Việc |
|---|---|
| `make_park.py` | Script chính: vẽ mọi thứ và ghi ra `park.ts` cùng một ảnh xem trước |
| `people_art.py` | Hình từng người (dáng, tóc, quần áo, đồ mang theo), được `make_park.py` dùng |
| `check_pixels.py` | Kiểm tra: giải mã ngược hình đã nén và so với điểm ảnh gốc, đồng thời xem mọi màu có hợp lệ không |

## Vẽ lại park.ts

Chạy trong thư mục này:

```powershell
python make_park.py ..\running-cat\hooks\park.ts preview.png
```

- Lệnh in ra kích thước từng phần, ví dụ `defs 58255 back 9198 ... total 92627`.
- Mở `preview.png` để xem nhanh cảnh tĩnh.
- Muốn ảnh xem trước có cả mèo thì thêm đường dẫn tới `Cat-Sheet.png` của Bow.Pixel làm tham số thứ ba. Ảnh đó chỉ để xem, không được đưa lên repo.

Cùng một script luôn sinh ra cùng một `park.ts`, đúng đến từng byte. Nhờ vậy, nếu bạn chỉ dọn code mà không định đổi hình, chạy lại rồi so file sẽ thấy ngay có gì đổi ngoài ý muốn hay không:

```powershell
git diff --stat
```

## Sau khi sửa hình

1. Chạy `python check_pixels.py`. Kết quả phải là `no problems`.
2. Chạy test của mod: `claude plugin test ..\running-cat`. Có một test kiểm tra kích thước, vì cả band phải nằm dưới 131.072 ký tự, nếu vượt thì app không vẽ.
3. Xem trong app: mở một session mới, hoặc dùng `/running-cat season …` và `/running-cat weather …` để xem đủ các mùa và kiểu thời tiết.

## Lưu ý

- Mỗi màu dùng nhiều lần được đặt một tên lớp ngắn khi chạy (`register.tsx`). Phần đổi màu theo mùa trong `register.tsx` tìm cây anh đào và hàng rào theo **mã màu gốc**: `#d65c98`, `#f07cb4`, `#ff9cc8`, `#ffb7d5`, `#fff4f9`, `#0f2a2e`, `#17403f`. Nếu đổi các màu này ở đây thì phải đổi cả `SEASON_BASE` trong `register.tsx`.
- Đoạn "bench visitors" là cách vẽ khách ghé thăm đời đầu. Đoạn này vẫn được giữ vì nó dựng các hàm dùng chung, và thứ tự nó dùng các phần hình quyết định tên các mẫu hình trong `park.ts`. Xoá nó thì hình không đổi nhưng `park.ts` sẽ khác byte.
- Mùa đông: `people_art.py` có bộ mẫu `WINTER` (đầu đội mũ len, thân quàng khăn, váy dài mặc quần tất). `make_park.py` xuất chúng thành `PARK_WINTER_DEFS` với cùng id, cùng `PARK_WINTER_STYLE` (màu khăn, mũ của từng người, tay áo dài, quần tất). Cành trơ của cây anh đào là nhóm `wtr` trong mẫu công viên; tuyết trên cành (`TREE_SNOW`) nằm trong hai lớp tuyết đọng `sg1`/`sg2` (mỗi lớp một nửa), nên cành chỉ trắng khi tuyết đã rơi. `register.tsx` chỉ dùng các phần này vào mùa đông, đồng thời bỏ tán hoa, hoa trong bồn (nhóm `flw`) và tia nước (`fjet`, `fw0`–`fw2`) khỏi bản vẽ. Tuyết đọng là hai nhóm `sg1` (lấm tấm: đường tuyết `scp` vẽ nét đứt) và `sg2` (phủ dày: chính đường đó vẽ liền, chất cao thêm một hàng trên mặt rộng, phủ trắng mép bồn và vòng đá); `register.tsx` tính độ dày tuyết theo các đợt tuyết rơi (`snowDepth` trong `season.ts`) và đổi độ mờ hai nhóm. `PARK_WINTER_PAINT` đổi màu lá bồn hoa thành bụi cây, nước thành băng và làm trầm áo người đạp xe; quần áo những người khác trầm 20% bằng `color-mix` trong `PARK_WINTER_STYLE`.
- Hình con mèo không nằm ở đây. Nó được tạo từ gói của Bow.Pixel bằng `running-cat/tools/make_cat_frames.py`, và **không được chia sẻ lại**.
- Cổng: người lên khỏi cầu thang ngay trong lòng cổng, bước thẳng xuống lối đi rồi đi tới chỗ dừng; lúc về đi vào hẳn lòng cổng, bước thẳng lên mép rồi xuống cầu thang (`leg_css`). Nhóm của họ đi ngang và bước lên/xuống mép; `.vw` bên trong lên/xuống cầu thang và chỉ trong lúc đó bị cắt ngay dưới chân bằng `clipPath` `gk` (qua biến `--k`), nên đứng trên lối đi trong lòng cổng vẫn thấy đủ người.
- Mùa hạ và mùa thu cũng thay mẫu như mùa đông (cùng id): `people_art.py` có `SUMMER` (tay áo chỉ còn ở vai, bỏ vạt áo khoác dài, áo của dân văn phòng và học sinh gakuran thành sơ mi trắng theo `COOL_BIZ`, hoodie/bomber/cardigan thành áo phông cùng màu theo `TEE_ON`) và `AUTUMN` (khăn mỏng ở cổ: chữ `w` thay da cổ, `v` hai bên). `make_park.py` xuất chúng thành `PARK_SUMMER_DEFS`/`PARK_AUTUMN_DEFS` cùng style riêng: mùa hạ tay áo trắng cho dân văn phòng; mùa thu tay áo dài theo màu áo, và màu khăn (`--w2`) cho mỗi người thứ hai (`autumn_colours`), người còn lại không có khăn (da cổ như cũ). `register.tsx` thay mẫu theo mùa qua `DRESS`.
- Ngày theo mùa: hình vẽ các mốc của trời (`dsky`, `dusk`, `dlt`), mặt trời, mặt trăng, đèn đường (`nl`) và đom đóm (`ffy`) theo một ngày mặt trời mọc lúc 6 giờ, lặn lúc 18 giờ. `register.tsx` (`sunStyle`) dời các mốc đó tới giờ mọc/lặn của ngày đang vẽ (`sunHours`, `solarHour` trong `season.ts`). Thêm hiệu ứng nào theo mặt trời thì vẽ theo ngày 6–18 và thêm tên keyframes vào `SOLAR`.
- Đom đóm mùa hạ: `make_park.py` (đoạn trước "people") rải 16 con theo hạt giống cố định, tránh cổng, máy bán hàng và WC. Mỗi con là một `<use href="#fg">` (lõi 1 px, quầng 3 px mờ) với một trong bốn nhịp `fp0`–`fp3` (nhấp nháy `ffb`, trôi `ffd`). Cả đàn nằm trong nhóm `ffl`, lặp ba lần theo chiều ngang trong `<g class="ffy dn"><g class="ffr">`: `ffy` theo giờ trong ngày, `ffr` theo thời tiết (do `register.tsx` đặt). Ngoài mùa hạ `register.tsx` cắt cả nhóm; khi bản vẽ quá giới hạn SVG thì đom đóm và cánh hoa bị bỏ trước khách ghé thăm.
- Ghế: người ngồi ghế (các stage `bench`) được vẽ trước mọi người khác, nên ai đi ngang trên lối đi luôn ở phía trước họ; người ngồi quay mặt ra có chân trên hàng đi (`FRONT_SIT_Y`).
