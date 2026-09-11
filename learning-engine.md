# learning-engine.md — TRẠNG THÁI NGƯỜI HỌC & SESSION

> Đọc sau `CLAUDE.md` và `project-architecture.md`. Khi mâu thuẫn: `CLAUDE.md` > `project-architecture.md` > file này.
> Quy ước nhãn trường (`LOCKED`/`PROPOSED`/`DERIVED`/`REJECTED`): xem `grammar-schema.md §2`.

---

## 1. PURPOSE

Trả lời hai câu hỏi, và **chỉ** hai câu hỏi:

1. **Người học đang ở đâu với từng mẫu ngữ pháp?** → `MasteryEngine` (§4–§6)
2. **Hôm nay học gì, theo thứ tự nào, trong bao nhiêu phút?** → `SessionEngine` (§8–§12)

Ranh giới với các file khác:

| Câu hỏi | File chịu trách nhiệm |
|---|---|
| Hình dạng của kiến thức | `grammar-schema.md` |
| **Chọn câu nào** trong một block, chấm thế nào | `exercise-engine.md` |
| **Khi nào** gặp lại một mẫu, ưu tiên bao nhiêu | `review-engine.md` |
| Tổng hợp toàn cục, ERS, khuyến nghị | `analytics-engine.md` |

`SessionEngine` **gọi** `ReviewEngine.selectDueItems` và `ExerciseEngine.pickQuestions`; nó không tự chọn câu, không tự tính priority.

---

## 2. DEFINITIONS

| Thuật ngữ | Nghĩa chính xác |
|---|---|
| **MasteryState** | 1 trong 7 nhãn rời rạc (`CLAUDE.md §5`). Là **kết luận**, không phải điểm số. |
| **Skill dimension** | 1 trong 3 chiều `KNOW` / `COMPARE` / `DETECT`, mỗi chiều 0–100. Là **thang đo**, không phải state. |
| **Evidence** | Tập `Attempt` thoả điều kiện lọc, dùng làm bằng chứng cho một kết luận. Bằng chứng từ nội dung `NEEDS_REVIEW` bị loại khỏi quyết định `EXAM_READY`. |
| **Learning day** | Ngày theo `dayBoundaryHour` (mặc định 04:00 địa phương), không phải theo UTC. |
| **Capacity** | Số item một block có thể chứa trong `budgetMinutes`, ước lượng từ `targetTimeMs`. |
| **Backlog** | Số item có `nextReviewAt < now`. |
| **Micro-cycle** | Vòng đời của **một mẫu**: SEE → UNDERSTAND → RECALL → RECOGNIZE → USE → REVIEW. Trải nhiều ngày. |
| **Daily loop** | Vòng của **một ngày**: 7 bước `CLAUDE.md §7`. Không thay thế micro-cycle; hai thứ vuông góc nhau. |

### 2.1 Micro-cycle ↔ Daily loop (không mâu thuẫn)

Micro-cycle là **trục dọc** (một mẫu, nhiều ngày). Daily loop là **trục ngang** (một ngày, nhiều mẫu). Ánh xạ:

| Micro-cycle (một mẫu) | Xảy ra trong block nào của daily loop | State sau đó |
|---|---|---|
| SEE — thấy mẫu lần đầu | `LEARN` | `UNSEEN → INTRODUCED` |
| UNDERSTAND — hiểu nghĩa + 接続 | `LEARN` (cùng learn card) | `INTRODUCED` |
| RECALL — tự nhớ khi bị che | `RECALL` | tích luỹ bằng chứng |
| RECOGNIZE — nhận ra trong câu | `RECALL` / `APPLY` | `INTRODUCED → RECOGNIZED` |
| USE — chọn đúng khi có mẫu gần nghĩa cạnh bên | `COMPARE` / `APPLY` | `RECOGNIZED → COMPARABLE → EXAM_READY` |
| REVIEW — sống sót sau khoảng nghỉ | `REVIEW` | giữ state, gỡ `isStale` |

> Một ngày có thể chứa mẫu A ở bước SEE và mẫu B ở bước USE. Đó là bình thường và mong muốn.

---

## 3. PHASE — CHỈ THAM CHIẾU

`PhaseEngine` đã được chốt ở `arch §7.1`, luật ở `CLAUDE.md §4`. File này **không** định nghĩa lại và **không** được tự tính phase.

`SessionEngine` nhận `timeline` như dữ liệu đầu vào bất biến:

```ts
Timeline = {
  totalStudyDays, daysElapsed, daysRemaining, studyDayIndex,
  currentPhase: Phase, mode: StudyMode,
  progressExpected, phaseBoundaries, daysLeftInPhase, isPhaseTransitionDay
}
```

Cấm tuyệt đối trong file này và trong `engines/session/**`: mọi so sánh dạng `daysRemaining <= 14`. Dùng `timeline.mode`.

---

## 4. METRIC VECTOR — MỖI GRAMMAR × NGƯỜI HỌC

`MasteryState` không được suy từ cảm tính hay từ số lần mở trang. Nó suy từ **vector chỉ số** dưới đây, và vector này suy từ `Attempt` (append-only, `arch §4.4`).

```ts
interface GrammarMetrics {          // DERIVED — không lưu DB, tính lại từ attempts
  grammarId: string;

  meaningAccuracy: number;          // 0..1  MEANING_MC
  formAccuracy: number;             // 0..1  FORM_MC
  usageAccuracy: number;            // 0..1  câu mà manh mối quyết định là ngữ cảnh/ràng buộc/collocation
  comparisonAccuracy: number;       // 0..1  MINIMAL_PAIR + WHY_NOT_OTHER
  timedAccuracy: number;            // 0..1  attempt có isTimed = true
  trapAccuracy: number;             // 0..1  câu có trap != null, + TRAP_ID
  examStyleAccuracy: number;        // 0..1  CLOZE_MC + SENTENCE_BUILD + TEXT_GRAMMAR

  retentionScore: number;           // 0..1  §4.3
  medianResponseTimeMs: number;     // theo question type, chuẩn hoá ở §4.4
  speedIndex: number;               // 0..1  §4.4
  confidenceCalibration: number;    // 0..1  §4.5
  guessRate: number;                // 0..1  tỉ lệ GUESS trong 6 lần gần nhất
  recentErrorRate: number;          // 0..1  §4.6, cửa sổ 14 ngày có suy giảm

  evidence: EvidenceLevel;          // §4.7
  attemptCount: number;
  distinctDays: number;
  verifiedAttemptCount: number;     // chỉ đếm attempt trên content VERIFIED
}

type EvidenceLevel = 'NONE' | 'THIN' | 'OK' | 'SOLID';
```

### 4.1 Cửa sổ thời gian

| Chỉ số | Cửa sổ | Lý do |
|---|---|---|
| `meaning/form/usage/comparison/examStyle/timed/trapAccuracy` | 21 ngày gần nhất, tối đa 12 attempt gần nhất | Đủ dài để ổn định, đủ ngắn để phản ánh hiện tại |
| `retentionScore` | 21 ngày | Cần chỗ cho khoảng nghỉ ≥ 3 ngày |
| `recentErrorRate` | 14 ngày, có suy giảm (arch §7.7) | Khớp cửa sổ `ErrorEngine` |
| `guessRate` | 6 attempt gần nhất | Khớp `CLAUDE.md §5.1` |

Khi `daysRemaining ≤ 21`, mọi cửa sổ 21 ngày co lại còn `max(7, daysRemaining)` — dữ liệu cũ hơn thời gian còn lại thì không còn nói được gì hữu ích.

### 4.2 Accuracy có **giảm chấn** (bắt buộc)

Không bao giờ dùng `correct / total` trần trụi. 1 câu đúng **không** phải 100%.

```
accHat(c, n, p0) = (c + ALPHA * p0) / (n + ALPHA)

ALPHA = 4                 // learning.config: METRIC_SHRINKAGE_ALPHA
p0    = 1 / choiceCount   // xác suất đoán trúng; 4 đáp án → 0.25
```

Ví dụ: 1/1 đúng, 4 đáp án → `accHat = (1 + 4·0.25)/(1+4) = 0.40`, **không** phải 1.00.
6/6 đúng → `(6+1)/10 = 0.70`. 12/12 đúng → `(12+1)/16 = 0.8125`.

> Hệ quả cố ý: **không thể** đạt điểm cao nếu chưa làm đủ nhiều. Đây là hàng rào chống ảo tưởng tiến độ.

### 4.3 `retentionScore`

Chỉ tính trên **attempt sống sót qua khoảng nghỉ**:

```
gapAttempts = attempts mà (attempt.timestamp − lần gặp mẫu này trước đó) ≥ RETENTION_GAP_DAYS (=3)
retentionScore = accHat(#đúng trong gapAttempts, #gapAttempts, p0)
nếu #gapAttempts == 0 → retentionScore = null, evidence không được lên SOLID
```

### 4.4 `speedIndex`

```
với mỗi questionType t mà mẫu này có attempt:
    r_t = targetRT(t, phase) / medianRT(t)        // targetRT lấy từ timing.config (CLAUDE.md §13)
speedIndex = clamp(weightedMean(r_t theo số attempt), 0, 1)
```
`medianRT` dùng median, **không** dùng mean (một lần bị gián đoạn 5 phút sẽ phá mean).
Attempt có `responseTimeMs > RT_OUTLIER_MS` (=180000) bị loại khỏi thống kê tốc độ nhưng **vẫn** tính vào accuracy.

### 4.5 `confidenceCalibration`

Xác suất kỳ vọng gán cho mỗi mức (`learning.config.CONFIDENCE_EXPECTED`):

| Confidence | p̂ kỳ vọng |
|---|---|
| `GUESS` | 0.25 |
| `UNSURE` | 0.60 |
| `CONFIDENT` | 0.90 |

```
calibration = 1 − Σ_b ( w_b · |p̂_b − accuracyThựcTế_b| )      // w_b = tỉ trọng attempt của bucket b
```
`1.0` = tự đánh giá khớp thực tế. `< 0.6` = tự đánh giá không đáng tin ⇒ `AnalyticsEngine` phải cảnh báo, và `wrong + CONFIDENT` được ưu tiên tối đa (`CLAUDE.md §12`).

### 4.6 `recentErrorRate`

```
w(a) = 0.5 ^ (daysAgo(a) / ERROR_HALF_LIFE_DAYS)     // ERROR_HALF_LIFE_DAYS = 7
recentErrorRate = Σ w(a)·[a sai] / Σ w(a)            // trên cửa sổ 14 ngày
```

### 4.7 `EvidenceLevel`

| Mức | Điều kiện |
|---|---|
| `NONE` | `attemptCount = 0` |
| `THIN` | `attemptCount < 4` **hoặc** `distinctDays < 2` |
| `OK` | `attemptCount ≥ 4` và `distinctDays ≥ 2` |
| `SOLID` | `OK` và `attemptCount ≥ 8` và `distinctDays ≥ 3` và `retentionScore != null` |

Luật UI (`CLAUDE.md §17.2` — UI chỉ hiển thị): điểm ở mức `THIN` **phải** hiển thị kèm nhãn "chưa đủ dữ liệu". Cấm hiển thị "92" từ 1 câu.

---

## 5. BA CHIỀU — KNOW / COMPARE / DETECT

Yêu cầu gốc: `mastery = 75%` là vô nghĩa. Người học phải đọc được *"tôi biết nghĩa nhưng chưa làm được đề"*.

```ts
interface SkillProfile {            // DERIVED
  know: number;      // 0..100
  compare: number;   // 0..100
  detect: number;    // 0..100
  evidence: Record<SkillDimension, EvidenceLevel>;
  bottleneck: SkillDimension;       // chiều thấp nhất có evidence ≥ OK
}
```

### 5.1 Công thức (`learning.config.SKILL_WEIGHTS`)

```
KNOW    = 100 × ( 0.40·meaningAccuracy
                + 0.30·formAccuracy
                + 0.20·retentionScore⁺
                + 0.10·usageAccuracy )

COMPARE = 100 × ( 0.60·comparisonAccuracy
                + 0.25·(1 − confusionPenalty)
                + 0.15·usageAccuracy )

DETECT  = 100 × ( 0.35·examStyleAccuracy
                + 0.25·trapAccuracy
                + 0.20·timedAccuracy
                + 0.20·speedIndex )
```

```
retentionScore⁺  = retentionScore, hoặc meaningAccuracy nếu retentionScore = null
confusionPenalty = clamp( Σ confusedWith[*] / CONFUSION_SATURATION , 0, 1 )   // saturation = 6
```

### 5.2 Luật của ba chiều

| # | Luật |
|---|---|
| S1 | Ba chiều **không** thay thế `MasteryState`. State là quyết định (dùng cho lên lịch); chiều là chẩn đoán (dùng để giải thích và để chọn drill). |
| S2 | Chiều có `evidence = NONE` hiển thị `—`, **không** hiển thị `0`. "Chưa đo" khác "kém". |
| S3 | `bottleneck` bỏ qua chiều `THIN`/`NONE`. Không được khuyên người học luyện DETECT khi chưa có bằng chứng DETECT nào. |
| S4 | Ở `PHASE_1_KNOW`, chiều COMPARE và DETECT gần như luôn `NONE`. Đó là **đúng**, không phải lỗi. UI không được tô đỏ. |
| S5 | Ba chiều **không** được dùng làm điều kiện thăng cấp — điều kiện thăng cấp đã chốt cứng ở `CLAUDE.md §5.1` và không được thêm/bớt ở đây. |

### 5.3 Ví dụ đọc được

```
〜に至って
  KNOW    92   ●●●●●  (SOLID)
  COMPARE 53   ●●●○○  (OK)     ← bottleneck
  DETECT  31   ●●○○○  (THIN)

Đọc: "Bạn hiểu nghĩa rất chắc. Bạn vẫn lẫn khi nó đứng cạnh 〜に至っては.
      Chưa đủ dữ liệu về khả năng làm đề có giới hạn thời gian."
Hành động: Compare drill cặp ni-itatte ↔ ni-itatte-wa.
```

---

## 6. MASTERY STATE MACHINE

Luật ở `CLAUDE.md §5` là **cứng**. Phần này chỉ biến nó thành thuật toán kiểm được, không thêm không bớt.

### 6.1 Chữ ký (đã chốt ở `arch §7.3`)

```ts
applyAttempt(mastery, attempt, question, now): { mastery: GrammarMastery; event?: MasteryEvent }
applyDecay(mastery, timeline, now): GrammarMastery
canPromoteToExamReady(mastery, evidence): { ok: boolean; missingVi: string[] }
```
Pure. Không I/O. `now` là tham số.

### 6.2 Thứ tự xử lý trong `applyAttempt` (bắt buộc đúng thứ tự này)

```
1. Cập nhật bộ đếm: correctCount/wrongCount, streak, distinctCorrectDays,
   medianResponseTimeMs, guessRate, confusedWith[]
2. Tính cờ rủi ro:
     isGuessCorrect  = isCorrect && confidence == 'GUESS'
     isTooSlow       = responseTimeMs > SLOW_FACTOR (=2.5) × medianRT cá nhân của type đó
     isMisconception = !isCorrect && confidence == 'CONFIDENT'
3. Áp TỤT CẤP trước (CLAUDE.md §5.2)
4. Nếu không tụt → xét THĂNG CẤP (CLAUDE.md §5.1)
5. Nếu không đổi state → chỉ cập nhật cờ (SHAKY / isStale)
6. Sinh MasteryEvent nếu state đổi, kèm `reason` bằng tiếng Việt đọc được
```

> Tụt trước, thăng sau. Nếu làm ngược, một câu sai sau chuỗi đúng có thể vừa thăng vừa tụt trong cùng một lượt.

### 6.3 Vị từ thăng cấp (dịch nguyên văn `CLAUDE.md §5.1`)

```
canIntroduce(m):
    đã hoàn thành 1 learn card && đã trả lời mini-recall (đúng/sai đều tính)

canRecognize(m):
    countCorrect(type ∈ {MEANING_MC, FORM_MC}) ≥ 3
 && distinctDays(những lần đúng đó) ≥ 2
 && last2Attempts.every(isCorrect)
 && lastAttempt.confidence != 'GUESS'

canCompare(m):
    trong 5 attempt gần nhất thuộc {MINIMAL_PAIR, WHY_NOT_OTHER} cùng grammarFamily:
        correct ≥ 4
 && distinctDays ≥ 2
 && không có Attempt errorType = SIMILAR_GRAMMAR_CONFUSION trong 7 ngày gần nhất

canExamReady(m):
    trong 6 attempt gần nhất thuộc {CLOZE_MC, SENTENCE_BUILD, TEXT_GRAMMAR}:
        correct ≥ 5
 && ≥ 1 trong số đó có isTimed = true
 && medianResponseTimeMs(type) ≤ targetRT(type, PHASE_3)        // CLAUDE.md §13
 && ratio(confidence == 'CONFIDENT' trong 6 lần gần nhất) ≥ 0.70
 && ∃ attempt đúng với gap ≥ 3 ngày kể từ lần gặp trước         // "sống sót qua khoảng nghỉ"
 && mọi attempt dùng làm bằng chứng ở trên đến từ question.verificationStatus = 'VERIFIED'
```

`canPromoteToExamReady` trả về `missingVi[]` để `/grammar/:id` nói được **còn thiếu gì**:
```
["Chưa có lần đúng nào trong bài có giới hạn thời gian",
 "Cần 1 lần đúng sau khi nghỉ ít nhất 3 ngày"]
```

### 6.4 Vị từ tụt cấp (`CLAUDE.md §5.2`)

```
onWrong(m):        nếu state ≥ RECOGNIZED → tụt đúng 1 bậc + set SHAKY
onCorrectGuess(m): không thăng; nếu state ≥ RECOGNIZED → set SHAKY
onTooSlow(m):      set SHAKY (kể cả khi đúng)
onConfusion(m,x):  nếu count(confusedWith[x], 14 ngày) ≥ 2 → state = CONFUSED, ghi cặp (m,x)
FLOOR:             state không bao giờ < INTRODUCED
exitConfused(m,x): chỉ khi thắng contrast drill của ĐÚNG cặp (m,x): 3/3 hoặc 4/5
```

Thứ tự bậc để "tụt 1 bậc": `EXAM_READY → COMPARABLE → RECOGNIZED → INTRODUCED`.
`SHAKY` và `CONFUSED` là **cờ trạng thái đặc biệt**, không nằm trên thang bậc — khi tụt từ `SHAKY` thì tụt theo bậc nền đã lưu.

> Thiết kế bắt buộc: `GrammarMastery` phải giữ thêm `baseRank: 'INTRODUCED'|'RECOGNIZED'|'COMPARABLE'|'EXAM_READY'` (`PROPOSED`) song song với `state`. Không có nó thì `SHAKY → tụt 1 bậc` là vô định nghĩa. Xem `spec-consistency-check.md C-08`.

### 6.5 `applyDecay` (`CLAUDE.md §5.3`)

```
staleThreshold = { PHASE_1: 10, PHASE_2: 7, PHASE_3: 4, FINAL_14/FINAL_7: 3 }[timeline.mode ?? phase]

nếu state ≥ RECOGNIZED và daysSince(lastReviewedAt) > staleThreshold:
    isStale = true                 // KHÔNG đổi state
```
`isStale` không phải trạng thái thành thạo, nó là **tín hiệu ưu tiên** cho `ReviewEngine` (`review-engine.md §4`).

---

## 7. BẤT BIẾN CỦA `MasteryEngine` (phải có test, `CLAUDE.md §27.2`)

| # | Bất biến |
|---|---|
| M1 | `đúng + GUESS` không bao giờ làm tăng state. |
| M2 | State không bao giờ trở về `UNSEEN` sau khi đã rời `UNSEEN`. |
| M3 | Không thể lên `EXAM_READY` nếu mọi lần đúng nằm trong **cùng một** session. |
| M4 | Không thể lên `EXAM_READY` nếu chưa có attempt `isTimed = true`. |
| M5 | Bằng chứng từ content `NEEDS_REVIEW` không đóng góp vào `canExamReady`. |
| M6 | `applyAttempt` là pure: gọi hai lần với cùng input cho cùng output; không đọc `Date.now()`. |
| M7 | Mọi thay đổi state đều sinh đúng 1 `MasteryEvent` có `reason` khác rỗng. |
| M8 | Chuỗi attempt bất kỳ (property-based) không bao giờ đưa state ra ngoài 7 giá trị hợp lệ. |
| M9 | Thoát `CONFUSED` chỉ xảy ra qua contrast drill của đúng cặp đã ghi. |
| M10 | Chuyển phase không làm đổi bất kỳ `state`, `count`, hay `attempt` nào (`CLAUDE.md §22`). |

---

## 8. SESSION ENGINE — PHÂN BỔ THỜI GIAN

### 8.1 Nguồn tỉ lệ — **chốt cứng**

Bảng phân bổ là bảng ở **`CLAUDE.md §8`** (6 block: REVIEW / LEARN / RECALL / COMPARE / APPLY / ANALYZE_ERROR).

> ⚠️ Yêu cầu ban đầu đề xuất một bảng 3 nhóm khác (Review/New/Recognition — Review/Comparison/Mixed — Review/Trap/Timed). Bảng đó **không được dùng để phân bổ**, vì nó bỏ mất `ANALYZE_ERROR` (`CLAUDE.md §7` cấm bỏ) và bỏ mất `RECALL`. Xem `spec-consistency-check.md C-01`.
> Bảng 3 nhóm vẫn hữu ích để **hiển thị tóm tắt** cho người học; §8.4 định nghĩa phép gộp.

### 8.2 Thuật toán `buildDailySession`

```
INPUT : profile, timeline, plan, allMastery, weakness, adaptations, contentRepo, now, seed
OUTPUT: DailySession (deterministic với cùng input + seed)

 1. M = profile.availableMinutesPerDay
 2. ratios = PHASE_BLOCK_RATIOS[timeline.mode ?? timeline.currentPhase]      // CLAUDE.md §8
 3. nếu coverage ≥ plan.coverageTarget và mode ∈ {FINAL_14, FINAL_7}:
        ratios.LEARN = 0; dồn phần đó sang APPLY                              // CLAUDE.md §8 ghi chú *
 4. backlog = count(mastery.nextReviewAt < now)
    capacity = dailyReviewCapacity(M, ratios.REVIEW)                          // §8.5
    nếu backlog > BACKLOG_FREEZE_FACTOR (=1.5) × capacity:
        ratios.LEARN = 0; dồn sang REVIEW
        note("Hôm nay tạm dừng học mẫu mới: bạn còn N mẫu quá hạn ôn.")
 5. áp adaptations (tối đa 3, arch §7.8) → cộng/trừ ratios, kèm AdaptationNote
 6. chuẩn hoá ratios về tổng 1.0, rồi budgetMinutes[b] = round(M × ratios[b])
    ràng buộc sàn: ANALYZE_ERROR ≥ ANALYZE_MIN_MINUTES (=3) nếu M ≥ 15
 7. điền item cho từng block (§9), theo thứ tự cố định §8.3
 8. tổng thời lượng ước tính ≤ M × 1.15; nếu vượt → cắt theo §10
 9. chèn "sai → gặp lại cuối session" (§11)
10. status = PLANNED; lưu 1 lần/ngày (arch §8.2)
```

Xác định: cùng `(input, seed)` → cùng session, phục vụ snapshot test (`arch §13`).

### 8.3 Thứ tự block trong ngày — cố định, không phụ thuộc phase

```
REVIEW → LEARN → RECALL → COMPARE → APPLY → ANALYZE_ERROR → SCHEDULE
```
Lý do thứ tự này (không được đảo):
- `REVIEW` trước `LEARN`: nợ cũ chặn nợ mới; và trí nhớ tươi nhất ở đầu buổi nên dành cho thứ sắp quên.
- `RECALL` ngay sau `LEARN`: khoảng cách càng ngắn thì active recall càng đúng mục đích (`CLAUDE.md §11`).
- `ANALYZE_ERROR` áp chót: cần lỗi của chính hôm nay làm nguyên liệu.
- `SCHEDULE` cuối, chạy tự động, người học không thấy thao tác (`CLAUDE.md §7`).

Block có `budgetMinutes = 0` bị **ẩn hoàn toàn** khỏi UI, không hiện dạng "0 phút".

### 8.4 Phép gộp để hiển thị (chỉ hiển thị, không phân bổ)

```
Nhóm "Ôn tập"     = REVIEW
Nhóm "Học mới"    = LEARN + RECALL
Nhóm "So sánh"    = COMPARE
Nhóm "Luyện đề"   = APPLY
Nhóm "Chữa lỗi"   = ANALYZE_ERROR
```
`/today` được phép hiển thị 3–5 nhóm cho gọn, nhưng `DailySession.blocks` vẫn phải đủ 7 phần tử theo `CLAUDE.md §7`.

### 8.5 Ước lượng sức chứa

```
avgItemMs(blockType, phase) = trung bình targetTimeMs của các question type block đó dùng
                              + OVERHEAD_MS (=4000, thời gian đọc + chọn confidence)
capacity(block) = floor(budgetMinutes × 60000 / avgItemMs)
```
`LEARN`: `avgItemMs = LEARN_CARD_MS` (=150000, 2.5 phút/mẫu gồm cả mini-recall).
Trần cứng: `newItemsToday ≤ min(capacity(LEARN), plan.newPerDay, NEW_PER_DAY_HARD_CAP = 8)` (`CLAUDE.md §8.2`).

---

## 9. NGUỒN ITEM CHO TỪNG BLOCK

| Block | Nguồn | Ai chọn |
|---|---|---|
| `REVIEW` | `ReviewEngine.selectDueItems(allMastery, ctx, capacity)` | `ReviewEngine` |
| `LEARN` | `plan.requiredGrammarIds` chưa `INTRODUCED`, ưu tiên **cùng family** với mẫu vừa học 2 ngày qua | `SessionEngine` |
| `RECALL` | `ExerciseEngine.pickQuestions({ grammarIds: mẫu vừa LEARN, types: [MEANING_MC, FORM_MC] })` | `ExerciseEngine` |
| `COMPARE` | `ComparisonSet` chứa mẫu đang `CONFUSED` (ưu tiên 1) hoặc mẫu vừa lên `RECOGNIZED` (ưu tiên 2) | `SessionEngine` chọn set, `ExerciseEngine` chọn câu |
| `APPLY` | `ExerciseEngine.pickQuestions({ types: exam-style, timed: phase == 3 })` | `ExerciseEngine` |
| `ANALYZE_ERROR` | lỗi trong session hôm nay **+** top lỗi 7 ngày từ `WeaknessProfile` | `ErrorEngine` cung cấp, `SessionEngine` xếp |
| `SCHEDULE` | không có item hiển thị; chạy `ReviewEngine.computeNextReview` cho mọi mẫu đã chạm hôm nay | `ReviewEngine` |

Luật `LEARN` gom theo family: học `〜に至って` hôm nay thì ngày mai ưu tiên `〜に至っては` — để Phase 2 có sẵn cặp để so sánh (`arch §7.2`).

Luật `ANALYZE_ERROR` khi **không có lỗi nào**: block vẫn chạy, nội dung đổi thành (`CLAUDE.md §7`):
```
1. Câu chậm nhất hôm nay + đường giải nhanh hơn
2. Câu đúng nhưng confidence = GUESS  (đúng do may)
3. Nếu cả hai đều không có → 1 câu "决め手は？" trên câu đã làm đúng
```

---

## 10. LUẬT CẮT KHI VƯỢT NGÂN SÁCH

Khi tổng ước tính > `M × 1.15`, cắt theo thứ tự này cho tới khi vừa:

```
1. APPLY        (bỏ item khó nhất trước — giữ item gần target time)
2. LEARN        (giảm số mẫu mới, giữ tối thiểu 1 nếu ratios.LEARN > 0)
3. COMPARE      (bỏ set, không bỏ nửa set)
4. RECALL       (giữ tối thiểu 1 câu/mẫu vừa học — CLAUDE.md §11 cấm học mà không recall)
5. REVIEW       (chỉ cắt item priority thấp nhất)
── KHÔNG BAO GIỜ CẮT ──
   ANALYZE_ERROR                                        // CLAUDE.md §7, §8.2
```

Sàn không thể phá:
- Mỗi mẫu vào `LEARN` phải kèm ≥ 1 item `RECALL` — nếu cắt hết `RECALL` thì phải cắt luôn mẫu đó khỏi `LEARN`.
- `COMPARE` không được cắt còn 1 mẫu (so sánh 1 mẫu là vô nghĩa).

### 10.1 Ngân sách nhỏ — 20 phút

`M = 20` là trường hợp phải chạy đúng, không phải ngoại lệ. Với `PHASE_2_COMPARE`:

```
REVIEW 15% → 3 phút    LEARN 15% → 3 phút    RECALL 10% → 2 phút
COMPARE 35% → 7 phút   APPLY 15% → 3 phút    ANALYZE_ERROR 10% → 2 phút  (sàn 3 → 3)
```
Sau khi ép sàn `ANALYZE_ERROR = 3`, chuẩn hoá lại phần còn lại về 17 phút.
Thứ tự ưu tiên nội dung khi chỉ có 20 phút (đúng như yêu cầu ban đầu):
```
1. review quá hạn có priority cao nhất
2. cặp confusion đang ở trạng thái CONFUSED
3. câu luyện giá trị cao (examFrequency HIGH)
4. mẫu mới   ← xuống cuối
```

---

## 11. "SAI → GẶP LẠI TRONG CÙNG NGÀY"

`CLAUDE.md §14.2`: câu sai phải gặp lại **cuối session hôm nay**, rồi mới tính interval 1 ngày.

Cài đặt: `SessionEngine` chèn một block ảo `REDO` vào **cuối** `ANALYZE_ERROR`:
- Không phải block thứ 8 — nó là phần cuối của `ANALYZE_ERROR`, để không phá cấu trúc 7 bước.
- Câu gặp lại phải là **câu khác** cùng mẫu, cùng question type nếu có; nếu kho không đủ, dùng lại đúng câu đó (được phép, vì `ExerciseEngine` cho lặp câu **đã sai** — `arch §7.6`).
- Kết quả lần gặp lại **vẫn** ghi `Attempt` bình thường, nhưng `MasteryEngine` biết đây là cùng session ⇒ không đủ để thăng cấp (bất biến M3).

---

## 12. CHẾ ĐỘ ĐẶC BIỆT

### 12.1 Recovery Mode (nghỉ ≥ 3 ngày)

Không phải một `StudyMode` mới. `StudyMode` (`NORMAL|TRIAGE|FINAL_14|FINAL_7`) là **chế độ theo lịch thi** và đã `LOCKED`. Recovery là **một luật của `AdaptationEngine`** (`CLAUDE.md §15`, dòng cuối bảng).

```
RULE recovery_return:
  điều kiện: daysSinceLastSession ≥ 3
  hành động:
     ratios = { REVIEW: 0.85, RECALL: 0.10, ANALYZE_ERROR: 0.05, còn lại 0 }
     LEARN = 0 tuyệt đối trong ngày quay lại
     capacity REVIEW bị chặn trên bởi RECOVERY_CAP = capacity bình thường (KHÔNG nhân lên)
     chèn 1 "win nhỏ": 3 câu trên mẫu có state cao nhất, đảm bảo làm được
     messageVi: "Bạn nghỉ N ngày. Hôm nay chỉ ôn lại, không có mẫu mới."
  hiệu lực: đúng 1 ngày học
```

**Luật chống 300 item** (yêu cầu §21 của prompt):
```
backlogDisplayed = số thật (không giấu)
backlogScheduledToday = min(backlog, capacity(REVIEW))       // KHÔNG BAO GIỜ vượt capacity
```
Backlog **không** biến thành nợ phải trả hết. Item quá hạn lâu chỉ được cộng `decay` trong công thức priority (`CLAUDE.md §14.1`), tối đa `1.0` — nghỉ 30 ngày không nguy hiểm hơn nghỉ 15 ngày về mặt xếp hàng.

Sau Recovery day: gọi `RoadmapEngine.shouldReplan` → nghỉ ≥ 3 ngày là một trong các điều kiện replan (`arch §7.2`).

### 12.2 `FINAL_14_MODE` / `FINAL_7_MODE`

Đã chốt ở `CLAUDE.md §8` (cột riêng) và `§14.5`. Điểm cài đặt cần nhấn:

| Luật | Cài đặt |
|---|---|
| FINAL_14: cấm nhồi mẫu mới nếu `coverage ≥ coverageTarget` | bước 3 của §8.2 |
| FINAL_7: `LEARN = 0%` tuyệt đối | `PHASE_BLOCK_RATIOS.FINAL_7.LEARN = 0`, không adaptation nào được nâng lên |
| FINAL_7: giảm tổng khối lượng 20–30% | `M_effective = M × FINAL_7_LOAD_FACTOR (=0.75)` **trước** khi phân bổ |
| FINAL_7: không hiển thị chỉ số gây hoảng loạn | `AnalyticsEngine` đổi view (xem `analytics-engine.md §10`) — `SessionEngine` chỉ set cờ `mode` |
| Thứ tự ưu tiên FINAL_14 | Weak → Confusion → Trap → Timed → Mixed → Error notebook → Mock |

`AdaptationEngine` bị **khoá** khỏi việc tăng `LEARN` khi `mode ∈ {FINAL_7}`. Đây là bất biến có test.

---

## 13. MICRO LESSON (learn card)

### 13.1 Thứ tự hiển thị — **chốt theo `arch §9 /grammar/:id`**

```
1. Pattern
2. Nghĩa (tiếng Việt)        ← meaningVi
3. Core image                ← coreImage  ("mental image")
4. Structure (接続)
5. Usage
6. Restrictions              ← quan trọng, đặt TRƯỚC ví dụ
7. Register
8. Examples (1–3)
9. Common mistake
10. Mini recall              ← BẮT BUỘC, không bỏ được
```

> ⚠️ Yêu cầu ban đầu đề xuất 8 bước với `Examples` **trước** `Restriction` và không có `Usage`/`Register`. Khác với `arch §9`. `arch` thắng. Lý do giữ `arch`: đọc ví dụ trước khi biết ràng buộc sẽ khiến người học khái quát hoá sai từ ví dụ. Xem `spec-consistency-check.md C-05`.

### 13.2 Luật độ dài (`CLAUDE.md §18`, `§11`)

| Luật | Ngưỡng |
|---|---|
| Mỗi mục ≤ 3 dòng | cứng |
| Toàn bộ learn card ≤ 1.5 màn hình 375×812 khi thu gọn | cứng |
| Không có 2 màn hình đọc liên tiếp mà không có recall | cứng (`CLAUDE.md §11`) |
| "Xem thêm chi tiết" là accordion, mặc định **đóng** | cứng — cho phép đọc thêm, không ép đọc |
| Mini recall là **sản sinh trước, nhận diện sau**: che nghĩa → tự nhớ → mới hiện | cứng |

### 13.3 Mini recall — nội dung tối thiểu

```
Bước 1 (sản sinh): hiện pattern, che nghĩa → "Mẫu này nghĩa là gì?" → người học tự nghĩ → bấm "Hiện"
Bước 2 (nhận diện): 1 câu MEANING_MC hoặc FORM_MC → ghi Attempt thật
```
Chỉ bước 2 sinh `Attempt`. Bước 1 không chấm (không có dữ liệu để chấm), nhưng **bắt buộc phải có thao tác** trước khi hiện đáp án (`CLAUDE.md §11`).

Hoàn thành learn card + trả lời bước 2 (đúng/sai đều được) ⇒ `UNSEEN → INTRODUCED`.

---

## 14. PHASE TRANSITION

Luật ở `CLAUDE.md §22`. Trách nhiệm chia như sau:

| Việc | Engine |
|---|---|
| Phát hiện `isPhaseTransitionDay` | `PhaseEngine` |
| Sinh nội dung màn hình chuyển phase | `AnalyticsEngine.buildPhaseTransitionSummary` |
| Ghi "đã xem" | storage `meta.phaseTransitionSeen` |
| Chèn "nợ KNOW" vào session Phase 2 khi coverage chưa đạt | **`SessionEngine`** |

### 14.1 Nợ KNOW

Vào `PHASE_2_COMPARE` mà còn `requiredGrammarIds` ở `UNSEEN`/`INTRODUCED`:

```
knowDebt = #(required ∧ state < RECOGNIZED)
extraLearnRatio = clamp(knowDebt / (daysLeftInPhase2 × NEW_PER_DAY_HARD_CAP), 0, 0.20)
ratios.LEARN += extraLearnRatio   (lấy từ APPLY trước, rồi COMPARE)
note: "Bạn còn N mẫu chưa vững nghĩa. Mỗi ngày sẽ xen thêm k mẫu ở chế độ học mới."
```
Trần `0.20`: nợ KNOW **không được** nuốt Phase 2. Nếu `extraLearnRatio` chạm trần trong 5 ngày liên tiếp → `RoadmapEngine.shouldReplan` và `/analytics` cảnh báo coverage không kịp.

Cấm tuyệt đối: reset dữ liệu, xoá lịch sử, đặt lại mastery khi chuyển phase (M10).

---

## 15. EDGE CASES

| Tình huống | Xử lý |
|---|---|
| `M < 10` phút | Session tối thiểu: `REVIEW` (top-3 priority) + `ANALYZE_ERROR` (1 mục). Không `LEARN`. Cảnh báo ở `/today`: "10 phút là mức tối thiểu để giữ nhịp." |
| `M > 120` phút | Trần cứng `SESSION_MAX_MINUTES = 120`. Phần dư gợi ý sang `/practice`, không nhồi vào session bắt buộc. |
| Người học mở app 2 lần/ngày | Session sinh **1 lần**, lưu lại, mở lại thì tiếp tục (`arch §8.2`). Nút "Tạo lại" có xác nhận và ghi lý do. |
| Qua `dayBoundaryHour` giữa buổi học | Session đang `IN_PROGRESS` **không** bị cắt. Ngày mới bắt đầu ở lần mở app kế tiếp sau khi session hiện tại kết thúc/bỏ. |
| Đổi `examDate` giữa chừng | `PhaseEngine` tính lại → có thể nhảy phase. Session hôm nay đã `IN_PROGRESS` giữ nguyên; ngày mai áp mode mới. Không mất dữ liệu. |
| `coverage` đã đạt 100% nhưng vẫn ở Phase 1 | `LEARN = 0`, phần đó dồn sang `RECALL` + `APPLY`, ghi note. Không "học lại mẫu cũ như mới". |
| Kho câu hỏi cạn cho một mẫu | `ExerciseEngine` trả ít hơn yêu cầu; `SessionEngine` lấp bằng mẫu cùng family và ghi WARN cho `/analytics` (`arch §12`). |
| Mọi mẫu đều `EXAM_READY` | Session chuyển sang mixed set + mock (`CLAUDE.md §14.4`: `EXAM_READY` chỉ xuất hiện trong mixed set khi `daysUntilExam ≤ 21`). |
| 3 adaptation cùng đòi tăng cùng một block | Cộng dồn rồi chuẩn hoá; trần mỗi block `0.55`. Không block nào được chiếm > 55% một ngày. |
| `daysRemaining ≤ 0` (đã qua ngày thi) | `PhaseEngine` trả mode `NORMAL`, `daysRemaining = 0`; app chuyển sang chế độ ôn tự do, `/today` gợi ý đặt kỳ thi mới. Không crash, không chia cho 0. |

---

## 16. EXAMPLES

### 16.1 Ngày 45/90, `M = 45`, Phase 2, backlog bình thường

```
ratios (CLAUDE.md §8, COMPARE):  REVIEW .15  LEARN .15  RECALL .10
                                 COMPARE .35 APPLY .15  ANALYZE_ERROR .10

budget:  REVIEW 7 · LEARN 7 · RECALL 4 · COMPARE 16 · APPLY 7 · ANALYZE_ERROR 4   (= 45)

REVIEW         7'  → 8 item due, priority cao nhất
LEARN          7'  → 3 mẫu mới (cùng family EMPHASIS)
RECALL         4'  → 6 câu MEANING_MC/FORM_MC của 3 mẫu đó
COMPARE       16'  → cmp-emphasis-02 (3 mẫu) + 4 MINIMAL_PAIR + 2 WHY_NOT_OTHER
APPLY          7'  → 6 CLOZE_MC, không timed
ANALYZE_ERROR  4'  → 2 lỗi hôm nay + 1 confusion pair top tuần + REDO 2 câu đã sai
```

### 16.2 Cùng ngày đó nhưng backlog = 34, capacity = 8

```
34 > 1.5 × 8 = 12  →  LEARN = 0, dồn sang REVIEW

budget:  REVIEW 14 · LEARN 0 · RECALL 4 · COMPARE 16 · APPLY 7 · ANALYZE_ERROR 4
AdaptationNote: "Hôm nay tạm dừng mẫu mới: bạn còn 34 mẫu quá hạn ôn (sức chứa 8/ngày).
                 Sẽ mở lại mẫu mới khi còn dưới 12."
Lên lịch hôm nay: 16 item (capacity mới), KHÔNG phải 34.
```

### 16.3 Quay lại sau 5 ngày nghỉ, `M = 45`

```
RULE recovery_return kích hoạt
budget:  REVIEW 38 · RECALL 5 · ANALYZE_ERROR 2 · LEARN 0 · COMPARE 0 · APPLY 0
Lên lịch: min(backlog=61, capacity=22) = 22 item.  39 item còn lại KHÔNG bị dồn vào ngày mai —
          chúng chỉ giữ decay = 1.0 và sẽ được xếp theo priority ở các ngày sau.
Win nhỏ: 3 câu trên mẫu EXAM_READY  →  kết thúc bằng một chuỗi đúng.
Sau session: RoadmapEngine.shouldReplan = true (nghỉ ≥ 3 ngày) → plan v2.
```

### 16.4 `FINAL_7`, `M = 60`

```
M_effective = 60 × 0.75 = 45
ratios FINAL_7: REVIEW .20  LEARN .00  RECALL .10  COMPARE .15  APPLY .45  ANALYZE_ERROR .10
budget: REVIEW 9 · RECALL 5 · COMPARE 7 · APPLY 20 · ANALYZE_ERROR 5   (= 46 ≈ 45)
LEARN bị khoá ở 0 kể cả khi coverage < target và kể cả khi có adaptation đòi tăng.
```

---

## 17. ACCEPTANCE CRITERIA

**MasteryEngine**
- [ ] Có test cho **mọi** transition ở `CLAUDE.md §5.1` và `§5.2`.
- [ ] Test M1–M10 (§7) đều pass, trong đó M2 và M8 là property-based (≥ 500 chuỗi ngẫu nhiên).
- [ ] Test: 6 câu đúng liên tiếp trong **một** session → **không** `EXAM_READY` (`arch §13` kịch bản 3).
- [ ] Test: `EXAM_READY` + 1 câu sai → `COMPARABLE` + `SHAKY`, **không** `UNSEEN` (kịch bản 4).
- [ ] Test: bằng chứng toàn `NEEDS_REVIEW` → `canPromoteToExamReady().ok = false`, `missingVi` nói rõ lý do.
- [ ] `applyAttempt` không tham chiếu `Date.now()` (lint rule + test).

**Skill dimensions**
- [ ] 1 câu đúng duy nhất → `KNOW ≤ 45`, `evidence = THIN`. Không bao giờ ra 100.
- [ ] `evidence = NONE` → API trả `null`, không trả `0`.
- [ ] `bottleneck` bỏ qua chiều `THIN`/`NONE`.

**SessionEngine**
- [ ] Tổng thời lượng ước tính ≤ `M × 1.15` với `M ∈ {10, 20, 45, 60, 90, 120}` × 3 phase × 4 mode.
- [ ] `ANALYZE_ERROR` tồn tại và `budgetMinutes > 0` trong **mọi** tổ hợp trên (khi `M ≥ 15`).
- [ ] Backlog 3× capacity → `LEARN = 0` **và** có ≥ 1 `AdaptationNote` (kịch bản 5).
- [ ] Recovery mode: nghỉ 5 ngày → số item lên lịch ≤ capacity, không phải toàn bộ backlog.
- [ ] `FINAL_7` → `LEARN = 0` kể cả khi coverage thiếu và có adaptation đòi tăng.
- [ ] Snapshot test: cùng `(input, seed)` → session giống hệt nhau (`arch §13`).
- [ ] Mỗi mẫu trong `LEARN` luôn kèm ≥ 1 item `RECALL`, kể cả sau khi cắt ngân sách.
- [ ] Chuyển phase: so sánh dump DB trước/sau → 0 bản ghi mastery/attempt thay đổi (kịch bản 7).

---

## 18. FILE NÀY **KHÔNG** CHỊU TRÁCH NHIỆM

| Chủ đề | Xem file |
|---|---|
| Chọn câu hỏi cụ thể nào, chấm, độ khó, trap lab, mock | `exercise-engine.md` |
| `priority`, `nextReviewAt`, nén theo ngày thi, audit coverage | `review-engine.md` |
| `WeaknessProfile`, confusion matrix, ERS, khuyến nghị, checkpoint | `analytics-engine.md` |
| Hình dạng `Grammar`/`Question`/`ComparisonSet` | `grammar-schema.md` |
