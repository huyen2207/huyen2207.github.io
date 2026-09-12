# CLAUDE.md — 最高法規 / Luật tối cao của project

> Project: **N1 文法 90 Days** — web app luyện 文法 JLPT N1 trong đúng số ngày còn lại trước kỳ thi.
> File này là **luật tối cao**. Mọi prompt, mọi PR, mọi refactor phải đọc file này **trước**.
> File thứ hai bắt buộc đọc: `project-architecture.md`.

---

## 0. QUY TẮC ĐỌC & QUY TẮC XUNG ĐỘT (đọc trước tiên)

1. Trước khi thay đổi bất cứ thứ gì trong project, phải đọc:
   - `CLAUDE.md` (file này)
   - `project-architecture.md`
2. Nếu một spec/prompt mới **mâu thuẫn** với `CLAUDE.md`:
   - **KHÔNG** tự ý sửa logic.
   - **DỪNG**, in ra khối `⚠️ CONFLICT` gồm: điều khoản bị vi phạm, spec mới, 2–3 phương án hoà giải, khuyến nghị.
   - Chờ người dùng quyết định.
3. Thứ tự ưu tiên khi xung đột:
   `CLAUDE.md` > `project-architecture.md` > prompt hiện tại > code hiện có > sở thích cá nhân của AI.
4. Nếu `CLAUDE.md` được sửa, phải cập nhật `project-architecture.md` trong **cùng một lần thay đổi**. Không để hai file lệch nhau.
5. Mọi hằng số học thuật (ngưỡng, trọng số, khoảng review) trong file này phải tồn tại trong code dưới dạng **config có tên**, không được rải rác magic number. Xem `§16`.

---

## 1. ĐỊNH NGHĨA SẢN PHẨM TRONG MỘT CÂU

> Một hệ thống huấn luyện 文法 N1 **có thời hạn cứng**, đưa người học đã có N2 từ *"chưa biết mẫu nào"* đến *"xử lý câu hỏi 文法 N1 nhanh và chính xác"*, bằng cách thay đổi **cách luyện** theo 3 giai đoạn chứ không chỉ tăng số lượng bài.

Không phải: từ điển ngữ pháp. Không phải: app flashcard tổng quát. Không phải: kho đề.

---

## 2. NGƯỜI HỌC (LEARNER PROFILE — bất biến)

| Thuộc tính | Giá trị |
|---|---|
| Trình độ nền | Đã đạt JLPT N2 |
| 文法 N1 đã học có hệ thống | ~0 |
| Thời gian còn lại | ≈ 3 tháng (có thể ít hơn) |
| Mục tiêu | **Điểm 文法 N1 cao nhất có thể trong thời gian còn lại** |
| Không phải mục tiêu | Trở thành nhà ngôn ngữ học, hiểu sâu lịch sử ngữ pháp, đọc 古文 |
| Thiết bị chính | Điện thoại |
| Ngôn ngữ giải thích | **Tiếng Việt** (thuật ngữ + ví dụ giữ nguyên tiếng Nhật) |

Câu thần chú thiết kế:
```
時間がない。でも、点数を最大化したい。
```

Hệ quả bắt buộc:
- Mọi giải thích **ngắn**. Nếu cần cuộn quá 1.5 màn hình điện thoại để hiểu 1 mẫu → sai thiết kế.
- Mọi thứ dạy phải quy được về **hành vi làm bài**.
- Không dạy kiến thức không xuất hiện trong đề thi chỉ vì "nó thú vị".

---

## 3. TRIẾT LÝ TRUNG TÂM — 3 PHASE (KHÔNG ĐƯỢC PHÁ)

```
PHASE_1_KNOW      文法を知る     「この文法はどういう意味？」
        ↓
PHASE_2_COMPARE   文法を比べる   「なぜこれで、あれではない？」
        ↓
PHASE_3_DETECT    問題を見抜く   「この問題は何を引っかけようとしている？」
```

**90 ngày KHÔNG phải 90 ngày giống nhau.** Cùng một grammar, cách luyện phải khác nhau theo phase.

Ví dụ chuẩn — `〜に至って`:

| Phase | Nội dung luyện |
|---|---|
| KNOW | Nghĩa là gì? Cấu trúc? Dùng khi nào? Sắc thái cơ bản? |
| COMPARE | `〜に至って` vs `〜に至るまで` vs `〜に至っては` — khác chủ thể / phạm vi / sắc thái / vị trí trong câu |
| DETECT | Câu này có dấu hiệu nào? Vì sao đề đặt `〜に至っては` làm distractor? Loại được đáp án nào ngay? |

### 3.1 Định nghĩa mục tiêu đầu ra của từng phase

- **KNOW** — nhìn mẫu → hiểu đại khái nghĩa trong ≤ 5 giây.
- **COMPARE** — nhìn 2–4 đáp án gần giống nhau → chỉ ra **điểm khác biệt quyết định**.
- **DETECT** — nhìn câu hỏi → nhận ra **loại bẫy** → loại đáp án → chọn nhanh (mục tiêu tốc độ ở `§13`).

### 3.2 Quy tắc chuyển phase

- Phase được tính bằng **ngày**, không bằng "hoàn thành bài".
- Không reset dữ liệu khi chuyển phase. Không xoá lịch sử. Không đặt lại mastery.
- Phase mới **không** loại bỏ hoạt động của phase cũ, chỉ **đổi trọng số** (xem `§8`).
- Grammar chưa đạt `RECOGNIZED` khi vào Phase 2 vẫn tiếp tục được dạy ở chế độ KNOW, xen vào session.

---

## 4. THREE-MONTH MODE — TÍNH PHASE (KHÔNG HARD-CODE NGÀY)

Input do người học khai báo ở onboarding:
```
examDate, studyStartDate, availableMinutesPerDay, daysPerWeek,
selfAssessedLevel, grammarAlreadyStudiedCount, targetScoreBand, confidenceLevel
```

Hệ thống tính:
```
totalDays      = businessDaysBetween(studyStartDate, examDate, daysPerWeek)
daysElapsed    = từ studyStartDate đến hôm nay
daysRemaining  = từ hôm nay đến examDate
currentPhase   = phaseOf(daysElapsed / totalDays)
progressExpected, progressActual
```

### 4.1 Tỉ lệ phase theo tổng số ngày (compress tự động)

| Tổng số ngày còn lại | KNOW | COMPARE | DETECT | Ghi chú |
|---|---|---|---|---|
| ≥ 90 | 33% | 33% | 34% | chuẩn |
| 60–89 | 35% | 32% | 33% | compress đều |
| 30–59 | 40% | 30% | 30% | ưu tiên coverage trước |
| 15–29 | 45% | 25% | 30% | `TRIAGE_MODE` bật |
| < 15 | 0% | 30% | 70% | `TRIAGE_MODE` + chỉ high-frequency grammar |

Ràng buộc cứng:
- Phase 3 **luôn ≥ 7 ngày** nếu tổng ngày ≥ 14.
- `TRIAGE_MODE` bật khi `daysRemaining < 30`: chỉ dạy grammar có `examFrequency ∈ {HIGH, MEDIUM}`, bỏ `LOW` khỏi kế hoạch bắt buộc (vẫn tra được ở `/grammar`).
- **Cấm** hard-code `day <= 30`, `day <= 60`. Luôn dùng `PhaseEngine`.

### 4.2 Hai chế độ override

- `FINAL_14_MODE`: bật khi `daysRemaining ≤ 14`. Xem `§14`.
- `FINAL_7_MODE`: bật khi `daysRemaining ≤ 7`. Xem `§14`.

---

## 5. GRAMMAR MASTERY STATE MACHINE (BẮT BUỘC)

**Cấm** dùng `learned: boolean`. Mỗi grammar × learner có đúng một state:

```
UNSEEN → INTRODUCED → RECOGNIZED → COMPARABLE → EXAM_READY
                ↘        ↓   ↑         ↓
                  SHAKY ←┘   └──── CONFUSED
```

| State | Ý nghĩa |
|---|---|
| `UNSEEN` | Chưa học |
| `INTRODUCED` | Đã xem bài học, chưa chứng minh nhớ |
| `RECOGNIZED` | Nhận ra mẫu + hiểu nghĩa + biết 接続 |
| `SHAKY` | Nhớ nhưng không chắc / chậm / đúng do đoán |
| `CONFUSED` | Hay nhầm với một mẫu cụ thể khác |
| `COMPARABLE` | Phân biệt được với các mẫu gần nghĩa cùng family |
| `EXAM_READY` | Xử lý ổn trong câu hỏi kiểu JLPT **có giới hạn thời gian** |

### 5.1 Điều kiện thăng cấp (CỨNG — không được nới lỏng thầm lặng)

**`UNSEEN → INTRODUCED`**
- Hoàn thành 1 learn card + trả lời mini-recall cuối bài (đúng/sai đều tính).

**`INTRODUCED → RECOGNIZED`**
- ≥ 3 lần đúng ở câu hỏi loại `MEANING_MC` hoặc `FORM_MC`, **trải trên ≥ 2 ngày khác nhau**, và
- 2 lần trả lời gần nhất đều đúng, và
- confidence lần gần nhất ≠ `GUESS`.

**`RECOGNIZED → COMPARABLE`**
- ≥ 4/5 câu đúng gần nhất thuộc loại `MINIMAL_PAIR` / `WHY_NOT_OTHER` trong cùng `grammarFamily`, và
- trải trên ≥ 2 ngày khác nhau, và
- không có bản ghi `SIMILAR_GRAMMAR_CONFUSION` mới trong 7 ngày gần nhất.

**`COMPARABLE → EXAM_READY`**
- ≥ 5/6 câu đúng gần nhất ở loại exam-style (`CLOZE_MC`, `SENTENCE_BUILD`, `TEXT_GRAMMAR`), và
- ≥ 1 lần trong số đó nằm trong `timed set`, và
- median `responseTimeMs` ≤ ngưỡng theo question type (`§13`), và
- tỉ lệ `CONFIDENT` ≥ 70% trong 6 lần gần nhất, và
- **sống sót qua một khoảng nghỉ**: có ít nhất 1 lần đúng sau khoảng cách ≥ 3 ngày kể từ lần trước.

> ⚠️ **Cấm tuyệt đối:** thăng lên `EXAM_READY` chỉ vì đọc bài nhiều lần, mở lại trang nhiều lần, hay đúng liên tiếp trong **cùng một session**.

### 5.2 Điều kiện tụt cấp

- Bất kỳ state ≥ `RECOGNIZED` mà **sai 1 câu** → tụt đúng **1 bậc** và gắn cờ `SHAKY`.
- `đúng + GUESS` → không thăng cấp; nếu đang ≥ `RECOGNIZED` → gắn `SHAKY`.
- `responseTimeMs > 2.5 × median cá nhân của loại câu đó` → gắn `SHAKY` (kể cả khi đúng).
- Sai ≥ 2 lần với **cùng một** `confusedWith` trong 14 ngày → `CONFUSED` (ghi rõ cặp).
- **Không bao giờ** rơi thẳng về `UNSEEN`. Sàn tụt cấp là `INTRODUCED`.
- Thoát `CONFUSED` **chỉ** bằng cách thắng contrast drill của **đúng cặp gây nhầm** đó (≥ 3/3 hoặc 4/5).

### 5.3 Decay / stale

- Item ≥ `RECOGNIZED` không được review quá `staleThreshold` ngày → **không đổi state**, nhưng đặt `isStale = true` và cộng điểm ưu tiên review.
- `staleThreshold`: 10 ngày (Phase 1), 7 (Phase 2), 4 (Phase 3), 3 (`FINAL_14_MODE`).

---

## 6. GRAMMAR CONNECTION GRAPH (KHÔNG LƯU DẠNG DANH SÁCH PHẲNG)

Mỗi grammar là một **node**. Quan hệ bắt buộc hỗ trợ:

```
similarTo            — gần nghĩa
contrastsWith        — đối lập / thường ra chung một đề
oftenConfusedWith    — thực nghiệm: học viên hay nhầm (có thể sinh từ dữ liệu lỗi)
sameFunctionGroup    — cùng chức năng ngữ pháp
prerequisite         — cần biết trước
registerVariantOf    — cùng nghĩa khác 文体 (書き言葉/話し言葉/硬い)
```

### 6.1 Grammar Family (nhóm chức năng — tối thiểu)

```
LIMITATION    CONCESSION   CAUSE        CONDITION    DEGREE
EMPHASIS      TIME         EVALUATION   ASSUMPTION   NEGATION
PURPOSE       ADDITION     STANCE       INEVITABILITY
```

Quy tắc:
- Mỗi grammar phải thuộc **≥ 1** family.
- `oftenConfusedWith` có **2 nguồn**: (a) biên tập thủ công từ tài liệu, (b) **sinh từ lịch sử lỗi của chính người học**. Phải phân biệt hai nguồn bằng field `source: CURATED | LEARNED`.
- Phase 2 sử dụng graph này làm xương sống. `Compare Lab` **chỉ** được ghép các mẫu có cạnh trong graph — không ghép ngẫu nhiên.

---

## 7. DAILY LEARNING LOOP (BẮT BUỘC ĐỦ 7 BƯỚC)

```
REVIEW → LEARN → RECALL → COMPARE → APPLY → ANALYZE_ERROR → SCHEDULE_NEXT_REVIEW
```

- **Cấm** session kiểu `học mới → quiz → hết`.
- Bước `ANALYZE_ERROR` **không được bỏ qua** kể cả khi đúng hết — khi đó nó hiển thị "câu chậm nhất / câu đúng do đoán".
- `SCHEDULE_NEXT_REVIEW` chạy **tự động**, người học không phải tự chọn ngày.
- Mỗi bước là một `SessionBlock` có `type`, `budgetMinutes`, `items`, `completed`.

---

## 8. TRỌNG SỐ SESSION THEO PHASE

Với `M = availableMinutesPerDay`, `SessionEngine` phân bổ:

| Block | KNOW | COMPARE | DETECT | FINAL_14 | FINAL_7 |
|---|---|---|---|---|---|
| REVIEW | 20% | 15% | 10% | 15% | 20% |
| LEARN (mới) | 40% | 15% | 5% | 5%* | 0%* |
| RECALL | 25% | 10% | 5% | 5% | 10% |
| COMPARE | 0% | 35% | 15% | 20% | 15% |
| APPLY (quiz/timed/trap) | 10% | 15% | 45% | 40% | 45% |
| ANALYZE_ERROR | 5% | 10% | 20% | 15% | 10% |

`*` LEARN chỉ > 0 khi `coverage < coverageTarget`. Nếu coverage đã đủ → 0% và chia phần đó cho APPLY.

### 8.1 Cấu trúc session mẫu (hiển thị cho người học)

**Phase 1 — 文法を知る**
```
Review mẫu cũ → Học mẫu mới → Nhận diện nghĩa → Nhận diện cấu trúc(接続) → Mini quiz
```

**Phase 2 — 文法を比べる**
```
Review → Grammar pair → Bảng so sánh → Minimal pair → Why-not-the-other
```

**Phase 3 — 問題を見抜く**
```
Rapid review → Trap drill → Timed set → Error analysis → Weak-point drill
```

### 8.2 Ràng buộc khối lượng

- Session **không được vượt** `M` quá 15%. Nếu vượt → cắt bớt block ưu tiên thấp nhất, **không** cắt `ANALYZE_ERROR`.
- Số grammar mới/ngày = `ceil(unseenRequired / learningDaysLeftInPhase1)`, **trần 8/ngày cho buổi học do hệ thống sinh ra** (quá 8 mẫu N1/ngày là ảo tưởng).
  - Trần này ràng buộc **hệ thống**, không ràng buộc **người học**. Hệ thống không bao giờ tự xếp quá 8 mẫu mới vào một buổi.
  - Người học chủ động bấm "Học thêm mẫu mới" ở `/practice` thì **không bị chặn**. Qua mốc 8 phải nhắc một lần, nói rõ đánh đổi, rồi vẫn cho đi tiếp. Quyết định thuộc về người học.
  - Học trước không làm lệch lộ trình: `newPerDay` tính từ số mẫu **chưa học** còn lại, nên hôm sau mục tiêu tự trừ đi phần đã học trước.
  - *(Sửa 2026-09-12 theo quyết định của người học — phương án B. Lý do: những hôm rảnh học bù trước để hôm bận không đứt lộ trình. Bản gốc chặn cứng cả hai phía.)*
- Nếu `reviewBacklog > 1.5 × dailyReviewCapacity` → **đóng băng LEARN hôm nay**, dồn cho REVIEW. Hiển thị lý do rõ ràng cho người học.

---

## 9. ERROR-FIRST DESIGN (SAI = DỮ LIỆU QUÝ NHẤT)

Mỗi lần trả lời (đúng hoặc sai) đều ghi một `Attempt`. Mỗi câu **sai** bắt buộc có đủ:

```
attemptId, questionId, grammarId, sessionId, phase,
selectedAnswer, correctAnswer, isCorrect,
errorType, confusedWith, responseTimeMs, confidence, timestamp
```

### 9.1 Error taxonomy (tối thiểu — enum đóng)

```
MEANING_ERROR              — hiểu sai nghĩa mẫu
FORM_ERROR                 — sai 接続 / thể / danh động
NUANCE_ERROR               — đúng nghĩa, sai sắc thái
CONSTRAINT_ERROR           — vi phạm ràng buộc (chủ thể, tính chất động từ, +/- ý chí, câu phủ định...)
SIMILAR_GRAMMAR_CONFUSION  — nhầm với mẫu gần nghĩa (bắt buộc điền confusedWith)
CONTEXT_ERROR              — không đọc đúng ngữ cảnh / mạch văn
COLLOCATION_ERROR          — sai cụm đi kèm cố định
CARELESS_ERROR             — biết nhưng bấm nhầm / đọc sót
TIME_PRESSURE_ERROR        — sai khi bị giới hạn thời gian, đúng khi không giới hạn
TRAP_ERROR                 — rơi đúng vào bẫy đề đã cài (đối chiếu question.trapType)
```

### 9.2 Quy tắc gán errorType

1. Ưu tiên **suy ra tự động** từ metadata của câu hỏi: mỗi đáp án sai trong content phải khai báo `wrongBecause: ErrorType` + `explanation`.
2. Nếu content chưa khai báo → hỏi người học 1 chạm ("Vì sao bạn chọn?") với tối đa 4 lựa chọn.
3. `CARELESS_ERROR` chỉ được gán khi grammar đó đang ≥ `COMPARABLE` **và** `responseTimeMs` bất thường thấp.
4. `TIME_PRESSURE_ERROR` chỉ gán trong `timed set`.

### 9.3 Weakness Profile

Sinh từ lịch sử lỗi, cập nhật sau mỗi session:
```
errorTypeDistribution, topConfusionPairs[], weakFamilies[],
slowQuestionTypes[], guessRate, accuracyByPhaseSkill, reviewDebt
```
Weakness Profile là **input bắt buộc** của `AdaptationEngine`. Không có nó thì không được sinh session.

---

## 10. ミスノート (MISTAKE NOTEBOOK) — KHÔNG PHẢI LOG THÔ

Trang `/mistakes` **không** được chỉ liệt kê câu sai. Bắt buộc tổng hợp thành **câu tiếng Việt dễ đọc**:

```
Bạn hay nhầm:        〜ならでは ↔ 〜なりに      (7 lần / 14 ngày)
Bạn thường sai:      ràng buộc (CONSTRAINT)     32% tổng số lỗi
Bạn biết nghĩa nhưng chọn sai vì sắc thái:      18 câu
Bạn mất nhiều thời gian ở:  文の組み立て        median 71s (mục tiêu 60s)
```

Mỗi dòng phải có nút **"Luyện ngay"** → sinh drill tương ứng (`ErrorEngine → SessionEngine.buildAdHocDrill`).

---

## 11. ACTIVE RECALL — CẤM ĐỌC SUÔNG

- **Cấm** để người học đọc quá **2 màn hình điện thoại** liên tiếp mà không có recall.
- Mỗi learn card kết thúc bằng ≥ 1 câu recall.
- Ưu tiên recall dạng **sản sinh trước, nhận diện sau**: che nghĩa → tự nhớ → mới hiện đáp án.
- Ở `Compare Lab`, bảng so sánh **hiện sau khi người học thử phân biệt**, không hiện trước.
- Trong bài giải thích, nút "Xem đáp án" phải đứng **sau** một thao tác của người học.

---

## 12. CONFIDENCE (BẮT BUỘC THU THẬP)

Sau mỗi câu: `GUESS | UNSURE | CONFIDENT` (1 chạm, mặc định không chọn sẵn).

Ma trận xử lý:

| Kết quả | Confidence | Xử lý |
|---|---|---|
| Đúng | CONFIDENT | Thăng cấp bình thường, interval dài |
| Đúng | UNSURE | Thăng cấp chậm, interval ngắn (2 ngày) |
| Đúng | GUESS | **Không thăng cấp**, gắn `SHAKY`, review sau 1 ngày |
| Sai | CONFIDENT | **Ưu tiên cao nhất** — hiểu sai có hệ thống, đưa vào `/mistakes` với cờ đỏ |
| Sai | UNSURE/GUESS | Ưu tiên cao, quay lại trong cùng session |

> `đúng + GUESS` **không bao giờ** được đánh giá ngang `đúng + CONFIDENT`.

---

## 13. RESPONSE TIME

- Ghi `responseTimeMs` cho **mọi** câu, mọi phase.
- Mục tiêu Phase 3 không chỉ `accuracy ↑` mà là `accuracy ↑ ĐỒNG THỜI responseTime ↓`.

Ngưỡng mục tiêu theo dạng câu (dựa trên cấu trúc đề thật):

| Dạng | Tương ứng đề thi | Mục tiêu Phase 2 | Mục tiêu Phase 3 |
|---|---|---|---|
| `MEANING_MC` / `FORM_MC` | (drill nội bộ) | 20s | 12s |
| `CLOZE_MC` | 問題5 文法形式の判断 | 50s | **35s** |
| `SENTENCE_BUILD` | 問題6 文の組み立て | 90s | **60s** |
| `TEXT_GRAMMAR` | 問題7 文章の文法 | 90s/câu | **60s/câu** |
| `MINIMAL_PAIR` | drill so sánh | 30s | 20s |

Ngân sách tổng cho phần 文法 trong đề thật: **≈ 20 phút** (10 câu 問題5 + 5 câu 問題6 + 5 câu 問題7). Mock test phải phản ánh ngân sách này.

---

## 14. REVIEW ENGINE — SPACED REPETITION HƯỚNG KỲ THI

Không sao chép SM-2 máy móc. Thuật toán tối ưu cho **exam readiness trong thời gian hữu hạn**.

### 14.1 Điểm ưu tiên

```
priority =
    0.25 * stateWeight          // UNSEEN 0 (do LEARN lo) | INTRODUCED .6 | SHAKY .9 | CONFUSED 1.0
                                 // RECOGNIZED .5 | COMPARABLE .3 | EXAM_READY .1
  + 0.20 * errorPressure        // mistakeCount chuẩn hoá + trọng số lỗi gần đây
  + 0.15 * confusionPressure    // tần suất confusion của cặp liên quan
  + 0.15 * decay                // (daysSinceLastReview / staleThreshold), cắt tại 1.0
  + 0.10 * speedPenalty         // medianRT / targetRT - 1, cắt [0,1]
  + 0.10 * guessPenalty         // tỉ lệ GUESS/UNSURE gần đây
  + 0.05 * examFrequencyWeight  // HIGH 1.0 | MEDIUM .6 | LOW .2
  - 0.10 * recencyPenalty       // tránh lặp lại item vừa gặp trong cùng ngày
```

Nhân hệ số phù hợp phase (`phaseFit`): item chưa `RECOGNIZED` × **1.3** ở Phase 1; item `CONFUSED` × **1.4** ở Phase 2; item có `trapHistory` × **1.4** ở Phase 3.

### 14.2 Khoảng review cơ sở

| Tình huống | Interval (ngày) |
|---|---|
| Sai | Gặp lại **cuối cùng session hôm nay**, rồi 1 ngày |
| Đúng + GUESS | 1 |
| Đúng + UNSURE | 2 |
| Đúng + CONFIDENT, `RECOGNIZED` | 4 |
| Đúng + CONFIDENT, `COMPARABLE` | 7 |
| Đúng + CONFIDENT, `EXAM_READY` | 12 |

### 14.3 Nén theo ngày thi (BẮT BUỘC)

```
interval = min(baseInterval × compressionFactor,
               max(1, floor(daysUntilExam × 0.4)))
```
```
compressionFactor = 1.0   nếu daysUntilExam > 21
                  = 0.6   nếu 7 < daysUntilExam ≤ 21
                  = 0.4   nếu daysUntilExam ≤ 7
```

Đảm bảo cứng: **mọi item đã học phải được gặp lại ít nhất 2 lần trước ngày thi.** Nếu lịch không cho phép, `ReviewEngine` phải cảnh báo ở `/analytics`.

### 14.4 Càng gần ngày thi càng ưu tiên

Khi `daysUntilExam ≤ 21`, tăng trọng số: `confusionPressure → 0.25`, `errorPressure → 0.25`, `trapHistory → 0.20`; giảm `decay → 0.05`. Grammar `EXAM_READY` chỉ xuất hiện trong **mixed set**, không chiếm slot riêng.

### 14.5 FINAL_14 / FINAL_7

`FINAL_14_MODE` (≤ 14 ngày) — **cấm nhồi grammar mới** nếu `coverage ≥ coverageTarget`. Thứ tự ưu tiên:
```
Weak grammar → Confusion pairs → Trap drills → Timed questions → Mixed sets → Error notebook → Mock tests
```

`FINAL_7_MODE` (≤ 7 ngày) — LEARN mới = **0%**. Mục tiêu chuyển từ "thêm" sang:
```
recognition ↑   speed ↑   stability ↑   confidence ↑
```
Giảm tổng khối lượng 20–30% để tránh kiệt sức. Không hiển thị chỉ số gây hoảng loạn; hiển thị "những gì bạn đã vững".

---

## 15. ADAPTIVE STUDY — HAI NGƯỜI CÙNG DAY 45 KHÔNG HỌC GIỐNG NHAU

`AdaptationEngine` là **rule-based, minh bạch, có thể giải thích**. Mỗi điều chỉnh phải in được lý do cho người học.

| Điều kiện (7 ngày gần nhất) | Điều chỉnh |
|---|---|
| `meaningAccuracy < 0.70` | +1 block meaning recall, −50% thời lượng COMPARE |
| `confusionRate > 0.25` | +compare drill cho **top 3** confusion pairs |
| `accuracy ≥ 0.85` **và** `medianRT > 1.5 × target` | +timed recognition, giảm giải thích dài |
| `guessRate > 0.30` | +active recall dạng sản sinh; **khoá** thăng `EXAM_READY` |
| `formErrorRate > 0.20` | +structure/接続 drill riêng |
| `contextErrorRate > 0.20` | +`TEXT_GRAMMAR` (問題7) |
| `reviewBacklog > 1.5 × capacity` | đóng băng LEARN hôm nay |
| Bỏ học ≥ 3 ngày liên tiếp | session "quay lại": 100% review + 1 win nhỏ, không grammar mới |

Bốn chân dung mẫu phải hoạt động đúng:
- **A** yếu nghĩa → tăng meaning recall.
- **B** hay nhầm mẫu gần nghĩa → tăng comparison drill.
- **C** chính xác nhưng chậm → tăng timed recognition.
- **D** đoán nhiều → tăng active recall + chặn thăng cấp.

---

## 16. NGUỒN & TÍNH TOÀN VẸN NỘI DUNG (SOURCE INTEGRITY)

> **Đây là điều khoản nghiêm khắc nhất của project.**

1. **AI không được bịa quy tắc ngữ pháp và coi đó là dữ liệu chính thức.**
2. Mỗi `Grammar` và mỗi `Question` phải có:
   ```
   sourceId, sourcePage, sourceSection, sourceReference
   verificationStatus: VERIFIED | NEEDS_REVIEW | DRAFT
   ```
3. Nội dung do AI sinh ra mà chưa đối chiếu tài liệu → **bắt buộc** `NEEDS_REVIEW`.
4. Nội dung `NEEDS_REVIEW`:
   - hiển thị badge cảnh báo trong UI,
   - **không** được dùng để quyết định thăng `EXAM_READY`,
   - vẫn được luyện, nhưng đánh dấu rõ.
5. Kiến trúc phải hỗ trợ **import** grammar/question từ tài liệu ngoài (JSON/CSV) — xem `project-architecture.md §12`.
6. Nếu hai nguồn mâu thuẫn → giữ cả hai, gắn `conflictNote`, không tự chọn.

---

## 17. KIẾN TRÚC — TÁCH LỚP BẮT BUỘC

```
Content Layer  →  Learning Engine  →  UI Layer
                       ↑ ↓
        Exercise / Review / Analytics Engine
                       ↑ ↓
                  Storage Layer
```

Luật cứng:
1. **Cấm** hard-code nội dung grammar (mẫu, nghĩa, ví dụ, giải thích) trong component UI.
2. UI **không** được tự tính mastery, priority, phase, hay readiness. UI chỉ **hiển thị** kết quả của engine.
3. Engine là **pure function** khi có thể: `(state, input) → newState`. Side effect chỉ ở Storage Layer.
4. **Cấm** engine import từ UI. Chiều phụ thuộc một chiều (chi tiết ở `project-architecture.md §3`).
5. Mọi hằng số học thuật nằm trong `src/config/learning.config.ts`. Cấm magic number rải rác.
6. Mọi thay đổi thuật toán học tập phải kèm **unit test** với case cụ thể.

---

## 18. UI/UX — MOBILE FIRST (KHÔNG THƯƠNG LƯỢNG)

- Thiết kế cho **một tay**, ngón cái: hành động chính nằm ở **nửa dưới màn hình**.
- Vùng chạm tối thiểu **44×44px**.
- Font tiếng Nhật rõ, cỡ tối thiểu **18px** cho câu ví dụ, **20px+** cho mẫu ngữ pháp. Không dùng font quá mảnh.
- Furigana: bật/tắt được, mặc định **tắt** (người học đã N2).
- Một màn hình = **một việc**. Không dashboard dày đặc.
- Không bắt đọc đoạn văn dài. Giải thích tối đa ~3 câu/ý, dùng bảng và gạch đầu dòng.
- Không animation quá 200ms. Không popup gây mất mạch.
- Offline-first: mất mạng vẫn học được. Mất dữ liệu là lỗi nghiêm trọng cấp 1.
- Dark mode bắt buộc (học buổi tối).

---

## 19. PRODUCT PRINCIPLE — BÀI KIỂM TRA CHO MỌI MÀN HÌNH

Mỗi màn hình / feature phải trả lời được:

> **"Nó giúp người học tăng khả năng lấy điểm 文法 JLPT N1 như thế nào?"**

Không trả lời rõ được → **không vào MVP**.

Mỗi PR thêm feature phải ghi câu trả lời này vào mô tả. Không có → từ chối.

### 19.1 Anti-goals (KHÔNG làm)

- Gamification rỗng: streak/huy hiệu không gắn với readiness.
- Social feed, leaderboard, bình luận.
- Từ điển tra cứu tổng quát, kanji/từ vựng đầy đủ (ngoài phạm vi).
- Giải thích học thuật dài về nguồn gốc mẫu ngữ pháp.
- AI chat tự do sinh giải thích ngữ pháp không nguồn (vi phạm `§16`).
- Tuỳ chỉnh thuật toán review cho người dùng chỉnh tay.

---

## 20. MVP PAGES (TỐI THIỂU)

```
/onboarding    /today      /grammar     /grammar/:id   /compare
/trap-lab      /review     /mistakes    /grammar-map   /practice
/mock          /analytics  /settings
```

`/today` là **trang quan trọng nhất**. Người học **không bao giờ** phải tự hỏi "hôm nay học gì". Mở app → có sẵn session.

Trách nhiệm chi tiết từng trang: `project-architecture.md §9`.

---

## 21. WEEKLY CHECKPOINT

Mỗi 7 ngày học, sinh **Weekly Grammar Check** gồm:
```
grammar đã học | grammar yếu | confusion pairs | phân bố lỗi
accuracy | speed | review debt | so sánh với tuần trước
```
Sau đó **tự động điều chỉnh kế hoạch tuần kế tiếp** và nói rõ đã đổi gì, vì sao. Checkpoint được lưu (không phải tính lại), để so sánh xu hướng.

---

## 22. PHASE TRANSITION (NGHI THỨC CHUYỂN GIAI ĐOẠN)

**Cuối Phase 1** → màn hình `文法を知る → 文法を比べる`:
```
Bạn đã biết X grammar.
Y grammar còn shaky.
Z grammar cần review.
→ Từ mai, cách học đổi: không còn học từng mẫu riêng lẻ.
```

**Cuối Phase 2** → màn hình `文法を比べる → 問題を見抜く`, kèm **confusion map** (bản đồ các cặp hay nhầm).

Luật:
- **Không reset dữ liệu.** Không xoá lịch sử. Không đặt lại mastery.
- Màn hình chuyển phase chỉ hiện **một lần**, có thể xem lại ở `/analytics`.
- Nếu coverage chưa đạt, vẫn chuyển phase nhưng chèn "nợ KNOW" vào session Phase 2.

---

## 23. EXAM READINESS SCORE

```
ERS = ( 0.25 * coverage
      + 0.20 * retention
      + 0.20 * comparisonAccuracy
      + 0.15 * trapDetection
      + 0.10 * timedAccuracy
      + 0.10 * speedIndex
      ) * stabilityFactor          // recentStability, 0.85 … 1.00
```

Thang: `<40` Cần báo động · `40–59` Đang xây · `60–74` Đúng lộ trình · `75–89` Vững · `90+` Sẵn sàng thi.

Luật:
- **Không** được trình bày như xác suất đậu JLPT. Luôn kèm dòng: *"Chỉ số này đo mức độ sẵn sàng của bạn với dạng bài 文法, không phải xác suất đậu."*
- ERS **không bao giờ** là một con số đơn lẻ trên UI — luôn hiển thị kèm **6 thành phần con** để biết phải làm gì.
- ERS chỉ tính khi `coverage ≥ 20%`; trước đó hiển thị "chưa đủ dữ liệu".

---

## 24. DASHBOARD — CẤM HIỂN THỊ "50% COMPLETE"

`/analytics` bắt buộc có:
```
Days remaining · Current phase · Grammar coverage
Recognition accuracy · Comparison accuracy · Trap accuracy
Average response time · Review backlog
Weakest grammar groups · Strongest groups · Exam readiness
```
Mỗi chỉ số phải kèm **một hành động gợi ý** ("Luyện ngay 5 phút"). Chỉ số không hành động được thì không hiển thị.

---

## 25. TECH STACK (mặc định — người dùng có thể override)

| Hạng mục | Lựa chọn | Lý do |
|---|---|---|
| Build | Vite + React 18 + TypeScript (strict) | Nhanh, đơn giản, không cần server |
| Routing | React Router | Đủ dùng cho 13 route |
| Style | Tailwind CSS | Mobile-first, ít CSS thủ công |
| State | Zustand | Nhẹ, dễ test, không boilerplate |
| Lưu trữ | IndexedDB qua Dexie | Offline-first, dữ liệu học tập lớn dần |
| Nội dung | JSON tĩnh + validate bằng Zod | Tách content khỏi code |
| Test | Vitest (+ Testing Library) | Bắt buộc cho mọi engine |
| PWA | vite-plugin-pwa | Học offline trên điện thoại |
| Backend | **Không có ở MVP** | Một người học, một thiết bị chính |

Ràng buộc:
- TypeScript `strict: true`. **Cấm** `any` trong `src/engines/**` và `src/content/**`.
- Không thêm dependency mới nếu chưa ghi lý do vào `project-architecture.md §16`.
- Backup/restore JSON là **bắt buộc ở MVP** (bù cho việc không có backend).

---

## 26. CODE CONVENTIONS

- Enum của domain khai báo **một chỗ duy nhất**: `src/domain/enums.ts`. Cấm string literal rải rác.
- Tên file: `kebab-case.ts`; component: `PascalCase.tsx`; hook: `useXxx.ts`.
- Engine đặt trong `src/engines/<name>/`, export **một** public API qua `index.ts`.
- Ngôn ngữ UI: **tiếng Việt**. Thuật ngữ nội bộ/code: **tiếng Anh**. Nội dung ngữ pháp: **tiếng Nhật**.
- Chuỗi hiển thị nằm trong `src/i18n/vi.ts`. Cấm chuỗi tiếng Việt cứng trong component.
- Ngày giờ: lưu ISO 8601 UTC, hiển thị theo giờ địa phương. Ranh giới "ngày học" cấu hình được (mặc định 04:00 địa phương).

---

## 27. TESTING — BẮT BUỘC

Phải có unit test cho:
1. `PhaseEngine` — biên phase, compress, TRIAGE, FINAL_14/7.
2. `MasteryEngine` — mọi transition ở `§5`, đặc biệt: `đúng+GUESS không thăng cấp`, `không rơi về UNSEEN`.
3. `ReviewEngine` — priority, interval, nén theo ngày thi, đảm bảo "≥2 lần trước thi".
4. `SessionEngine` — tổng thời lượng ≤ M×1.15, đúng trọng số phase, freeze LEARN khi backlog cao.
5. `ErrorEngine` — phân loại, sinh confusion pairs.
6. `AnalyticsEngine` — ERS và 6 thành phần.
7. Content validation — mọi grammar/question hợp lệ schema, `NEEDS_REVIEW` được đánh dấu đúng.

**Cấm merge** thay đổi engine mà không có test tương ứng.

---

## 28. DEFINITION OF DONE

Một feature được coi là xong khi:
- [ ] Trả lời được câu hỏi ở `§19`.
- [ ] Không vi phạm điều khoản nào trong file này.
- [ ] Không hard-code nội dung ngữ pháp trong UI.
- [ ] Có unit test nếu chạm vào engine.
- [ ] Hoạt động trên màn hình rộng **375px** bằng một tay.
- [ ] Hoạt động **offline**.
- [ ] Ghi `Attempt` đầy đủ nếu có tương tác trả lời.
- [ ] Cập nhật `project-architecture.md` nếu đổi module/luồng dữ liệu.

---

## 29. THỨ TỰ XÂY DỰNG (không được đảo)

```
1. Domain types + enums + config          6. /grammar + /grammar/:id (KNOW)
2. Storage Layer (Dexie) + backup         7. Compare Lab (COMPARE)
3. Content schema + validator + seed      8. Trap Lab (DETECT)
4. PhaseEngine + RoadmapEngine            9. Mistakes + Grammar Map
5. MasteryEngine + ReviewEngine +         10. Analytics + Weekly Checkpoint
   SessionEngine + /today                 11. Mock test
                                          12. PWA + polish
```

Lý do: `/today` không thể đúng nếu engine chưa đúng. **Cấm** làm UI đẹp trước khi engine chạy đúng.

---

## 30. MỤC TIÊU CUỐI CÙNG

```
MONTH 1  「意味が分かる」
   ↓
MONTH 2  「違いが分かる」
   ↓
MONTH 3  「問題の意図が分かる」
   ↓
JLPT N1  文法問題を速く、正確に処理できる
```

Mọi dòng code trong project này tồn tại để phục vụ mũi tên cuối cùng đó.
