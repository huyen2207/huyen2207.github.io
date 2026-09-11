# N1 文法 90 Days

Web app luyện 文法 JLPT N1 trong **đúng số ngày còn lại** trước kỳ thi.

```
MONTH 1  文法を知る      「Mẫu này nghĩa là gì?」
MONTH 2  文法を比べる    「Tại sao là nó mà không phải mẫu kia?」
MONTH 3  問題を見抜く    「Đề đang định bẫy mình ở đâu?」
```

Luật tối cao của project: [`CLAUDE.md`](./CLAUDE.md). Kiến trúc: [`project-architecture.md`](./project-architecture.md).
Mọi quyết định khi triển khai (kể cả các conflict và cách hoà giải): [`implementation-decisions.md`](./implementation-decisions.md).

## Chạy

```bash
npm install
npm run dev        # http://localhost:5173
```

Học trên điện thoại cùng wifi (không có HTTPS ⇒ **không** cài được PWA, **không** học offline):

```bash
npm run build && npx vite preview --host
```

## Kiểm tra

```bash
npm run verify     # typecheck + lint + test + build
```

## Triển khai để học thật

App chạy trên **GitHub Pages**, tự động build mỗi khi đẩy code lên:

```bash
npm run deploy     # = git push origin main
```

GitHub Actions sẽ chạy `npm run verify` (typecheck + lint + test + build) rồi mới deploy —
hỏng test thì không deploy được. Xem tiến trình ở tab **Actions** trên GitHub.

URL học: **https://huyen2207.github.io/**

Ba ràng buộc của host (chi tiết ở [`project-architecture.md §14.1`](./project-architecture.md)):
**root domain** ✓ (repo đặt tên `huyen2207.github.io` nên chạy ở gốc), **SPA fallback** ✓
(`npm run build` tự tạo `dist/404.html` — GitHub Pages không hiểu `_redirects` của Netlify),
**HTTPS** ✓ (Pages mặc định).

> ⚠️ Tiến độ học nằm trong IndexedDB, **gắn theo URL**. Đổi tên repo là mất tiến độ — phải
> export ở URL cũ rồi import ở URL mới tại `/settings`.

`content-inventory/` bị loại khỏi repo (xem `.gitignore`): đó là bản trích 210 mẫu kèm 形/意味
chép nguyên từ sách nguồn, không nên công khai. App không import file này nên không ảnh hưởng gì.

## Kiến trúc rút gọn

```
UI  →  app/services  →  engines (PURE)  →  content (đọc) + storage (ghi)
```

- **Engine là pure function**: `(state, input) → output`. `now` luôn là tham số, không gọi `Date.now()`.
- **UI không tính toán**: không tính mastery, priority, phase hay readiness — chỉ hiển thị.
- **Nội dung ngữ pháp không nằm trong `.tsx`** — chỉ ở `src/content/data/**.json`.
- **`Attempt` chỉ append**, không sửa, không xoá.
- Cả bốn luật trên đều được thi hành bằng test ở `src/__tests__/architecture.test.ts`.

## Dữ liệu học

Nằm trong IndexedDB **trên trình duyệt của bạn**. Không có backend.
Sao lưu ở `/settings` → *Xuất file sao lưu*. App nhắc sao lưu mỗi 7 ngày.

## Nội dung ngữ pháp

Seed hiện tại gồm **12 mẫu N1 do AI sinh**, đánh dấu `NEEDS_REVIEW`.
Theo `CLAUDE.md §16.4`, nội dung chưa xác minh **vẫn luyện được** nhưng **không** dùng làm bằng
chứng để đạt mức *Sẵn sàng thi*. Nhập nội dung đã đối chiếu tài liệu ở `/settings` để mở khoá.
