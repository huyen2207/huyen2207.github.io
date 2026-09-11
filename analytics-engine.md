# analytics-engine.md — LỖI · ĐIỂM YẾU · SẴN SÀNG THI

> Đọc sau `CLAUDE.md` và `project-architecture.md`. Khi mâu thuẫn: `CLAUDE.md` > `project-architecture.md` > file này.
> Quy ước nhãn trường: `grammar-schema.md §2`.

---

## 1. PURPOSE

Biến **lịch sử trả lời** thành **kết luận có thể hành động**.

Một dòng phân biệt file này với bốn file kia:

> Bốn engine kia hỏi *"làm gì tiếp theo?"*. File này hỏi *"chuyện gì đang xảy ra, và vì sao?"*.

Bốn sản phẩm đầu ra:

| Sản phẩm | Người tiêu thụ |
|---|---|
| `WeaknessProfile` | `AdaptationEngine`, `ReviewEngine`, `SessionEngine` — **đầu vào bắt buộc** (`CLAUDE.md §9.3`) |
| `ConfusionMatrix` + `NotebookLineVi[]` | `/mistakes`, `/grammar-map`, Compare Lab |
| `DashboardMetrics` + `ReadinessSnapshot` | `/analytics` |
| `WeeklyCheckpoint`, `PhaseTransitionSummary` | `/analytics`, màn hình chuyển phase |

Ràng buộc phủ định quan trọng nhất (`CLAUDE.md §24`): **cấm hiển thị "50% complete"**. Mọi chỉ số phải kèm **một hành động**. Chỉ số không hành động được thì không hiển thị.

---

## 2. DEFINITIONS

| Thuật ngữ | Nghĩa |
|---|---|
| **Error memory** | Bản ghi một lần sai, đã được phân loại và có thể tái phát. §3 |
| **Recurrence** | Cùng một lỗi (cùng grammar + cùng errorType, hoặc cùng cặp confusion) lặp lại. |
| **Confusion pair** | Cặp có hướng `(đúng, đã chọn nhầm)`. `(A→B)` **khác** `(B→A)`. |
| **Weakness profile** | Ảnh chụp điểm yếu trong cửa sổ 14 ngày, có suy giảm theo thời gian. |
| **ERS** | Exam Readiness Score — `CLAUDE.md §23`. **Không** phải xác suất đậu. |
| **Checkpoint** | Ảnh chụp được **lưu lại** mỗi 7 ngày học, để so sánh xu hướng (`CLAUDE.md §21`). |

Cửa sổ mặc định: **14 ngày**, trọng số suy giảm `w = 0.5^(daysAgo / 7)` (`arch §7.7`). Ngoại lệ ghi rõ tại chỗ.

---

## 3. ERROR MEMORY

### 3.1 Nguồn dữ liệu

`Attempt` (immutable, append-only, `arch §4.4`) là **nguồn sự thật duy nhất**. `ErrorRecord` là **chỉ mục dẫn xuất** — được tính lại từ attempts, không phải nơi lưu sự thật.

```ts
interface ErrorRecord {              // PROPOSED — DERIVED, tính lại được từ attempts
  errorId: string;                   // = attemptId của lần sai đầu tiên trong nhóm
  attemptIds: string[];              // mọi lần sai thuộc cùng pattern này
  questionIds: string[];
  grammarIds: string[];
  selectedChoice: string;            // của lần gần nhất
  correctChoice: string;
  errorType: ErrorType;
  confusedWithGrammarId: string | null;
  confidence: Confidence;            // của lần gần nhất
  responseTimeMs: number;            // median các lần
  firstOccurredAt: string;
  lastOccurredAt: string;
  recurrenceCount: number;           // = attemptIds.length
  resolved: boolean;                 // §3.3
  pinned: boolean;                   // người học ghim (arch §9 /mistakes)
}
```

### 3.2 Gom nhóm (grouping key)

```
groupKey =
   errorType == SIMILAR_GRAMMAR_CONFUSION
       ? `conf:${grammarId}→${confusedWith}`      // gom theo CẶP, không theo câu hỏi
       : `type:${grammarId}:${errorType}`         // gom theo (mẫu, loại lỗi)
```
Không gom theo `questionId`. Sai cùng một kiểu ở ba câu khác nhau là **một** vấn đề, không phải ba. Đây là điều khiến `/mistakes` khác một cái log (`CLAUDE.md §10`).

### 3.3 `resolved`

```
resolved = true  ⇔  từ lastOccurredAt tới nay:
                       ≥ RESOLVE_STREAK (=3) attempt đúng trên cùng grammar
                    ∧ ≥ 1 trong số đó cách lần sai cuối ≥ 3 ngày
                    ∧ với lỗi confusion: ≥ 1 lần đúng trên chính câu đối chọi cặp đó
```
`resolved` **không** xoá bản ghi. Nó chuyển sang mục "đã khắc phục" — người học cần thấy mình đã sửa được gì (`CLAUDE.md §14.5`: FINAL_7 hiển thị "những gì bạn đã vững").

Tái phát sau khi `resolved`: `resolved = false`, `recurrenceCount++`, và gắn cờ `RELAPSE` — đây là tín hiệu mạnh hơn lỗi mới.

---

## 4. WEAKNESS PROFILE

### 4.1 Hình dạng (`CLAUDE.md §9.3` chốt 8 trường; các trường thêm đánh dấu `PROPOSED`)

```ts
interface WeaknessProfile {
  // ── CLAUDE.md §9.3 — LOCKED ──
  errorTypeDistribution: Record<ErrorType, number>;   // tỉ lệ, tổng = 1
  topConfusionPairs: ConfusionPair[];                 // sắp giảm dần, ≤ 10
  weakFamilies: FamilyScore[];
  slowQuestionTypes: SlowType[];
  guessRate: number;
  accuracyByPhaseSkill: Record<SkillDimension, number>;
  reviewDebt: number;

  // ── PROPOSED ──
  misconceptionItems: string[];      // grammarId có sai + CONFIDENT trong 14 ngày — cờ đỏ
  relapseItems: string[];            // lỗi đã resolved rồi tái phát
  trapDistribution: Record<TrapType, number>;
  calibration: number;               // 0..1, learning-engine.md §4.5
  bottleneckDimension: SkillDimension;
  windowDays: number;                // 14, hoặc ngắn hơn khi gần thi
  computedAt: string;
}

interface ConfusionPair { from: string; to: string; count: number; weighted: number; lastAt: string; }
interface FamilyScore   { family: GrammarFamily; accuracy: number; n: number; evidence: EvidenceLevel; }
interface SlowType      { type: QuestionType; medianMs: number; targetMs: number; ratio: number; }
```

### 4.2 Tính

```
buildWeaknessProfile(attempts, mastery, timeline, now):
  1. lọc attempts trong windowDays (14, hoặc max(7, daysRemaining) khi daysRemaining ≤ 21)
  2. gán trọng số w(a) = 0.5^(daysAgo/7)
  3. errorTypeDistribution = Σw(sai theo type) / Σw(mọi lần sai)
  4. topConfusionPairs: gom theo (grammarId, confusedWith); weighted = Σw
  5. weakFamilies: accuracy có giảm chấn (learning-engine.md §4.2) theo family; loại family evidence < OK
  6. slowQuestionTypes: median RT theo type / targetRT; giữ type có ratio > 1.15
  7. guessRate = Σw(confidence == GUESS) / Σw
  8. accuracyByPhaseSkill = accuracy theo question.testedSkill (KNOW/COMPARE/DETECT)
  9. reviewDebt = #(nextReviewAt < now)                        ← đọc từ mastery, không từ attempts
 10. misconceptionItems = grammarId có ≥ 1 attempt (sai ∧ CONFIDENT)
 11. calibration = learning-engine.md §4.5, tính trên toàn bộ attempts trong cửa sổ
```

`WeaknessProfile` là **đầu vào bắt buộc** của `AdaptationEngine` (`CLAUDE.md §9.3`): không có nó thì **không được sinh session**. Khi chưa đủ dữ liệu (ngày 1–2), trả profile rỗng hợp lệ với `evidence` thấp — không trả `null`, không ném lỗi.

### 4.3 Ánh xạ sang luật thích nghi

Bảng luật ở `CLAUDE.md §15` là **cứng**. `AnalyticsEngine` chỉ cung cấp vế trái; `AdaptationEngine` quyết định vế phải.

| Trường trong `WeaknessProfile` | Luật `CLAUDE.md §15` nó nuôi |
|---|---|
| `accuracyByPhaseSkill.KNOW` | `meaningAccuracy < 0.70` → +meaning recall, −50% COMPARE |
| `topConfusionPairs` | `confusionRate > 0.25` → compare drill top-3 cặp |
| `slowQuestionTypes` | `accuracy ≥ 0.85` ∧ `medianRT > 1.5×target` → +timed |
| `guessRate` | `> 0.30` → +active recall, **khoá** thăng `EXAM_READY` |
| `errorTypeDistribution.FORM_ERROR` | `> 0.20` → +drill 接続 |
| `errorTypeDistribution.CONTEXT_ERROR` | `> 0.20` → +`TEXT_GRAMMAR` |
| `reviewDebt` | `> 1.5 × capacity` → đóng băng LEARN |
| (ngày nghỉ, từ `timeline`) | ≥ 3 ngày → session "quay lại" |

> Luật `guessRate > 0.30` **khoá thăng `EXAM_READY`** là một luật của `MasteryEngine`, không phải chỉnh tỉ lệ block. Nó phải được cài ở `canPromoteToExamReady` như một điều kiện chặn toàn cục, và có test riêng.

---

## 5. CONFUSION MATRIX

### 5.1 Hình dạng

```ts
interface ConfusionMatrix {          // PROPOSED — DERIVED
  cells: ConfusionPair[];            // (from → to, count, weighted, lastAt)
  byGrammar: Record<string, { outgoing: ConfusionPair[]; incoming: ConfusionPair[] }>;
  symmetricPairs: Array<{ a: string; b: string; total: number }>;  // gộp hai chiều, để vẽ bản đồ
  computedAt: string;
}
```

**Có hướng.** `(A→B)` = "đáp án đúng là A, bạn chọn B". Đây **không** giống `(B→A)` và không được gộp khi chọn drill:

```
〜に至って → 〜に至っては   8 lần     "thấy に至 là chọn cái dài hơn"
〜に至っては → 〜に至って   1 lần
```
Hai chiều lệch nhau nói rằng người học có một **thiên lệch có hệ thống**, không phải "lẫn lộn chung chung". Compare drill phải nhắm đúng chiều nặng.

`symmetricPairs` chỉ dùng để **vẽ** confusion map ở màn hình chuyển phase (`CLAUDE.md §22`) và `/grammar-map`.

### 5.2 Sinh quan hệ `LEARNED`

```
deriveLearnedRelations(attempts): GrammarRelation[]         // arch §7.7

với mỗi cặp (from → to) có count ≥ LEARNED_EDGE_MIN (=2):
    { from, to, type: 'oftenConfusedWith', source: 'LEARNED', strength: weighted }
```

Luật:
- Ghi vào bảng `learnedRelations` (storage). **Không bao giờ** ghi vào `content/data/relations.json` (`grammar-schema.md G1`).
- Cạnh `LEARNED` **được phép** dùng để mở Compare Lab, kể cả khi không có cạnh `CURATED` — vì đó là bằng chứng thực nghiệm về chính người học, mạnh hơn phỏng đoán của biên tập viên.
- Nhưng: `ComparisonSet` trong content vẫn chỉ được ghép theo cạnh `CURATED` (`grammar-schema.md C1`). Với cặp chỉ có cạnh `LEARNED`, hệ thống sinh **ad-hoc compare drill** (`SessionEngine.buildAdHocDrill('CONFUSION_PAIR')`), không sinh `ComparisonSet` giả.
- Cạnh `LEARNED` mang `verificationStatus` ngầm là `NEEDS_REVIEW` — nội dung so sánh sinh từ nó không dùng làm bằng chứng `EXAM_READY`.

### 5.3 Dùng ở đâu

| Nơi dùng | Cách dùng |
|---|---|
| `ReviewEngine.confusionPressure` | `max(count)` của cặp liên quan (`review-engine.md §4.2`) |
| `AdaptationEngine` | top-3 cặp → compare drill (`CLAUDE.md §15`) |
| `/mistakes` | dòng "Bạn hay nhầm: A ↔ B (n lần / 14 ngày)" + nút "Luyện ngay" |
| Màn hình chuyển Phase 2 → 3 | confusion map (`CLAUDE.md §22`) |
| `ExerciseEngine.selectionScore` | `confusionTargeting` (`exercise-engine.md §3.3`) |

---

## 6. ミスノート — `/mistakes`

`CLAUDE.md §10`: **không** phải log thô. Phải là câu tiếng Việt đọc được, mỗi dòng có nút "Luyện ngay".

```ts
summarizeForNotebook(profile, matrix, mastery): NotebookLineVi[]    // arch §7.7

interface NotebookLineVi {           // PROPOSED
  id: string;
  kind: 'CONFUSION' | 'ERROR_TYPE' | 'NUANCE' | 'SPEED' | 'MISCONCEPTION' | 'RELAPSE' | 'RESOLVED';
  severity: 1 | 2 | 3;               // 3 = cờ đỏ
  messageKey: string;                // khoá i18n — KHÔNG phải chuỗi tiếng Việt (CLAUDE.md §26)
  params: Record<string, string | number>;
  drill: { kind: 'CONFUSION_PAIR' | 'ERROR_TYPE' | 'FAMILY' | 'SPEED'; payload: unknown };
  pinned: boolean;
}
```

Bảy dòng bắt buộc sinh được (khi có dữ liệu):

| kind | Mẫu câu (render từ i18n) | Điều kiện | drill |
|---|---|---|---|
| `MISCONCEPTION` | "Bạn **chắc chắn** nhưng sai ở 〜ならでは — 3 câu" | sai + CONFIDENT ≥ 1 | `ERROR_TYPE` |
| `CONFUSION` | "Bạn hay nhầm: 〜ならでは ↔ 〜なりに (7 lần / 14 ngày)" | pair.count ≥ 2 | `CONFUSION_PAIR` |
| `ERROR_TYPE` | "Bạn thường sai: ràng buộc (CONSTRAINT) — 32% tổng số lỗi" | tỉ lệ ≥ 0.20 | `ERROR_TYPE` |
| `NUANCE` | "Bạn biết nghĩa nhưng chọn sai vì sắc thái: 18 câu" | NUANCE_ERROR ≥ 5 | `ERROR_TYPE` |
| `SPEED` | "Bạn mất nhiều thời gian ở 文の組み立て: median 71s (mục tiêu 60s)" | ratio > 1.15 | `SPEED` |
| `RELAPSE` | "Lỗi này bạn từng sửa được rồi lại sai: 〜きらいがある" | resolved → sai lại | `ERROR_TYPE` |
| `RESOLVED` | "Bạn đã sửa được 6 lỗi trong tuần này" | resolved trong 7 ngày | — |

Luật hiển thị:
- Sắp theo `severity` giảm dần, rồi `weighted` giảm dần. `MISCONCEPTION` luôn ở trên cùng (`CLAUDE.md §12`).
- Dòng `pinned` (người học ghim) luôn hiện, bất kể xếp hạng.
- Tối đa **7 dòng** trên màn hình đầu. Nhiều hơn = quay lại thành log.
- Dòng `RESOLVED` là dòng duy nhất không có nút "Luyện ngay" — nó tồn tại để giữ tinh thần, đặc biệt ở `FINAL_7`.
- **Cấm** hiển thị bảng thô "câu 12 sai, câu 15 sai".

---

## 7. DASHBOARD METRICS

### 7.1 `computeMetrics` — 11 mục bắt buộc (`CLAUDE.md §24`)

```ts
interface DashboardMetrics {         // mở rộng arch §7.9
  daysRemaining: number;
  currentPhase: Phase;
  mode: StudyMode;
  coverage: number;
  recognitionAccuracy: number;
  comparisonAccuracy: number;
  trapAccuracy: number;
  averageResponseTimeMs: Record<QuestionType, number>;
  reviewBacklog: number;
  weakestFamilies: FamilyScore[];
  strongestFamilies: FamilyScore[];
  readiness: ReadinessSnapshot | null;   // null khi coverage < 0.20

  // PROPOSED — bổ sung, mỗi mục đều có hành động kèm theo
  timedAccuracy: number;
  retention: number;
  speedTrend: TrendPoint[];
  accuracyByQuestionType: Record<QuestionType, number>;
  calibration: number;
  recurringErrorCount: number;
  contentGaps: string[];               // grammar có < 2 câu hỏi (grammar-schema V11)
  coverageAudit: CoverageAudit;        // từ ReviewEngine §6.3
}
```

### 7.2 Công thức chỉ số — **chép `arch §7.9`, không diễn giải lại**

| Chỉ số | Công thức | Cửa sổ |
|---|---|---|
| `coverage` | `#(mastery ≥ RECOGNIZED ∧ ∈ requiredGrammarIds) / coverageTarget` | — |
| `retention` | tỉ lệ đúng ở lần review **sau khoảng nghỉ ≥ 3 ngày** | 21 ngày |
| `comparisonAccuracy` | accuracy của `MINIMAL_PAIR` + `WHY_NOT_OTHER` | 14 ngày |
| `trapDetection` | accuracy câu **có** `trap`, cộng accuracy `TRAP_ID` | 14 ngày |
| `timedAccuracy` | accuracy của `Attempt.isTimed = true` | 14 ngày |
| `speedIndex` | `clamp(targetRT / medianRT, 0, 1)`, bình quân theo question type | 14 ngày |
| `recentStability` | `1 − stdev(accuracy theo ngày)` | 7 ngày |
| `reviewBacklog` | `#(nextReviewAt < now)` | — |
| `recognitionAccuracy` | accuracy của `MEANING_MC` + `FORM_MC` | 14 ngày |

Mọi accuracy dùng **giảm chấn** (`learning-engine.md §4.2`). Không có ngoại lệ.

### 7.3 Luật "mỗi chỉ số kèm một hành động" (`CLAUDE.md §24`)

```ts
interface MetricCard {               // PROPOSED
  metricKey: string;
  value: number | null;
  evidence: EvidenceLevel;
  trend: 'UP' | 'DOWN' | 'FLAT' | 'NEW';
  action: { labelKey: string; drill: DrillSpec } | null;
}
```
Nếu `action = null` ⇒ **không render card đó**. Đây là luật kiểm được bằng test, không phải lời khuyên.

Ví dụ ánh xạ:

| Chỉ số | Hành động |
|---|---|
| `comparisonAccuracy` thấp | "Luyện 5 phút: 3 cặp bạn hay nhầm" → `CONFUSION_PAIR` |
| `speedIndex` thấp | "Rapid review 5 phút" → `SPEED` |
| `reviewBacklog` cao | "Dọn 10 mẫu quá hạn" → `REVIEW_TOP` |
| `trapDetection` thấp | "Trap Lab 5 câu, bẫy bạn hay sập" → `TRAP_TYPE` |
| `coverage` thấp | "Học 3 mẫu mới" → `LEARN` |
| `calibration` thấp | "5 câu: đoán ít lại, chọn 'không chắc' thật lòng" → `CALIBRATION` |
| `daysRemaining` | *không có hành động* → hiển thị như **ngữ cảnh**, không phải card chỉ số |

---

## 8. EXAM READINESS SCORE

### 8.1 Công thức — **chép nguyên `CLAUDE.md §23`**

```
ERS = ( 0.25 · coverage
      + 0.20 · retention
      + 0.20 · comparisonAccuracy
      + 0.15 · trapDetection
      + 0.10 · timedAccuracy
      + 0.10 · speedIndex
      ) · stabilityFactor

stabilityFactor = clamp(recentStability, 0.85, 1.00)
```

> Prompt liệt kê **7** điểm thành phần (kể cả `StabilityScore`). `CLAUDE.md §23` dùng **6** thành phần có trọng số **× 1** hệ số ổn định. Hai cách nói cùng một thứ; công thức chốt là của `CLAUDE.md`. `stabilityFactor` là **hệ số nhân**, không phải số hạng thứ 7 — nó không thể "bù" cho thành phần khác, nó chỉ **trừng phạt** sự thất thường. Đó là hành vi đúng.

### 8.2 Thang & luật hiển thị

| ERS | Nhãn |
|---|---|
| `< 40` | Cần báo động |
| `40–59` | Đang xây |
| `60–74` | Đúng lộ trình |
| `75–89` | Vững |
| `90+` | Sẵn sàng thi |

Luật **không thương lượng** (`CLAUDE.md §23`):

| # | Luật |
|---|---|
| E1 | ERS chỉ tính khi `coverage ≥ 0.20`. Trước đó trả `null`, UI hiện "chưa đủ dữ liệu". |
| E2 | **Không bao giờ** là một con số đơn lẻ trên UI — luôn hiển thị kèm **6 thành phần con**. |
| E3 | Luôn kèm dòng: *"Chỉ số này đo mức độ sẵn sàng của bạn với dạng bài 文法, không phải xác suất đậu."* |
| E4 | **Cấm** mọi từ ngữ dạng "xác suất đậu", "%", "khả năng qua". Kiểm bằng lint trên `i18n/vi.ts`. |
| E5 | Snapshot lưu mỗi ngày (`readiness` table) để vẽ xu hướng — không tính lại quá khứ. |

### 8.3 `ReadinessSnapshot`

```ts
interface ReadinessSnapshot {
  date: string;
  ers: number | null;
  band: 'ALERT'|'BUILDING'|'ON_TRACK'|'SOLID'|'READY' | null;
  components: {                       // BẮT BUỘC — E2
    coverage: number; retention: number; comparisonAccuracy: number;
    trapDetection: number; timedAccuracy: number; speedIndex: number;
  };
  stabilityFactor: number;
  weakestComponent: keyof ReadinessSnapshot['components'];   // PROPOSED — để sinh hành động
  evidence: EvidenceLevel;
}
```
`weakestComponent` là thứ biến ERS từ một con số thành một câu: *"Điểm kéo bạn xuống nhiều nhất là khả năng phân biệt mẫu gần nghĩa."*

---

## 9. KHUYẾN NGHỊ

`CLAUDE.md §24` + yêu cầu §24 của prompt: khuyến nghị phải **hành động được**, không được là "cần cố gắng thêm".

```ts
interface Recommendation {           // PROPOSED
  id: string;
  priority: 1 | 2 | 3;
  targetKey: string;                 // i18n
  targetParams: { grammarIds?: string[]; pair?: [string,string]; type?: QuestionType };
  reasonKey: string;                 // i18n — BẮT BUỘC, không có lý do thì không khuyến nghị
  reasonParams: Record<string, string | number>;
  drill: DrillSpec;
  estimatedMinutes: number;
}
```

Luật sinh:

| # | Luật |
|---|---|
| N1 | Mọi khuyến nghị phải nêu **mẫu cụ thể** hoặc **cặp cụ thể**. Cấm khuyến nghị chung chung. |
| N2 | Mọi khuyến nghị phải có `reasonKey` dẫn ra **số liệu quan sát được**. |
| N3 | Tối đa **3** khuyến nghị/ngày (khớp trần 3 adaptation, `arch §7.8`). |
| N4 | Có `estimatedMinutes` — người học phải biết mình đang đồng ý với cái gì. |
| N5 | Khuyến nghị bị bỏ qua 3 lần liên tiếp → hạ `priority`, đổi cách diễn đạt, không lặp y nguyên. |

Ví dụ đầu ra (render):

```
Ngày mai ưu tiên:
   〜にして  vs  〜にあって  vs  〜とあって
Lý do:
   Bạn đã nhầm nhóm này 4 lần trong 7 ngày; 3/4 lần chọn 〜にあって.
Thời lượng: 6 phút.                                   [Luyện ngay]
```

Đối chiếu với dạng **bị cấm**: "Bạn cần cố gắng học thêm ngữ pháp." — không có mẫu, không có số liệu, không có thời lượng, không có nút.

---

## 10. WEEKLY CHECKPOINT & PHASE TRANSITION

### 10.1 `buildWeeklyCheckpoint` (`CLAUDE.md §21`)

Chạy khi `studyDayIndex % 7 == 0` (`arch §8.4`).

```ts
interface WeeklyCheckpoint {
  id: string; weekIndex: number; createdAt: string;
  grammarLearned: string[];  grammarWeak: string[];
  confusionPairs: ConfusionPair[];  errorDistribution: Record<ErrorType, number>;
  accuracy: number;  medianRtByType: Record<QuestionType, number>;
  reviewDebt: number;
  deltaVsPrev: {                      // PROPOSED — "so với tuần trước"
    accuracy: number; speed: number; coverage: number; confusionCount: number;
  } | null;
  planChanges: PlanChange[];          // PROPOSED — "tuần tới đổi gì, vì sao"
}
```

Luật:
- Checkpoint được **lưu**, không tính lại (`CLAUDE.md §21`) — để so sánh xu hướng trung thực kể cả khi công thức đổi.
- Sau khi dựng: gọi `RoadmapEngine.shouldReplan`; nếu replan → `planChanges` phải nói **đổi gì và vì sao** bằng câu người học đọc được.
- Tuần đầu: `deltaVsPrev = null`, UI hiện "tuần đầu tiên — chưa có mốc để so".

### 10.2 `buildPhaseTransitionSummary` (`CLAUDE.md §22`)

```
Cuối Phase 1 →  "Bạn đã biết X mẫu. Y mẫu còn shaky. Z mẫu cần ôn.
                 Từ mai cách học đổi: không còn học từng mẫu riêng lẻ."
Cuối Phase 2 →  như trên + CONFUSION MAP (symmetricPairs, ≤ 12 cặp nặng nhất)
```
Luật: chỉ hiện **một lần** (`meta.phaseTransitionSeen`), xem lại được ở `/analytics`, và **không reset dữ liệu gì cả**.

### 10.3 Chế độ hiển thị `FINAL_7` (`CLAUDE.md §14.5`)

> "Không hiển thị chỉ số gây hoảng loạn; hiển thị *những gì bạn đã vững*."

Cài đặt ở tầng `AnalyticsEngine`, không phải ở UI:

| Ẩn khi `mode = FINAL_7` | Hiện thay vào |
|---|---|
| `reviewBacklog` (số tuyệt đối) | "Hôm nay: N mẫu ưu tiên cao nhất" |
| `contentGaps`, `coverageAudit` cảnh báo đỏ | — (không còn hành động được nữa) |
| `coverage` nếu < 1.0 | `#EXAM_READY` + `#COMPARABLE` |
| ERS band `ALERT` | ERS + `weakestComponent` + 1 hành động 5 phút |
| Xu hướng đi xuống | Xu hướng 7 ngày của `timedAccuracy` (thứ vẫn cải thiện được trong 7 ngày) |

Đây là **lọc**, không phải bịa: không con số nào bị thay đổi, chỉ đổi cái được đưa lên trước. `/analytics` vẫn có mục "xem toàn bộ chỉ số" cho người học chủ động mở.

---

## 11. EDGE CASES

| Tình huống | Xử lý |
|---|---|
| Ngày 1, chưa có attempt nào | Mọi profile/metric trả cấu trúc **rỗng hợp lệ**, `evidence = NONE`, `readiness = null`. Không `null` toàn cục, không ném lỗi. `/analytics` hiện "bắt đầu học để có dữ liệu". |
| `coverage = 0.19` | ERS = `null` (E1). Hiện 6 thành phần con riêng lẻ — chúng vẫn hành động được. |
| `stdev` của 1 ngày | `recentStability = 1.0` (không có biến thiên để đo). Ghi `evidence = THIN` để UI không khoe "rất ổn định". |
| Chia cho 0 (`medianRT = 0`) | Không thể xảy ra vì `responseTimeMs ≥ 1`; vẫn phải guard, trả `speedIndex = 0` và ghi cảnh báo dev. |
| Mọi lỗi cùng một loại (n=3) | `errorTypeDistribution` = 100% cho loại đó, nhưng `evidence = THIN` ⇒ `/mistakes` **không** sinh dòng `ERROR_TYPE` (cần n ≥ 5). Tránh kết luận vội. |
| Confusion pair 1 lần | Không vào `topConfusionPairs` (ngưỡng ≥ 2) và không sinh cạnh `LEARNED`. Một lần là ngẫu nhiên. |
| Người học nghỉ 10 ngày | Cửa sổ 14 ngày chỉ còn 4 ngày dữ liệu → mọi `evidence` tụt. Profile **không** được coi 0 attempt là "accuracy = 0". |
| `calibration` không tính được (chỉ 1 bucket confidence) | Trả `null`, không trả `1.0`. Người luôn bấm `CONFIDENT` chưa chứng minh được là hiệu chuẩn tốt. |
| Attempt trên content `NEEDS_REVIEW` | **Có** tính vào metric hiển thị, **không** tính vào bằng chứng `EXAM_READY` (`CLAUDE.md §16.4`). Hai đường khác nhau, phải test riêng. |
| ERS giảm sau một ngày tệ | Bình thường. **Không** làm mượt, không giấu. Nhưng ở `FINAL_7` thì hiện xu hướng 7 ngày thay vì delta 1 ngày (§10.3). |
| `weakFamilies` rỗng vì mọi family đều `THIN` | Trả rỗng + `messageKey = 'not_enough_data'`. Cấm bịa ra family yếu nhất từ 2 câu. |

---

## 12. EXAMPLES

### 12.1 Weakness profile ngày 52

```
errorTypeDistribution:  SIMILAR_GRAMMAR_CONFUSION .41 | CONSTRAINT_ERROR .22
                        NUANCE_ERROR .16 | FORM_ERROR .11 | CONTEXT_ERROR .10
topConfusionPairs:      (ならでは → なりに, 7) (にして → にあって, 4) (に至って → に至っては, 3)
weakFamilies:           EVALUATION .58 (n=19, OK) | STANCE .61 (n=14, OK)
slowQuestionTypes:      SENTENCE_BUILD 71s / 60s (1.18)
guessRate:              .18
accuracyByPhaseSkill:   KNOW .88 | COMPARE .59 | DETECT .44
misconceptionItems:     ['narade-wa']
bottleneckDimension:    COMPARE
reviewDebt:             14
calibration:            .71
```

Kết luận `/mistakes` sinh ra (`CLAUDE.md §10` yêu cầu đúng giọng này):

```
🔴 Bạn CHẮC CHẮN nhưng sai ở 〜ならでは — 2 câu               [Luyện ngay]
   Bạn hay nhầm: 〜ならでは ↔ 〜なりに (7 lần / 14 ngày)      [Luyện ngay]
   Bạn không yếu nghĩa (88%). Bạn yếu phân biệt (59%).        [Luyện ngay]
   41% lỗi gần đây là nhầm mẫu gần nghĩa.                     [Luyện ngay]
   Bạn mất nhiều thời gian ở 文の組み立て: 71s (mục tiêu 60s) [Luyện ngay]
```

### 12.2 ERS ngày 52

```
components:  coverage .72 | retention .69 | comparisonAccuracy .59
             trapDetection .44 | timedAccuracy .51 | speedIndex .63
raw = .25(.72)+.20(.69)+.20(.59)+.15(.44)+.10(.51)+.10(.63)
    = .180+.138+.118+.066+.051+.063 = .616
recentStability = .91  →  stabilityFactor = .91
ERS = .616 × .91 = .561  →  56  →  band "Đang xây"
weakestComponent = trapDetection

Hiển thị:
   ERS 56 — Đang xây
   Chỉ số này đo mức độ sẵn sàng của bạn với dạng bài 文法, không phải xác suất đậu.
   Coverage 72 · Retention 69 · So sánh 59 · Bẫy 44 · Có giờ 51 · Tốc độ 63
   Kéo bạn xuống nhiều nhất: nhận diện bẫy.       [Trap Lab 5 phút]
```

### 12.3 Cùng dữ liệu đó nhưng `mode = FINAL_7`

```
   Bạn đã vững: 42 mẫu Exam Ready · 31 mẫu Comparable
   Hôm nay: 12 mẫu ưu tiên cao nhất                        ← thay vì "backlog 14"
   Có giờ: 51 → 58 trong 7 ngày ↑                          ← xu hướng còn cải thiện được
   Việc đáng làm nhất hôm nay: Trap Lab 5 phút             [Bắt đầu]
   (ẩn: cảnh báo coverage, contentGaps, delta ERS 1 ngày)
   [Xem toàn bộ chỉ số]
```

---

## 13. ACCEPTANCE CRITERIA

- [ ] Test ERS khớp `CLAUDE.md §23` từng chữ số với bộ dữ liệu ở §12.2 (`56`).
- [ ] Test E1: `coverage = 0.19` → `ers = null`, `band = null`.
- [ ] Test E2: `ReadinessSnapshot` luôn có đủ 6 `components`; không API nào trả ERS mà thiếu chúng.
- [ ] Test E4: grep `i18n/vi.ts` không chứa "xác suất", "đậu", "pass rate".
- [ ] Test: mọi `MetricCard` có `action = null` đều bị loại khỏi output (`CLAUDE.md §24`).
- [ ] Test: `buildWeaknessProfile` với 0 attempt → cấu trúc rỗng hợp lệ, không ném lỗi, `evidence = NONE`.
- [ ] Test: confusion pair có hướng — `(A→B, 8)` và `(B→A, 1)` **không** bị gộp trong `cells`.
- [ ] Test: `deriveLearnedRelations` không ghi vào `content/**` (kiểm bằng mock filesystem + lint).
- [ ] Test: attempt trên content `NEEDS_REVIEW` **có** vào metric, **không** vào bằng chứng `EXAM_READY`.
- [ ] Test: `summarizeForNotebook` sinh được cả 7 `kind` với dữ liệu tương ứng, và **không** sinh dòng nào khi `evidence = THIN` ở các kind cần n ≥ 5.
- [ ] Test: `mode = FINAL_7` → `reviewBacklog` và `coverageAudit` không có trong output mặc định.
- [ ] Test: `buildWeeklyCheckpoint` tuần 1 → `deltaVsPrev = null`, không crash.
- [ ] Test: khuyến nghị luôn có `reasonKey` + `targetParams` không rỗng (N1, N2).
- [ ] Test: `recentStability` với 1 ngày dữ liệu → `1.0` kèm `evidence = THIN`.
- [ ] Hiệu năng: `computeMetrics` trên 4.000 attempt < 50ms; nếu vượt → Web Worker (`arch §14`).

---

## 14. FILE NÀY **KHÔNG** CHỊU TRÁCH NHIỆM

| Chủ đề | Xem file |
|---|---|
| `MasteryState`, ba chiều KNOW/COMPARE/DETECT của **một** mẫu, session | `learning-engine.md` |
| `priority`, `nextReviewAt`, audit coverage (file này chỉ **hiển thị** kết quả) | `review-engine.md` |
| Chấm bài, `GradeResult`, `DeliveryMode` | `exercise-engine.md` |
| Hình dạng `Grammar`/`Question`, validator, `verificationStatus` | `grammar-schema.md` |
