# review-engine.md — ƯU TIÊN & LỊCH ÔN HƯỚNG KỲ THI

> Đọc sau `CLAUDE.md` và `project-architecture.md`. Khi mâu thuẫn: `CLAUDE.md` > `project-architecture.md` > file này.
> Quy ước nhãn trường: `grammar-schema.md §2`.

---

## 1. PURPOSE

Trả lời đúng hai câu hỏi:

1. **Cái gì đáng ôn nhất bây giờ?** → `computePriority` (§4)
2. **Khi nào gặp lại nó?** → `computeNextReview` (§5)

Cộng thêm một nghĩa vụ không được quên:

3. **Kế hoạch ôn có kịp trước ngày thi không?** → `auditExamCoverage` (§7)

Đây **không** phải SM-2. SM-2 tối ưu trí nhớ dài hạn vô hạn. Ở đây có một **deadline cứng** và mọi thứ sau `examDate` là vô nghĩa (ADR #3, `arch §16`).

Câu hỏi phân biệt trách nhiệm:

| Câu hỏi | File |
|---|---|
| Ôn **cái gì**, ôn **khi nào** | file này |
| Ôn **bằng câu hỏi nào** | `exercise-engine.md` |
| Ôn trong **block nào, bao nhiêu phút** | `learning-engine.md` |
| **Vì sao** yếu chỗ đó | `analytics-engine.md` |

---

## 2. DEFINITIONS

| Thuật ngữ | Nghĩa |
|---|---|
| **Due** | `mastery.nextReviewAt < now`. |
| **Backlog** | Số item due. Là **con số hiển thị**, không phải nợ phải trả hết trong ngày. |
| **Capacity** | Số item block `REVIEW` chứa được hôm nay (`learning-engine.md §8.5`). |
| **Interval** | Khoảng cách (ngày) tới lần gặp kế tiếp. |
| **Compression** | Nén interval khi gần ngày thi (`CLAUDE.md §14.3`). |
| **Lapse** | Một item ≥ `RECOGNIZED` trả lời sai. |
| **Rapid review** | Ôn chỉ-nhận-diện, ≤ 10s/câu, dùng ở Phase 3 (`arch §9 /review`). |

---

## 3. CHỮ KÝ (đã chốt `arch §7.4`)

```ts
computePriority(mastery, ctx: PriorityContext): number          // 0..~1.6
computeNextReview(mastery, attempt, timeline): string           // ISO
selectDueItems(allMastery, ctx, capacity): ScoredItem[]
auditExamCoverage(allMastery, timeline): CoverageAudit
```

```ts
interface PriorityContext {          // PROPOSED — làm rõ hình dạng ctx
  timeline: Timeline;
  weakness: WeaknessProfile;         // từ analytics-engine.md §4
  now: Date;
  seenTodayGrammarIds: string[];
  personalMedianRtByType: Record<QuestionType, number>;
}

interface ScoredItem {               // PROPOSED
  grammarId: string;
  priority: number;
  reasonsVi: string[];               // BẮT BUỘC — arch §9 /review đòi hiển thị lý do
  suggestedDelivery: DeliveryMode;   // §8
}
```

Pure. `now` là tham số. Không I/O, không `Date.now()`.

---

## 4. PRIORITY

### 4.1 Công thức — **chép nguyên `CLAUDE.md §14.1`, không được đổi trọng số**

```
priority =
    0.25 · stateWeight
  + 0.20 · errorPressure
  + 0.15 · confusionPressure
  + 0.15 · decay
  + 0.10 · speedPenalty
  + 0.10 · guessPenalty
  + 0.05 · examFrequencyWeight
  − 0.10 · recencyPenalty

priority *= phaseFit
```

### 4.2 Định nghĩa từng thành phần (mọi thành phần ∈ [0,1] trừ khi ghi khác)

| Thành phần | Công thức | Ghi chú |
|---|---|---|
| `stateWeight` | bảng §4.3 | `CLAUDE.md §14.1` chốt sẵn giá trị |
| `errorPressure` | `clamp( Σ w(a)·[a sai] / ERROR_SATURATION , 0, 1)`, `w(a) = 0.5^(daysAgo/7)`, `ERROR_SATURATION = 3` | "mistakeCount chuẩn hoá + trọng số lỗi gần đây" |
| `confusionPressure` | `clamp( max(confusedWith[*]) / CONFUSION_SATURATION , 0, 1)`, `= 6` | Lấy **max** của cặp nặng nhất, không lấy tổng — một cặp nhầm 6 lần nguy hiểm hơn 6 cặp nhầm 1 lần |
| `decay` | `clamp( daysSince(lastReviewedAt) / staleThreshold , 0, 1)` | **Cắt tại 1.0** (`CLAUDE.md §14.1`) — nghỉ 60 ngày không nguy hơn nghỉ 10 ngày |
| `speedPenalty` | `clamp( medianRT/targetRT − 1 , 0, 1)` | `targetRT` theo `CLAUDE.md §13`, theo phase hiện tại |
| `guessPenalty` | `tỉ lệ (GUESS + 0.5·UNSURE) trong 6 attempt gần nhất` | `UNSURE` nặng bằng nửa `GUESS` |
| `examFrequencyWeight` | `HIGH 1.0 · MEDIUM 0.6 · LOW 0.2` | `CLAUDE.md §14.1` |
| `recencyPenalty` | `1` nếu `grammarId ∈ ctx.seenTodayGrammarIds`, ngược lại `0` | Trừ `0.10` — tránh lặp trong cùng ngày |

`staleThreshold` (`CLAUDE.md §5.3`): `PHASE_1: 10 · PHASE_2: 7 · PHASE_3: 4 · FINAL_14/FINAL_7: 3`.

### 4.3 `stateWeight` (`CLAUDE.md §14.1`)

| State | Weight | Ghi chú |
|---|---|---|
| `UNSEEN` | 0.0 | `LEARN` lo, không phải `REVIEW` |
| `INTRODUCED` | 0.6 | |
| `RECOGNIZED` | 0.5 | |
| `SHAKY` | 0.9 | |
| `CONFUSED` | 1.0 | cao nhất |
| `COMPARABLE` | 0.3 | |
| `EXAM_READY` | 0.1 | |

> `INTRODUCED (0.6) > RECOGNIZED (0.5)` là **cố ý**, không phải lỗi đánh máy trong `CLAUDE.md`: mẫu vừa gặp một lần dễ rơi hơn mẫu đã chứng minh nhận diện được.

### 4.4 `phaseFit` (`CLAUDE.md §14.1`)

```
phaseFit = 1.0 (mặc định)
× 1.3   nếu phase = PHASE_1_KNOW    và state < RECOGNIZED
× 1.4   nếu phase = PHASE_2_COMPARE và state = CONFUSED
× 1.4   nếu phase = PHASE_3_DETECT  và có trapHistory        // đã từng sập bẫy ≥ 1 lần
```
Các hệ số **không** nhân dồn với nhau: chỉ áp hệ số của phase hiện tại. Trần `phaseFit ≤ 1.4`.

### 4.5 Tái cân bằng khi gần thi (`CLAUDE.md §14.4`)

Khi `daysUntilExam ≤ 21`, thay bộ trọng số:

| Thành phần | Bình thường | `daysUntilExam ≤ 21` |
|---|---|---|
| `stateWeight` | 0.25 | 0.25 |
| `errorPressure` | 0.20 | **0.25** |
| `confusionPressure` | 0.15 | **0.25** |
| `decay` | 0.15 | **0.05** |
| `trapPressure` | — | **0.20** ← thành phần mới, chỉ tồn tại ở chế độ này |
| `speedPenalty` | 0.10 | 0.10 |
| `guessPenalty` | 0.10 | 0.10 |
| `examFrequencyWeight` | 0.05 | 0.05 |
| `recencyPenalty` | −0.10 | −0.10 |

```
trapPressure = clamp( số lần sập bẫy 14 ngày / TRAP_SATURATION (=3) , 0, 1 )
```

Tổng trọng số dương ở chế độ gần thi = 1.20; **không** chuẩn hoá về 1.0 — `priority` là thang so sánh tương đối, chỉ cần nhất quán trong cùng một lần xếp hạng. Nhưng **cấm** so sánh `priority` giữa hai chế độ khác nhau (ví dụ vẽ biểu đồ priority theo thời gian). Nếu cần biểu đồ → dùng thứ hạng, không dùng giá trị tuyệt đối.

Quy tắc bổ sung `CLAUDE.md §14.4`: grammar `EXAM_READY` **chỉ** xuất hiện trong **mixed set**, không được chiếm slot riêng trong `REVIEW` khi `daysUntilExam ≤ 21`.
Cài đặt: `selectDueItems` gắn `suggestedDelivery` và đánh dấu `mixedOnly = true`; `SessionEngine` không tạo block riêng cho chúng.

### 4.6 `reasonsVi` — bắt buộc

`/review` phải nói được **vì sao** một item lên đầu (`arch §9 /review`). Sinh từ thành phần đóng góp lớn nhất:

```
thành phần đóng góp = trọng số × giá trị
lấy top-2 thành phần, dịch sang câu tiếng Việt:

confusionPressure → "Bạn nhầm mẫu này với 〜に至っては 6 lần"
errorPressure     → "Bạn sai 4 lần trong 2 tuần"
decay             → "9 ngày chưa gặp lại"
speedPenalty      → "Bạn mất 71s, mục tiêu 35s"
guessPenalty      → "3/6 lần gần nhất bạn chọn 'đoán'"
stateWeight       → "Mẫu này đang ở trạng thái Shaky"
trapPressure      → "Bạn đã sập bẫy dạng này 3 lần"
```
Chuỗi hiển thị nằm ở `i18n/vi.ts` (`CLAUDE.md §26`), engine chỉ trả `ruleId` + tham số.

---

## 5. INTERVAL

### 5.1 Interval cơ sở (`CLAUDE.md §14.2` — chốt cứng)

| Tình huống | `baseInterval` (ngày) |
|---|---|
| Sai | gặp lại **cuối session hôm nay**, rồi **1** |
| Đúng + `GUESS` | 1 |
| Đúng + `UNSURE` | 2 |
| Đúng + `CONFIDENT`, state `RECOGNIZED` | 4 |
| Đúng + `CONFIDENT`, state `COMPARABLE` | 7 |
| Đúng + `CONFIDENT`, state `EXAM_READY` | 12 |
| Đúng + `CONFIDENT`, state `INTRODUCED` | 2 |
| Đúng, state `SHAKY` hoặc `CONFUSED` | 1 |

Hai dòng cuối là bổ sung cần thiết (`CLAUDE.md §14.2` không liệt kê `INTRODUCED`/`SHAKY`/`CONFUSED` + đúng + `CONFIDENT`) — chúng là suy luận trực tiếp từ tinh thần bảng, không nới lỏng điều gì. Xem `spec-consistency-check.md C-10`.

> "Gặp lại cuối session hôm nay" **không** phải một `nextReviewAt`. Nó do `SessionEngine` chèn item vào cuối `ANALYZE_ERROR` (`learning-engine.md §11`). `nextReviewAt` được đặt là `ngày mai`.

### 5.2 Nén theo ngày thi (`CLAUDE.md §14.3` — chốt cứng)

```
compressionFactor = 1.0   nếu daysUntilExam > 21
                  = 0.6   nếu 7 < daysUntilExam ≤ 21
                  = 0.4   nếu daysUntilExam ≤ 7

interval = min( baseInterval × compressionFactor,
                max(1, floor(daysUntilExam × 0.4)) )
```

Kiểm chứng bằng số (dùng làm test case):

| `daysUntilExam` | `baseInterval` | `× factor` | trần `floor(d×0.4)` | **interval** |
|---|---|---|---|---|
| 60 | 12 | 12.0 | 24 | **12** |
| 21 | 12 | 7.2 | 8 | **7** |
| 20 | 7 | 4.2 | 8 | **4** |
| 8 | 12 | 7.2 | 3 | **3** |
| 7 | 12 | 4.8 | 2 | **2** |
| 5 | 7 | 2.8 | 2 | **2** |
| 5 | 4 | 1.6 | 2 | **1** |
| 2 | 12 | 4.8 | 1 | **1** |
| 1 | 4 | 1.6 | 1 | **1** |

`interval` luôn ≥ 1 và luôn là số nguyên (`floor` sau khi nhân, sàn 1).

Yêu cầu ban đầu nói rõ: còn 8 ngày thì `nextReview = +14 days` là vô nghĩa. Bảng trên cho `daysUntilExam = 8, baseInterval = 12 → 3 ngày`. Đúng ý.

### 5.3 Đặt `nextReviewAt`

```
computeNextReview(mastery, attempt, timeline):
    base     = bảng §5.1
    interval = nén theo §5.2
    ngày mục tiêu = ngày học hiện tại + interval          // ngày học theo dayBoundaryHour
    nextReviewAt  = mốc dayBoundaryHour của ngày đó, ISO UTC

    nếu nextReviewAt > examDate:
        nextReviewAt = min(nextReviewAt, examDate − 1 ngày)     // §6 bảo đảm ≥ 2 lần
```

Không random hoá (không "fuzz"). Với một người học trong 90 ngày, tải mỗi ngày được `SessionEngine` điều tiết bằng `capacity`, không cần rải ngẫu nhiên.

---

## 6. BẢO ĐẢM "≥ 2 LẦN TRƯỚC NGÀY THI"

`CLAUDE.md §14.3`: **mọi item đã học phải được gặp lại ít nhất 2 lần trước ngày thi.**

### 6.1 Định nghĩa chính xác

> "Đã học" = `state ≥ INTRODUCED`.
> "Gặp lại" = một `Attempt` trên mẫu đó, ở bất kỳ block/delivery nào, sau lần học đầu tiên.
> Đếm là số lần gặp **đã lên lịch hoặc đã xảy ra** từ hôm nay tới `examDate − 1`.

### 6.2 Thuật toán bảo đảm

```
với mỗi item có state ≥ INTRODUCED:
    encountersRemaining = số ngày ∈ [today, examDate) mà item được lên lịch
    nếu encountersRemaining < 2:
        ép nextReviewAt = mốc sớm nhất còn trống, và
        đặt guaranteedSecondAt = examDate − max(1, floor(daysUntilExam × 0.25))
```

Hai lần này được đánh dấu `pinned = true` (`PROPOSED` trên `GrammarMastery`) và **không** bị `selectDueItems` cắt vì hết capacity — chúng chen lên đầu hàng đợi.

### 6.3 Khi bất khả thi

```
requiredSlots = 2 × #(state ≥ INTRODUCED)
availableSlots = Σ capacity(d) với d ∈ [today, examDate)

nếu requiredSlots > availableSlots  →  KHÔNG âm thầm bỏ luật
```

`auditExamCoverage` trả cảnh báo cho `/analytics` (`arch §7.4`):

```
{
  ok: false,
  atRisk: ['ni-itaru-made', 'to-aitte', ...],        // sắp theo priority tăng dần (yếu nhất được cứu trước)
  requiredSlots: 268, availableSlots: 210,
  messageVi: "Với 15 phút/ngày và 21 ngày còn lại, 58 mẫu sẽ không kịp ôn đủ 2 lần.
              Hai cách: tăng lên 25 phút/ngày, hoặc thu hẹp còn các mẫu tần suất cao."
}
```
Luật: engine **đưa ra lựa chọn**, không tự quyết. Thu hẹp phạm vi là quyết định của người học (`CLAUDE.md §4.1` — `TRIAGE_MODE` do `daysRemaining` quyết định, không do engine tự ý).

---

## 7. `selectDueItems`

```
selectDueItems(allMastery, ctx, capacity):
  1. pinned   = item có pinned = true và đến hạn ép (§6.2)          → LUÔN lấy trước
  2. pool     = item due (nextReviewAt < now) ∪ item isStale
                 ∪ item state = CONFUSED (bất kể due hay chưa)
  3. loại     = item state = UNSEEN                                 // LEARN lo
  4. score    = computePriority(item, ctx)  cho mỗi item trong pool
  5. sort     giảm dần theo priority
  6. đa dạng  ≤ ceil(capacity/2) item cùng một GrammarFamily
              ≤ ceil(capacity/3) item cùng một cặp confusion
  7. lấy      pinned ++ top(capacity − |pinned|)
  8. gắn      reasonsVi (§4.6) và suggestedDelivery (§8)
```

**Ràng buộc trần cứng:** `|kết quả| ≤ capacity`, luôn luôn, kể cả khi backlog = 300 (`learning-engine.md §12.1`). Backlog không bao giờ tràn vào session.

Item `CONFUSED` được đưa vào pool **kể cả khi chưa due**: trạng thái nhầm lẫn là thứ duy nhất mà chờ đợi làm cho tệ hơn — mỗi ngày trôi qua là một ngày nữa liên kết sai được củng cố.

---

## 8. `suggestedDelivery` — ôn kiểu gì

| Điều kiện | `DeliveryMode` | Lý do |
|---|---|---|
| `state = CONFUSED` | `STUDY` | Cần bảng so sánh + giải thích đầy đủ, không cần tốc độ |
| `state = SHAKY`, phase 1–2 | `PRACTICE` | Feedback từng câu |
| `phase = PHASE_3_DETECT`, `state ≥ COMPARABLE` | `TIMED` | Mục tiêu Phase 3 là accuracy ↑ **đồng thời** RT ↓ (`CLAUDE.md §13`) |
| `speedPenalty > 0.5` | `TIMED` | Chậm là vấn đề chính, phải luyện đúng cái đó |
| `mode = FINAL_7` | `TIMED` | Ổn định + tốc độ, không thêm kiến thức (`CLAUDE.md §14.5`) |
| còn lại | `PRACTICE` | |

**Rapid review** (`arch §9 /review`): `delivery = TIMED` với `targetTimeMs ≤ 10000`, chỉ dùng `MEANING_MC`/`FORM_MC`, chỉ ở Phase 3. Đây là một cấu hình của `TIMED`, không phải mode thứ 5.

---

## 9. BẤT BIẾN (phải có test)

| # | Bất biến |
|---|---|
| R1 | `interval ≥ 1` và là số nguyên, với mọi tổ hợp `(baseInterval, daysUntilExam)`. |
| R2 | `daysUntilExam ≤ 7` → `interval ≤ 2` với **mọi** state (`arch §13` kịch bản 6: `d = 5` → mọi interval ≤ 2). |
| R3 | `nextReviewAt < examDate` luôn đúng với item `state ≥ INTRODUCED`. |
| R4 | Sai → `interval = 1` (và có item gặp lại trong session hôm nay), bất kể state trước đó. |
| R5 | Đúng + `GUESS` → `interval = 1`, **không bao giờ** dài hơn đúng + `UNSURE`. |
| R6 | `|selectDueItems(...)| ≤ capacity`, luôn luôn. |
| R7 | `computePriority` là pure và deterministic. |
| R8 | `decay` bị cắt tại `1.0` — nghỉ 100 ngày và nghỉ 10 ngày cho cùng `decay` khi `staleThreshold = 10`. |
| R9 | Item `UNSEEN` không bao giờ xuất hiện trong `selectDueItems`. |
| R10 | Item `CONFUSED` luôn nằm trong pool, kể cả `nextReviewAt` ở tương lai. |
| R11 | `auditExamCoverage().ok = false` ⇒ `messageVi` khác rỗng và `atRisk` không rỗng. |
| R12 | Trọng số §4.1 khớp **chính xác** `CLAUDE.md §14.1` — test đọc hằng số từ `learning.config.ts` và so với giá trị mong đợi. |

---

## 10. EDGE CASES

| Tình huống | Xử lý |
|---|---|
| `daysUntilExam = 0` (ngày thi) | Không lên lịch gì. `/today` chuyển sang chế độ "ôn nhẹ trước giờ thi": chỉ mixed set ngắn, không mẫu mới, không chỉ số. |
| `daysUntilExam < 0` (đã thi xong) | `PhaseEngine` trả `daysRemaining = 0`. `ReviewEngine` chạy ở `compressionFactor = 1.0`, không ép §6. Gợi ý đặt kỳ thi mới. |
| `lastReviewedAt = null` (chưa từng ôn) | `decay = 0`. Dùng `firstSeenAt` nếu có; không có thì item chưa `INTRODUCED` nên không vào pool. |
| Backlog = 0 và không item nào stale | Pool rỗng → block `REVIEW` lấy item `priority` cao nhất trong toàn bộ `state ≥ INTRODUCED` (ôn sớm), ghi `reasonsVi = ["Không có mẫu quá hạn — ôn trước mẫu yếu nhất"]`. Không để block trống. |
| Mọi item đều `EXAM_READY` và `daysUntilExam ≤ 21` | Không tạo block `REVIEW` riêng; dồn sang mixed set trong `APPLY` (`CLAUDE.md §14.4`). |
| Người học đổi `examDate` xa hơn | Mọi `nextReviewAt` **giữ nguyên** (không kéo dài ngược). Lần trả lời kế tiếp mới áp `compressionFactor` mới. Không viết lại lịch sử lịch. |
| Người học đổi `examDate` gần hơn | Chạy `recompressAll(allMastery, timeline)` **một lần**: mọi `nextReviewAt > examDate − 1` bị kéo về; ghi log để `/analytics` giải thích. Đây là ngoại lệ duy nhất được phép sửa hàng loạt `nextReviewAt`. |
| Hai item cùng `priority` | Tie-break xác định: `examFrequency` DESC → `daysSince(lastReviewedAt)` DESC → `grammarId` ASC. Không random. |
| `capacity = 0` (M rất nhỏ) | Trả `[]`. `SessionEngine` xử lý ở `learning-engine.md §15` (session tối thiểu). |
| Item `pinned` nhiều hơn `capacity` | Lấy `capacity` item pinned có `priority` cao nhất; số còn lại giữ `pinned` sang ngày mai và `auditExamCoverage` chuyển `ok = false`. |

---

## 11. EXAMPLES

### 11.1 Ba item, `daysUntilExam = 40`, Phase 2

```
A  〜に至っては   CONFUSED,  nhầm với 〜に至って 6 lần, 3 ngày chưa gặp, RT 48s/35s, guess 1/6
B  〜ならでは     RECOGNIZED, sai 1 lần, 9 ngày chưa gặp (stale=7), RT 30s/35s, guess 0/6
C  〜きらいがある EXAM_READY, không sai, 11 ngày chưa gặp, RT 28s/35s, guess 0/6

A: 0.25·1.00 + 0.20·0.75 + 0.15·1.00 + 0.15·0.43 + 0.10·0.37 + 0.10·0.17 + 0.05·1.00 − 0
 = 0.250+0.150+0.150+0.064+0.037+0.017+0.050 = 0.718
 × phaseFit 1.4 (PHASE_2 + CONFUSED)                                    → 1.005

B: 0.25·0.50 + 0.20·0.25 + 0.15·0 + 0.15·1.00 + 0.10·0 + 0.10·0 + 0.05·0.60
 = 0.125+0.050+0+0.150+0+0+0.030 = 0.355  × 1.0                          → 0.355

C: 0.25·0.10 + 0 + 0 + 0.15·1.00 + 0 + 0 + 0.05·0.60
 = 0.025+0.150+0.030 = 0.205  × 1.0                                       → 0.205

Xếp hạng: A → B → C.
A.reasonsVi = ["Bạn nhầm mẫu này với 〜に至って 6 lần", "Mẫu này đang ở trạng thái Confused"]
A.suggestedDelivery = STUDY   (CONFUSED → cần bảng so sánh, không cần tốc độ)
```

### 11.2 Cùng ba item nhưng `daysUntilExam = 10` (trọng số §4.5)

```
staleThreshold ở PHASE_3 = 4 ngày → decay: A = 3/4 = 0.75 · B, C = clamp(9/4, 11/4) = 1.00

A: 0.25·1.00 + 0.25·0.75 + 0.25·1.00 + 0.05·0.75 + 0.20·0.33 + 0.10·0.37 + 0.10·0.17 + 0.05·1.00
 = 0.250+0.188+0.250+0.038+0.066+0.037+0.017+0.050 = 0.896   × 1.0 (chưa có trapHistory) → 0.896
B: 0.125+0.063+0+0.050+0+0+0+0.030 = 0.268
C: 0.025+0+0+0.050+0+0+0+0.030 = 0.105     ← và bị đánh dấu mixedOnly (EXAM_READY, d ≤ 21)

Khoảng cách A–B giãn rộng: gần thi thì lỗi và nhầm lẫn quan trọng hơn "lâu chưa gặp".
```

### 11.3 Interval sau mỗi loại trả lời, `daysUntilExam = 10` (factor 0.6, trần `floor(4) = 4`)

```
Sai                            → gặp lại cuối session hôm nay, nextReviewAt = +1
Đúng + GUESS                   → min(1×0.6, 4) → 1
Đúng + UNSURE                  → min(2×0.6, 4) → 1
Đúng + CONFIDENT, RECOGNIZED   → min(4×0.6, 4) → 2
Đúng + CONFIDENT, COMPARABLE   → min(7×0.6, 4) → 4
Đúng + CONFIDENT, EXAM_READY   → min(12×0.6, 4) → 4
```

### 11.4 Cảnh báo coverage

```
Đầu vào: 134 mẫu ≥ INTRODUCED, M = 15', daysUntilExam = 21, capacity ≈ 10/ngày
requiredSlots = 268, availableSlots = 21 × 10 = 210
auditExamCoverage → ok = false, atRisk = 58 mẫu
/analytics hiển thị: "58 mẫu sẽ không kịp ôn đủ 2 lần trước ngày thi."
   [Tăng thời gian/ngày]   [Chỉ ôn mẫu tần suất cao]
```

---

## 12. ACCEPTANCE CRITERIA

- [ ] Test R1–R12 (§9) pass.
- [ ] Test bảng §5.2: **cả 9 dòng** kiểm chứng bằng số cho kết quả đúng.
- [ ] Test `arch §13` kịch bản 6: `daysUntilExam = 5` → mọi interval ≤ 2 (chạy qua cả 8 dòng §5.1).
- [ ] Test: item `CONFUSED` chưa due vẫn vào pool.
- [ ] Test: backlog = 300, capacity = 12 → `selectDueItems` trả đúng 12.
- [ ] Test: `pinned` chen lên đầu và không bị cắt bởi capacity.
- [ ] Test: mọi item `≥ INTRODUCED` có ≥ 2 lượt lên lịch trước `examDate`, hoặc `auditExamCoverage.ok = false`.
- [ ] Test: đổi `examDate` gần hơn → `recompressAll` kéo mọi `nextReviewAt` về trước `examDate`.
- [ ] Test: đổi `examDate` xa hơn → không `nextReviewAt` nào bị đẩy ra xa.
- [ ] Test: tie-break xác định (chạy 100 lần cho cùng thứ tự).
- [ ] Test: mọi `ScoredItem` có `reasonsVi` không rỗng.
- [ ] Test: trọng số đọc từ `learning.config.ts` khớp `CLAUDE.md §14.1` (kiểm giá trị, không kiểm tên biến).
- [ ] Không có magic number nào trong `engines/review/**` — lint rule.

---

## 13. FILE NÀY **KHÔNG** CHỊU TRÁCH NHIỆM

| Chủ đề | Xem file |
|---|---|
| Chọn câu hỏi cụ thể cho item due | `exercise-engine.md` |
| Block, ngân sách phút, capacity | `learning-engine.md` |
| `WeaknessProfile`, ma trận nhầm lẫn (đầu vào của file này) | `analytics-engine.md` |
| `MasteryState`, `staleThreshold` (nguồn) | `learning-engine.md` |
