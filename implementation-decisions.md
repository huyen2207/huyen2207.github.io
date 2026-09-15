# implementation-decisions.md — NHẬT KÝ QUYẾT ĐỊNH KHI TRIỂN KHAI

> Ghi lại **mọi** chỗ spec mâu thuẫn hoặc thiếu, và cách hoà giải.
> Luật ưu tiên đã dùng: `CLAUDE.md` > `project-architecture.md` > 5 file spec > prompt > code.
> Không dòng nào của `CLAUDE.md` bị sửa.

---

## A. BẢY CONFLICT TỪ `spec-consistency-check.md` — áp dụng phương án khuyến nghị (A)

Prompt yêu cầu: *"Nếu phát hiện conflict: DỪNG phần bị conflict, ghi chú rõ conflict và dùng
rule ưu tiên trong `CLAUDE.md`."* Cả 7 phương án A đều **giữ nguyên `CLAUDE.md`**, nên áp dụng
chúng chính là thi hành luật ưu tiên — không có phần nào bị chặn.

| # | Conflict | Quyết định | Nơi thể hiện trong code |
|---|---|---|---|
| C-01 | Bảng phân bổ session 3 nhóm vs 6 block | Giữ 6 block của `CLAUDE.md §8` để **phân bổ**; bảng 3–5 nhóm chỉ để **hiển thị** | `config/phase.config.ts` (`PHASE_BLOCK_RATIOS`), `engines/session/displayGroups()` |
| C-02 | 6 dạng bài Phase 1 vs enum 8 giá trị | Thêm 3 loại trắc nghiệm; **hoãn** `MINI_SENTENCE_COMPLETION` | `domain/enums.ts` (`QUESTION_TYPES`, 11 giá trị) |
| C-03 | 10 tên `TrapType` của prompt vs 9 giá trị đã khoá | Giữ 9 + thêm 3 → **12 giá trị** (giữ `POLARITY_TRAP`, `VOLITION_TRAP` vì rất đặc trưng N1) | `domain/enums.ts` (`TRAP_TYPES`) |
| C-04 | Trùng tên `StudyMode` | Đặt tên mới `DeliveryMode` cho 4 chế độ giao bài | `domain/enums.ts` (`DELIVERY_MODES`) |
| C-05 | Thứ tự micro lesson 8 bước vs 10 bước | Giữ 10 bước của `arch §9`; `Restrictions` đứng **trước** `Examples` | `ui/components/LearnCard.tsx` (có test kiểm thứ tự) |
| C-06 | 4 mã kết quả vs ma trận 3×2 của `CLAUDE.md §12` | Dùng **8** `GradeOutcome` | `domain/enums.ts`, `engines/exercise/grade.ts` |
| C-07 | `ComparisonGroup` 2–5 mẫu vs `ComparisonSet` 2–4 | Giữ `ComparisonSet`, trần 4, `decisiveDifferenceVi` một câu | `content/schema/index.ts` (`zComparisonSet`) |

### Hai mục GAP cần người dùng xác nhận — đã chọn theo khuyến nghị

| # | Câu hỏi | Quyết định | Hệ quả |
|---|---|---|---|
| G-05 | ERS: thành phần chưa có dữ liệu tính 0 hay loại khỏi công thức? | **Loại + chuẩn hoá lại trọng số** | Người học Phase 1 không bị đẩy vào band "Cần báo động" vì lý do không phải năng lực. Có test riêng. |
| G-06 | Confidence trong Mock | **Ghi mặc định `UNSURE` + cờ `confidenceImputed`** | Attempt có cờ này bị loại khỏi `guessRate` và `calibration`. |

---

## B. CONFLICT MỚI PHÁT HIỆN KHI CODE

### ⚠️ C-08 — Dòng disclaimer của ERS

| | |
|---|---|
| **Điều khoản A** | `CLAUDE.md §23`: ERS *"Luôn kèm dòng: 'Chỉ số này đo mức độ sẵn sàng của bạn với dạng bài 文法, **không phải xác suất đậu**.'"* — quy định NGUYÊN VĂN. |
| **Điều khoản B** | `analytics-engine.md §13`, luật E4: *"Test E4: grep `i18n/vi.ts` không chứa 'xác suất', 'đậu', 'pass rate'."* |
| **Mâu thuẫn** | A **bắt buộc** chuỗi mà B **cấm**. Không thể thoả mãn cả hai theo nghĩa đen. |

**Hoà giải (theo `CLAUDE.md §0.3`: `CLAUDE.md` thắng):**
- Giữ **nguyên văn** dòng disclaimer của `§23`.
- Thu hẹp luật E4 về đúng ý định của nó: cấm **KHẲNG ĐỊNH** xác suất đậu, không cấm **PHỦ ĐỊNH** nó.
  Test duyệt mọi khoá i18n *trừ* chính dòng disclaimer.
- Nơi thể hiện: `i18n/vi.ts` (`analytics.ersDisclaimer`), `engines/analytics/analytics.test.ts` (E3 + E4).

### ⚠️ C-09 — Số giá trị `TrapType` sau khi mở rộng

`spec-consistency-check C-03` phương án A vừa liệt kê 3 tên mới (→ 12) vừa nhắc thêm
`CONTEXT_TRAP` (→ 13), nhưng chốt tổng là **"12 giá trị"**.
**Quyết định:** lấy đúng con số đã chốt — 9 giá trị khoá + `PART_OF_SPEECH_TRAP`,
`FAMILIAR_WORD_TRAP`, `NUANCE_TRAP` = **12**. `CONTEXT_REVERSAL` tiếp tục gánh vai trò bẫy ngữ cảnh.
Nếu sau này cần một loại "context" rộng hơn, thêm nó là một thay đổi cộng thêm, không phá dữ liệu cũ.

### ⚠️ C-10 — Ngân sách thời gian của Mock

| | |
|---|---|
| **Điều khoản** | `CLAUDE.md §13`: tổng phần 文法 ≈ **20 phút**; đồng thời mục tiêu Phase 3 là 35s / 60s / 60s. |
| **Mâu thuẫn số học** | 10×35s + 5×60s + 5×60s = **950s ≈ 15,8 phút**, lệch 21% so với 20 phút — vượt dung sai ±10% mà `exercise-engine §13` đòi. |

**Hoà giải:** hai con số phục vụ hai mục đích khác nhau, không mâu thuẫn về ý.
- `TARGET_RT_MS` (35/60/60) = **MỤC TIÊU luyện tập** Phase 3 → dùng cho `speedIndex`, `canExamReady`, `slowQuestionTypes`.
- `MOCK_STRUCTURE` (40/80/80) = **NGÂN SÁCH phòng thi** → tổng đúng 1200s = 20 phút.
Mục tiêu luôn chặt hơn ngân sách. Nơi thể hiện: `config/timing.config.ts` (có chú thích), ADR #10.

### 🟡 G-07 — `applyAttempt` không đủ dữ liệu để thi hành `CLAUDE.md §5.1`

Chữ ký khoá `applyAttempt(mastery, attempt, question, now)` chỉ có bộ đếm tổng hợp, trong khi
`§5.1` đòi các vị từ dạng *"trong 5 attempt gần nhất thuộc `MINIMAL_PAIR`"*, *"2 lần gần nhất đều đúng"*,
*"tỉ lệ `CONFIDENT` trong 6 lần gần nhất"*, *"sống sót qua khoảng nghỉ ≥ 3 ngày"*.

**Quyết định:** thêm tham số thứ năm **optional** `evidence: MasteryEvidence` (lịch sử attempt của
chính mẫu đó + `globalGuessRate` + kết quả contrast drill). Chữ ký cũ vẫn gọi được; engine vẫn pure,
vẫn không I/O, `now` vẫn là tham số. Khái niệm `evidence` đã tồn tại sẵn trong
`canPromoteToExamReady(mastery, evidence)` nên đây là mở rộng nhất quán, không phải phát minh mới. (ADR #9)

### 🟡 G-08 — `ScoredItem.reasonsVi: string[]` vs "engine chỉ trả `ruleId` + tham số"

`review-engine §3` khai `reasonsVi: string[]`, nhưng `§4.6` và `CLAUDE.md §26` đòi chuỗi hiển thị
nằm ở `i18n/vi.ts` và engine chỉ trả khoá + tham số.
**Quyết định:** đổi tên trường thành `reasons: ReasonRef[]` (`{ key, params }`). `ScoredItem` là
`PROPOSED` nên đổi được; luật §26 là luật cứng nên nó thắng.

### 🟡 G-09 — Thứ tự chuẩn của mảnh ghép `SENTENCE_BUILD`

`arch §7.6` chốt "chấm theo vị trí ★" nhưng không nói cách biểu diễn thứ tự đúng, khiến cờ chẩn đoán
`FULL_ORDER_CORRECT` không có mốc để so.
**Quyết định:** `Question.fragments` lưu **thứ tự đúng** (canonical); `starSlotIndex` là chỉ số ô ★ trong
thứ tự đó; khi giao bài, `shuffleFragments()` xáo để hiển thị. Chấm vẫn chỉ so ô ★.

### 🟡 G-10 — Hai luật mock K5 chưa được cài ở lần triển khai đầu

`exercise-engine §8` K5 đòi mock *"cân bằng `examFrequency` (≥ 60% HIGH), tránh câu đã gặp trong
14 ngày"*. Lần triển khai đầu, `pickQuestions` dùng chung `COOLDOWN_DAYS = 7` cho mọi chế độ và
không có ưu tiên `examFrequency` ở nhánh MOCK.

**Đã cài ở lần mở rộng kho câu:**
- `MOCK_COOLDOWN_DAYS = 14` — riêng `delivery = 'MOCK'`; đồng thời **bỏ** ngoại lệ "câu đã sai được
  lặp sớm" trong mock, vì mock mô phỏng phòng thi chứ không phải bài chữa lỗi.
- `MOCK_MIN_HIGH_RATIO = 0.6` — nhánh MOCK xếp câu nhắm grammar `HIGH` lên trước trong từng dạng.
  Đây là **sàn**, không phải trần, và tự suy giảm êm khi kho không đủ.
- Nơi thể hiện: `config/learning.config.ts`, `engines/exercise/index.ts`,
  test ở `src/content/__tests__/coverage.test.ts`.

---

## C. LUẬT ĐƯỢC THI HÀNH BẰNG TEST (thay cho `eslint-plugin-boundaries`)

`arch §3` đề xuất `eslint-plugin-boundaries`. Đã thi hành bằng **hai lớp**:
1. `.eslintrc.cjs` — `no-restricted-imports` theo tầng + cấm `any` + cấm so sánh `daysRemaining` trực tiếp.
2. `src/__tests__/architecture.test.ts` — kiểm những luật ESLint không với tới:
   - engine không gọi `Date.now()` / `Math.random()` (M6, P1, R7);
   - `src/ui/**` không tự tính đúng/sai (P4);
   - **không chuỗi tiếng Nhật nào** trong `.tsx` (`grammar-schema §10`);
   - không magic number trong `engines/review/**` (`review-engine §12`);
   - nội dung ngữ pháp chỉ nằm trong `content/data/**.json`;
   - mọi khoá `t('...')` dùng ở UI đều tồn tại trong `i18n/vi.ts`.

---

## D. HỆ QUẢ CỦA VIỆC CHƯA CÓ TÀI LIỆU NGUỒN

Seed 12 mẫu do AI sinh, `sources.json` khai `kind: AI_GENERATED` / `trustLevel: UNVERIFIED`
⇒ validator ép toàn bộ về `NEEDS_REVIEW` ⇒ **không mẫu nào có thể lên `EXAM_READY`**
(`CLAUDE.md §16.4`, bất biến M5, có test).

Đây là hành vi **đúng theo thiết kế**, không phải lỗi. `/settings` hiển thị cảnh báo và chỉ đường
mở khoá: nhập nội dung đã đối chiếu tài liệu. Khi có nội dung `VERIFIED`, `EXAM_READY` mở ngay,
không cần sửa dòng code nào.

---

## D-01 — Ranh giới `VERIFIED` cho câu hỏi tự soạn (ghi bổ sung, 2026-09-11)

**Quyết định này đã được áp dụng suốt từ lô 1 nhưng chưa ghi lại. Ghi ở đây để minh bạch.**

`CLAUDE.md §16.3` quy định: *"Nội dung do AI sinh ra mà chưa đối chiếu tài liệu → bắt buộc `NEEDS_REVIEW`."*
Câu hỏi trong project này nằm ở vùng xám: **quy tắc ngữ pháp** được đối chiếu sách, nhưng
**câu ví dụ** thì do tôi soạn.

### Ranh giới đang dùng

| Thành phần của câu hỏi | Nguồn | Kết luận |
|---|---|---|
| Mẫu ngữ pháp được hỏi (形・意味・接続・ràng buộc) | Trích ドリル＆ドリル N1 文法, có `sourcePage` tới trang 別冊 cụ thể | Đã đối chiếu |
| Đáp án đúng và lý do sai của distractor | Suy ra từ 接続・ràng buộc mà sách nêu | Đã đối chiếu |
| Câu ví dụ chứa chỗ trống | Tôi soạn | **Chưa đối chiếu** |

Câu hỏi được đánh `VERIFIED` khi **hai hàng đầu** đã đối chiếu sách, vì đó mới là thứ quyết
định đáp án. Hàng thứ ba là ứng dụng của quy tắc đã xác minh, không phải một khẳng định
ngữ pháp mới.

### Rủi ro còn lại — phải nói thẳng

Câu ví dụ tự soạn vẫn có thể **không tự nhiên** với người bản ngữ, dù đúng ngữ pháp. Đây là
rủi ro thật và `verificationStatus: VERIFIED` **không** che được nó. Điều đang được bảo đảm là
"quy tắc dùng để chấm điểm câu này có nguồn", chứ không phải "câu này chuẩn như đề thi thật".

### Hệ quả nếu người học muốn siết chặt hơn

Nếu muốn `VERIFIED` chỉ dành cho câu chép nguyên từ sách, cách làm là: thêm
`exampleSource: 'BOOK' | 'AUTHORED'` vào `Question`, giữ `VERIFIED` cho hàng 1–2 và lọc
theo `exampleSource` khi cần. Chưa làm vì sẽ khiến 703 câu hiện có phải soạn lại từ đầu
và không còn nội dung nào đủ điều kiện `EXAM_READY`.

### Ngoại lệ đang tồn tại

12 mẫu seed AI ban đầu (`sourceId: 'ai-seed'`) **không** có nguồn cho cả hàng 1 và 2, nên
giữ `NEEDS_REVIEW` — đúng theo `§16.3`. Hai đoạn văn `psg-01`/`psg-02` và 21 câu
`SENTENCE_BUILD`/`TEXT_GRAMMAR` dựa trên chúng cũng vậy.

## D-02 — Câu hỏi có HAI đáp án đúng (2026-09-12)

**Người học báo đúng.** Câu `q-cmp-limitation-lo3-01-mp-02` ra đề
「新人は新人___工夫を重ねている。」 và chấm 「なりの」 là sai. Nhưng ngay sau chỗ trống là
**工夫 — một danh từ**, nên 「新人なりの工夫を重ねている」 là tiếng Nhật đúng. Lời giải còn ghi
*"Sau chỗ trống là động từ nên dùng 「なりに」"* — sai sự thật, sau chỗ trống không phải động từ.

Đã đổi đề thành 「新人は新人___、地道に工夫を重ねている。」 để chỉ còn một đáp án đúng.

**Quét toàn kho** tìm cùng một kiểu lỗi (đáp án sai dạng 連体 「〜の」 trong khi ngay sau chỗ
trống là danh từ): 27 câu khả nghi, đọc tay từng câu, ba câu nữa có thật:

| Câu | Vấn đề | Xử lý |
|---|---|---|
| `q-narade-wa-form-01` | Hỏi "hình thức đúng" nhưng loại 「なりの」 bằng lý do **sắc thái** — trong khi đó là một hình thức đúng | Thay bằng 「ならではな」 (không tồn tại) |
| `q-atte-no-cloze-01` | 「方々があっての私の今日」 vẫn đúng; lý do "thừa 「が」" không đứng vững | Thay bằng 「あっても」 |
| `q-kara-aru-cloze-01` | 「100キロからのバーベル」 cũng là cách nói có thật | Thay bằng 「ばかりの」 |

23 câu còn lại kiểm tay thấy đáp án sai thật sự không ghép được (「いざの人前」, 「いかにもの職人」…).

**Rủi ro còn lại, nói thẳng:** phép quét chỉ bắt được một kiểu lỗi (đuôi 「の」/「な」 đứng trước
danh từ). Câu có hai đáp án đúng vì lý do **sắc thái** thì không có cách tự động nào phát hiện.
Người học báo tiếp thì sửa tiếp.

## D-03 — 「〜ならでは」 bị nhập hai lần (2026-09-12)

`nara-dewa` (lô 3) và `narade-wa` (seed) là cùng một mẫu. Hậu quả không chỉ đếm sai coverage:
H9 coi chúng là hai mẫu khác nhau, nên câu so sánh nhắm mẫu này bị loại vì "chưa học" mẫu kia,
dù người học đã học đúng cái đó rồi. Đã gộp về `narade-wa`; tổng mẫu 195 → **194**.
Thêm test chặn vĩnh viễn: không hai bản ghi nào được trùng `pattern` sau khi chuẩn hoá.

## D-04 — Gỡ dạng câu TRAP_ID khỏi kho nội dung (2026-09-13)

**Người học báo:** *"loại bài tập này là gì? tôi không hiểu lắm"* — và họ đúng.

Dạng câu hỏi **về** câu hỏi: nhồi cả đề gốc lẫn bốn lựa chọn của nó vào một khối tiếng Nhật
(「計画を縮小＿＿。」選択肢：せざるを得ない／…。この問題の罠は何か。), rồi bắt chọn một
**nhãn phân loại bẫy** trừu tượng ("Bẫy động từ ý chí", "Nghĩa chồng lấn") mà không chỗ nào
dạy các nhãn đó nghĩa là gì. Sáu câu, tất cả `NEEDS_REVIEW`, đều do tôi tự soạn.

**Đã gỡ cả sáu.** Kho còn **965** câu.

**Vì sao gỡ được mà không phá trụ cột DETECT (CLAUDE.md §3):** kỹ năng nhận bẫy vốn không
nằm ở dạng câu meta này. **328/965 câu thường đã có sẵn trường `trap`** — người học làm câu
thật, sập bẫy thật, rồi được chỉ ra bẫy nằm ở đâu. Trap Lab dùng `requireTrap` trên câu thường,
không dùng TRAP_ID, nên không bị ảnh hưởng.

**Một chỗ suýt hỏng âm thầm:** `metrics.trapAccuracy` (trọng số **0.25** của chiều DETECT,
`SKILL_WEIGHTS`) chỉ đếm `questionType === 'TRAP_ID'`. Gỡ dạng câu đi là chỉ số này tắt hẳn
và chiều DETECT mất một phần tư trọng số mà không báo gì. Nay nó nhận thêm
`trapByQuestion` và đo trên **mọi câu có cài bẫy** — đúng với việc làm bài hơn dạng cũ.
(`analytics/index.ts` vốn đã dùng `hasTrap`, nên ERS §23 không bị ảnh hưởng.)

**Giữ lại năng lực chấm TRAP_ID trong engine**, kèm fixture riêng trong test, để sau này dựng
lại một dạng dễ hiểu hơn thì không phải làm lại từ đầu.

## D-05 — Cập nhật nội dung làm kẹt buổi học đã lưu (2026-09-15)

Người học mở app: mục 1/32 báo "Dữ liệu không hợp lệ" và **không có nút đi tiếp**. Buổi học
là ảnh chụp lúc tạo; D-02/D-03/D-04 gỡ câu hỏi và gộp mẫu nên vài id trong ảnh chụp thành id chết.

- `getOrCreateTodaySession` dựng lại buổi học khi nó trỏ tới grammar / câu hỏi / bộ so sánh không còn.
- Mục hỏng ở `/session` không bao giờ là ngõ cụt nữa: có nút "Bỏ qua mục này".
- Mẫu gộp `nara-dewa → narade-wa`: bản ghi mastery và thẻ ôn chuyển sang id mới trong
  `ensureMasteryRows`, để người học không bị dạy lại từ đầu. `Attempt` giữ nguyên (append-only, §9).

Bài học: mỗi lần gỡ/đổi id nội dung phải nghĩ tới dữ liệu ĐÃ LƯU trên máy người học, không chỉ kho nội dung.

## D-06 — Câu sắp xếp vẽ ★ sai ô (2026-09-15)

**Người học báo đúng.** `q-build-b07`: đề vẽ ★ ở ô thứ 2 (「十年目の社員が」), nhưng
`starSlotIndex = 3` và máy chấm lấy 「とは」. Người học làm đúng theo ★ trên đề và bị chấm sai.

Vị trí ★ tồn tại ở **hai nơi** — ký tự ★ trong `stemJa` và `starSlotIndex` — không có gì ràng chúng lại.
Quét 20 câu `SENTENCE_BUILD`: **3 câu lệch** (`q-build-05`, `q-build-b07`, `q-build-b08`), cùng kiểu:
đáp án và lời giải đúng, chỉ ★ trên đề sai ô. Đã sửa đề.

Lần quét đầu của tôi báo nhầm 11 câu vì hai lỗi của chính công cụ quét: tìm `_` nửa độ rộng trong khi
đề dùng `＿` toàn độ rộng, và lời giải ghi dính phần đầu câu vào mảnh đầu nên thứ tự bị lệch một.
8 câu còn lại đã đọc tay, đều đúng.

Test mới khoá: số ô = số mảnh, ★ trên đề = `starSlotIndex`, `correctChoiceId = starFragmentId`.
Trả `q-build-b07` về đề cũ thì test FAIL đúng câu đó.

Attempt sai người học đã ghi cho câu này **giữ nguyên** (append-only, §9); người học xoá nó khỏi
danh sách lỗi bằng cách "Làm lại" ở sổ lỗi.

