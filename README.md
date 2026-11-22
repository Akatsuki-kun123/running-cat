# Running Cat — mod mèo chạy cho Claude

Một chú mèo pixel trong công viên đêm Neon Tokyo, nằm phía trên ô chat của Claude (app desktop):

- Có task: mèo đi vài bước rồi chạy tại chỗ, cảnh công viên trôi theo. Xong task thì mèo phanh lại; nếu task xong suôn sẻ thì nhảy lên mừng, còn nếu task bị dừng thì mèo lóe đỏ như bị đau.
- Lúc chờ: mèo đứng thở, ngồi vẫy đuôi, đứng lên hai chân gãi ngứa.
- Sau 20 giây không có task: mèo ngó phải ngó trái, ngồi xuống, nằm ngủ; ngủ lâu thì chuyển sang ngủ say.
- Có task mới khi đang ngủ: mèo ngẩng đầu, đứng dậy, cúi rạp vươn vai, đi vài bước rồi mới chạy.
- Trong công viên có tháp Tokyo cao vút, máy bán hàng tự động, ghế đá, cây anh đào rơi cánh (gốc có vòng đá thấp), đài phun nước nhìn xiên 3D, WC công cộng, cột đèn thỉnh thoảng chập chờn, người đi dạo, dắt chó, đạp xe, ngồi ghế, ngồi thẳng ngắm cảnh, ngồi thẳng chơi điện thoại, ghé WC, đứng nói chuyện... Mỗi người một dáng riêng (11×22 pixel): có mặt, kiểu tóc, quần áo và đồ mang theo, từ nhân viên văn phòng xách cặp tới nữ sinh áo thủy thủ. Ghế đá, máy bán hàng (cao hơn người một cái đầu), WC (cửa cao hơn người) và xe đạp cũng to tương xứng; cây anh đào lớn vươn tán lên tận trời; cảnh vật có mặt bên, mặt trên và bóng đổ cho cảm giác 3D; những tòa nhà phía xa cao vút; bồn hoa gạch nhìn xiên 3D, đầy hoa nhiều màu, ở các khoảng trống; người mua nước quay mặt vào máy, bấm nút, lấy lon rồi quay ra cầm lon uống; cửa WC hé mở khi trống, mở ra khi có người vào và đóng kín khi có người bên trong; khung cảnh cao hơn, có thêm trời phía trên.
- Mỗi người trong công viên có vài việc hợp với mình (ngồi ghế, mua nước, chụp ảnh hoa anh đào, đứng đọc điện thoại dưới cột đèn, ghé WC...) và mỗi lần ghé lại chọn ngẫu nhiên một việc; việc nào đã kín chỗ thì không chọn được (ghế đá chỉ ngồi được 2 người). Người chỉ ra ngoài vào giờ của mình và không ai ngồi ngoài trời khi mưa.
- Ngày và đêm luân phiên (1 phút = 1 giờ, cả ngày 24 phút): trời sáng dần, mặt trời và mặt trăng đi ngang trời, đồng hồ góc trên, đèn đường tắt ban ngày; ban đêm ít người ra đường hơn; 7h–8h và 17h–18h chủ yếu là người đi làm và học sinh; từ 0h đến 6h không có tàu; về khuya và ban ngày phần lớn nhà tắt đèn.
- Bốn mùa kiểu Nhật, mỗi mùa 4 ngày công viên (96 phút thật), sang mùa lúc 4 giờ sáng; cả năm khoảng 6,4 giờ. Xuân: anh đào hồng, cánh hoa rơi, mưa phùn. Hạ: cây xanh, mưa rào ngắn và nhiều. Thu: lá cam đỏ bay chéo theo gió, ít mưa. Đông: cây phủ tuyết, tuyết rơi (người vẫn ra chơi khi tuyết nhẹ), thỉnh thoảng có bão tuyết ngắn với sương trắng mờ. Màu cây và cỏ đổi dần trong 2 giờ cuối mùa.
- Thời tiết: khi mưa hoặc bão tuyết trời xám lại; mưa rơi, nước bắn trên lối đi; người đi dạo bung ô (ai không có ô thì chạy vội ra khỏi khung hình rồi biến mất), nhóm đứng nói chuyện che ô, người dắt chó và đạp xe ở nhà, ghế đá vắng người.
- Xem thử: gõ `/running-cat season <spring|summer|autumn|winter|auto>` hoặc `/running-cat weather <clear|rain|snow|blizzard|auto>` để xem mùa hoặc thời tiết khác ngay (chỉ trong session đó; `auto` để quay lại). Gõ `/running-cat` để xem đang mùa nào, ngày mấy.
- Phía xa có đường tàu trên cầu cạn, cứ khoảng 45 giây lại có một đoàn tàu chạy qua, lần lượt từ trái sang phải rồi từ phải sang trái.

Mod chỉ hiện trong app Claude desktop (và mobile), không hiện trong terminal.

## Vì sao phải tự tạo hình mèo?

Hình con mèo lấy từ gói **"Cat 50+ Animations" của Bow.Pixel** (itch.io). Giấy phép của gói cho phép dùng
và chỉnh sửa nhưng **không cho chia sẻ lại hình**, nên gói mod này **không kèm hình mèo**. Bạn tự tải gói
về, rồi chạy tool đi kèm một lần để tạo file hình (`running-cat/hooks/cat-frames.ts`) trên máy mình.
Phần cảnh công viên và con người được vẽ riêng cho mod, có sẵn trong gói.

## Cần chuẩn bị

1. **Claude Code** (app Claude desktop, tab Code) và lệnh `claude` chạy được trong PowerShell.
   Thử: `claude --version`. Nếu chưa có, cài theo hướng dẫn tại https://claude.com/claude-code
2. **Python 3** — tải tại https://www.python.org/downloads/ (khi cài nhớ tick "Add python.exe to PATH").
   Thử: `python --version`
3. **Gói mèo**: tìm "Cat 50+ Animations" của Bow.Pixel trên https://itch.io và tải về file
   `Cat 50+ Animations.zip` (không cần giải nén).

## Cài nhanh (Windows)

1. Tải repo này về: `git clone https://github.com/Akatsuki-kun123/running-cat.git`, hoặc trên GitHub chọn **Code → Download ZIP** rồi giải nén.
2. Mở PowerShell trong thư mục repo (Shift + chuột phải vào khoảng trống → "Open PowerShell window here",
   hoặc gõ `cd` tới thư mục đó).
3. Chạy (thay đường dẫn bằng chỗ bạn để file zip mèo):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1 -CatZip "$HOME\Downloads\Cat 50+ Animations.zip"
   ```

   Script sẽ: cài thư viện Pillow cho Python nếu thiếu → chép mod vào `%USERPROFILE%\.claude\mods\running-cat-pack`
   → tạo hình mèo từ file zip → đăng ký và cài mod cho mọi session.
4. **Mở một session mới** trong app Claude (hoặc khởi động lại app). Mèo sẽ hiện trên ô chat.

Script chép mod sang chỗ riêng nên thư mục tải về có thể xoá sau khi cài; mod chạy từ `%USERPROFILE%\.claude\mods\running-cat-pack`
(đừng xoá thư mục này).

## Cài từng bước (macOS / Linux, hoặc nếu script lỗi)

1. Chép thư mục gói này tới chỗ cố định, ví dụ `~/.claude/mods/running-cat-pack`.
2. Cài Pillow:

   ```sh
   python3 -m pip install pillow
   ```

3. Tạo hình mèo (đưa file zip, thư mục đã giải nén, hoặc thẳng file `Cat-Sheet.png` đều được):

   ```sh
   python3 ~/.claude/mods/running-cat-pack/running-cat/tools/make_cat_frames.py "~/Downloads/Cat 50+ Animations.zip"
   ```

   Thấy dòng `Xong: đã tạo .../hooks/cat-frames.ts (44 khung hình, khung 24x16 px).` là được.
4. Đăng ký và cài mod:

   ```sh
   claude plugin marketplace add ~/.claude/mods/running-cat-pack
   claude plugin install running-cat@running-cat-mods --scope user
   ```

5. Mở session mới trong app Claude.

## Gỡ cài đặt

```powershell
claude plugin uninstall running-cat@running-cat-mods
claude plugin marketplace remove running-cat-mods
```

Rồi xoá thư mục `%USERPROFILE%\.claude\mods\running-cat-pack`.

## Lỗi hay gặp

- **`python` không chạy / mở Microsoft Store**: cài Python từ python.org và tick "Add python.exe to PATH", rồi mở lại PowerShell.
- **`claude` không chạy**: cài Claude Code, mở lại PowerShell, thử `claude --version`.
- **Không thấy mèo sau khi cài**: phải mở session mới. Kiểm tra `claude plugin list` có `running-cat@running-cat-mods` và trạng thái enabled.
- **Mod báo lỗi thiếu `cat-frames.ts`**: chưa chạy bước tạo hình mèo, chạy lại bước 3.

## Bản quyền

- Hình mèo: © Bow.Pixel, gói "Cat 50+ Animations" — mỗi người tự tải và tuân theo giấy phép của gói. Không chia sẻ lại file `cat-frames.ts` đã tạo.
- Code mod, cảnh công viên và nhân vật: dùng và sửa thoải mái cho mục đích cá nhân.

## Cấu trúc repo

| Thư mục / file | Là gì |
|---|---|
| `running-cat/` | Mod: `hooks/` (code chạy trong Claude), `tests/`, `types/`, `tools/make_cat_frames.py` (tạo hình mèo) |
| `running-cat/hooks/park.ts` | Hình công viên đã vẽ sẵn, **sinh ra từ `art/`**: đừng sửa tay |
| `running-cat/hooks/season.ts` | Bốn mùa và lịch thời tiết |
| `art/` | Bộ script Python vẽ công viên, người, cây → `park.ts` (xem `art/README.md`) |
| `.claude-plugin/marketplace.json`, `install.ps1` | Để cài mod |

## Đóng góp

1. Cài mod theo hướng dẫn ở trên: cần có gói mèo của Bow.Pixel để tạo `running-cat/hooks/cat-frames.ts`.
   Muốn chạy thẳng từ thư mục repo khi đang sửa:

   ```powershell
   python running-cat	ools\make_cat_frames.py "$HOME\Downloads\Cat 50+ Animations.zip"
   claude plugin marketplace add .
   claude plugin install running-cat@running-cat-mods --scope user
   ```

   Sau mỗi lần sửa: `claude plugin marketplace update running-cat-mods` rồi `claude plugin update running-cat@running-cat-mods`, mở session mới.
2. Tạo nhánh riêng cho mỗi thay đổi: `git switch -c ten-nhanh`.
3. Sửa code trong `running-cat/hooks/`; sửa hình thì sửa `art/` rồi vẽ lại `park.ts` (xem `art/README.md`).
4. Chạy test, tất cả phải đạt:

   ```powershell
   claude plugin test running-cat
   claude plugin validate running-cat
   ```

   Có test kiểm tra kích thước: cả band phải dưới 131.072 ký tự, quá là app không vẽ.
5. Tăng `version` trong `running-cat/.claude-plugin/plugin.json`, commit và mở pull request.

**Không bao giờ commit `cat-frames.ts` hay file nào của gói mèo** (`.gitignore` đã chặn sẵn): giấy phép Bow.Pixel không cho chia sẻ lại.

Xem thử mùa và thời tiết trong app: `/running-cat season <spring|summer|autumn|winter|auto>`, `/running-cat weather <clear|rain|snow|blizzard|auto>`.
