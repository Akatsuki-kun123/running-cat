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
- Mùa đông: `people_art.py` có bộ mẫu `WINTER` (đầu đội mũ len, thân quàng khăn, váy dài mặc quần tất). `make_park.py` xuất chúng thành `PARK_WINTER_DEFS` với cùng id, cùng `PARK_WINTER_STYLE` (màu khăn, mũ của từng người, tay áo dài, quần tất). Cành trơ của cây anh đào là nhóm `wtr` trong mẫu công viên. `register.tsx` chỉ dùng các phần này vào mùa đông, đồng thời ẩn màu tán hoa.
- Hình con mèo không nằm ở đây. Nó được tạo từ gói của Bow.Pixel bằng `running-cat/tools/make_cat_frames.py`, và **không được chia sẻ lại**.
