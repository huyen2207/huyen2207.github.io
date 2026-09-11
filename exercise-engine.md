# exercise-engine.md — CHỌN CÂU · GIAO BÀI · CHẤM

> Đọc sau `CLAUDE.md` và `project-architecture.md`. Khi mâu thuẫn: `CLAUDE.md` > `project-architecture.md` > file này.
> Quy ước nhãn trường: `grammar-schema.md §2`.

---

## 1. PURPOSE

Ba việc, không hơn:

1. **Chọn** câu hỏi nào cho một yêu cầu (`pickQuestions`) — §3
2. **Giao** câu đó dưới đúng chế độ (feedback bao nhiêu, có đồng hồ không) — §5
3. **Chấm** một cách thuần khiết và kiểm được (`grade`) — §6–§7

Không thuộc file này: mastery (→ `learning-engine.md`), lịch review (→ `review-engine.md`), thống kê (→ `analytics-engine.md`), hình dạng `Question` (→ `grammar-schema.md`).

**Ranh giới cứng:** `grade()` là pure function. Nó **không** ghi DB, **không** đổi mastery, **không** gọi `Date.now()`. Cập nhật trạng thái xảy ra **sau**, ở `app/services/*` theo đúng luồng `arch §8.3`.

---

## 2. DEFINITIONS

| Thuật ngữ | Nghĩa |
|---|---|
| **Delivery mode** | Mức feedback + áp lực thời gian khi giao một câu. 4 giá trị, §5. |
| **Exposure** | Số lần người học đã gặp một `questionId`, kèm lần gần nhất. |
| **Cooldown** | Khoảng thời gian một câu không được lặp lại. |
| **Distractor** | Đáp án sai. Trong project này, distractor **luôn** có lý do; distractor ngẫu nhiên là lỗi content. |
| **Decisive clue** | Manh mối trong câu quyết định đáp án. Nội dung dạy chính của Phase 3. |
| **Normalization** | Chuẩn hoá chuỗi trước khi so sánh khi chấm. §7.2 — hiện chưa dùng, xem §7.1. |

---

## 3. QUESTION SELECTION

### 3.1 Chữ ký (đã chốt `arch §7.6`)

```ts
pickQuestions(criteria: PickCriteria, history: ExposureHistory, count: number): Question[]

interface PickCriteria {           // PROPOSED — làm rõ hình dạng, arch chỉ ghi "criteria"
  grammarIds?: string[];
  types?: QuestionType[];
  phase: Phase;
  mode: StudyMode;                 // NORMAL | TRIAGE | FINAL_14 | FINAL_7
  delivery: DeliveryMode;          // §5
  skill?: SkillDimension;          // KNOW | COMPARE | DETECT
  comparisonSetId?: string;
  trapTypes?: TrapType[];
  targetDifficulty?: number;       // 1..5, mềm
  excludeQuestionIds?: string[];
  daysUntilExam: number;
  seed: number;                    // bắt buộc — chọn phải deterministic
}

interface ExposureHistory {        // PROPOSED
  byQuestion: Record<string, { seenCount: number; lastSeenAt: string; wrongCount: number; lastWasWrong: boolean }>;
  recentQuestionIdsToday: string[];
}
```

### 3.2 Bộ lọc cứng (hard filter — loại thẳng, không cho điểm)

Áp trước khi tính điểm. Câu bị loại **không bao giờ** được chọn dù điểm cao.

| # | Loại bỏ câu nếu | Lý do |
|---|---|---|
| H1 | `verificationStatus = 'DRAFT'` | Chưa biên tập xong (`grammar-schema.md §5.2`) |
| H2 | Có `targetGrammarIds` trỏ tới grammar có `conflictNote` **và** câu kiểm tra đúng điểm đang mâu thuẫn | `CLAUDE.md §16.6` — không được ép người học chọn giữa hai nguồn |
| H3 | `id ∈ criteria.excludeQuestionIds` | — |
| H4 | `id ∈ history.recentQuestionIdsToday` | Không lặp trong cùng ngày |
| H5 | `daysSince(lastSeenAt) < COOLDOWN_DAYS (=7)` **và** `lastWasWrong = false` | `arch §7.6` — lặp câu đã đúng là lãng phí |
| H6 | `mode = TRIAGE` và mọi `targetGrammarIds` có `examFrequency = 'LOW'` | `CLAUDE.md §4.1` |
| H7 | `type` không thuộc `criteria.types` (khi có khai báo) | — |
| H8 | `delivery = MOCK` và `type ∉ {CLOZE_MC, SENTENCE_BUILD, TEXT_GRAMMAR}` | Mock phải giống đề thật (§8) |

> **Ngoại lệ cố ý của H5**: câu **đã sai** được phép lặp lại sớm — đó là remediation, không phải lười. Điều kiện: `lastWasWrong = true` và `daysSince(lastSeenAt) ≥ 1`.

### 3.3 Điểm chọn (soft score) — `selectionScore`

```
selectionScore =
    0.30 · masteryFit          // câu này có đúng tầm của người học không
  + 0.20 · errorTargeting      // có nhắm vào lỗi gần đây không
  + 0.15 · confusionTargeting  // có đụng cặp đang nhầm không
  + 0.15 · skillFit            // có đúng chiều KNOW/COMPARE/DETECT đang cần không
  + 0.10 · noveltyBonus        // chưa gặp / gặp lâu rồi
  + 0.10 · examValue           // examFrequency của grammar đích
  − 0.20 · overExposurePenalty // đã gặp nhiều lần
  − 0.10 · difficultyMismatch  // |difficulty − targetDifficulty| / 4
```

| Thành phần | Định nghĩa |
|---|---|
| `masteryFit` | `1 − |p̂_dự_đoán − DESIRED_SUCCESS_RATE|` với `DESIRED_SUCCESS_RATE = 0.75`. `p̂` từ §9.3. |
| `errorTargeting` | `1` nếu grammar đích nằm trong top-5 `weakness.errorGrammarIds`, ngược lại `0` |
| `confusionTargeting` | `1` nếu ∃ distractor có `confusedWithGrammarId` khớp một cặp trong `topConfusionPairs`, ngược lại `0` |
| `skillFit` | `1` nếu `question.testedSkill = criteria.skill`, `0.5` nếu không khai báo, `0` nếu khác |
| `noveltyBonus` | `clamp(daysSince(lastSeenAt) / 14, 0, 1)`; chưa gặp bao giờ = `1` |
| `examValue` | `HIGH 1.0 · MEDIUM 0.6 · LOW 0.2` (max trên các grammar đích) |
| `overExposurePenalty` | `clamp(seenCount / EXPOSURE_SATURATION (=4), 0, 1)` |

**`DESIRED_SUCCESS_RATE = 0.75`** là hằng số học thuật, nằm ở `learning.config.ts` (`CLAUDE.md §0.5`). Lý do 0.75: đủ khó để học được gì đó, đủ dễ để không bỏ cuộc trong 90 ngày.

### 3.4 Ràng buộc đa dạng (áp sau khi xếp hạng)

Chọn tham lam theo điểm, nhưng bác bỏ ứng viên vi phạm:

| # | Ràng buộc trong một lần `pickQuestions(count = n)` |
|---|---|
| D1 | ≤ `ceil(n/2)` câu cùng một `targetGrammarIds[0]` |
| D2 | ≤ `ceil(n/2)` câu cùng một `type` (trừ khi `criteria.types` chỉ có 1 giá trị) |
| D3 | Không hai câu liên tiếp cùng `trapType` |
| D4 | Với `delivery = MOCK`: tỉ lệ type **cố định** theo §8, D1/D2 không áp dụng |
| D5 | Nếu sau lọc còn < `n` câu → trả về những gì có + `shortfall` để `SessionEngine` ghi WARN. **Không** nới H1–H8 để lấp đầy. |

### 3.5 Xáo đáp án

```ts
shuffleChoices(question, seed): Question    // LOCKED arch §7.6
```
- Hoán vị dùng PRNG có seed = `hash(questionId + sessionId + attemptIndex)` ⇒ cùng phiên → cùng thứ tự khi mở lại, khác phiên → khác thứ tự.
- `correctChoiceId` **không** đổi; chỉ thứ tự hiển thị đổi.
- `SENTENCE_BUILD`: **không** xáo — thứ tự mảnh ghép là một phần của bài (§6.4).

---

## 4. SINH CÂU SO SÁNH & MINIMAL PAIR

### 4.1 `buildMinimalPair` (chốt `arch §7.6`)

```ts
buildMinimalPair(a: Grammar, b: Grammar, pool: Question[]): Question | null
```

Định nghĩa **minimal pair** trong project này:

> Hai câu **gần như giống hệt nhau**, khác nhau ở **đúng một** manh mối, và manh mối đó làm đáp án đúng đổi từ `a` sang `b`.

Không phải minimal pair: hai câu khác nhau hoàn toàn, mỗi câu dùng một mẫu.

```
Điều kiện để ghép được (đủ cả 4, thiếu 1 → trả null):
  1. ∃ cạnh trong graph giữa a và b  (similarTo | contrastsWith | oftenConfusedWith)
  2. ∃ ≥ 1 ComparisonSet chứa cả a và b
  3. ∃ ≥ 1 trục ComparisonAxis mà cells[a] ≠ cells[b]  → đó là trục quyết định
  4. pool có sẵn câu cho a và câu cho b trên CÙNG trục đó
```

**Ưu tiên dùng cặp đã biên tập** (`ComparisonSet.minimalPairQuestionIds`) hơn là ghép tự động. Ghép tự động chỉ là fallback, và kết quả ghép tự động **luôn** mang `verificationStatus = 'NEEDS_REVIEW'` (`CLAUDE.md §16.3`) ⇒ không dùng làm bằng chứng `EXAM_READY`.

### 4.2 Luồng minimal pair

```
1. Hiện câu A  →  người học chọn
2. Hiện câu B (gần giống)  →  người học chọn
3. Chấm cả hai
4. Hỏi: 「何が変わったから答えが変わった？」
       chọn 1 trong các ComparisonAxis xuất hiện trong set (≤ 4 lựa chọn)
5. Hiện: trục quyết định + decisiveDifferenceVi + highlight chỗ khác nhau giữa A và B
```
Bước 4 sinh một `Attempt` riêng với `type = MINIMAL_PAIR`? **Không.** Bước 4 là *meta-question*; nó ghi `Attempt` với `type = MINIMAL_PAIR` và cờ `PROPOSED` `subKind: 'AXIS_ID'`, để `comparisonAccuracy` không bị pha loãng bởi câu meta. Xem `spec-consistency-check.md C-09`.

### 4.3 `WHY_NOT_OTHER` — dạng bài quan trọng nhất Phase 2

Luồng bắt buộc (`CLAUDE.md §8.1`, `arch §9 /compare`):

```
1. Question               → hiện câu, người học chọn đáp án
2. Correct / Incorrect    → chấm ngay
3. 「決め手は？」          → chọn ClueKind (≤ 6 lựa chọn) — người học phải nói RA manh mối
4. 「なぜBはだめ？」       → chọn lý do cho distractor GẦN NHẤT (không phải mọi distractor)
                             lựa chọn = ComparisonAxis + choice.whyWrongVi rút gọn
5. Comparison summary     → bảng so sánh + decisiveDifferenceVi
```

Luật:
- Distractor "gần nhất" = distractor có `confusedWithGrammarId` nằm trong `oftenConfusedWith` của đáp án đúng, chọn theo `strength` cao nhất; nếu không có, chọn distractor cùng `violatedAxis` với trục quyết định.
- Bước 3 và 4 **luôn chạy kể cả khi trả lời đúng**. Đúng mà không nói được vì sao thì chưa phải biết (`CLAUDE.md §11`).
- Bước 3 sai → ghi cờ `CLUE_MISS` trong `GradeResult.flags`; đây là tín hiệu riêng, **không** làm câu đó thành sai.
- Bước 5 chỉ hiện sau bước 3–4 (`CLAUDE.md §11`: bảng so sánh hiện **sau** khi người học thử phân biệt).

### 4.4 Theo dõi cặp nhầm

Mỗi lần chọn distractor có `confusedWithGrammarId = X` trên câu đích `Y` ⇒ ghi `Attempt.confusedWith = X`.
`ErrorEngine` gom lại thành ma trận (→ `analytics-engine.md §5`). `ExerciseEngine` chỉ **cung cấp dữ kiện**, không tự dựng ma trận.

---

## 5. DELIVERY MODE

> ⚠️ Yêu cầu ban đầu gọi 4 chế độ này là `STUDY_MODE / PRACTICE_MODE / TIMED_MODE / MOCK_MODE`. Nhưng `StudyMode` **đã tồn tại** trong `arch §4.1` với nghĩa hoàn toàn khác (`NORMAL | TRIAGE | FINAL_14 | FINAL_7` — chế độ theo lịch thi). Trùng tên sẽ gây lỗi ngầm rất khó tìm.
> Tên chốt ở đây: **`DeliveryMode`** (`PROPOSED`). Xem `spec-consistency-check.md C-04`.

```ts
type DeliveryMode = 'STUDY' | 'PRACTICE' | 'TIMED' | 'MOCK';   // PROPOSED
```

| | `STUDY` | `PRACTICE` | `TIMED` | `MOCK` |
|---|---|---|---|---|
| Dùng ở | learn card, RECALL, COMPARE | APPLY, `/practice`, `/review` | APPLY Phase 3, rapid review | `/mock` |
| Đồng hồ hiển thị | không | không | **có**, đếm ngược/câu | **có**, đếm ngược cả bài |
| Feedback | ngay, đầy đủ | ngay, sau mỗi câu | ngay, **rút gọn** (đáp án + 1 dòng clue) | **không** cho tới khi nộp |
| Hiện `explanationVi` | có | có | sau khi hết block | sau khi nộp |
| Hiện `trap` | có | có | **không** trong lúc làm | **không** |
| Hiện tên grammar/family | có | có | không | **không** |
| Hiện `solvingStrategy` | có | có | sau block | sau khi nộp |
| Gợi ý / hint | có (accordion) | không | không | **không** |
| Tra cứu `/grammar` | có | có | không | **không** |
| Đánh dấu quay lại sau | — | — | — | **có** |
| `Attempt.isTimed` | `false` | `false` | **`true`** | **`true`** |
| Ghi `Attempt` | có | có | có | có |
| Vào mastery & analytics | có | **có** | có | có |

Luật:
- **Không có "chế độ nháp"** (`arch §9 /practice`). Mọi câu trả lời ở mọi chế độ đều ghi `Attempt` và tính vào mastery.
- `TIME_PRESSURE_ERROR` chỉ được gán khi `delivery ∈ {TIMED, MOCK}` (`CLAUDE.md §9.2.4`).
- `MOCK` là nơi **duy nhất** đo áp lực thời gian đáng tin (`arch §9 /mock`).
- Chuyển `DeliveryMode` giữa chừng một block: **cấm**. Mode gắn với block, quyết định lúc dựng session.

---

## 6. GRADING — PURE FUNCTION

### 6.1 Chữ ký

```ts
grade(input: GradeInput): GradeResult      // pure, không I/O, không Date.now()

interface GradeInput {                     // PROPOSED (arch §7.6 chốt tên hàm, chưa chốt hình dạng)
  question: Question;
  response: Response;
  responseTimeMs: number;
  confidence: Confidence;                  // GUESS | UNSURE | CONFIDENT — LOCKED, 3 mức
  delivery: DeliveryMode;
  context: GradeContext;                   // ảnh chụp CHỈ ĐỌC, xem §6.2
}

type Response =
  | { kind: 'CHOICE'; choiceId: string }
  | { kind: 'ORDER'; orderedFragmentIds: string[] }   // SENTENCE_BUILD
  | { kind: 'CLUE'; clueKind: ClueKind }              // 「決め手は？」
  | { kind: 'TRAP'; trapType: TrapType }              // TRAP_ID
  | { kind: 'NONE' };                                  // hết giờ, không trả lời
```

### 6.2 `GradeContext` — chỉ đọc, và chỉ chừng này

```ts
interface GradeContext {                   // PROPOSED
  masteryState: MasteryState;              // để phân biệt CARELESS_ERROR
  personalMedianRtMs: number | null;       // theo question type
  knownConfusionPartners: string[];        // grammarId người học đã nhầm với mẫu này ≥ 1 lần
  sameSessionAttemptCount: number;         // số lần đã gặp mẫu này trong session hôm nay
}
```
`grade` **không** được nhận toàn bộ DB, toàn bộ attempts, hay repository. Nếu một luật chấm cần dữ liệu ngoài 4 trường trên, luật đó không thuộc `grade` — nó thuộc `ErrorEngine` hoặc `MasteryEngine`.

### 6.3 `GradeResult`

```ts
interface GradeResult {                    // PROPOSED
  isCorrect: boolean;
  outcome: GradeOutcome;                   // §6.5 — mã chính
  flags: GradeFlag[];                      // §6.6 — tín hiệu phụ, có thể nhiều
  errorTypeAuto: ErrorType | null;         // suy từ metadata content
  needsSelfReport: boolean;                // true khi không suy được errorType
  confusedWith: string | null;
  violatedAxis: ComparisonAxis | null;
  score: number;                           // 0..1 — với SENTENCE_BUILD có thể là phần
  feedback: FeedbackPayload;               // §6.7 — cái gì được phép hiện, theo DeliveryMode
}
```

### 6.4 Chấm theo từng `type`

| `type` | Cách chấm |
|---|---|
| `MEANING_MC`, `FORM_MC`, `CLOZE_MC`, `MINIMAL_PAIR`, `WHY_NOT_OTHER`, `TEXT_GRAMMAR` | `choiceId === correctChoiceId`. `score ∈ {0, 1}`. |
| `SENTENCE_BUILD` | **Chấm theo vị trí ★ như đề thật** (`arch §7.6`): chỉ so mảnh đứng ở ô ★. `score = 1` nếu đúng ô ★. Ghi thêm `flags: FULL_ORDER_CORRECT` nếu toàn bộ thứ tự cũng đúng — thông tin chẩn đoán, **không** ảnh hưởng đúng/sai. |
| `TRAP_ID` | `trapType === question.trap.trapType`. Câu không có `trap` **không** được dùng cho `TRAP_ID` (hard filter). |
| `Response.NONE` (hết giờ) | `isCorrect = false`, `outcome = TIMEOUT`, `errorTypeAuto = TIME_PRESSURE_ERROR` (chỉ khi `delivery ∈ {TIMED, MOCK}`), `confidence` ghi `GUESS`. |

> Lý do chấm `SENTENCE_BUILD` theo ô ★: đề thật (問題6) chỉ hỏi mảnh ở dấu ★. Chấm toàn chuỗi sẽ đánh trượt người học vì một hoán vị hợp lệ khác, tạo dữ liệu lỗi giả và làm hỏng `WeaknessProfile`.

### 6.5 `GradeOutcome` — 8 mã

> Yêu cầu ban đầu đề xuất 4 mã (`CORRECT_CONFIDENT`, `CORRECT_UNCERTAIN`, `INCORRECT_KNOWN_CONFUSION`, `INCORRECT_NEW_CONFUSION`). Bốn mã đó **gộp mất** `GUESS` và `UNSURE` vào chung "uncertain", trong khi `CLAUDE.md §12` xử lý hai mức này **khác nhau** (`GUESS` → không thăng cấp; `UNSURE` → thăng chậm, interval 2 ngày). Vì vậy dùng 8 mã dưới đây — bảo toàn đủ ma trận 3×2 của `CLAUDE.md §12`, và tách riêng timeout.

```ts
type GradeOutcome =                        // PROPOSED
  | 'CORRECT_CONFIDENT'
  | 'CORRECT_UNSURE'
  | 'CORRECT_GUESS'                        // ← mã mà 4-mã-gốc làm mất
  | 'INCORRECT_MISCONCEPTION'              // sai + CONFIDENT — ưu tiên cao nhất (CLAUDE.md §12)
  | 'INCORRECT_KNOWN_CONFUSION'            // sai vào mẫu ĐÃ TỪNG nhầm
  | 'INCORRECT_NEW_CONFUSION'              // sai vào mẫu gần nghĩa, lần đầu
  | 'INCORRECT_OTHER'                      // sai không do nhầm mẫu (form/context/careless…)
  | 'TIMEOUT';
```

Cây quyết định (thứ tự này là **cố định**, kiểm bằng test):

```
nếu response.kind == 'NONE'                     → TIMEOUT
nếu isCorrect:
    confidence == CONFIDENT                     → CORRECT_CONFIDENT
    confidence == UNSURE                        → CORRECT_UNSURE
    confidence == GUESS                         → CORRECT_GUESS
ngược lại (sai):
    confidence == CONFIDENT                     → INCORRECT_MISCONCEPTION     ← xét TRƯỚC
    chosen.confusedWithGrammarId ∈ ctx.knownConfusionPartners
                                                → INCORRECT_KNOWN_CONFUSION
    chosen.wrongBecause == SIMILAR_GRAMMAR_CONFUSION
                                                → INCORRECT_NEW_CONFUSION
    ngược lại                                   → INCORRECT_OTHER
```

> `INCORRECT_MISCONCEPTION` được xét **trước** hai mã confusion là cố ý: "sai mà vẫn chắc chắn" là tín hiệu mạnh nhất trong hệ thống (`CLAUDE.md §12`), nó không được bị che bởi một phân loại chi tiết hơn. Thông tin confusion không mất — nó nằm ở `confusedWith` và ở `flags`.

### 6.6 `GradeFlag` — tín hiệu phụ, cộng dồn được

```ts
type GradeFlag =                           // PROPOSED
  | 'MISCONCEPTION'          // sai + CONFIDENT (lặp lại outcome để tiện lọc)
  | 'LUCKY'                  // đúng + GUESS
  | 'TOO_SLOW'               // responseTimeMs > SLOW_FACTOR (2.5) × personalMedianRtMs
  | 'SUSPICIOUSLY_FAST'      // responseTimeMs < FAST_FLOOR_RATIO (0.25) × targetTimeMs
  | 'KNOWN_CONFUSION'        // chọn đúng mẫu đã từng nhầm
  | 'CLUE_MISS'              // trả lời đúng nhưng chọn sai 「決め手」
  | 'TRAP_HIT'               // rơi đúng vào bẫy đã khai ở question.trap
  | 'FULL_ORDER_CORRECT'     // SENTENCE_BUILD: đúng cả chuỗi, không chỉ ô ★
  | 'UNVERIFIED_CONTENT'     // question.verificationStatus != VERIFIED
  | 'SAME_SESSION_REPEAT';   // đã gặp mẫu này trong session hôm nay
```

`UNVERIFIED_CONTENT` và `SAME_SESSION_REPEAT` là hai cờ mà `MasteryEngine` **bắt buộc** đọc: chúng chặn thăng `EXAM_READY` (`CLAUDE.md §5.1`, `§16.4`).

### 6.7 Suy `errorType` tự động (`CLAUDE.md §9.2`)

```
1. chosen.wrongBecause có khai báo trong content     → dùng nó       (errorSource = 'AUTO')
2. TIMEOUT và delivery ∈ {TIMED, MOCK}               → TIME_PRESSURE_ERROR
3. flags có TRAP_HIT và không suy được gì khác       → TRAP_ERROR
4. masteryState ≥ COMPARABLE và SUSPICIOUSLY_FAST    → CARELESS_ERROR   (CLAUDE.md §9.2.3)
5. không suy được                                    → needsSelfReport = true
```

Luật `CARELESS_ERROR` (§9.2.3) là **cứng**: chỉ gán khi **cả hai** điều kiện đúng. Cấm gán `CARELESS_ERROR` cho mẫu đang `SHAKY` — đó là tự lừa mình.

Khi `needsSelfReport = true`: UI hỏi **1 chạm**, tối đa **4 lựa chọn**, sinh từ `wrongBecause` của các distractor + `OTHER`. Kết quả ghi `errorSource = 'SELF_REPORTED'`. Người học bỏ qua được → `errorType = undefined`, `Attempt` vẫn hợp lệ.

### 6.8 `FeedbackPayload` — cổng chặn theo `DeliveryMode`

```ts
interface FeedbackPayload {                // PROPOSED
  correctChoiceId: string | null;          // null trong MOCK cho tới khi nộp
  explanationVi: string | null;
  keyClueVi: string | null;
  choiceExplanations: Record<string, string> | null;   // vì sao TỪNG distractor sai
  trap: TrapAnnotation | null;
  solvingStrategy: SolvingStep[] | null;
  grammarLinks: string[] | null;
}
```
`grade` trả `FeedbackPayload` **đã lọc sẵn** theo `delivery` (§5). UI **không** được tự quyết định giấu/hiện — nếu UI cầm dữ liệu đầy đủ rồi mới giấu, một lỗi render là lộ đáp án giữa bài mock.

---

## 7. NORMALIZATION KHI CHẤM

### 7.1 Hiện trạng: **chưa dùng**

Trong 8 `QuestionType` đã chốt (`arch §4.1`), **không có** loại nào nhận text tự do:
- Trắc nghiệm → so `choiceId`.
- `SENTENCE_BUILD` → so id mảnh ghép ở ô ★, **không** so chuỗi.

Vì vậy `normalizeForGrading` hiện **không được gọi ở bất kỳ đâu**. Nó được đặc tả sẵn ở §7.2 để nếu sau này duyệt thêm loại câu nhập text (ví dụ `MINI_SENTENCE_COMPLETION` đang chờ duyệt — `spec-consistency-check.md C-02`), luật chấm đã có sẵn và không ai phải ứng biến.

### 7.2 Đặc tả `normalizeForGrading` (dùng khi và chỉ khi có input text)

```
normalizeForGrading(s):
  1. NFKC                                  // 全角英数→半角, ﾊﾝｶｸｶﾅ→カタカナ
  2. trim + gộp mọi khoảng trắng (kể cả 　U+3000) thành rỗng
  3. bỏ dấu câu cuối câu: 。．.
  4. bỏ ký tự trang trí: 〜 ～ ・ 「」 『』 （）
  5. KHÔNG chuyển カタカナ→ひらがな        ← khác với normalizeForSearch
  6. KHÔNG bỏ dấu 濁点/半濁点
  7. KHÔNG sửa lỗi chính tả, KHÔNG so khớp mờ (fuzzy)
```

Khác biệt so với `normalizeForSearch` (`grammar-schema.md §7`) là **có chủ ý**: tìm kiếm cần khoan dung, chấm bài thì không. `かった` và `カッタ` khác nghĩa; chấm mà gộp lại là dạy sai.

Luật chấm text (khi được duyệt):
```
đúng  ⇔ normalizeForGrading(input) ∈ acceptedAnswers.map(normalizeForGrading)
```
- `acceptedAnswers` là **danh sách khai báo trong content**, không phải suy đoán lúc chạy.
- Không có "gần đúng", không có khoảng cách Levenshtein, không có chấm điểm bộ phận.
- Sai chính tả = sai. Nhưng `errorTypeAuto` khi đó là `CARELESS_ERROR` nếu chuỗi lệch ≤ 1 ký tự và mastery ≥ `COMPARABLE`.

### 7.3 Bất biến của chấm

| # | Bất biến |
|---|---|
| P1 | `grade` không ghi DB, không gọi repository, không gọi `Date.now()`, không dùng `Math.random()`. |
| P2 | Cùng `GradeInput` → cùng `GradeResult` (deep equal). |
| P3 | `grade` không đọc và không sửa `GrammarMastery`; nó chỉ nhận `GradeContext` chỉ đọc. |
| P4 | UI **không** chứa bất kỳ so sánh đúng/sai nào. Grep `=== correctChoiceId` trong `src/ui/**` phải ra 0 kết quả. |
| P5 | Mọi `GradeOutcome` đều có ≥ 1 unit test riêng (`CLAUDE.md §27`). |
| P6 | `FeedbackPayload` ở `delivery = MOCK` có `correctChoiceId = null` — kiểm bằng test cho cả 8 outcome. |

---

## 8. MOCK MODE

Cấu trúc chốt theo `arch §9 /mock` và `CLAUDE.md §13`:

| Phần | Số câu | Type | Ngân sách |
|---|---|---|---|
| 問題5 文法形式の判断 | 10 | `CLOZE_MC` | ~35s/câu |
| 問題6 文の組み立て | 5 | `SENTENCE_BUILD` | ~60s/câu |
| 問題7 文章の文法 | 5 | `TEXT_GRAMMAR` | ~60s/câu |
| **Tổng** | **20** | | **20 phút** |

Luật mock:

| # | Luật |
|---|---|
| K1 | Không hiện đáp án, giải thích, trap, tên grammar, hay từ điển trong lúc làm. |
| K2 | Đồng hồ đếm ngược **cả bài**, không phải từng câu. Hết giờ → tự nộp, câu chưa làm ghi `Response.NONE`. |
| K3 | Đánh dấu quay lại sau; điều hướng tự do trong bài. |
| K4 | 問題7 dùng chung một `contextJa` cho 5 câu — đoạn văn phải hiện lại được ở mọi câu trong nhóm. |
| K5 | Chọn câu: `pickQuestions` với `delivery = MOCK`, cân bằng `examFrequency` (≥ 60% HIGH), tránh câu đã gặp trong 14 ngày. |
| K6 | Sau khi nộp: điểm, thời gian/câu, phân bố lỗi, so với mock trước, và **tạo drill từ câu sai** (`SessionEngine.buildAdHocDrill`). |
| K7 | Khả dụng từ Phase 2. Khuyến nghị ≥ 4 lần trong Phase 3. Không chặn cứng. |
| K8 | Mock **không** được sinh `Attempt` có `errorType = CARELESS_ERROR` tự động — dưới áp lực thời gian, "bấm nhầm" và "không kịp nghĩ" không phân biệt được. Dùng `TIME_PRESSURE_ERROR`. |

Mock **có** tính vào mastery và analytics. Đây là nguồn bằng chứng `isTimed = true` quan trọng nhất cho `EXAM_READY`.

---

## 9. DIFFICULTY

Không hard-code `easy/medium/hard`. Hai lớp:

### 9.1 `difficultyStatic` — biên tập, 1..5 (`PROPOSED`, ở `Question`)

```
difficultyStatic = round( clamp(
      1
    + 0.8 · grammarComplexity        // max(difficulty của targetGrammarIds) − 1, 0..2
    + 0.6 · choiceSimilarity         // 0..2: bao nhiêu distractor có cạnh với đáp án đúng
    + 0.5 · trapStrength             // trap?.strength ?? 0, 0..3 → chuẩn hoá 0..2
    + 0.4 · contextLoad              // độ dài contextJa: 0 (không có) .. 2 (đoạn văn)
    − 0.5 · clueCount                // số manh mối rõ trong câu: nhiều manh mối → dễ hơn
, 1, 5) )
```

### 9.2 `difficultyEmpirical` — từ dữ liệu người học

```
pObserved = accHat(#đúng, #lần gặp, p0)        // giảm chấn như learning-engine §4.2
difficultyEmpirical = 1 + 4 · (1 − pObserved)
```

### 9.3 Độ khó hiệu dụng (dùng trong `selectionScore`)

```
w = clamp(attemptCount / EMPIRICAL_TRUST_N (=6), 0, 1)
difficulty = (1 − w) · difficultyStatic + w · difficultyEmpirical
p̂_dự_đoán  = 1 − (difficulty − 1) / 4
```
Một người học không đủ dữ liệu để hiệu chuẩn độ khó ⇒ luôn phải có `difficultyStatic` làm nền. Không được để `difficultyEmpirical` chi phối khi mới 1–2 lần gặp.

---

## 10. TRAP LAB

Sau **mọi** câu ở Trap Lab, hiển thị đủ và đúng thứ tự (`arch §9 /trap-lab`):

```
1. Đáp án đúng
2. Vì sao đúng                    ← explanationVi
3. Manh mối quyết định            ← decisiveClue, highlight span trong stemJa
4. Loại bẫy                       ← trap.trapType + trapExplanationVi
5. Vì sao A / B / C sai           ← choiceExplanations, TỪNG distractor một
6. Đường giải nhanh nhất          ← trap.fastestPathVi + solvingStrategy
```

Thêm dạng bài `TRAP_ID` (`LOCKED`, đã có trong enum): 「この問題の罠は？」— người học chọn `TrapType` **trước** khi xem giải thích.

Và câu 「この問題の決め手は？」 — người học chọn `ClueKind` trong 6 lựa chọn: `meaning · connection · restriction · context · nuance · register` (`PROPOSED` `ClueKind`, `grammar-schema.md §4.6`).

Luật Trap Lab:

| # | Luật |
|---|---|
| T1 | `solvingStrategy` hiển thị theo **từng câu**, không áp cứng 6 bước cho mọi câu (`arch §9`). |
| T2 | Câu không có `trap` vẫn dùng được ở Trap Lab, nhưng bước 4 bị ẩn — không bịa bẫy. |
| T3 | Thống kê theo `TrapType`: "bạn hay sập bẫy nào nhất" → `analytics-engine.md §7`. |
| T4 | Chọn sai `TRAP_ID` → `errorType = TRAP_ERROR`, và ghi `Attempt` với grammar đích của câu. |

---

## 11. EDGE CASES

| Tình huống | Xử lý |
|---|---|
| Kho câu cạn sau hard filter | Trả về ít hơn `count` + `shortfall`. **Không** nới H1–H8. `SessionEngine` lấp bằng mẫu cùng family và ghi WARN cho `/analytics`. |
| Chỉ còn đúng câu đã làm sai hôm qua | Được phép (ngoại lệ H5). Ghi `SAME_SESSION_REPEAT` nếu trùng ngày. |
| Người học không chọn `confidence` | `confidence` là **bắt buộc**, 3 nút hiện cùng lúc với đáp án (`arch §11`), không chọn sẵn. Không chọn → không nộp được câu. Ngoại lệ: `MOCK` ghi mặc định `UNSURE` để không làm chậm bài thi; ghi cờ `PROPOSED` `confidenceImputed = true`. |
| Hết giờ giữa `SENTENCE_BUILD` chưa xếp xong | `Response.NONE`, `score = 0`, `outcome = TIMEOUT`. Không chấm phần đã xếp. |
| Distractor thiếu `whyWrongVi` | Không xảy ra — validator chặn build (`grammar-schema.md V2`). Nếu vẫn xảy ra lúc chạy (content import): câu bị hard filter loại, ghi lỗi. |
| Người học bấm hai lần rất nhanh | `responseTimeMs` cực nhỏ → `SUSPICIOUSLY_FAST`. Nếu mastery thấp → **không** gán `CARELESS_ERROR` (§6.7 luật 4 cần mastery ≥ COMPARABLE). |
| `personalMedianRtMs = null` (lần đầu) | Không gán `TOO_SLOW`. So với `targetTimeMs × 2.5` thay thế và ghi cờ mềm, không vào mastery. |
| `TRAP_ID` trên câu không có trap | Hard filter loại từ đầu. |
| Mock bị đóng app giữa chừng | Lưu tiến độ + thời gian còn lại. Mở lại → tiếp tục đúng chỗ. Nếu quá 24h → huỷ bài, ghi `ABANDONED`, **không** tính điểm nhưng **vẫn** giữ các `Attempt` đã ghi. |
| Hai grammar trong `targetGrammarIds` | `Attempt.grammarId` = grammar của **đáp án đúng**. Grammar còn lại vào `confusedWith` khi chọn sai. |

---

## 12. EXAMPLES

### 12.1 Sai + CONFIDENT vào mẫu đã từng nhầm

```
input:  question q-ni-itatte-cloze-01, chọn "b" (に至っては), 9.2s, CONFIDENT
        ctx: masteryState = COMPARABLE, personalMedianRt = 24000,
             knownConfusionPartners = ['ni-itatte-wa']

output: isCorrect        = false
        outcome          = INCORRECT_MISCONCEPTION      ← xét trước KNOWN_CONFUSION
        flags            = ['MISCONCEPTION', 'KNOWN_CONFUSION', 'TRAP_HIT']
        errorTypeAuto    = SIMILAR_GRAMMAR_CONFUSION    ← từ choice.wrongBecause
        confusedWith     = 'ni-itatte-wa'
        violatedAxis     = 'MEANING'
        needsSelfReport  = false
        score            = 0
```
Hệ quả dây chuyền: `MasteryEngine` → sai lần 2 với cùng `confusedWith` trong 14 ngày → `CONFUSED`.
`ReviewEngine` → `confusionPressure` tăng. `AnalyticsEngine` → dòng cờ đỏ trong `/mistakes`.

### 12.2 Đúng + GUESS

```
outcome = CORRECT_GUESS
flags   = ['LUCKY']
→ MasteryEngine: KHÔNG thăng cấp, set SHAKY nếu state ≥ RECOGNIZED   (CLAUDE.md §12)
→ ReviewEngine : interval = 1 ngày                                    (CLAUDE.md §14.2)
```

### 12.3 `SENTENCE_BUILD` đúng ô ★ nhưng sai thứ tự tổng

```
score   = 1, isCorrect = true
flags   = []          ← KHÔNG có FULL_ORDER_CORRECT
→ đúng theo chuẩn đề thật; cờ thiếu chỉ dùng cho chẩn đoán, không trừ điểm.
```

### 12.4 Hết giờ trong mock

```
outcome        = TIMEOUT
errorTypeAuto  = TIME_PRESSURE_ERROR
confidence     = GUESS (ghi mặc định), confidenceImputed = true
feedback       = mọi trường null cho tới khi nộp bài
```

---

## 13. ACCEPTANCE CRITERIA

- [ ] `grade` có test cho **cả 8** `GradeOutcome`, mỗi mã ≥ 1 case.
- [ ] Test P1–P6 (§7.3) pass. P4 kiểm bằng lint rule trên `src/ui/**`.
- [ ] Test: `delivery = MOCK` → `FeedbackPayload` toàn `null` với cả 8 outcome.
- [ ] Test: `SENTENCE_BUILD` chấm theo ô ★ — case "đúng ★ sai thứ tự" ra `isCorrect = true`.
- [ ] Test: `CARELESS_ERROR` **không** được gán khi `masteryState < COMPARABLE`.
- [ ] Test: `TIME_PRESSURE_ERROR` **không** được gán khi `delivery ∈ {STUDY, PRACTICE}`.
- [ ] Test: `pickQuestions` không bao giờ trả câu `DRAFT`, câu đã gặp hôm nay, hay câu trong cooldown 7 ngày (trừ ngoại lệ "đã sai").
- [ ] Test: `pickQuestions` deterministic với cùng `seed`.
- [ ] Test: `TRIAGE` → không câu nào có toàn grammar `LOW`.
- [ ] Test: `buildMinimalPair` trả `null` khi hai grammar không có cạnh trong graph.
- [ ] Test: kết quả `buildMinimalPair` tự động luôn mang `NEEDS_REVIEW`.
- [ ] Test: mock đúng cấu trúc 10/5/5, tổng `targetTimeMs` ≈ 20 phút (±10%).
- [ ] Test: `normalizeForGrading` **không** gộp カタカナ/ひらがな (case `かった` vs `カッタ` → khác nhau).
- [ ] Lint: `src/ui/**` không import `engines/**` (`arch §3`).

---

## 14. FILE NÀY **KHÔNG** CHỊU TRÁCH NHIỆM

| Chủ đề | Xem file |
|---|---|
| Hình dạng `Question`, `Choice`, `TrapAnnotation`, validator content | `grammar-schema.md` |
| Mastery, session, phân bổ thời gian, micro lesson | `learning-engine.md` |
| Khi nào gặp lại, `priority`, interval | `review-engine.md` |
| Ma trận nhầm lẫn, weakness profile, ERS, khuyến nghị | `analytics-engine.md` |
