# grammar-schema.md — CONTENT LAYER

> Đọc sau `CLAUDE.md` và `project-architecture.md`. Khi mâu thuẫn: `CLAUDE.md` > `project-architecture.md` > file này.
> File này **chỉ** nói về **dữ liệu tĩnh**: grammar, example, relation, comparison set, question, source, validation.
> File này **không** chứa: mastery, priority, session, metric, thuật toán học tập. Xem 4 file còn lại.

---

## 1. PURPOSE

Định nghĩa **hình dạng của kiến thức** mà toàn hệ thống đọc.

Ba ràng buộc quyết định mọi thiết kế dưới đây:

| Ràng buộc | Nguồn | Hệ quả trong file này |
|---|---|---|
| Nội dung không được bịa, phải truy nguồn | `CLAUDE.md §16` | mọi node có `sourceId` + `verificationStatus`; validator ép `NEEDS_REVIEW` khi thiếu nguồn |
| Quan hệ ngữ pháp là **graph**, không phải danh sách phẳng | `CLAUDE.md §6` | `similarTo/contrastsWith/...` sống trong `relations.json`, **không** nằm trên node grammar |
| Mỗi distractor phải giải thích được vì sao sai | `CLAUDE.md §9.2`, `arch §6.3` | `Choice.wrongBecause` + `whyWrongVi` là **bắt buộc**, thiếu → fail build |

---

## 2. QUY ƯỚC TRẠNG THÁI TRƯỜNG (dùng chung cho cả 5 file)

Mỗi trường được gắn một trong bốn nhãn:

| Nhãn | Nghĩa |
|---|---|
| `LOCKED` | Đã chốt ở `project-architecture.md §4`. **Không** đổi tên, không đổi kiểu, không bỏ. |
| `PROPOSED` | Đề xuất mới của bước thiết kế này. **Chưa được phép code** cho tới khi người dùng duyệt và `project-architecture.md` được cập nhật (`CLAUDE.md §0.4`). Xem `spec-consistency-check.md`. |
| `DERIVED` | **Không lưu trong content**. Được tính ra lúc đọc (repository) hoặc từ dữ liệu người học. |
| `REJECTED` | Có trong yêu cầu ban đầu nhưng bị loại, kèm lý do. |

> Quy tắc vàng: nếu một trường là `DERIVED`, việc lưu nó xuống JSON là **lỗi**, vì nó sẽ lệch với nguồn thật.

---

## 3. DEFINITIONS

| Thuật ngữ | Nghĩa chính xác trong project |
|---|---|
| **Grammar node** | Một mẫu 文法 N1 duy nhất, định danh bởi `id` ổn định vĩnh viễn. |
| **Relation edge** | Một cạnh có hướng giữa hai grammar node, có `type` và `source`. |
| **ComparisonSet** | Một nhóm 2–4 grammar **có cạnh** trong graph, kèm bảng so sánh đã biên tập. Xương sống của Compare Lab. |
| **Question** | Một câu hỏi có đúng một đáp án đúng và ≥ 1 distractor đã được giải thích. |
| **Clue** | Manh mối trong câu quyết định đáp án (`文末`, `接続`, chủ thể, ngữ cảnh…). Là thứ Phase 3 dạy người học nhìn. |
| **Trap** | Ý đồ gài bẫy của người ra đề, gắn ở cấp **Question**, không phải cấp Grammar. |
| **Source** | Tài liệu giấy/PDF có thật, có trang. Không có source ⇒ không `VERIFIED`. |

---

## 4. DATA MODELS

### 4.1 `Grammar` (arch gọi `Grammar`; prompt gọi `GrammarItem` — **tên chốt: `Grammar`**)

```ts
interface Grammar {
  // ── định danh ──────────────────────────────────────────────
  id: string;                       // LOCKED  'ni-itatte' — kebab-case romaji, ổn định vĩnh viễn
  pattern: string;                  // LOCKED  '〜に至って'  — dạng hiển thị chính tắc
  reading?: string;                 // LOCKED  'にいたって'
  aliases: string[];                // LOCKED  biến thể xuất hiện trong đề: ['に至り','に至っても']

  // ── nghĩa ──────────────────────────────────────────────────
  meaningVi: string;                // LOCKED  nghĩa lõi, 1 câu. = "coreMeaningVi" trong prompt
  meaningsVi?: string[];            // PROPOSED nghĩa phụ khi mẫu đa nghĩa (≤ 3). Rỗng với đa số mẫu.
  coreImage: string;                // LOCKED  "mental image" 1 câu, để nhớ nhanh
  nuanceVi?: string;                // PROPOSED sắc thái (≤ 2 câu). Nguồn dữ liệu của NUANCE_ERROR.

  // ── dùng thế nào ───────────────────────────────────────────
  structure: ConnectionRule[];      // LOCKED  接続 — ≥ 1
  usage: string[];                  // LOCKED  ≤ 3 gạch đầu dòng
  restrictions: Restriction[];      // LOCKED  nguồn dữ liệu của CONSTRAINT_ERROR
  register: Register;               // LOCKED
  typicalContexts?: string[];       // PROPOSED ≤ 3: 'ニュース', '論説文', 'ビジネス文書'
  collocations?: Collocation[];     // PROPOSED nguồn dữ liệu của COLLOCATION_ERROR / COLLOCATION_TRAP

  // ── học & thi ──────────────────────────────────────────────
  examples: Example[];              // LOCKED  ≥ 2 (validator), hiển thị 1–3 ở micro-lesson
  commonMistakes: string[];         // LOCKED  ≤ 3
  keyClues: string[];               // LOCKED  dấu hiệu nhận biết trong đề. = "examTips" trong prompt
  families: GrammarFamily[];        // LOCKED  ≥ 1. = "functionGroup" trong prompt (giữ dạng mảng)
  examFrequency: ExamFrequency;     // LOCKED
  difficulty: 1 | 2 | 3;            // LOCKED  độ khó biên tập (tĩnh)

  // ── nguồn ──────────────────────────────────────────────────
  sourceId: string;                 // LOCKED
  sourcePage?: string;              // LOCKED
  sourceSection?: string;           // LOCKED
  sourceReference?: string;         // LOCKED
  verificationStatus: VerificationStatus; // LOCKED
  conflictNote?: string;            // LOCKED  hai nguồn mâu thuẫn → giữ cả hai (CLAUDE.md §16.6)
}
```

**Trường bị loại, có lý do:**

| Trường trong prompt | Quyết định | Lý do |
|---|---|---|
| `displayPattern` | `REJECTED` | Trùng `pattern`. Biến thể đã có `aliases`. Nhu cầu thật là **khoá tìm kiếm**, xử lý bằng `searchKey` (`DERIVED`). |
| `examTips` | `REJECTED` | Trùng `keyClues`. Hai trường "mẹo làm bài" sẽ lệch nhau sau 3 tháng biên tập. |
| `similarGrammarIds` | `DERIVED` | Vi phạm `CLAUDE.md §6` nếu lưu trên node. Xem §4.4. |
| `contrastGrammarIds` | `DERIVED` | Như trên. |
| `confusedGrammarIds` | `DERIVED` | **Ngoài ra**: đây là dữ liệu **của người học**, không phải của ngữ pháp. Lưu ở `learnedRelations` (storage), không ở content. |
| `trapTags` | `DERIVED` | Trap gắn ở Question. "Mẫu này hay bị bẫy kiểu gì" = tổng hợp từ các Question trỏ tới nó. |

**Trường `DERIVED` do repository sinh ra khi đọc (không lưu JSON):**

```ts
interface GrammarView extends Grammar {
  searchKey: string;                // DERIVED  pattern+reading+aliases, đã normalize (§7)
  similarGrammarIds: string[];      // DERIVED  từ relations: similarTo
  contrastGrammarIds: string[];     // DERIVED  từ relations: contrastsWith
  curatedConfusedIds: string[];     // DERIVED  từ relations: oftenConfusedWith, source=CURATED
  trapProneTypes: TrapType[];       // DERIVED  distinct traps của Question có targetGrammarIds chứa id
  questionCountByType: Record<QuestionType, number>; // DERIVED  để cảnh báo thiếu dữ liệu luyện tập
}
```

> `GrammarView` là thứ UI nhận. `Grammar` là thứ JSON chứa. Không trộn hai cái.

### 4.2 Kiểu phụ

```ts
interface ConnectionRule {          // LOCKED
  pos: string;                      // 'V', 'N', 'A-i', 'A-na'
  form: string;                     // 'V-辞書形', 'N＋の', 'V-た'
  note?: string;
}

interface Restriction {             // LOCKED
  kind: 'SUBJECT'|'POLARITY'|'VOLITION'|'TENSE'|'ANIMACY'|'SCOPE'|'OTHER';
  ruleVi: string;                   // "Chủ ngữ phải là người nói"
  counterExample?: string;          // câu SAI, để đối chiếu
}

interface Collocation {             // PROPOSED
  chunkJa: string;                  // '〜に至っては言うまでもない'
  glossVi: string;
  strength: 'FIXED' | 'STRONG' | 'COMMON';  // FIXED = sai đi là sai hẳn
}
```

### 4.3 `Example`

```ts
interface Example {
  ja: string;                       // LOCKED  ("japanese")
  vi: string;                       // LOCKED  ("vietnamese")
  highlight?: [number, number];     // LOCKED  chỉ số ký tự trong `ja` — bôi đậm mẫu
  register?: Register;              // LOCKED

  targetGrammarId?: string;         // PROPOSED  mặc định = grammar chứa nó; khai báo khi ví dụ dùng để đối chiếu
  contextVi?: string;               // PROPOSED  ≤ 1 câu: "trong bản tin thời sự"
  whyNaturalVi?: string;            // PROPOSED  vì sao dùng mẫu này ở đây là tự nhiên
  whyNotOthers?: WhyNot[];          // PROPOSED  vì sao KHÔNG dùng mẫu gần nghĩa — nhiên liệu Phase 2
  sourceReference?: string;         // PROPOSED  nguồn riêng cho ví dụ (khác nguồn của mẫu)
}

interface WhyNot {                  // PROPOSED
  grammarId: string;                // mẫu không dùng được
  reasonVi: string;                 // ≤ 1 câu
  axis: ComparisonAxis;             // trục khác biệt — nối thẳng sang Compare Lab (§4.5)
}
```

**Sử dụng theo tháng** (đúng như prompt yêu cầu):

| Giai đoạn | Trường được dùng |
|---|---|
| Month 1 — KNOW | `ja`, `vi`, `highlight` (subset tối thiểu) |
| Month 2 — COMPARE | thêm `whyNotOthers`, `contextVi`, `register` |
| Month 3 — DETECT | thêm `whyNaturalVi` (dạy "câu này tự nhiên vì đâu" → đọc ý đồ đề) |

Validator **không** bắt buộc `whyNotOthers` với mọi ví dụ, nhưng bắt buộc: mỗi `ComparisonSet` phải có **≥ 1 ví dụ có `whyNotOthers`** cho mỗi cặp trong set.

### 4.4 Relation graph (`relations.json`)

```ts
interface GrammarRelation {         // LOCKED nguyên vẹn theo arch §4.2
  from: string;
  to: string;
  type: RelationType;               // similarTo | contrastsWith | oftenConfusedWith
                                    // | sameFunctionGroup | prerequisite | registerVariantOf
  differenceKey?: string;
  noteVi?: string;
  source: 'CURATED' | 'LEARNED';
  strength?: number;
}
```

Luật graph:

| # | Luật |
|---|---|
| G1 | `relations.json` chỉ chứa `source: 'CURATED'`. Cạnh `LEARNED` sinh từ lỗi người học và sống ở bảng `learnedRelations` (storage) — **không bao giờ** ghi ngược vào content. |
| G2 | `similarTo`, `contrastsWith`, `oftenConfusedWith`, `sameFunctionGroup`, `registerVariantOf` là **đối xứng**: khai một chiều, repository tự sinh chiều ngược. `prerequisite` là **có hướng**, không đối xứng. |
| G3 | `prerequisite` không được tạo chu trình. Validator chạy phát hiện chu trình → fail build. |
| G4 | Hai grammar cùng `families` **không** tự động có cạnh. Cùng family là điều kiện cần, không đủ, để vào một ComparisonSet. |
| G5 | Cạnh `oftenConfusedWith` CURATED phải có `noteVi` nói **nhầm ở điểm nào**, nếu không thì nó vô dụng cho Compare Lab. |

### 4.5 `ComparisonSet`

```ts
interface ComparisonSet {
  id: string;                       // LOCKED
  grammarIds: string[];             // LOCKED  2–4 (arch chốt 4, prompt xin 5 → xem consistency check C-07)
  familyHint: GrammarFamily;        // LOCKED
  rows: ComparisonRow[];            // LOCKED
  decisiveDifferenceVi: string;     // LOCKED  MỘT câu. Nếu không viết nổi 1 câu ⇒ set này chưa chín.
  sourceId: string;                 // LOCKED
  verificationStatus: VerificationStatus; // LOCKED

  minimalPairQuestionIds?: string[];// PROPOSED  câu MINIMAL_PAIR gắn sẵn cho set
  whyNotQuestionIds?: string[];     // PROPOSED  câu WHY_NOT_OTHER gắn sẵn
  examPatternVi?: string;           // PROPOSED  "đề thường ra dạng: cho ngữ cảnh nhóm, hỏi chủ thể"
}

interface ComparisonRow {           // LOCKED (arch liệt kê 8 trục)
  axis: ComparisonAxis;
  cells: Record<string /*grammarId*/, string /*mô tả ngắn tiếng Việt*/>;
}
```

**`ComparisonAxis`** — `PROPOSED` enum (arch §9 liệt kê 8 trục dạng văn xuôi; ở đây chốt thành enum để code và test được):

```ts
type ComparisonAxis =
  | 'MEANING'          // nghĩa lõi
  | 'NUANCE'           // sắc thái (khen/chê, mạnh/nhẹ)
  | 'CONNECTION'       // 接続
  | 'SUBJECT'          // chủ thể (người nói / người khác / vật)
  | 'REGISTER'         // 文体
  | 'RESTRICTION'      // ràng buộc cứng
  | 'TYPICAL_CONTEXT'  // ngữ cảnh hay gặp
  | 'KEY_CLUE'         // dấu hiệu nhận biết trong đề
  // ── ba trục prompt yêu cầu thêm ──
  | 'SPEAKER_INTENT'   // ý đồ người nói
  | 'STRENGTH'         // cường độ
  | 'TIME_RELATION'    // quan hệ thời gian
  | 'POLARITY_TENDENCY'; // xu hướng đi với khẳng định / phủ định
```

Luật ComparisonSet:

| # | Luật |
|---|---|
| C1 | Mọi cặp trong `grammarIds` phải **có cạnh** trong graph (`CLAUDE.md §6`, arch §6.3.6). Không ghép ngẫu nhiên. |
| C2 | Không bắt buộc đủ 12 trục. Bắt buộc **≥ 3 trục**, trong đó **≥ 1 trục là trục quyết định** (trục mà `decisiveDifferenceVi` nói tới). |
| C3 | Mọi ô trong `rows[].cells` phải có đủ khoá cho **mọi** `grammarIds` (không bỏ trống) — bảng thủng làm hỏng so sánh. |
| C4 | `decisiveDifferenceVi` ≤ 1 câu, ≤ 120 ký tự. |
| C5 | Bảng chỉ được hiển thị **sau khi người học thử phân biệt** (`CLAUDE.md §11`). Đây là ràng buộc content→UI: set phải kèm ≥ 1 câu hỏi mở màn. |

### 4.6 `Question`

```ts
interface Question {
  id: string;                       // LOCKED
  type: QuestionType;               // LOCKED — 8 giá trị ở arch §4.1. Prompt xin thêm 4 → C-02.
  phaseHint: Phase[];               // LOCKED
  targetGrammarIds: string[];       // LOCKED
  stemJa: string;                   // LOCKED  ("stem") — chứa ___ nếu cloze
  contextJa?: string;               // LOCKED  ("sentence"/đoạn văn cho TEXT_GRAMMAR)
  choices: Choice[];                // LOCKED
  correctChoiceId: string;          // LOCKED

  explanationVi: string;            // LOCKED  vì sao đáp án đúng
  keyClueVi: string;                // LOCKED  manh mối quyết định, dạng câu
  solvingStrategy: SolvingStep[];   // LOCKED  đường giải nhanh nhất, không rỗng
  trap?: TrapAnnotation;            // LOCKED  không bắt buộc mọi câu có bẫy

  targetTimeMs: number;             // LOCKED  từ timing.config theo type
  sourceId: string;                 // LOCKED
  sourcePage?: string;              // LOCKED
  verificationStatus: VerificationStatus; // LOCKED

  testedSkill: SkillDimension;      // PROPOSED  'KNOW' | 'COMPARE' | 'DETECT' — nối vào §4 của learning-engine
  decisiveClue: Clue;               // PROPOSED  phiên bản có kiểu của keyClueVi, cần cho 「決め手は？」
  difficultyStatic: 1|2|3|4|5;      // PROPOSED  xem exercise-engine §9
  comparisonSetId?: string;         // PROPOSED  bắt buộc với MINIMAL_PAIR / WHY_NOT_OTHER
}

interface Choice {
  id: string;                       // LOCKED
  textJa: string;                   // LOCKED
  isCorrect: boolean;               // LOCKED
  wrongBecause?: ErrorType;         // LOCKED  BẮT BUỘC nếu !isCorrect
  whyWrongVi?: string;              // LOCKED  BẮT BUỘC nếu !isCorrect
  confusedWithGrammarId?: string;   // LOCKED  BẮT BUỘC nếu wrongBecause = SIMILAR_GRAMMAR_CONFUSION
  violatedAxis?: ComparisonAxis;    // PROPOSED  trục bị vi phạm — cho phép feedback chỉ đúng chỗ sai
}

interface TrapAnnotation {
  trapType: TrapType;               // LOCKED  9 giá trị arch §4.1. Prompt xin thêm 3 → C-03.
  trapExplanationVi: string;        // LOCKED
  fastestPathVi: string;            // LOCKED
  strength?: 1|2|3;                 // PROPOSED  bẫy mạnh cỡ nào — vào công thức difficulty
}

interface SolvingStep {             // LOCKED
  order: number;
  labelJa: string;                  // '文末を見る'
  labelVi: string;                  // 'Nhìn đuôi câu'
}

interface Clue {                    // PROPOSED
  kind: ClueKind;
  textJa?: string;                  // đoạn text trong stem là manh mối
  span?: [number, number];          // vị trí manh mối trong stemJa — để highlight khi giải thích
  noteVi: string;
}

type ClueKind =                     // PROPOSED — đúng 6 lựa chọn prompt yêu cầu ở 「決め手は？」, + 2
  | 'MEANING' | 'CONNECTION' | 'RESTRICTION'
  | 'CONTEXT' | 'NUANCE' | 'REGISTER'
  | 'COLLOCATION' | 'POSITION';
```

### 4.7 `Source`

```ts
interface Source {                  // PROPOSED (arch §6.2 có getSource nhưng chưa định nghĩa hình dạng)
  id: string;                       // 'shinkanzen-n1-bunpou'
  titleJa: string;
  publisher?: string;
  year?: number;
  kind: 'TEXTBOOK' | 'WORKBOOK' | 'PAST_EXAM' | 'DICTIONARY' | 'AI_GENERATED';
  trustLevel: 'PRIMARY' | 'SECONDARY' | 'UNVERIFIED';
}
```

Luật: `kind: 'AI_GENERATED'` ⇒ `trustLevel: 'UNVERIFIED'` ⇒ mọi node trỏ tới nó bị ép `verificationStatus = NEEDS_REVIEW`. Không có ngoại lệ (`CLAUDE.md §16.3`).

---

## 5. RULES — TÍNH TOÀN VẸN NỘI DUNG

### 5.1 Validator bắt buộc (chạy build-time + CI; vi phạm = **fail build**)

| # | Luật | Mức |
|---|---|---|
| V1 | Mọi `Grammar` có ≥ 1 `families`, ≥ 2 `examples`, ≥ 1 `structure` | FAIL |
| V2 | Mọi `Choice` sai có **cả** `wrongBecause` **và** `whyWrongVi` | FAIL |
| V3 | `wrongBecause = SIMILAR_GRAMMAR_CONFUSION` ⇒ có `confusedWithGrammarId` trỏ tới grammar tồn tại | FAIL |
| V4 | Mọi `Question` có `keyClueVi` khác rỗng và `solvingStrategy.length ≥ 1` | FAIL |
| V5 | Mọi id trong `relations.json`, `comparison sets`, `targetGrammarIds` đều tồn tại | FAIL |
| V6 | Không có chu trình trong cạnh `prerequisite` | FAIL |
| V7 | Mọi cặp trong `ComparisonSet.grammarIds` có cạnh trong graph | FAIL |
| V8 | `ComparisonSet.rows` phủ đủ mọi `grammarIds` ở mọi trục khai báo | FAIL |
| V9 | Đúng **một** `Choice` có `isCorrect = true`, và `correctChoiceId` trỏ đúng vào nó | FAIL |
| V10 | `sourceId` không tồn tại trong `sources.json` ⇒ **ép** `verificationStatus = NEEDS_REVIEW` | AUTO-FIX + WARN |
| V11 | Grammar chỉ xuất hiện trong ≤ 1 Question | WARN |
| V12 | Grammar `examFrequency = HIGH` mà không có Question loại `CLOZE_MC` | WARN |
| V13 | Grammar `INTRODUCED`-able mà không có ComparisonSet nào chứa nó, dù có cạnh `oftenConfusedWith` | WARN |
| V14 | `targetTimeMs` lệch khỏi `timing.config` của `type` quá ±50% | WARN |
| V15 | Ví dụ có `highlight` nằm ngoài độ dài `ja` | FAIL |

> WARN không chặn build nhưng **phải** hiện ở `/analytics` dưới dạng "dữ liệu luyện tập chưa đủ cho mẫu X" (arch §12).

### 5.2 Luật `verificationStatus`

```
VERIFIED      ⇐ có sourceId trỏ tới Source trustLevel PRIMARY|SECONDARY, đã đối chiếu trang
NEEDS_REVIEW  ⇐ sinh bởi AI, hoặc import ngoài, hoặc thiếu nguồn, hoặc có conflictNote
DRAFT         ⇐ đang biên tập, chưa dùng trong session
```

| Trạng thái | Vào session? | Ghi Attempt? | Làm bằng chứng thăng `EXAM_READY`? | Badge UI |
|---|---|---|---|---|
| `VERIFIED` | có | có | **có** | không |
| `NEEDS_REVIEW` | có | có | **không** (`CLAUDE.md §16.4`) | có, cảnh báo |
| `DRAFT` | **không** | — | không | — |

> Điều này buộc `Attempt` phải mang được thông tin "câu này có VERIFIED không" tới `MasteryEngine`.
> Cơ chế: `MasteryEngine.applyAttempt` nhận cả `question` (arch §7.3 đã có chữ ký này) → đọc `question.verificationStatus`. Không cần thêm trường vào `Attempt`.

### 5.3 Luật hai nguồn mâu thuẫn (`CLAUDE.md §16.6`)

Không tự chọn. Giữ cả hai:
```
grammar.conflictNote = "Nguồn A (tr.112) nói chủ thể phải là người nói.
                        Nguồn B (tr.88) cho phép ngôi thứ ba trong văn viết."
grammar.verificationStatus = NEEDS_REVIEW
```
UI hiện cả hai. `ExerciseEngine` **không** được sinh câu hỏi kiểm tra đúng điểm đang mâu thuẫn đó (xem exercise-engine §3.2 hard filter).

---

## 6. ID & NAMING

| Loại | Quy tắc | Ví dụ |
|---|---|---|
| Grammar | `kebab-case` romaji của mẫu, bỏ 〜 | `ni-itatte`, `nara-dewa`, `to-aitte` |
| Grammar biến thể | thêm hậu tố phân biệt | `ni-itatte` / `ni-itaru-made` / `ni-itatte-wa` |
| Question | `q-<grammarId>-<type>-<nn>` | `q-ni-itatte-cloze-01` |
| ComparisonSet | `cmp-<family>-<nn>` | `cmp-inevitability-03` |
| Source | `kebab-case` viết tắt sách | `shinkanzen-n1` |

Luật: **id không bao giờ đổi**. Đổi id = mất toàn bộ lịch sử học của người dùng (attempts trỏ theo id). Nếu buộc phải đổi → cần migration có bảng ánh xạ, ghi vào ADR.

---

## 7. NORMALIZATION CỦA CONTENT (khác normalization khi chấm — xem exercise-engine §7)

Áp dụng khi **index để tìm kiếm**, không áp dụng khi hiển thị:

```
normalizeForSearch(s):
  1. NFKC                       // 全角英数 → 半角, ｶﾀｶﾅ → カタカナ
  2. bỏ ký tự trang trí: 〜 ～ ・ 「」 （） 空白
  3. カタカナ → ひらがな
  4. lowercase (phần latin)
```
`searchKey = normalizeForSearch(pattern + reading + aliases.join())`.

> Không dùng hàm này để chấm bài. Chấm bài là chuyện của `ExerciseEngine`, và ở MVP **không có** câu hỏi nhập text tự do (§ exercise-engine 7.1).

---

## 8. EDGE CASES

| Tình huống | Xử lý |
|---|---|
| Mẫu có 2 nghĩa rất khác nhau (vd `〜ところ`) | **Tách 2 grammar node** với id khác nhau, nối bằng cạnh `similarTo` + `differenceKey`. **Không** nhồi vào `meaningsVi`. `meaningsVi` chỉ cho sắc thái phụ của **cùng một** chức năng. |
| Mẫu chỉ khác nhau trợ từ (`に至って` / `に至っては`) | Hai node riêng + cạnh `oftenConfusedWith` bắt buộc + ComparisonSet bắt buộc. Đây chính là loại bẫy `LOOKALIKE_FORM`. |
| Grammar không có ví dụ đủ tin cậy | `verificationStatus = DRAFT` → không vào session. Thà thiếu còn hơn dạy sai (`CLAUDE.md §16.1`). |
| Question nhắm 2 grammar (so sánh) | `targetGrammarIds` có 2 phần tử. `Attempt.grammarId` (đơn) = grammar của **đáp án đúng**; grammar còn lại đi vào `confusedWith` khi chọn sai. |
| Import file ngoài trùng id | Không ghi đè content gốc. Ghi vào `contentOverrides` + báo cáo "X trùng id, đang dùng bản import" (arch §6.4). |
| Đề thật (`PAST_EXAM`) có bản quyền | Lưu `sourceReference` (năm, 問題số) nhưng **không** copy nguyên văn nếu không được phép; viết lại câu tương đương và đánh dấu `kind: WORKBOOK`. |
| `examFrequency` không rõ | Mặc định `MEDIUM`, `verificationStatus = NEEDS_REVIEW`. Không mặc định `HIGH` (sẽ chiếm slot TRIAGE oan). |
| Ví dụ dài quá 1 dòng điện thoại | Cảnh báo ở validator (> 45 ký tự Nhật) — vi phạm `CLAUDE.md §18`. |

---

## 9. EXAMPLES

### 9.1 Grammar node (rút gọn, đúng schema)

```json
{
  "id": "ni-itatte",
  "pattern": "〜に至って",
  "reading": "にいたって",
  "aliases": ["に至り"],
  "meaningVi": "Đến tận mức/giai đoạn nghiêm trọng đó thì mới…",
  "coreImage": "Đi hết một chặng dài, tới điểm cuối cùng — lúc đó mới xảy ra chuyện.",
  "nuanceVi": "Hàm ý 'muộn màng': đáng lẽ phải xảy ra sớm hơn.",
  "structure": [{ "pos": "N", "form": "N＋に至って" },
                { "pos": "V", "form": "V-辞書形＋に至って" }],
  "usage": ["Dùng cho tình huống đã đi tới mức xấu/nghiêm trọng",
            "Thường đi với 初めて / ようやく / やっと"],
  "restrictions": [
    { "kind": "SCOPE", "ruleVi": "Không dùng cho việc nhỏ, việc thường ngày.",
      "counterExample": "×コーヒーがなくなるに至って、店に行った。" }
  ],
  "register": "FORMAL_WRITTEN",
  "typicalContexts": ["ニュース", "論説文"],
  "examples": [
    { "ja": "事故が起きるに至って、ようやく対策が取られた。",
      "vi": "Đến khi tai nạn xảy ra thì rốt cuộc mới có biện pháp.",
      "highlight": [6, 11],
      "whyNaturalVi": "Có 「ようやく」— dấu hiệu điển hình của 〜に至って.",
      "whyNotOthers": [
        { "grammarId": "ni-itatte-wa", "reasonVi": "「〜に至っては」nêu ví dụ cực đoan, không diễn tả mốc thời gian.", "axis": "MEANING" }
      ] }
  ],
  "commonMistakes": ["Nhầm với 〜に至っては (nêu ví dụ cực đoan)"],
  "keyClues": ["ようやく / 初めて đứng sau", "sự việc nghiêm trọng đứng trước"],
  "families": ["TIME", "INEVITABILITY"],
  "examFrequency": "HIGH",
  "difficulty": 2,
  "sourceId": "shinkanzen-n1",
  "sourcePage": "112",
  "verificationStatus": "VERIFIED"
}
```

### 9.2 Question có bẫy

```json
{
  "id": "q-ni-itatte-cloze-01",
  "type": "CLOZE_MC",
  "phaseHint": ["PHASE_2_COMPARE", "PHASE_3_DETECT"],
  "targetGrammarIds": ["ni-itatte", "ni-itatte-wa"],
  "stemJa": "被害が全国に広がる___、政府はようやく重い腰を上げた。",
  "choices": [
    { "id": "a", "textJa": "に至って", "isCorrect": true },
    { "id": "b", "textJa": "に至っては", "isCorrect": false,
      "wrongBecause": "SIMILAR_GRAMMAR_CONFUSION", "confusedWithGrammarId": "ni-itatte-wa",
      "violatedAxis": "MEANING",
      "whyWrongVi": "「〜に至っては」dùng để nêu một ví dụ cực đoan, không nối mốc thời gian với hành động sau." },
    { "id": "c", "textJa": "に至るまで", "isCorrect": false,
      "wrongBecause": "MEANING_ERROR", "confusedWithGrammarId": "ni-itaru-made",
      "violatedAxis": "MEANING",
      "whyWrongVi": "「〜に至るまで」nhấn phạm vi 'cho tới tận…', không nhấn thời điểm bước ngoặt." },
    { "id": "d", "textJa": "に至らず", "isCorrect": false,
      "wrongBecause": "FORM_ERROR", "violatedAxis": "CONNECTION",
      "whyWrongVi": "Thể phủ định 「〜に至らず」mâu thuẫn với vế sau đã xảy ra 「重い腰を上げた」." }
  ],
  "correctChoiceId": "a",
  "explanationVi": "Vế sau có 「ようやく」— sự việc chỉ xảy ra khi đã đến mức nghiêm trọng.",
  "keyClueVi": "「ようやく」ở vế sau.",
  "decisiveClue": { "kind": "CONTEXT", "textJa": "ようやく", "span": [14, 18],
                    "noteVi": "Trạng từ 'rốt cuộc' chốt rằng đây là mốc bước ngoặt." },
  "solvingStrategy": [
    { "order": 1, "labelJa": "文末を見る", "labelVi": "Nhìn vế sau: đã xảy ra rồi → loại thể phủ định" },
    { "order": 2, "labelJa": "副詞を探す", "labelVi": "Tìm 「ようやく」→ đây là mốc thời gian" },
    { "order": 3, "labelJa": "選択肢を消す", "labelVi": "Loại 「〜に至っては」vì không nối mốc–hành động" }
  ],
  "trap": { "trapType": "LOOKALIKE_FORM",
            "trapExplanationVi": "Ba đáp án đều bắt đầu bằng 「に至」— đề đánh vào việc bạn chỉ nhìn lướt phần đầu.",
            "fastestPathVi": "Đọc hết đuôi mỗi đáp án trước, rồi mới đọc câu.",
            "strength": 3 },
  "testedSkill": "DETECT",
  "difficultyStatic": 3,
  "targetTimeMs": 35000,
  "sourceId": "shinkanzen-n1",
  "sourcePage": "112",
  "verificationStatus": "VERIFIED"
}
```

### 9.3 ComparisonSet (rút gọn)

```json
{
  "id": "cmp-time-01",
  "grammarIds": ["ni-itatte", "ni-itatte-wa", "ni-itaru-made"],
  "familyHint": "TIME",
  "rows": [
    { "axis": "MEANING", "cells": {
        "ni-itatte": "Đến mốc nghiêm trọng đó thì mới…",
        "ni-itatte-wa": "Nêu ví dụ cực đoan nhất trong nhóm",
        "ni-itaru-made": "Từ … cho tới tận …, nhấn phạm vi" } },
    { "axis": "SUBJECT", "cells": {
        "ni-itatte": "Sự kiện", "ni-itatte-wa": "Một thành viên của tập hợp", "ni-itaru-made": "Hai đầu của một dải" } },
    { "axis": "KEY_CLUE", "cells": {
        "ni-itatte": "ようやく / 初めて ở vế sau",
        "ni-itatte-wa": "có liệt kê ở phía trước",
        "ni-itaru-made": "có mốc đầu 「から」ở phía trước" } }
  ],
  "decisiveDifferenceVi": "「に至って」nối MỐC với HÀNH ĐỘNG; 「に至っては」nêu VÍ DỤ; 「に至るまで」đo PHẠM VI.",
  "minimalPairQuestionIds": ["q-cmp-time-01-mp-01", "q-cmp-time-01-mp-02"],
  "sourceId": "shinkanzen-n1",
  "verificationStatus": "VERIFIED"
}
```

---

## 10. ACCEPTANCE CRITERIA

Content layer được coi là **xong** khi:

- [ ] Zod schema tồn tại cho: `Grammar`, `Example`, `GrammarRelation`, `ComparisonSet`, `Question`, `Choice`, `Source`.
- [ ] `content/validator.ts` cài đủ V1–V15; V1–V9, V15 chặn build.
- [ ] Chạy validator trên seed 10 grammar: 0 FAIL, mọi WARN được liệt kê rõ.
- [ ] `repository.getGrammarView(id)` trả `similarGrammarIds`/`contrastGrammarIds`/`trapProneTypes` **được tính**, và grep toàn repo không tìm thấy các trường này trong bất kỳ file `.json` nào.
- [ ] Không có chuỗi tiếng Nhật hay giải thích ngữ pháp nào nằm trong file `.tsx` (`CLAUDE.md §17.1`) — kiểm bằng lint rule.
- [ ] Mọi node thiếu `sourceId` đều bị ép `NEEDS_REVIEW` (test).
- [ ] Test: node `NEEDS_REVIEW` không bao giờ được `MasteryEngine` tính là bằng chứng `EXAM_READY`.
- [ ] Test: `ComparisonSet` ghép hai grammar không có cạnh → validator FAIL.
- [ ] Test: `prerequisite` tạo chu trình A→B→A → validator FAIL.
- [ ] Importer gán `NEEDS_REVIEW` cho 100% bản ghi import, kể cả khi file nguồn tự khai `VERIFIED`.

---

## 11. FILE NÀY **KHÔNG** CHỊU TRÁCH NHIỆM

| Chủ đề | Xem file |
|---|---|
| Trạng thái thành thạo, 3 chiều KNOW/COMPARE/DETECT, session hằng ngày | `learning-engine.md` |
| Chọn câu, chấm bài, normalization khi chấm, mock/timed mode | `exercise-engine.md` |
| Ưu tiên review, lịch SRS theo ngày thi | `review-engine.md` |
| Error memory, confusion matrix, weakness profile, ERS | `analytics-engine.md` |
