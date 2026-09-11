# SPEC CONSISTENCY CHECK

> Kiểm tra chéo 5 file vừa tạo (`grammar-schema.md`, `learning-engine.md`, `exercise-engine.md`, `review-engine.md`, `analytics-engine.md`) với `CLAUDE.md` và `project-architecture.md`.
>
> **Không dòng nào của `CLAUDE.md` hay `project-architecture.md` bị sửa trong bước này.** Theo `CLAUDE.md §0.2`, mọi mâu thuẫn được liệt kê dưới đây kèm phương án và khuyến nghị, chờ người dùng quyết định.

---

## 0. TÓM TẮT

| Hạng mục | Số lượng |
|---|---|
| ⚠️ **CONFLICT** — spec yêu cầu mâu thuẫn với luật đã khoá | **7** (C-01 … C-07) |
| 🟡 **GAP** — luật đã khoá thiếu trường/định nghĩa để cài đặt được | **6** (G-01 … G-06) |
| 🔵 **ADDITION** — bổ sung thuần tuý, cần duyệt trước khi code | **5** (A-01 … A-05) |
| 🟢 **RECONCILED** — tưởng mâu thuẫn nhưng không | **4** (R-01 … R-04) |
| ✅ **Cross-file OK** | §5 |

**Số quyết định người dùng cần đưa ra để bắt đầu code: 7** (C-01 … C-07). Sáu mục GAP và năm mục ADDITION có thể duyệt gộp một lần.

**Có thể xây ngay không cần chờ quyết định:** `domain/enums.ts` (phần đã khoá), `config/*`, `storage/*`, `PhaseEngine`, `RoadmapEngine`, `MasteryEngine`, `ReviewEngine` — tức bước 1, 2, 4, 5 của `CLAUDE.md §29`. Bảy conflict chỉ chặn `ExerciseEngine` và phần UI của Compare/Trap Lab.

---

## 1. ⚠️ CONFLICT

### C-01 — Tỉ lệ phân bổ session

| | |
|---|---|
| **Điều khoản bị vi phạm** | `CLAUDE.md §8` (bảng trọng số 6 block theo phase) và `CLAUDE.md §7` ("`ANALYZE_ERROR` **không được bỏ qua** kể cả khi đúng hết") |
| **Spec mới** | Prompt §19: `PHASE 1: Review 30% / New 45% / Recognition 25%` · `PHASE 2: Review 25% / Comparison 45% / Mixed 30%` · `PHASE 3: Review 20% / Trap-Mixed 40% / Timed 40%` |
| **Mâu thuẫn ở đâu** | (a) Bảng mới chỉ có 3 nhóm, **không có** `ANALYZE_ERROR` — vi phạm `§7`. (b) Con số khác hẳn: Phase 1 `LEARN` 45% vs 40%; Phase 3 `REVIEW` 20% vs 10%. (c) Phase 3 cộng lại = 100% nhưng "Timed 40%" không phải một block, nó là một **thuộc tính** của block `APPLY` (`isTimed`), nên bảng mới trộn hai chiều khác nhau. |

**Phương án**

| # | Phương án | Hệ quả |
|---|---|---|
| **A** ✅ | Giữ nguyên bảng `CLAUDE.md §8` để **phân bổ**; dùng bảng 3 nhóm chỉ để **hiển thị tóm tắt** (`learning-engine.md §8.4` đã cài phép gộp) | Không đụng luật; người học vẫn thấy giao diện đơn giản 3 nhóm |
| B | Sửa `CLAUDE.md §8` thành bảng 3 nhóm, thêm `ANALYZE_ERROR` làm nhóm thứ 4 | Phải viết lại `§8`, `§7`, `arch §7.5`, và mọi test hiện có; mất độ chi tiết `RECALL` vs `LEARN` |
| C | Giữ 6 block nhưng chỉnh số theo tinh thần prompt (Phase 1 LEARN 40→45%) | Phải sửa `CLAUDE.md §8` và chứng minh tổng vẫn = 100% ở cả 5 cột |

**Khuyến nghị: A.** Hai bảng đang mô tả hai thứ khác nhau (phân bổ vs hiển thị), không thực sự loại trừ nhau. Đã cài sẵn theo A ở `learning-engine.md §8.1` + `§8.4`.

---

### C-02 — Bộ `QuestionType`

| | |
|---|---|
| **Điều khoản bị vi phạm** | `arch §4.1` (enum `QuestionType` 8 giá trị) và `CLAUDE.md §26` ("Enum của domain khai báo **một chỗ duy nhất**") |
| **Spec mới** | Prompt §5 yêu cầu 6 dạng bài Phase 1: `MEANING_CHOICE`, `FORM_CHOICE`, `GRAMMAR_RECOGNITION`, `CONTEXT_MATCH`, `VALID_OR_INVALID`, `MINI_SENTENCE_COMPLETION` |

**Ánh xạ**

| Prompt | Enum đã khoá | Trạng thái |
|---|---|---|
| `MEANING_CHOICE` | `MEANING_MC` | ✅ đổi tên, cùng nghĩa |
| `FORM_CHOICE` | `FORM_MC` | ✅ đổi tên, cùng nghĩa |
| `GRAMMAR_RECOGNITION` | *(không có)* | ❗ mới — "câu này đang dùng mẫu nào?" |
| `CONTEXT_MATCH` | *(không có)* | ❗ mới — ghép mẫu với ngữ cảnh phù hợp |
| `VALID_OR_INVALID` | *(không có)* | ❗ mới — 〇/× câu này có hợp lệ không |
| `MINI_SENTENCE_COMPLETION` | *(không có)* | ❗ mới — **có nhập text**, kéo theo cả §33 normalization |

**Phương án**

| # | Phương án | Hệ quả |
|---|---|---|
| **A** ✅ | Duyệt thêm **3** loại: `GRAMMAR_RECOGNITION`, `VALID_OR_INVALID`, `CONTEXT_MATCH`. **Hoãn** `MINI_SENTENCE_COMPLETION` sang sau MVP | 3 loại đầu vẫn là trắc nghiệm ⇒ dùng lại toàn bộ đường chấm hiện có, chi phí thấp, hợp mục tiêu "rapid recognition" của Month 1. Loại thứ 4 kéo theo input tiếng Nhật trên điện thoại + normalization + `acceptedAnswers` trong content — chi phí lớn, lợi ích thi cử thấp (đề N1 文法 không có câu viết tự do) |
| B | Duyệt cả 4 | Phải cài `normalizeForGrading` (`exercise-engine.md §7.2` đã đặc tả sẵn) + thêm trường `acceptedAnswers` vào `Question` + bàn phím tiếng Nhật |
| C | Không thêm gì, ép 4 dạng mới vào 8 loại có sẵn | `VALID_OR_INVALID` có thể giả lập bằng `MEANING_MC` 2 đáp án; `GRAMMAR_RECOGNITION` và `CONTEXT_MATCH` thì không giả lập được tự nhiên |

**Khuyến nghị: A.** Nếu duyệt, phải cập nhật `arch §4.1` **trong cùng lần thay đổi** (`CLAUDE.md §0.4`), và bổ sung `timing.config` cho 3 loại mới.

---

### C-03 — Bộ `TrapType`

| | |
|---|---|
| **Điều khoản bị vi phạm** | `arch §4.1` (enum `TrapType` 9 giá trị) |
| **Spec mới** | Prompt §12 liệt kê 10 tên khác |

**Ánh xạ**

| Prompt | Enum đã khoá | |
|---|---|---|
| `SIMILAR_MEANING` | `MEANING_OVERLAP` | ✅ đổi tên |
| `WRONG_CONNECTION` | `CONNECTION_MISMATCH` | ✅ đổi tên |
| `REGISTER_TRAP` | `REGISTER_MISMATCH` | ✅ đổi tên |
| `SUBJECT_RESTRICTION` | `SUBJECT_MISMATCH` | ✅ đổi tên |
| `NUANCE_TRAP` | `MEANING_OVERLAP` (một phần) | 🟡 chồng lấn |
| `COLLOCATION_TRAP` | `COLLOCATION_TRAP` | ✅ trùng khớp |
| `CONTEXT_TRAP` | `CONTEXT_REVERSAL` | 🟡 gần, không hẳn: `CONTEXT_REVERSAL` hẹp hơn |
| `PART_OF_SPEECH_TRAP` | *(không có)* | ❗ mới |
| `SURFACE_MATCH_TRAP` | `LOOKALIKE_FORM` | ✅ đổi tên |
| `FAMILIAR_WORD_TRAP` | *(không có)* | ❗ mới |
| — | `POLARITY_TRAP` | ⚠️ prompt **không** có; enum có |
| — | `VOLITION_TRAP` | ⚠️ prompt **không** có; enum có |

`POLARITY_TRAP` và `VOLITION_TRAP` rất đặc trưng N1 (`〜ざるを得ない` đòi phủ định, `〜べく` đòi động từ ý chí) — bỏ chúng là mất khả năng gắn nhãn cho một lớp bẫy phổ biến.

**Phương án**

| # | Phương án | Hệ quả |
|---|---|---|
| **A** ✅ | Giữ 9 tên đã khoá, thêm **3**: `PART_OF_SPEECH_TRAP`, `FAMILIAR_WORD_TRAP`, `NUANCE_TRAP` (tách khỏi `MEANING_OVERLAP`); giữ `CONTEXT_REVERSAL` và bổ sung `CONTEXT_TRAP` làm loại rộng hơn → **12 giá trị** | Không mất gì, phân loại đủ mịn cho `/trap-lab` thống kê |
| B | Thay hoàn toàn bằng 10 tên của prompt | Mất `POLARITY_TRAP`, `VOLITION_TRAP`; phải viết lại content đã gắn nhãn |
| C | Giữ nguyên 9, ép 3 loại mới vào `MEANING_OVERLAP` | Thống kê "bạn hay sập bẫy nào" mất độ phân giải đúng ở chỗ cần nhất |

**Khuyến nghị: A** (12 giá trị). Cập nhật `arch §4.1` cùng lúc.

---

### C-04 — Trùng tên `StudyMode`

| | |
|---|---|
| **Điều khoản bị vi phạm** | `arch §4.1`: `StudyMode = 'NORMAL' \| 'TRIAGE' \| 'FINAL_14' \| 'FINAL_7'` (chế độ theo **lịch thi**) |
| **Spec mới** | Prompt §30: `STUDY_MODE / PRACTICE_MODE / TIMED_MODE / MOCK_MODE` (mức **feedback & áp lực thời gian**) |
| **Mâu thuẫn** | Hai khái niệm hoàn toàn khác nhau, cùng một cái tên. Một `DailySession` có `mode = FINAL_7` **và đồng thời** có block chạy ở `TIMED`. Trùng tên sẽ sinh lỗi ngầm rất khó tìm. |

**Phương án**

| # | Phương án |
|---|---|
| **A** ✅ | Giữ `StudyMode` như đã khoá; đặt tên mới **`DeliveryMode`** cho 4 giá trị của prompt (đã dùng xuyên suốt `exercise-engine.md §5`) |
| B | Đổi `StudyMode` (đã khoá) thành `PlanMode`, dùng `StudyMode` cho 4 giá trị mới | Phải sửa `arch §4.1`, `§4.5`, `§7.1`, `CLAUDE.md §4.2` — nhiều nơi, lợi ích bằng 0 |
| C | Gộp thành một enum 8 giá trị | Sai về mặt mô hình: hai chiều độc lập, gộp lại thành 8 tổ hợp giả |

**Khuyến nghị: A.** Đây là lựa chọn đặt tên, không phải đổi luật — chi phí gần như bằng 0 nếu chốt ngay bây giờ.

---

### C-05 — Thứ tự micro lesson

| | |
|---|---|
| **Điều khoản bị vi phạm** | `arch §9 /grammar/:id` — thứ tự hiển thị **bắt buộc**, 10 mục |
| **Spec mới** | Prompt §6: 8 bước, `Examples` đứng **trước** `Important restriction`, không có `Usage`, không có `Register` |

**Phương án**

| # | Phương án | Hệ quả |
|---|---|---|
| **A** ✅ | Giữ 10 bước của `arch §9`; gộp hiển thị cho gọn: `Usage` + `Register` vào một dòng "Dùng ở đâu", `Restrictions` là hộp cảnh báo ngay trên `Examples` | Đúng luật, vẫn ngắn. Lý do giữ thứ tự: đọc ví dụ trước khi biết ràng buộc khiến người học khái quát hoá sai từ ví dụ — đúng loại lỗi `CONSTRAINT_ERROR` mà hệ thống đang muốn giảm |
| B | Sửa `arch §9` theo prompt (8 bước) | Mất `Register` khỏi learn card, trong khi `REGISTER_MISMATCH` là một `TrapType` đã khoá — người học sẽ gặp bẫy về thứ chưa từng được dạy |
| C | Cho phép hai thứ tự theo phase | Phức tạp không cần thiết |

**Khuyến nghị: A.** Đã cài theo A ở `learning-engine.md §13.1`.

---

### C-06 — Bộ `ResultType` khi chấm

| | |
|---|---|
| **Điều khoản liên quan** | `CLAUDE.md §12` — ma trận 3 mức confidence × 2 kết quả, trong đó `đúng + GUESS` và `đúng + UNSURE` được xử lý **khác nhau** (không thăng cấp vs thăng chậm interval 2 ngày) |
| **Spec mới** | Prompt §15: 4 mã `CORRECT_CONFIDENT / CORRECT_UNCERTAIN / INCORRECT_KNOWN_CONFUSION / INCORRECT_NEW_CONFUSION` |
| **Mâu thuẫn** | `CORRECT_UNCERTAIN` gộp `GUESS` và `UNSURE` ⇒ **mất thông tin** mà `CLAUDE.md §12` bắt buộc phải giữ. Ngoài ra 4 mã không biểu diễn được `sai + CONFIDENT` (ưu tiên cao nhất trong hệ thống) và không có mã cho hết giờ. |

**Phương án**

| # | Phương án |
|---|---|
| **A** ✅ | Dùng **8 mã** ở `exercise-engine.md §6.5` (prompt cho phép: *"hoặc thiết kế tốt hơn"*) — bảo toàn đủ ma trận 3×2, tách `INCORRECT_MISCONCEPTION` và `TIMEOUT` |
| B | Giữ 4 mã, bù thông tin bằng `flags` | `outcome` mất giá trị làm khoá phân tích; mọi query phải kiểm cả hai trường |
| C | Không dùng enum, chỉ dùng `(isCorrect, confidence, confusionKind)` | Khó test, khó thống kê, dễ quên tổ hợp |

**Khuyến nghị: A.**

---

### C-07 — Kích thước và tên nhóm so sánh

| | |
|---|---|
| **Điều khoản bị vi phạm** | `arch §4.2`: `interface ComparisonSet { grammarIds: string[]; // 2–4 mẫu }` |
| **Spec mới** | Prompt §7: `ComparisonGroup` gồm **2–5** grammar, các trường `comparisonAxes`, `decisiveDifferences` (số nhiều), `commonConfusions`, `minimalPairs`, `examPatterns` |
| **Mâu thuẫn** | (a) Tên: `ComparisonGroup` vs `ComparisonSet`. (b) Số lượng: 5 vs 4. (c) `decisiveDifferences` (nhiều) vs `decisiveDifferenceVi` (**một câu**) — `CLAUDE.md §18` đòi giải thích ngắn, và một nhóm có nhiều "điểm khác biệt quyết định" thì không còn là điểm quyết định |

**Phương án**

| # | Phương án |
|---|---|
| **A** ✅ | Giữ tên `ComparisonSet`, giữ trần **4**, giữ `decisiveDifferenceVi` **một câu**; các trường còn lại của prompt ánh xạ vào: `comparisonAxes → rows[].axis`, `commonConfusions → oftenConfusedWith` trong graph, `minimalPairs → minimalPairQuestionIds`, `examPatterns → examPatternVi` |
| B | Nâng trần lên 5 | Bảng 5 cột trên màn 375px là không đọc nổi (`CLAUDE.md §18`); nếu cần 5 mẫu thì tách thành 2 set chồng lấn |
| C | Đổi tên thành `ComparisonGroup` | Phải sửa `arch §4.2`, `§6.2`, `§7.5`, `§9`; lợi ích bằng 0 |

**Khuyến nghị: A.** Đã cài theo A ở `grammar-schema.md §4.5`.

---

## 2. 🟡 GAP — luật đã khoá thiếu thứ để cài đặt được

Những mục này **không** mâu thuẫn với luật; chúng chỉ ra chỗ luật chưa đủ chi tiết để viết code đúng.

### G-01 — `SHAKY` tụt cấp về đâu?

`CLAUDE.md §5.2`: *"Bất kỳ state ≥ `RECOGNIZED` mà sai 1 câu → tụt đúng 1 bậc và gắn cờ `SHAKY`."*
Nhưng `SHAKY` **cũng** là một `MasteryState`. Vậy một item đang `SHAKY` sai tiếp thì tụt từ đâu? Thang bậc không định nghĩa vị trí của `SHAKY`.

**Đề xuất:** thêm `baseRank: 'INTRODUCED' | 'RECOGNIZED' | 'COMPARABLE' | 'EXAM_READY'` vào `GrammarMastery`. `state` có thể là `SHAKY`/`CONFUSED` (cờ), `baseRank` giữ bậc nền. Tụt cấp luôn tính trên `baseRank`, sàn `INTRODUCED`.
*(Đã dùng ở `learning-engine.md §6.4`.)* → cần cập nhật `arch §4.3`.

### G-02 — Interval cho các state chưa liệt kê

`CLAUDE.md §14.2` liệt kê interval cho `RECOGNIZED`, `COMPARABLE`, `EXAM_READY` + `CONFIDENT`, nhưng **không** cho `INTRODUCED`, `SHAKY`, `CONFUSED` + đúng + `CONFIDENT`.
**Đề xuất:** `INTRODUCED → 2` ngày, `SHAKY/CONFUSED → 1` ngày. Đây là nội suy chặt hơn (ngắn hơn) chứ không nới lỏng. *(`review-engine.md §5.1`.)*

### G-03 — Chưa có định nghĩa `Source`

`arch §6.2` khai `getSource(sourceId): Source` nhưng `Source` chưa được định nghĩa ở `§4`.
**Đề xuất:** `grammar-schema.md §4.7`, kèm luật `kind: 'AI_GENERATED' ⇒ trustLevel: 'UNVERIFIED' ⇒ NEEDS_REVIEW` (thi hành `CLAUDE.md §16.3`).

### G-04 — Ai đảm bảo `pinned` không bị capacity cắt?

`CLAUDE.md §14.3` yêu cầu mọi item được gặp **≥ 2 lần** trước ngày thi, nhưng `selectDueItems` bị chặn bởi `capacity`. Không có cơ chế nào bảo vệ hai lượt bắt buộc.
**Đề xuất:** thêm `pinned: boolean` và `guaranteedSecondAt?: string` vào `GrammarMastery`; `selectDueItems` lấy `pinned` trước. *(`review-engine.md §6.2`, `§7`.)* → cần cập nhật `arch §4.3` + bảng index Dexie (`arch §5.1`, thêm index `pinned`).

### G-05 — ERS ở Phase 1 bị phạt oan

`CLAUDE.md §23` tính ERS khi `coverage ≥ 0.20`. Ở Phase 1, `coverage` có thể vượt 20% trong khi `trapDetection` và `timedAccuracy` **chưa có dữ liệu nào** — chúng sẽ bằng 0 và kéo ERS xuống tới **0.25 điểm** vì lý do hoàn toàn không phải năng lực người học.

**Phương án**

| # | Phương án | Hệ quả |
|---|---|---|
| **A** ✅ | Thành phần có `evidence = NONE` bị **loại khỏi công thức** và trọng số được chuẩn hoá lại trên các thành phần còn lại; hiển thị "—" cho thành phần đó | ERS phản ánh đúng những gì đã đo được; vẫn đúng tinh thần `§23` |
| B | Giữ nguyên (0 cho thành phần chưa đo) | Người học Phase 1 luôn thấy band "Cần báo động" → hoảng loạn vô cớ, vi phạm tinh thần `CLAUDE.md §18` |
| C | Chỉ tính ERS từ Phase 2 trở đi | Mất mốc so sánh sớm; nhưng đơn giản nhất |

**Khuyến nghị: A.** Đây là mục **duy nhất** trong danh sách GAP có thể bị coi là diễn giải lại `§23`, nên cần người dùng xác nhận rõ ràng.

### G-06 — `confidence` trong Mock

`CLAUDE.md §12` bắt buộc thu confidence sau **mỗi** câu. Nhưng `/mock` mô phỏng đề thật trong 20 phút; thêm 20 lần chạm confidence làm sai lệch chính thứ mock đang đo (tốc độ).
**Đề xuất:** trong `MOCK`, ghi mặc định `UNSURE` + cờ `confidenceImputed = true`; các chỉ số về confidence (`guessRate`, `calibration`) **loại trừ** attempt có cờ này. *(`exercise-engine.md §11`.)*
Phương án thay thế: hỏi confidence **một lần sau khi nộp** cho các câu người học đánh dấu. Cần người dùng chọn.

---

## 3. 🔵 ADDITION — bổ sung thuần tuý, cần duyệt gộp

Không mâu thuẫn với gì cả, nhưng vì `CLAUDE.md §26` yêu cầu enum khai báo một chỗ duy nhất và `§0.4` yêu cầu `project-architecture.md` không được lệch, chúng cần được duyệt và ghi vào `arch §4.1` trước khi code.

| # | Bổ sung | Nơi dùng | Vì sao cần |
|---|---|---|---|
| **A-01** | `SkillDimension = 'KNOW' \| 'COMPARE' \| 'DETECT'` | `learning-engine.md §5`, `Question.testedSkill` | Ba chiều là yêu cầu trung tâm của prompt §4; không có enum thì không phân loại được câu hỏi theo chiều |
| **A-02** | `ComparisonAxis` (12 giá trị) | `ComparisonRow.axis`, `Choice.violatedAxis`, `WhyNot.axis` | `arch §9` liệt kê 8 trục dạng văn xuôi; cần enum để test và để hỏi 「何が変わった？」 |
| **A-03** | `ClueKind` (8 giá trị) | `Question.decisiveClue`, câu 「決め手は？」 | Prompt §13 yêu cầu người học chọn 1 trong 6 loại manh mối — cần enum |
| **A-04** | `DeliveryMode` (4 giá trị) | toàn bộ `exercise-engine.md` | Xem C-04 |
| **A-05** | `GradeOutcome` (8) + `GradeFlag` (10) | `grade()` | Xem C-06 |

Trường mới trên interface đã khoá (cần thêm vào `arch §4`):

| Interface | Trường mới | Nhãn |
|---|---|---|
| `Grammar` | `meaningsVi?`, `nuanceVi?`, `typicalContexts?`, `collocations?` | PROPOSED |
| `Example` | `targetGrammarId?`, `contextVi?`, `whyNaturalVi?`, `whyNotOthers?`, `sourceReference?` | PROPOSED |
| `ComparisonSet` | `minimalPairQuestionIds?`, `whyNotQuestionIds?`, `examPatternVi?` | PROPOSED |
| `Question` | `testedSkill`, `decisiveClue`, `difficultyStatic`, `comparisonSetId?` | PROPOSED |
| `Choice` | `violatedAxis?` | PROPOSED |
| `TrapAnnotation` | `strength?` | PROPOSED |
| `GrammarMastery` | `baseRank`, `pinned`, `guaranteedSecondAt?` | PROPOSED (G-01, G-04) |
| `Attempt` | `confidenceImputed?`, `subKind?` | PROPOSED (G-06, C-06) |

> `Attempt` là **immutable, append-only** (`arch §4.6 A6`). Thêm trường **optional** không phá bất biến đó, nhưng cần migration Dexie có version (`arch §5.2`).

---

## 4. 🟢 RECONCILED — tưởng mâu thuẫn nhưng không

### R-01 — "State suy ra từ performance" vs điều kiện thăng cấp cứng

Prompt §3: *"mastery không được phụ thuộc hoàn toàn vào state thủ công… State được suy ra từ performance."*
`CLAUDE.md §5.1` đưa các điều kiện thăng cấp cứng.

**Không mâu thuẫn.** Các điều kiện của `§5.1` **chính là** hàm của performance (số lần đúng, số ngày khác nhau, confidence, response time, khoảng nghỉ). Không có bước thủ công nào. `learning-engine.md §4` bổ sung vector chỉ số làm **chẩn đoán**, còn quyết định thăng cấp vẫn dùng đúng vị từ của `§5.1`.

Ràng buộc đã ghi rõ (`learning-engine.md S5`): ba chiều KNOW/COMPARE/DETECT **không** được dùng làm điều kiện thăng cấp — thêm điều kiện cũng là sửa `§5.1`.

### R-02 — 7 điểm readiness vs 6 thành phần ERS

Prompt §26 liệt kê 7 (`CoverageScore … StabilityScore`); `CLAUDE.md §23` có 6 thành phần có trọng số **× `stabilityFactor`**.
**Không mâu thuẫn** — cùng 7 đại lượng, khác cách kết hợp. `stabilityFactor` là **hệ số nhân**, nên nó không thể bù cho thành phần khác, chỉ trừng phạt sự thất thường. Đó là hành vi mong muốn. Công thức chốt là của `CLAUDE.md §23`.

### R-03 — Recovery Mode

Prompt §21 đòi "Recovery Mode". `StudyMode` đã khoá 4 giá trị.
**Không cần enum mới**: `CLAUDE.md §15` đã có sẵn dòng *"Bỏ học ≥ 3 ngày liên tiếp → session 'quay lại': 100% review + 1 win nhỏ, không grammar mới"*. Recovery được cài như một **luật của `AdaptationEngine`** (`learning-engine.md §12.1`), kèm luật chống-300-item: `backlogScheduledToday = min(backlog, capacity)`.

### R-04 — Normalization khi chấm

Prompt §33 yêu cầu định nghĩa normalization cho câu nhập text.
**Đã đặc tả** ở `exercise-engine.md §7.2`, nhưng ghi rõ: hiện **không có** `QuestionType` nào nhận text tự do (`SENTENCE_BUILD` chấm theo vị trí ★ như đề thật, `arch §7.6`), nên hàm này chưa được gọi ở đâu. Nó sẽ được kích hoạt nếu `MINI_SENTENCE_COMPLETION` được duyệt (C-02).

---

## 5. ✅ KIỂM TRA CHÉO 5 FILE

### 5.1 Không trùng lặp trách nhiệm

| Chủ đề | File **duy nhất** định nghĩa | Các file khác chỉ tham chiếu |
|---|---|---|
| `Grammar`, `Question`, `ComparisonSet`, validator | `grammar-schema.md` | 4 file còn lại |
| `MasteryState` transition, 3 chiều, session, ngân sách phút | `learning-engine.md` | ✅ |
| `pickQuestions`, `grade`, `DeliveryMode`, difficulty, mock | `exercise-engine.md` | ✅ |
| `computePriority`, `computeNextReview`, compression, audit | `review-engine.md` | ✅ |
| `WeaknessProfile`, confusion matrix, ERS, checkpoint, khuyến nghị | `analytics-engine.md` | ✅ |

Ba chỗ ranh giới đã được xử lý rõ ràng:

| Ranh giới | Phân chia |
|---|---|
| Chỉ số **theo một mẫu** vs **toàn cục** | `learning-engine.md §4` (per-grammar) / `analytics-engine.md §7` (aggregate) |
| Confusion matrix | `analytics-engine.md §5` **dựng**; `review-engine.md §4.2` và `exercise-engine.md §3.3` **tiêu thụ** |
| "Gặp lại cuối session hôm nay" | `review-engine.md §5.1` nói luật; `learning-engine.md §11` cài đặt (chèn vào cuối `ANALYZE_ERROR`) |

Mỗi file đều có mục cuối "**FILE NÀY KHÔNG CHỊU TRÁCH NHIỆM**" trỏ đúng địa chỉ.

### 5.2 Hằng số — mọi giá trị phải nằm ở `src/config/learning.config.ts` (`CLAUDE.md §0.5`, `§17.5`)

| Hằng số | Giá trị | Định nghĩa tại | Dùng tại |
|---|---|---|---|
| `METRIC_SHRINKAGE_ALPHA` | 4 | learning §4.2 | learning, exercise §9.2, analytics §7.2 |
| `RETENTION_GAP_DAYS` | 3 | learning §4.3 | learning, analytics §7.2 |
| `RT_OUTLIER_MS` | 180000 | learning §4.4 | learning |
| `CONFIDENCE_EXPECTED` | .25/.60/.90 | learning §4.5 | learning, analytics §4.1 |
| `ERROR_HALF_LIFE_DAYS` | 7 | learning §4.6 | learning, review §4.2, analytics §2 |
| `CONFUSION_SATURATION` | 6 | learning §5.1 | learning, review §4.2 |
| `SLOW_FACTOR` | 2.5 | learning §6.2 | learning, exercise §6.6 |
| `NEW_PER_DAY_HARD_CAP` | 8 | learning §8.5 | learning §14.1 |
| `BACKLOG_FREEZE_FACTOR` | 1.5 | learning §8.2 | learning |
| `ANALYZE_MIN_MINUTES` | 3 | learning §8.2 | learning §10.1 |
| `LEARN_CARD_MS` | 150000 | learning §8.5 | learning |
| `OVERHEAD_MS` | 4000 | learning §8.5 | learning |
| `SESSION_MAX_MINUTES` | 120 | learning §15 | learning |
| `FINAL_7_LOAD_FACTOR` | 0.75 | learning §12.2 | learning |
| `COOLDOWN_DAYS` | 7 | exercise §3.2 | exercise |
| `DESIRED_SUCCESS_RATE` | 0.75 | exercise §3.3 | exercise |
| `EXPOSURE_SATURATION` | 4 | exercise §3.3 | exercise |
| `FAST_FLOOR_RATIO` | 0.25 | exercise §6.6 | exercise |
| `EMPIRICAL_TRUST_N` | 6 | exercise §9.3 | exercise |
| `ERROR_SATURATION` | 3 | review §4.2 | review |
| `TRAP_SATURATION` | 3 | review §4.5 | review |
| `LEARNED_EDGE_MIN` | 2 | analytics §5.2 | analytics |
| `RESOLVE_STREAK` | 3 | analytics §3.3 | analytics |

Không hằng số nào bị định nghĩa ở hai nơi với hai giá trị khác nhau. ✅

Hằng số **kế thừa nguyên vẹn** từ `CLAUDE.md` (cấm sửa): trọng số priority `§14.1`, interval `§14.2`, `compressionFactor` `§14.3`, tỉ lệ block `§8`, tỉ lệ phase `§4.1`, `staleThreshold` `§5.3`, targetRT `§13`, trọng số ERS `§23`, ngưỡng adaptation `§15`.

### 5.3 Đối chiếu với `CLAUDE.md §27` (test bắt buộc)

| `§27` yêu cầu | Đặc tả ở |
|---|---|
| 1. `PhaseEngine` | `arch §7.1` (không thuộc 5 file này — đã khoá) |
| 2. `MasteryEngine` | learning §7 (M1–M10), §17 |
| 3. `ReviewEngine` | review §9 (R1–R12), §12 |
| 4. `SessionEngine` | learning §17 |
| 5. `ErrorEngine` | analytics §13 |
| 6. `AnalyticsEngine` | analytics §13 |
| 7. Content validation | grammar-schema §10 (V1–V15) |

### 5.4 Đối chiếu với 10 kịch bản test của prompt §34

| Kịch bản | Đặc tả tại |
|---|---|
| mastery transition | learning §17 |
| review priority | review §12 |
| deadline-aware review | review §12 (bảng 9 dòng §5.2) |
| wrong + confident | exercise §13 (`INCORRECT_MISCONCEPTION`), analytics §13 |
| confusion recurrence | analytics §13 (có hướng, `RELAPSE`) |
| daily session | learning §17 (6 giá trị `M` × 3 phase × 4 mode) |
| recovery mode | learning §17 |
| phase transition | learning §17 (dump DB trước/sau) |
| final 14 days | learning §17 (`FINAL_7` khoá `LEARN = 0`) |
| question grading | exercise §13 (cả 8 `GradeOutcome`) |

### 5.5 Đối chiếu với `CLAUDE.md §19.1` (anti-goals)

| Anti-goal | 5 file có vi phạm không? |
|---|---|
| Gamification rỗng | Không — không streak, không huy hiệu. Dòng `RESOLVED` ở `/mistakes` gắn trực tiếp với lỗi đã khắc phục |
| Social / leaderboard | Không |
| Từ điển tổng quát | Không — `searchKey` chỉ tìm trong grammar thuộc plan |
| Giải thích học thuật dài | Không — mọi trường giải thích đều có trần độ dài |
| AI chat sinh giải thích không nguồn | Không — mọi nội dung sinh tự động bị ép `NEEDS_REVIEW` |
| Người dùng chỉnh tay thuật toán review | Không — `/settings` chỉ đổi `examDate`, thời gian/ngày, ngày/tuần |

### 5.6 Đối chiếu với `arch §3` (luật phụ thuộc)

| Kiểm tra | Kết quả |
|---|---|
| Engine nhận mọi thứ qua tham số, không import `storage`/`app`/`ui` | ✅ mọi chữ ký đều nhận dữ liệu vào |
| `now: Date` là tham số, không `Date.now()` | ✅ ghi rõ ở learning §6.1, review §3, exercise P1 |
| `grade` không ghi DB | ✅ exercise §6.2, P1–P3 |
| UI không tự tính đúng/sai | ✅ exercise P4 (lint rule) + `FeedbackPayload` lọc sẵn theo mode |
| Chuỗi tiếng Việt nằm ở `i18n/vi.ts` | ✅ `NotebookLineVi.messageKey`, `Recommendation.reasonKey`, `ScoredItem` trả `ruleId` |

---

## 6. VIỆC CẦN NGƯỜI DÙNG QUYẾT

Trả lời 7 câu dưới là đủ để bắt đầu code phần bị chặn. Khuyến nghị nằm ở cột cuối.

| # | Câu hỏi | Khuyến nghị |
|---|---|---|
| C-01 | Bảng phân bổ session: giữ 6 block của `CLAUDE.md §8`, dùng 3 nhóm chỉ để hiển thị? | **Có** |
| C-02 | Thêm `GRAMMAR_RECOGNITION`, `VALID_OR_INVALID`, `CONTEXT_MATCH`; hoãn `MINI_SENTENCE_COMPLETION`? | **Có** |
| C-03 | Mở rộng `TrapType` lên 12 giá trị (giữ 9 cũ + 3 mới)? | **Có** |
| C-04 | Đặt tên `DeliveryMode` cho 4 chế độ giao bài (giữ `StudyMode` như đã khoá)? | **Có** |
| C-05 | Giữ thứ tự 10 mục của `arch §9` cho learn card? | **Có** |
| C-06 | Dùng 8 `GradeOutcome` thay vì 4? | **Có** |
| C-07 | Giữ `ComparisonSet`, trần 4 mẫu, `decisiveDifferenceVi` một câu? | **Có** |

Thêm hai câu quan trọng không kém, thuộc nhóm GAP:

| # | Câu hỏi | Khuyến nghị |
|---|---|---|
| G-05 | ERS: loại thành phần chưa có dữ liệu và chuẩn hoá lại trọng số, hay để 0? | **Loại + chuẩn hoá lại** |
| G-06 | Mock: ghi mặc định `UNSURE` (loại khỏi thống kê confidence), hay hỏi sau khi nộp? | **Ghi mặc định + cờ** |

Nếu duyệt, **phải** cập nhật `project-architecture.md §4.1` (enum), `§4.2`/`§4.3` (trường mới), `§5.1` (index Dexie cho `pinned`), `§16` (ADR mới) **trong cùng một lần thay đổi** — `CLAUDE.md §0.4`.

Và hai câu vẫn còn treo từ `arch §17`, chưa được bước này trả lời (không cần để bắt đầu code engine, nhưng cần trước khi làm content): **tài liệu nguồn** và **số mẫu mục tiêu** (120/150/180).
