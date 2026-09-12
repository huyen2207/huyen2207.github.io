# project-architecture.md — N1 文法 90 Days

> Tài liệu kiến trúc. Đọc **sau** `CLAUDE.md` và **luôn cùng** `CLAUDE.md`.
> Khi tài liệu này mâu thuẫn với `CLAUDE.md` → `CLAUDE.md` thắng, và phải báo `⚠️ CONFLICT`.
> Phạm vi: module, page, data flow, engine, dependency, responsibility. **Chưa** phải code UI.

---

## 1. TỔNG QUAN HỆ THỐNG

Ứng dụng **client-only, offline-first, single-learner**. Không backend ở MVP.
Toàn bộ trạng thái học tập nằm trong IndexedDB trên máy người học; nội dung ngữ pháp là dữ liệu tĩnh được đóng gói cùng app và/hoặc import thêm.

```
                      ┌──────────────────────────────┐
                      │          UI LAYER            │
                      │  13 routes · mobile-first    │
                      └───────────────┬──────────────┘
                                      │ đọc ViewModel, gửi Intent
                      ┌───────────────▼──────────────┐
                      │        APPLICATION           │
                      │  stores (Zustand) · hooks    │
                      │  orchestration, không logic  │
                      └───────────────┬──────────────┘
        ┌──────────────┬──────────────┼──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼
   PhaseEngine   RoadmapEngine   SessionEngine   MasteryEngine   ReviewEngine
        │              │              │              │              │
        └──────────────┴──────┬───────┴──────────────┴──────────────┘
                              ▼
              ExerciseEngine · ErrorEngine · AdaptationEngine · AnalyticsEngine
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
  CONTENT LAYER (read-only)               STORAGE LAYER (read/write)
  grammar · questions · families          Dexie/IndexedDB · backup JSON
```

### 1.1 Nguyên tắc kiến trúc

| # | Nguyên tắc |
|---|---|
| A1 | Engine là **pure function**: `(state, input) → output`. Không I/O, không `Date.now()` trực tiếp (nhận `now` qua tham số). |
| A2 | UI **không tính toán** mastery / priority / phase / readiness. UI chỉ render. |
| A3 | Nội dung ngữ pháp **không bao giờ** nằm trong file `.tsx`. |
| A4 | Storage là nơi duy nhất có side effect. |
| A5 | Mọi hằng số học tập nằm trong `learning.config.ts`. |
| A6 | Dữ liệu học tập chỉ được **append**, không sửa lịch sử. `Attempt` là immutable. |

---

## 2. TECH STACK & THƯ MỤC

Stack: xem `CLAUDE.md §25`.

```
src/
├── domain/                     # Kiểu dữ liệu thuần, không phụ thuộc gì
│   ├── enums.ts                # TẤT CẢ enum của project
│   ├── grammar.ts              # Grammar, GrammarRelation, GrammarFamily
│   ├── question.ts             # Question, Choice, TrapAnnotation
│   ├── learner.ts              # LearnerProfile, StudyPlan
│   ├── mastery.ts              # GrammarMastery, MasteryEvent
│   ├── attempt.ts              # Attempt, Confidence, ErrorType
│   ├── session.ts              # DailySession, SessionBlock, SessionItem
│   └── analytics.ts            # WeaknessProfile, WeeklyCheckpoint, ReadinessSnapshot
│
├── config/
│   ├── learning.config.ts      # Ngưỡng, trọng số, interval, tỉ lệ phase
│   ├── phase.config.ts         # Bảng tỉ lệ phase, TRIAGE, FINAL_14/7
│   └── timing.config.ts        # Mục tiêu responseTime theo question type
│
├── content/                    # CONTENT LAYER — dữ liệu tĩnh
│   ├── data/
│   │   ├── grammar/*.json
│   │   ├── questions/*.json
│   │   ├── families.json
│   │   ├── relations.json
│   │   └── sources.json
│   ├── schema/                 # Zod schema
│   ├── repository.ts           # API đọc content (index hoá, cache)
│   ├── validator.ts            # Kiểm tra toàn vẹn + verificationStatus
│   └── importer.ts             # Import JSON/CSV từ tài liệu ngoài
│
├── engines/
│   ├── phase/                  # PhaseEngine
│   ├── roadmap/                # RoadmapEngine
│   ├── mastery/                # MasteryEngine
│   ├── review/                 # ReviewEngine
│   ├── session/                # SessionEngine
│   ├── exercise/               # ExerciseEngine
│   ├── error/                  # ErrorEngine
│   ├── adaptation/             # AdaptationEngine
│   └── analytics/              # AnalyticsEngine
│
├── storage/
│   ├── db.ts                   # Dexie schema + migration
│   ├── repositories/           # attemptRepo, masteryRepo, sessionRepo, profileRepo
│   └── backup.ts               # export/import JSON
│
├── app/
│   ├── stores/                 # Zustand: profileStore, sessionStore, uiStore
│   ├── hooks/                  # useTodaySession, useGrammar, useMastery...
│   └── services/               # Kết nối engine ↔ storage (impure orchestration)
│
├── ui/
│   ├── pages/                  # 13 route
│   ├── components/
│   └── design/                 # tokens, typography (Japanese-safe)
│
├── shared/                     # Hàm thuần dùng chung: date, math, prng, id
│
└── i18n/vi.ts
```

> `src/shared/` được thêm ở lần triển khai đầu tiên (ADR #7). Lý do: `engines/**` cần
> các hàm thuần về ngày/toán/PRNG; đặt chúng trong `domain/` sẽ phá luật "domain không
> import gì", còn nhân bản vào từng engine thì vi phạm `CLAUDE.md §0.5`.

---

## 3. LUẬT PHỤ THUỘC (DEPENDENCY RULES)

```
domain      ← không import gì (trừ type helper)
shared      ← config (hằng số trình bày)         # ADR #7
config      ← domain
content     ← domain, config, shared
storage     ← domain, config
engines     ← domain, config, shared, content(type-only qua repository interface)
app         ← domain, config, shared, content, storage, engines
ui          ← domain(type), shared, app, i18n, engines(chỉ hàm THUẦN để render)
```

> Ngoại lệ có kiểm soát ở `ui`: được phép import hàm **thuần, không trạng thái** của
> `engines/exercise` (`shuffleChoices`), `engines/session` (`displayGroups`),
> `engines/review` (`selectDueItems`) và `engines/mastery` (`canPromoteToExamReady`)
> để **render**. Mọi thứ có side effect vẫn phải đi qua `app/services/*`.
> Danh sách này được khoá bằng test ở `src/__tests__/architecture.test.ts`.

Cấm tuyệt đối:
- `engines/**` import từ `ui/**`, `app/**`, hoặc `storage/**` (engine nhận dữ liệu qua tham số).
- `ui/**` import trực tiếp `engines/**` (phải đi qua `app/`).
- `content/**` import `storage/**`.

Thực thi bằng `eslint-plugin-boundaries` (hoặc `import/no-restricted-paths`). Vi phạm = build fail.

---

## 4. DOMAIN MODEL

### 4.1 Enums (`domain/enums.ts`)

```ts
export type Phase = 'PHASE_1_KNOW' | 'PHASE_2_COMPARE' | 'PHASE_3_DETECT';

export type MasteryState =
  | 'UNSEEN' | 'INTRODUCED' | 'RECOGNIZED'
  | 'SHAKY' | 'CONFUSED' | 'COMPARABLE' | 'EXAM_READY';

export type Confidence = 'GUESS' | 'UNSURE' | 'CONFIDENT';

export type ErrorType =
  | 'MEANING_ERROR' | 'FORM_ERROR' | 'NUANCE_ERROR' | 'CONSTRAINT_ERROR'
  | 'SIMILAR_GRAMMAR_CONFUSION' | 'CONTEXT_ERROR' | 'COLLOCATION_ERROR'
  | 'CARELESS_ERROR' | 'TIME_PRESSURE_ERROR' | 'TRAP_ERROR';

export type QuestionType =
  | 'MEANING_MC'       // nghĩa gần nhất — drill nội bộ
  | 'FORM_MC'          // 接続 / thể — drill nội bộ
  | 'MINIMAL_PAIR'     // 2 mẫu gần nghĩa, chọn 1
  | 'WHY_NOT_OTHER'    // giải thích vì sao không phải mẫu kia
  | 'CLOZE_MC'         // 問題5 文法形式の判断
  | 'SENTENCE_BUILD'   // 問題6 文の組み立て (★)
  | 'TEXT_GRAMMAR'     // 問題7 文章の文法
  | 'TRAP_ID';         // "Bẫy của câu này là gì?"

export type GrammarFamily =
  | 'LIMITATION' | 'CONCESSION' | 'CAUSE' | 'CONDITION' | 'DEGREE'
  | 'EMPHASIS' | 'TIME' | 'EVALUATION' | 'ASSUMPTION' | 'NEGATION'
  | 'PURPOSE' | 'ADDITION' | 'STANCE' | 'INEVITABILITY';

export type RelationType =
  | 'similarTo' | 'contrastsWith' | 'oftenConfusedWith'
  | 'sameFunctionGroup' | 'prerequisite' | 'registerVariantOf';

export type TrapType =
  | 'LOOKALIKE_FORM'        // hình thức gần giống (〜に至って / 〜に至っては)
  | 'MEANING_OVERLAP'       // nghĩa chồng lấn, khác sắc thái
  | 'CONNECTION_MISMATCH'   // 接続 không khớp
  | 'SUBJECT_MISMATCH'      // sai chủ thể (người nói / người khác)
  | 'REGISTER_MISMATCH'     // 硬い / 話し言葉 không hợp văn cảnh
  | 'POLARITY_TRAP'         // đòi hỏi phủ định / khẳng định
  | 'VOLITION_TRAP'         // ±意志動詞
  | 'CONTEXT_REVERSAL'      // ngữ cảnh đảo chiều ở câu trước/sau
  | 'COLLOCATION_TRAP';     // cụm cố định

export type SessionBlockType =
  | 'REVIEW' | 'LEARN' | 'RECALL' | 'COMPARE'
  | 'APPLY' | 'ANALYZE_ERROR' | 'SCHEDULE';

export type VerificationStatus = 'VERIFIED' | 'NEEDS_REVIEW' | 'DRAFT';
export type ExamFrequency = 'HIGH' | 'MEDIUM' | 'LOW';
export type Register = 'FORMAL_WRITTEN' | 'NEUTRAL' | 'SPOKEN' | 'LITERARY' | 'ARCHAIC';
export type StudyMode = 'NORMAL' | 'TRIAGE' | 'FINAL_14' | 'FINAL_7';

/* ── BỔ SUNG đã duyệt (spec-consistency-check C-02, C-03, A-01…A-05) ── */

// C-02: thêm 3 loại trắc nghiệm cho Month 1. MINI_SENTENCE_COMPLETION HOÃN sau MVP.
// QuestionType nay có 11 giá trị: 8 giá trị cũ + 3 dòng dưới.
//   | 'GRAMMAR_RECOGNITION'  // "câu này đang dùng mẫu nào?"
//   | 'VALID_OR_INVALID'     // 〇/× câu này có hợp lệ không
//   | 'CONTEXT_MATCH'        // ghép mẫu với ngữ cảnh phù hợp

// C-03: TrapType nay có 12 giá trị: 9 giá trị cũ + 3 dòng dưới.
//   | 'PART_OF_SPEECH_TRAP' | 'FAMILIAR_WORD_TRAP' | 'NUANCE_TRAP'

export type SkillDimension = 'KNOW' | 'COMPARE' | 'DETECT';                    // A-01

export type ComparisonAxis =                                                   // A-02
  | 'MEANING' | 'NUANCE' | 'CONNECTION' | 'SUBJECT' | 'REGISTER' | 'RESTRICTION'
  | 'TYPICAL_CONTEXT' | 'KEY_CLUE' | 'SPEAKER_INTENT' | 'STRENGTH'
  | 'TIME_RELATION' | 'POLARITY_TENDENCY';

export type ClueKind =                                                         // A-03
  | 'MEANING' | 'CONNECTION' | 'RESTRICTION' | 'CONTEXT'
  | 'NUANCE' | 'REGISTER' | 'COLLOCATION' | 'POSITION';

/** A-04, C-04 — mức feedback + áp lực thời gian khi GIAO bài. KHÁC hoàn toàn StudyMode. */
export type DeliveryMode = 'STUDY' | 'PRACTICE' | 'TIMED' | 'MOCK';

export type GradeOutcome =                                                     // A-05, C-06
  | 'CORRECT_CONFIDENT' | 'CORRECT_UNSURE' | 'CORRECT_GUESS'
  | 'INCORRECT_MISCONCEPTION' | 'INCORRECT_KNOWN_CONFUSION'
  | 'INCORRECT_NEW_CONFUSION' | 'INCORRECT_OTHER' | 'TIMEOUT';

export type GradeFlag =                                                        // A-05
  | 'MISCONCEPTION' | 'LUCKY' | 'TOO_SLOW' | 'SUSPICIOUSLY_FAST' | 'KNOWN_CONFUSION'
  | 'CLUE_MISS' | 'TRAP_HIT' | 'FULL_ORDER_CORRECT' | 'UNVERIFIED_CONTENT'
  | 'SAME_SESSION_REPEAT';

export type EvidenceLevel = 'NONE' | 'THIN' | 'OK' | 'SOLID';
export type BaseRank = 'INTRODUCED' | 'RECOGNIZED' | 'COMPARABLE' | 'EXAM_READY';  // G-01
export type ReadinessBand = 'ALERT' | 'BUILDING' | 'ON_TRACK' | 'SOLID' | 'READY';
```

### 4.2 Content model

```ts
interface Grammar {
  id: string;                  // 'ni-itatte'
  pattern: string;             // '〜に至って'
  reading?: string;
  aliases: string[];           // biến thể hiển thị trong đề

  meaningVi: string;           // 1–2 câu, KHÔNG dài
  coreImage: string;           // "logic lõi" 1 câu — dùng để nhớ nhanh
  structure: ConnectionRule[]; // 接続
  usage: string[];             // ≤ 3 gạch đầu dòng
  restrictions: Restriction[]; // ràng buộc — nguồn của CONSTRAINT_ERROR
  register: Register;
  examples: Example[];         // 2–4 ví dụ, mỗi ví dụ có dịch Việt
  commonMistakes: string[];    // ≤ 3
  keyClues: string[];          // dấu hiệu nhận biết trong đề (dùng ở Phase 3)

  families: GrammarFamily[];
  examFrequency: ExamFrequency;
  difficulty: 1 | 2 | 3;

  sourceId: string;
  sourcePage?: string;
  sourceSection?: string;
  sourceReference?: string;
  verificationStatus: VerificationStatus;
  conflictNote?: string;
}

interface ConnectionRule { pos: string; form: string; note?: string; } // 'V-辞書形', 'N＋の'
interface Restriction { kind: 'SUBJECT'|'POLARITY'|'VOLITION'|'TENSE'|'ANIMACY'|'SCOPE'|'OTHER';
                        ruleVi: string; counterExample?: string; }
interface Example { ja: string; vi: string; highlight?: [number, number]; register?: Register; }

interface GrammarRelation {
  from: string; to: string; type: RelationType;
  differenceKey?: string;      // "sắc thái", "chủ thể", "phạm vi"
  noteVi?: string;
  source: 'CURATED' | 'LEARNED';   // LEARNED = suy ra từ lỗi của chính người học
  strength?: number;               // với LEARNED: tần suất nhầm
}

interface ComparisonSet {        // xương sống của Compare Lab
  id: string;
  grammarIds: string[];          // 2–4 mẫu
  familyHint: GrammarFamily;
  rows: ComparisonRow[];         // Meaning/Nuance/Structure/Subject/Register/Restriction/Context/KeyClue
  decisiveDifferenceVi: string;  // "điểm khác biệt quyết định" — 1 câu
  sourceId: string;
  verificationStatus: VerificationStatus;
}

interface Question {
  id: string;
  type: QuestionType;
  phaseHint: Phase[];            // phase nào nên dùng câu này
  targetGrammarIds: string[];
  stemJa: string;                // câu hỏi (đã có ___ nếu cloze)
  contextJa?: string;            // dùng cho TEXT_GRAMMAR
  choices: Choice[];
  correctChoiceId: string;

  explanationVi: string;         // vì sao đúng
  keyClueVi: string;             // manh mối quyết định
  solvingStrategy: SolvingStep[];// đường giải nhanh nhất
  trap?: TrapAnnotation;

  targetTimeMs: number;
  sourceId: string; sourcePage?: string;
  verificationStatus: VerificationStatus;
}

interface Choice {
  id: string; textJa: string;
  isCorrect: boolean;
  wrongBecause?: ErrorType;      // BẮT BUỘC nếu isCorrect = false
  whyWrongVi?: string;           // BẮT BUỘC nếu isCorrect = false
  confusedWithGrammarId?: string;
}

interface TrapAnnotation {
  trapType: TrapType;
  trapExplanationVi: string;     // "đề đang cố làm bạn nhầm điều gì"
  fastestPathVi: string;         // đường loại trừ nhanh nhất
}

interface SolvingStep { order: number; labelJa: string; labelVi: string; }
// Bộ mặc định Phase 3: ①文末を見る ②接続を見る ③文脈を見る
//                     ④制約を見る ⑤選択肢を消す ⑥最後に意味確認
// KHÔNG áp dụng cứng: mỗi Question tự khai solvingStrategy theo type.
```

### 4.3 Learner model

```ts
interface LearnerProfile {
  id: 'me';
  examDate: string;              // ISO
  studyStartDate: string;
  availableMinutesPerDay: number;
  daysPerWeek: number;           // 1–7
  selfAssessedLevel: 'N2_JUST' | 'N2_SOLID' | 'N2_PLUS';
  grammarAlreadyStudiedCount: number;
  targetScoreBand: 'PASS' | 'COMFORTABLE' | 'HIGH';
  initialConfidence: 1 | 2 | 3 | 4 | 5;
  dayBoundaryHour: number;       // mặc định 4
  furiganaEnabled: boolean;
  createdAt: string;
}

interface StudyPlan {            // sinh bởi RoadmapEngine, có thể tái sinh
  totalStudyDays: number;
  phaseBoundaries: { knowEndsDay: number; compareEndsDay: number };
  coverageTarget: number;        // số grammar bắt buộc phủ
  requiredGrammarIds: string[];  // đã lọc theo examFrequency nếu TRIAGE
  newPerDay: number;
  generatedAt: string;
  version: number;               // tăng khi replan; giữ lịch sử
}

interface GrammarMastery {
  grammarId: string;
  state: MasteryState;
  isStale: boolean;
  firstSeenAt?: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  correctCount: number; wrongCount: number;
  distinctCorrectDays: number;
  streak: number;
  medianResponseTimeMs?: number;
  guessRate: number;
  confusedWith: Record<string, number>;   // grammarId → số lần nhầm
  stateHistory: MasteryEvent[];           // append-only, dùng cho phase transition summary

  // ── Bổ sung đã duyệt ──
  baseRank: BaseRank | null;      // G-01: bậc nền song song với state.
                                  // SHAKY/CONFUSED là CỜ, không nằm trên thang bậc;
                                  // không có trường này thì "tụt 1 bậc" là vô định nghĩa.
  pinned: boolean;                // G-04: bảo đảm "≥ 2 lần gặp trước ngày thi"
  guaranteedSecondAt?: string;    // G-04
  confusedPair?: string;          // cặp đang CONFUSED — chỉ thoát bằng contrast drill ĐÚNG cặp này
  learnCardDoneAt?: string;       // điều kiện đầu của UNSEEN → INTRODUCED
}

interface MasteryEvent { at: string; from: MasteryState; to: MasteryState; reason: string; }
```

### 4.4 Attempt (immutable, append-only)

```ts
interface Attempt {
  attemptId: string;
  sessionId: string;
  questionId: string;
  grammarId: string;             // grammar chính bị nhắm tới
  phase: Phase;
  blockType: SessionBlockType;
  isTimed: boolean;

  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;

  errorType?: ErrorType;
  errorSource?: 'AUTO' | 'SELF_REPORTED';
  confusedWith?: string;

  responseTimeMs: number;
  confidence: Confidence;
  timestamp: string;

  // ── Bổ sung đã duyệt (vẫn append-only, chỉ thêm trường optional/dẫn xuất) ──
  questionType: QuestionType;     // tránh join ngược sang content ở mọi truy vấn thống kê
  delivery: DeliveryMode;
  verified: boolean;              // ảnh chụp question.verificationStatus === 'VERIFIED'
  confidenceImputed?: boolean;    // G-06: MOCK ghi mặc định UNSURE, loại khỏi guessRate/calibration
  subKind?: 'AXIS_ID' | 'CLUE_ID' | 'TRAP_ID';   // C-09: câu meta không pha loãng comparisonAccuracy
  dayKey: string;                 // ngày học theo dayBoundaryHour — index chính cho mọi cửa sổ
}
```

### 4.5 Session model

```ts
interface DailySession {
  sessionId: string;
  date: string;                  // ngày học (theo dayBoundaryHour)
  phase: Phase;
  mode: StudyMode;
  plannedMinutes: number;
  blocks: SessionBlock[];
  adaptationNotes: AdaptationNote[];  // "vì sao hôm nay bạn học thế này"
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  startedAt?: string; completedAt?: string;
}

interface SessionBlock {
  type: SessionBlockType;
  budgetMinutes: number;
  items: SessionItem[];
  completed: boolean;
}

type SessionItem =
  | { kind: 'LEARN_CARD'; grammarId: string }
  | { kind: 'QUESTION'; questionId: string; timed: boolean }
  | { kind: 'COMPARE_SET'; comparisonSetId: string }
  | { kind: 'TRAP_DRILL'; questionId: string }
  | { kind: 'ERROR_REVIEW'; attemptIds: string[] };

interface AdaptationNote { ruleId: string; messageVi: string; }
```

---

## 5. STORAGE LAYER

### 5.1 Dexie schema (v1)

| Table | Primary key | Index |
|---|---|---|
| `profile` | `id` | — |
| `plans` | `version` | `generatedAt` |
| `mastery` | `grammarId` | `state`, `nextReviewAt`, `isStale`, `pinned`, `baseRank` |
| `attempts` | `attemptId` | `timestamp`, `grammarId`, `questionId`, `errorType`, `sessionId`, `dayKey` |
| `sessions` | `sessionId` | `date`, `status` |
| `checkpoints` | `id` | `weekIndex`, `createdAt` |
| `readiness` | `id` | `date` |
| `learnedRelations` | `[from+to]` | `strength` |
| `contentOverrides` | `id` | `type`, `verificationStatus` |
| `meta` | `key` | — (schemaVersion, lastBackupAt, phaseTransitionSeen) |

### 5.2 Luật lưu trữ

- `attempts` **chỉ append**. Không update, không delete (trừ khi người dùng reset toàn bộ).
- Mọi ghi phải qua `storage/repositories/*`. UI không chạm Dexie.
- Migration có version rõ ràng, kèm test.
- **Backup**: nút export JSON toàn bộ ở `/settings`, và nhắc backup mỗi 7 ngày. Import có xác nhận ghi đè.
- Ước lượng dung lượng: ~90 ngày × ~40 attempt/ngày ≈ 3.600 bản ghi → không đáng lo, không cần nén.

---

## 6. CONTENT LAYER

### 6.1 Trách nhiệm

- Giữ toàn bộ dữ liệu ngữ pháp/câu hỏi ở dạng dữ liệu, **không** logic.
- Cung cấp truy vấn đã index: theo id, theo family, theo relation, theo `examFrequency`, theo `verificationStatus`.
- **Không** biết gì về người học.

### 6.2 API (`content/repository.ts`)

```ts
getGrammar(id): Grammar
listGrammar(filter?): Grammar[]
getFamily(family): Grammar[]
getRelations(grammarId, types?): GrammarRelation[]
getComparisonSetsFor(grammarId): ComparisonSet[]
getQuestions(filter: { grammarIds?, types?, phase?, excludeIds? }): Question[]
getSource(sourceId): Source
```

### 6.3 Validator (chạy ở build time + test)

Kiểm tra bắt buộc:
1. Mọi `Grammar` có ≥ 1 family, ≥ 2 example, ≥ 1 ConnectionRule.
2. Mọi `Choice` sai có `wrongBecause` **và** `whyWrongVi`. Thiếu → **fail build**.
3. Mọi `Question` có `keyClueVi` và `solvingStrategy` không rỗng.
4. Mọi id trong `relations.json` tồn tại.
5. Mọi item không có `sourceId` hợp lệ → ép `verificationStatus = NEEDS_REVIEW`.
6. `ComparisonSet` chỉ ghép các grammar **có cạnh** trong relation graph.
7. Không có grammar nào chỉ xuất hiện trong đúng 1 câu hỏi (thiếu dữ liệu luyện tập) → cảnh báo.

### 6.4 Importer

```
File ngoài (JSON/CSV)
   → parse → map sang schema → Zod validate
   → gắn sourceId/sourcePage/sourceSection
   → verificationStatus = NEEDS_REVIEW (mặc định)
   → ghi vào contentOverrides (không sửa file gốc trong repo)
   → hiển thị báo cáo: X hợp lệ, Y lỗi, Z cần review
```

Nội dung `NEEDS_REVIEW` được luyện bình thường nhưng **không** dùng làm bằng chứng thăng `EXAM_READY` (`CLAUDE.md §16`).

---

## 7. ENGINES — TRÁCH NHIỆM & GIAO DIỆN

> Tất cả engine đều **pure**. `now: Date` luôn là tham số, không gọi `Date.now()` bên trong.

### 7.1 PhaseEngine

**Trách nhiệm:** biến ngày tháng thành phase và mode. Nơi **duy nhất** biết ranh giới phase.

```ts
computeTimeline(profile, now): {
  totalStudyDays, daysElapsed, daysRemaining, studyDayIndex,
  currentPhase, mode: StudyMode,
  progressExpected: number,      // 0..1
  phaseBoundaries, daysLeftInPhase, isPhaseTransitionDay,
  todayKey: string,              // ngày học 'YYYY-MM-DD' theo dayBoundaryHour
  isExamOver: boolean,           // ADR #8 — cờ dẫn xuất, thay cho `daysRemaining <= 0`
  isNearExam: boolean            // ADR #8 — daysUntilExam ≤ 21 (CLAUDE.md §14.4)
}
```
Luật: bảng tỉ lệ ở `CLAUDE.md §4.1`; Phase 3 ≥ 7 ngày; TRIAGE khi `daysRemaining < 30`; FINAL_14/FINAL_7 override.
**Không ai khác** được tự tính phase.

### 7.2 RoadmapEngine
**Bổ sung 2026-09-11 — hai hàm trả lời câu hỏi "kế hoạch này có thực tế không":**

| Hàm | Trả lời | Dùng ở |
|---|---|---|
| `coverageFeasibility()` | Phase 1 có kịp phủ hết kho mẫu không, và tối thiểu bao nhiêu buổi/tuần mới đủ | `/onboarding` bước xem lộ trình |
| `observedCadence()` | Nhịp học THỰC TẾ (đếm `dayKey` khác nhau trong 14 ngày) so với `daysPerWeek` đã khai | `/analytics` |

Lý do cần `observedCadence()`: `daysPerWeek` là con số người học **tự khai một lần** ở onboarding
nhưng chi phối `totalStudyDays`, ranh giới giai đoạn và `newPerDay`. Khai sai thì cả kế hoạch lệch,
mà `shouldReplan()` không phát hiện được — nó chỉ chỉnh `newPerDay`, không chỉnh chính `daysPerWeek`.

Ba ràng buộc cố ý của `observedCadence()`:
- **Im lặng trước ngày 14** (`CADENCE_MIN_ELAPSED_DAYS`) — mới bắt đầu mà đã phán "học ít quá" thì vừa sai vừa làm nản.
- **Lệch < 1 buổi/tuần thì không nói gì** (`CADENCE_MIN_DRIFT`) — tránh làm phiền vì sai số vụn.
- **Làm tròn XUỐNG** — khai thấp an toàn hơn khai cao: khai 5 mà học 7 chỉ có lợi, khai 7 mà học 4 thì kế hoạch sai từ gốc.



**Trách nhiệm:** sinh `StudyPlan` từ profile + content + mastery hiện có.

```ts
generatePlan(profile, timeline, allGrammar, mastery): StudyPlan
shouldReplan(plan, timeline, mastery): { need: boolean; reasonVi?: string }
```
Logic:
- `requiredGrammarIds` = lọc theo `examFrequency` nếu TRIAGE, sắp xếp theo `examFrequency DESC, difficulty ASC, family` (học nhóm cùng family gần nhau để chuẩn bị cho Phase 2).
- `newPerDay = ceil(unseenRequired / learningDaysLeftInPhase1)`, trần **8**.
- Replan khi: đổi `examDate`/`availableMinutesPerDay`, nghỉ ≥ 3 ngày, hoặc `progressActual` lệch `progressExpected` > 15%.
- Giữ lịch sử plan (version tăng dần) — không ghi đè.

### 7.3 MasteryEngine

**Trách nhiệm:** state machine ở `CLAUDE.md §5`. Nơi **duy nhất** đổi `MasteryState`.

```ts
applyAttempt(mastery, attempt, question, now): { mastery: GrammarMastery; event?: MasteryEvent }
applyDecay(mastery, timeline, now): GrammarMastery      // chỉ đặt isStale
canPromoteToExamReady(mastery, evidence): { ok: boolean; missingVi: string[] }
```
Bất biến bắt buộc (có test):
- `đúng + GUESS` không bao giờ thăng cấp.
- Không rơi về `UNSEEN`.
- Thăng `EXAM_READY` cần bằng chứng **timed** + **survived gap ≥ 3 ngày**.
- Bằng chứng từ nội dung `NEEDS_REVIEW` không đủ để thăng `EXAM_READY`.

### 7.4 ReviewEngine

**Trách nhiệm:** ưu tiên & lịch review (`CLAUDE.md §14`).

```ts
computePriority(mastery, ctx: { timeline, weakness, now }): number
computeNextReview(mastery, attempt, timeline): string     // ISO
selectDueItems(allMastery, ctx, capacity): GrammarMastery[]
auditExamCoverage(allMastery, timeline): { atRisk: string[]; messageVi: string }
```
Bất biến: mọi item đã học phải được lên lịch gặp lại **≥ 2 lần** trước `examDate`; nếu bất khả thi → `auditExamCoverage` trả cảnh báo cho `/analytics`.

### 7.5 SessionEngine

**Trách nhiệm:** dựng `DailySession` — trái tim của `/today`.

```ts
buildDailySession(input: {
  profile, timeline, plan, allMastery, weakness,
  contentRepo, adaptations, now
}): DailySession

buildAdHocDrill(kind: 'CONFUSION_PAIR'|'ERROR_TYPE'|'FAMILY'|'SPEED', payload): SessionBlock
```
Thuật toán:
1. Lấy tỉ lệ block theo phase/mode (`CLAUDE.md §8`).
2. Áp `AdaptationEngine` → điều chỉnh tỉ lệ + ghi `AdaptationNote`.
3. Nếu `reviewBacklog > 1.5 × capacity` → `LEARN = 0`, dồn REVIEW, ghi note giải thích.
4. Điền item cho từng block:
   - REVIEW ← `ReviewEngine.selectDueItems`
   - LEARN ← `plan.requiredGrammarIds` chưa `INTRODUCED`, ưu tiên cùng family với mẫu vừa học
   - RECALL ← `MEANING_MC`/`FORM_MC` của mẫu vừa học
   - COMPARE ← `ComparisonSet` chứa mẫu đang `CONFUSED`/mới học
   - APPLY ← `CLOZE_MC`/`SENTENCE_BUILD`/`TEXT_GRAMMAR`, có `timed` ở Phase 3
   - ANALYZE_ERROR ← lỗi trong session hôm nay + top lỗi 7 ngày
5. Cắt để tổng ≤ `M × 1.15`. **Không bao giờ** cắt `ANALYZE_ERROR`.
6. Chèn "sai → gặp lại cuối session".

### 7.6 ExerciseEngine

**Bổ sung 2026-09-11 — luật H9: KHÔNG hỏi mẫu chưa được dạy.**

Bộ lọc cứng trước đây (H1–H8) không có điều kiện nào về việc người học đã gặp mẫu hay chưa,
nên buổi đầu tiên có thể ra câu về mẫu thuộc lô soạn sau — trái hẳn `CLAUDE.md §7`
(vòng học `LEARN → RECALL → COMPARE → APPLY`, phần APPLY phải áp dụng cái VỪA HỌC).

`PickCriteria.introducedGrammarIds` khi được truyền sẽ loại mọi câu có **bất kỳ** mẫu đích
nằm ngoài danh sách. Yêu cầu ĐỦ CẢ BỘ, không phải một nửa: câu so sánh mà chỉ biết một
trong ba mẫu thì không so được gì.

`SessionEngine` dựng danh sách này bằng: mẫu đã học từ trước (`state ≠ UNSEEN`)
**cộng** các mẫu học ngay trong buổi đó — thiếu vế thứ hai thì RECALL sẽ không có câu cho
mẫu vừa dạy. `buildAdHocDrill` (Trap Lab, `/practice`) cũng nhận danh sách này.

Cố ý KHÔNG áp cho: bài xếp lớp (`buildPlacementQuiz`) vì mục đích của nó là hỏi mẫu chưa học.

> ⚠️ **Sửa 2026-09-12 — khối REVIEW ban đầu bị bỏ sót, và lý do bỏ sót là SAI.**
> Lập luận cũ: "REVIEW đã khoá vào đúng một mẫu đang đến hạn ôn nên mẫu đó chắc chắn đã học".
> Đúng về mẫu ĐẾN HẠN, nhưng `criteria.grammarIds` lọc bằng `.some()` — một câu so sánh nhắm
> ba mẫu vẫn lọt qua khi CHỈ MỘT mẫu khớp. Người học vì vậy gặp mẫu chưa dạy ngay trong phần ôn.
> `buildReviewItems` nay nhận và truyền `introducedGrammarIds`. Thà khối ôn tập ngắn đi còn hơn
> hỏi mẫu chưa dạy.



**Trách nhiệm:** chọn/biến hoá câu hỏi, chấm, xáo đáp án.

```ts
pickQuestions(criteria, history, count): Question[]
grade(question, selectedChoiceId, responseTimeMs, confidence): GradeResult
shuffleChoices(question, seed): Question
buildMinimalPair(a: Grammar, b: Grammar, pool): Question | null
```
Luật:
- Không lặp lại câu hỏi đã gặp trong **7 ngày** trừ khi đó là câu **đã sai** (khi đó cố ý lặp).
- `SENTENCE_BUILD` chấm theo **vị trí ★** như đề thật, không so chuỗi tự do.
- Distractor phải đến từ `oftenConfusedWith` / `similarTo`, **không** ngẫu nhiên.

### 7.7 ErrorEngine

**Trách nhiệm:** phân loại lỗi, dựng `WeaknessProfile`, sinh quan hệ `LEARNED`.

```ts
classify(attempt, question, mastery): { errorType: ErrorType; confusedWith?: string; needsSelfReport: boolean }
buildWeaknessProfile(attempts, mastery, timeline, now): WeaknessProfile
deriveLearnedRelations(attempts): GrammarRelation[]     // source: 'LEARNED'
summarizeForNotebook(profile): NotebookLineVi[]         // câu tiếng Việt cho /mistakes
```
Cửa sổ phân tích: **14 ngày**, có trọng số suy giảm (gần đây nặng hơn).

### 7.8 AdaptationEngine

**Trách nhiệm:** bảng luật ở `CLAUDE.md §15`. Rule-based, giải thích được.

```ts
evaluate(weakness, timeline, mastery): Adaptation[]
// Adaptation = { ruleId, blockDeltas: Partial<Record<SessionBlockType, number>>,
//                injectItems?: SessionItem[], messageVi: string, priority: number }
```
Luật: tối đa **3** adaptation/ngày (tránh session hỗn loạn); xung đột → lấy `priority` cao hơn; mọi adaptation phải hiển thị được cho người học.

### 7.9 AnalyticsEngine

**Trách nhiệm:** mọi chỉ số hiển thị + ERS + weekly checkpoint.

```ts
computeMetrics(attempts, mastery, timeline): DashboardMetrics
computeReadiness(metrics): ReadinessSnapshot   // ERS + 6 thành phần + band
buildWeeklyCheckpoint(weekIndex, attempts, mastery, prev): WeeklyCheckpoint
buildPhaseTransitionSummary(fromPhase, mastery, attempts): PhaseTransitionSummary
```

Định nghĩa chỉ số (chốt, không được diễn giải lại ở nơi khác):

| Chỉ số | Công thức |
|---|---|
| `coverage` | `(#mastery ≥ RECOGNIZED trong requiredGrammarIds) / coverageTarget` |
| `retention` | tỉ lệ đúng ở lần review **sau khoảng nghỉ ≥ 3 ngày**, 21 ngày gần nhất |
| `comparisonAccuracy` | accuracy của `MINIMAL_PAIR` + `WHY_NOT_OTHER`, 14 ngày |
| `trapDetection` | accuracy của câu **có** `trap`, cộng accuracy của `TRAP_ID`, 14 ngày |
| `timedAccuracy` | accuracy của attempt `isTimed = true`, 14 ngày |
| `speedIndex` | `clamp(targetRT / medianRT, 0, 1)` bình quân theo question type |
| `recentStability` | `1 − (độ lệch chuẩn accuracy theo ngày, 7 ngày gần nhất)` |
| `reviewBacklog` | số item `nextReviewAt < now` |

ERS: công thức `CLAUDE.md §23`. Chỉ tính khi `coverage ≥ 0.20`.

---

## 8. DATA FLOW

### 8.1 Onboarding → Roadmap

```
/onboarding (7 câu hỏi)
   → profileStore.save(LearnerProfile)          [storage]
   → PhaseEngine.computeTimeline()
   → RoadmapEngine.generatePlan()
   → plans.put(StudyPlan v1)
   → khởi tạo mastery = UNSEEN cho toàn bộ grammar
   → điều hướng /today
```
Nếu `grammarAlreadyStudiedCount > 0` → gợi ý (không bắt buộc) làm **placement quiz 15 câu** để đặt trạng thái ban đầu chính xác hơn `INTRODUCED`.

### 8.2 Mở `/today`

```
profile + now
  → PhaseEngine.computeTimeline
  → (nếu cần) RoadmapEngine.shouldReplan → replan
  → masteryRepo.getAll + attemptRepo.recent(14d)
  → ErrorEngine.buildWeaknessProfile
  → AdaptationEngine.evaluate
  → SessionEngine.buildDailySession
  → sessions.put(status=PLANNED)
  → UI render danh sách block
```
Session của một ngày được **sinh một lần** và lưu lại; mở lại app trong ngày → tiếp tục, không sinh mới (trừ khi người học bấm "Tạo lại").

### 8.3 Trả lời một câu (đường nóng nhất)

**Bổ sung 2026-09-11 — khối ANALYZE_ERROR phải được dựng LẠI trước khi bước vào.**

`getOrCreateTodaySession` sinh buổi học **một lần vào đầu ngày** và lưu lại (arch §8.2).
Lúc đó chưa có `Attempt` nào của hôm nay, nên `buildErrorMaterials` không tìm thấy câu sai
và khối ANALYZE_ERROR bị đóng băng ở thông điệp "hôm nay không có câu sai" — kể cả khi
người học sau đó sai hàng chục câu. Màn tổng kết lại tính lại từ `Attempt` thật nên hiện
đúng tỉ lệ, tạo ra mâu thuẫn ngay trong một buổi học.

`refreshAnalyzeBlock(session, env, timeline)` dựng lại **chỉ** khối đó từ nguyên liệu lỗi
hiện tại; `SessionPage` gọi ngay khi con trỏ sắp bước vào ANALYZE_ERROR.
`refreshAnalyze()` ở tầng app **đọc lại `Attempt` từ DB** chứ không tin `ctx.attempts` trong
store — các câu vừa trả lời có thể chưa kịp vào ctx, mà đó đúng là những câu cần chữa.



```
UI: chọn đáp án + confidence
  → ExerciseEngine.grade()
  → ErrorEngine.classify()  ─ nếu needsSelfReport → hỏi 1 chạm "Vì sao bạn chọn?"
  → tạo Attempt (immutable) → attempts.add()
  → MasteryEngine.applyAttempt() → mastery.put() (+ MasteryEvent)
  → ReviewEngine.computeNextReview() → mastery.nextReviewAt
  → nếu sai: đẩy item vào cuối session (gặp lại hôm nay)
  → UI hiện feedback:
       Correct answer · Why correct · Key clue
       Why A/B/C wrong · Trap type · Fastest solving path
```
Yêu cầu hiệu năng: từ lúc bấm đến lúc hiện feedback **< 100ms**. Ghi DB chạy bất đồng bộ, không chặn UI.

### 8.4 Kết thúc session

```
sessions.update(status=COMPLETED)
  → ErrorEngine.buildWeaknessProfile (làm mới)
  → ErrorEngine.deriveLearnedRelations → learnedRelations.put
  → AnalyticsEngine.computeMetrics + computeReadiness → readiness.put (snapshot theo ngày)
  → nếu studyDayIndex % 7 == 0 → buildWeeklyCheckpoint → checkpoints.put
  → nếu isPhaseTransitionDay → đánh dấu hiển thị màn hình chuyển phase
```

### 8.5 Weekly Checkpoint

```
Ngày học thứ 7/14/21/...
  → so sánh với checkpoint trước
  → xuất: grammar đã học, grammar yếu, confusion pairs, phân bố lỗi,
          accuracy, speed, review debt
  → RoadmapEngine.shouldReplan → nếu cần, sinh plan version mới
  → hiển thị "Tuần tới sẽ đổi gì và vì sao"
```

### 8.6 Phase Transition

```
isPhaseTransitionDay = true
  → AnalyticsEngine.buildPhaseTransitionSummary()
  → màn hình toàn trang: 文法を知る → 文法を比べる (hoặc → 問題を見抜く)
  → hiển thị X biết / Y shaky / Z cần review (+ confusion map ở lần thứ hai)
  → meta.phaseTransitionSeen = phase  (chỉ hiện 1 lần)
  → KHÔNG reset dữ liệu
```

---

## 9. PAGES — TRÁCH NHIỆM

> Mỗi trang phải trả lời `CLAUDE.md §19`. Câu trả lời ghi ngay dưới đây.

### `/onboarding`
- **Giúp lấy điểm ra sao:** biến thời gian còn lại thành kế hoạch có thật, tránh học lan man.
- Hỏi đúng 7 mục ở `LearnerProfile`, mỗi màn hình **một câu hỏi**.
- Kết thúc: hiển thị roadmap (số ngày, số mẫu/ngày, 3 phase) trước khi xác nhận.
- Có thể chạy lại từ `/settings` mà không mất lịch sử.

### `/today` — 今日の学習 ★ TRANG QUAN TRỌNG NHẤT
- **Giúp lấy điểm ra sao:** loại bỏ hoàn toàn chi phí ra quyết định; đảm bảo mỗi ngày chạm đủ 7 bước của learning loop.
- Hiển thị: phase hiện tại, số ngày còn lại, danh sách block với thời lượng, nút **"Bắt đầu"** to ở nửa dưới màn hình.
- Hiển thị `AdaptationNote` — "vì sao hôm nay bạn học thế này".
- Cho phép dừng giữa chừng và tiếp tục. Không mất tiến độ.
- **Không** cho người học tự chọn nội dung học (chỉ được chọn "học thêm" sau khi hoàn thành).

### `/grammar`
- **Giúp lấy điểm ra sao:** tra nhanh khi quên, và nhìn được mình đang đứng đâu.
- Danh sách + filter: family, mastery state, examFrequency, verificationStatus.
- Tìm kiếm theo pattern/nghĩa. Không phải từ điển đầy đủ — chỉ N1 grammar trong plan.

### `/grammar/:id` — Learn card (Phase 1)
- **Giúp lấy điểm ra sao:** đưa mẫu từ `UNSEEN` lên `RECOGNIZED` nhanh nhất.
- Thứ tự hiển thị **bắt buộc**:
  `1. Pattern → 2. Nghĩa (tiếng Việt) → 3. Core image → 4. Structure(接続) → 5. Usage → 6. Restrictions → 7. Register → 8. Examples → 9. Common mistake → 10. Mini recall`
- Giải thích ngắn. Mỗi phần ≤ 3 dòng. Bảng thay vì đoạn văn.
- **Bắt buộc** kết thúc bằng mini recall (`CLAUDE.md §11`).
- Hiện quan hệ graph: "Dễ nhầm với: …" (link sang `/compare`).
- Badge `NEEDS_REVIEW` nếu nội dung chưa xác minh.

### `/compare` — Compare Lab (Phase 2) ★
- **Giúp lấy điểm ra sao:** dạy đúng kỹ năng quyết định điểm số ở 問題5 — chọn giữa các đáp án gần nghĩa.
- Luồng bắt buộc:
  1. Hiện 2–4 mẫu + 1 câu ví dụ có chỗ trống → **người học thử chọn trước**.
  2. **Sau đó** mới hiện bảng so sánh: `Meaning · Nuance · Structure · Subject · Register · Restriction · Typical context · Key clue`.
  3. Nêu **decisive difference** trong 1 câu.
  4. Minimal pair questions.
  5. **Why-not-the-other**: "Tại sao câu này dùng A mà không dùng B?" — dạng bài quan trọng nhất Phase 2.
- Chỉ ghép mẫu có cạnh trong graph. Ưu tiên cặp đang `CONFUSED` của chính người học.
- Bảng so sánh phải cuộn ngang được trên 375px (hoặc chuyển layout thẻ dọc).

### `/trap-lab` — Trap Lab (Phase 3) ★
- **Giúp lấy điểm ra sao:** chuyển từ "hiểu ngữ pháp" sang "đọc được ý đồ của đề".
- Mỗi câu sau khi trả lời **bắt buộc** hiển thị đủ:
  `Correct answer · Why correct · What clue matters · Why A wrong · Why B wrong · Why C wrong · Trap type · Fastest solving path`
- Có dạng bài riêng `TRAP_ID`: 「この問題の罠は？」 — người học chọn loại bẫy trước khi xem giải thích.
- Hiển thị `solvingStrategy` theo từng question type (không áp cứng 6 bước cho mọi câu).
- Thống kê theo `TrapType`: bạn hay sập bẫy nào nhất.

### `/review`
- **Giúp lấy điểm ra sao:** chống quên — đảm bảo mẫu đã học không rơi lại trước ngày thi.
- Hàng đợi due theo `ReviewEngine.priority`. Hiển thị lý do ưu tiên ("bạn sai 3 lần", "9 ngày chưa gặp").
- Có chế độ **Rapid review** (chỉ nhận diện, ≤ 10s/câu) cho Phase 3.
- Hiển thị review backlog và thời gian ước tính để dọn hết.

### `/mistakes` — ミスノート
- **Giúp lấy điểm ra sao:** biến lỗi thành bài luyện có mục tiêu thay vì cảm giác mơ hồ "mình yếu ngữ pháp".
- **Không** phải log thô. Hiển thị theo `CLAUDE.md §10`:
  confusion pairs · loại lỗi hay mắc · "biết nghĩa nhưng sai sắc thái" · dạng bài tốn thời gian.
- Mỗi dòng có nút **"Luyện ngay"** → `SessionEngine.buildAdHocDrill`.
- Cho phép ghim (pin) một lỗi để nó xuất hiện thường xuyên hơn.

### `/grammar-map`
- **Giúp lấy điểm ra sao:** nhìn thấy khoảng trống còn lại và quyết định dồn sức vào đâu.
- Hiển thị toàn bộ grammar theo family × mastery state. Ví dụ hiển thị:
  ```
  120 grammar · 42 Exam Ready · 31 Comparable · 20 Recognized · 17 Shaky · 10 Unseen
  ```
- Filter: `Unseen · Weak · Confused · Ready · Needs Review`.
- Chạm vào một cụm → mở drill cho cụm đó.
- Trên mobile: dạng lưới/heatmap, **không** phải đồ thị lực (force graph) khó chạm.

### `/practice`
- **Giúp lấy điểm ra sao:** luyện thêm có kiểm soát khi còn thời gian, mà không phá lịch review.
- Tự chọn: theo family, theo mastery state, theo question type, theo trap type; bật/tắt timed.
- Attempt ở đây **vẫn** tính vào mastery và analytics (không có "chế độ nháp").

### `/mock`
- **Giúp lấy điểm ra sao:** mô phỏng áp lực thời gian thật — nơi duy nhất đo `TIME_PRESSURE_ERROR` đáng tin.
- Cấu trúc theo đề thật: **問題5 ×10 · 問題6 ×5 · 問題7 ×5**, tổng **20 phút**.
- Không hiện đáp án giữa chừng. Có đồng hồ đếm ngược. Có thể đánh dấu để quay lại.
- Sau khi nộp: điểm, thời gian/câu, phân bố lỗi, so với lần mock trước, và tạo drill từ câu sai.
- Khả dụng từ Phase 2; khuyến nghị **≥ 4 lần** trong Phase 3.

### `/analytics`
- **Giúp lấy điểm ra sao:** biến dữ liệu thành hành động, không phải để ngắm.
- Hiển thị đủ 11 mục ở `CLAUDE.md §24` + ERS với 6 thành phần con.
- Mỗi chỉ số kèm **một** nút hành động.
- Lịch sử Weekly Checkpoint + màn hình chuyển phase đã xem.
- Cảnh báo từ `ReviewEngine.auditExamCoverage`.

### `/settings`
- Sửa `examDate`, thời gian/ngày, số ngày/tuần → **kích hoạt replan** (có xác nhận, giữ lịch sử).
- Furigana on/off, dark mode, `dayBoundaryHour`.
- **Export/Import backup JSON** (bắt buộc MVP).
- Import content ngoài + báo cáo validation.
- Reset toàn bộ (xác nhận hai bước).

---

## 10. STATE MANAGEMENT

| Store | Nội dung | Ghi chú |
|---|---|---|
| `profileStore` | profile, timeline, plan | hydrate lúc khởi động |
| `sessionStore` | session hôm nay, con trỏ block/item, kết quả tạm | nguồn sự thật khi đang học |
| `contentStore` | cache content đã index | chỉ đọc |
| `metricsStore` | metrics + readiness snapshot gần nhất | tính lại sau mỗi session |
| `uiStore` | theme, furigana, modal, cờ chuyển phase | không chứa dữ liệu học |

Luật:
- Store **không chứa logic học tập** — chỉ gọi `app/services/*` vốn gọi engine.
- Timeline được tính lại khi app khởi động và khi qua `dayBoundaryHour`.
- Không lưu dữ liệu suy diễn được (derived) vào DB, trừ snapshot có chủ đích (`readiness`, `checkpoints`) để so sánh theo thời gian.

---

## 11. QUY TẮC UI DÙNG CHUNG (chi tiết ở `CLAUDE.md §18`)

- Layout `/today` và mọi màn hình luyện: nội dung trên, **hành động dưới** (thumb zone).
- Câu hỏi: đáp án là **nút full-width xếp dọc**, tối thiểu 56px cao.
- Confidence: 3 nút xuất hiện **cùng lúc** với đáp án (không phải màn hình thứ hai) để không tốn thêm thao tác.
- Feedback: hiện ngay tại chỗ, không điều hướng trang.
- Font: Noto Sans JP / Hiragino, `font-feature-settings` chuẩn; số và chữ Nhật không co giãn khác nhau.
- Không dùng màu đỏ lớn cho câu sai (gây stress); dùng nhãn trung tính + icon.
- Skeleton loading ≤ 1 giây; nếu lâu hơn là lỗi kiến trúc.

---

## 12. NỘI DUNG — QUY MÔ MỤC TIÊU (MVP)

| Loại | Số lượng tối thiểu MVP | Ghi chú |
|---|---|---|
| Grammar | 120–180 | theo tài liệu người học chọn |
| Câu hỏi/grammar | ≥ 6 | chia đủ các `QuestionType` |
| ComparisonSet | ≥ 40 | phủ các family hay ra đề |
| Câu có `trap` | ≥ 120 | phục vụ Phase 3 |
| Đề mock | ≥ 4 bộ 20 câu | dùng ở Phase 3 |

> **Tình trạng thực tế (cập nhật sau P4):** 195 grammar · 971 câu hỏi · 88 ComparisonSet ·
> 4 đoạn văn 文章の文法 · 203 câu có `trap` · 460 cạnh quan hệ.
> **183 grammar VERIFIED** trích từ ドリル＆ドリル N1 文法; 12 grammar seed AI vẫn `NEEDS_REVIEW`.
>
> ✅ **Thang mastery thông suốt: 195/195 mẫu đủ câu cho cả ba bậc.**
> ✅ **Độ dày đạt khuyến nghị: 195/195 mẫu có ≥ 6 câu** (thấp nhất 6, cao nhất 18).
> ✅ **Dựng được 4 đề mock liên tiếp không trùng câu nào.**
> Cả bốn điều trên đều khoá bằng test ở `coverage.test.ts`.
>
> Phân bố dạng câu: `MEANING_MC` 195 · `FORM_MC` 195 · `VALID_OR_INVALID` 138 ·
> `MINIMAL_PAIR` 176 · `CLOZE_MC` 205 · `SENTENCE_BUILD` 20 · `TEXT_GRAMMAR` 20 · còn lại 22.
> Ranh giới `VERIFIED` cho câu tự soạn: xem `implementation-decisions.md` D-01.

Nếu chưa đủ: app vẫn chạy nhưng `/analytics` hiển thị cảnh báo "dữ liệu luyện tập chưa đủ cho grammar X".

---

## 13. TESTING (bổ sung cho `CLAUDE.md §27`)

| Loại | Phạm vi |
|---|---|
| Unit | Toàn bộ `engines/**` — bắt buộc, coverage ≥ 90% |
| Property-based | `MasteryEngine`: sinh chuỗi attempt ngẫu nhiên, kiểm bất biến (không rơi về UNSEEN, GUESS không thăng cấp) |
| Snapshot | `SessionEngine`: cùng input → cùng session (deterministic, seed cố định) |
| Contract | `content/validator` chạy trong CI, fail nếu content sai schema |
| Integration | Luồng "trả lời câu hỏi" từ UI → DB → mastery |
| Manual | 375px một tay; chế độ máy bay (offline) |

Kịch bản test bắt buộc (regression):
1. Người học còn 45 ngày → phase ratio 40/30/30, TRIAGE không bật (45 ≥ 30).
2. Người học còn 20 ngày → TRIAGE bật, chỉ HIGH/MEDIUM vào plan.
3. Đúng 6 lần liên tiếp trong **một** session → **không** lên `EXAM_READY`.
4. `EXAM_READY` sai 1 câu → về `COMPARABLE` + `SHAKY`, không về `UNSEEN`.
5. Backlog 3× capacity → session hôm nay có `LEARN = 0` và có `AdaptationNote`.
6. `daysUntilExam = 5` → mọi interval ≤ 2 ngày.
7. Chuyển phase → không mất bản ghi mastery/attempt nào.

---

## 14. HIỆU NĂNG & OFFLINE

- Content đóng gói tĩnh trong một chunk riêng (`manualChunks` ở `vite.config.ts`).
- **Đo thực tế sau lô 3b (195 grammar · 708 câu hỏi):** chunk `content` 1,05 MB, **gzip 223 kB**;
  dựng toàn bộ `ContentIndex` mất **1,9 ms**, truy cập sau đó ~0,002 ms. Lazy-load theo family
  vì vậy CHƯA cần: chi phí duy nhất là một lần tải 223 kB, sau đó service worker precache.
  Ngưỡng nên xem lại: khi gzip vượt ~400 kB hoặc thời gian dựng index vượt 50 ms.
- Toàn bộ tính toán engine chạy đồng bộ trên main thread (dữ liệu nhỏ); nếu `computeMetrics` > 50ms → chuyển sang Web Worker.
- PWA: precache app shell + content JSON. Mất mạng vẫn học được **toàn bộ** tính năng.
- Nhắc backup mỗi 7 ngày; cảnh báo rõ rằng dữ liệu nằm trên trình duyệt.

### 14.1 Triển khai (host tĩnh)

App không có backend nên chỉ cần phục vụ thư mục `dist`. Ba ràng buộc bắt buộc của host:

| Ràng buộc | Lý do | Đã xử lý ở |
|---|---|---|
| Phải ở **root domain**, không phải subpath | `vite.config.ts` không đặt `base`; manifest dùng `start_url: '/'`, `scope: '/'`. Deploy ở `/tên-repo/` (GitHub Pages project page) sẽ hỏng đường dẫn asset. | ✅ Repo đặt tên `huyen2207.github.io` ⇒ Pages phục vụ ở gốc, không cần sửa `base`. |
| **SPA fallback** | `main.tsx` dùng `BrowserRouter`. Thiếu fallback thì tải lại `/today` ra 404. | GitHub Pages: `dist/404.html` do `npm run build` tạo. Netlify (nếu đổi host): `public/_redirects` + `netlify.toml`, vẫn giữ trong repo. |
| **HTTPS** | Service worker chỉ chạy trên HTTPS (hoặc `localhost`). Không có SW ⇒ mất offline và không cài được PWA — tức là mất đúng hai yêu cầu của `CLAUDE.md §18`. | — (chọn host đúng) |

`sw.js` được đặt `Cache-Control: no-cache` trong `netlify.toml`. Trên GitHub Pages không đặt header được, nhưng `vite-plugin-pwa` dùng `registerType: 'autoUpdate'` nên service worker vẫn tự kiểm tra bản mới mỗi lần tải trang.

> ⚠️ **IndexedDB gắn theo origin.** Đổi URL học ⇒ toàn bộ tiến độ không đi theo, phải
> export/import JSON ở `/settings`. Vì vậy URL học cần được chốt **trước** khi bắt đầu học thật.

---

## 15. RỦI RO ĐÃ BIẾT & ĐỐI SÁCH

| Rủi ro | Đối sách |
|---|---|
| Mất dữ liệu do xoá site data | Backup JSON + nhắc định kỳ + cảnh báo ở onboarding |
| Mất dữ liệu do **đổi URL học** (IndexedDB theo origin) | Chốt URL trước khi học thật (`§14.1`); nếu buộc phải đổi thì export ở URL cũ, import ở URL mới |
| Thêm nội dung giữa chừng làm tụt `coverage` và tăng số mẫu mới/ngày | Hành vi đúng theo thiết kế (`coverageTarget` suy từ content thực có); báo trước cho người học, ưu tiên soạn xong nội dung rồi mới bắt đầu |
| Nội dung ngữ pháp sai/bịa | `verificationStatus`, chặn thăng `EXAM_READY`, badge UI (`CLAUDE.md §16`) |
| Thiếu câu hỏi → lặp lại nhàm | Cảnh báo ở `/analytics`; `ExerciseEngine` tránh lặp trong 7 ngày |
| Người học bỏ 3–5 ngày | Session "quay lại" + replan tự động |
| Session quá tải, bỏ cuộc | Trần thời lượng `M × 1.15`, trần 8 mẫu mới/ngày |
| ERS bị hiểu nhầm là xác suất đậu | Bắt buộc dòng disclaimer + luôn hiện 6 thành phần con |
| Over-engineering | Thứ tự xây dựng cố định `CLAUDE.md §29`; anti-goals `§19.1` |

---

## 16. NHẬT KÝ QUYẾT ĐỊNH (ADR — cập nhật khi có thay đổi)

| # | Quyết định | Lý do | Ngày |
|---|---|---|---|
| 1 | Client-only, không backend | Một người học, một thiết bị; giảm thời gian xây dựng để dành cho nội dung | 2026-09-10 |
| 2 | IndexedDB/Dexie thay vì localStorage | Số attempt lớn dần, cần index & truy vấn | 2026-09-10 |
| 3 | Thuật toán review riêng thay vì SM-2 | SM-2 tối ưu trí nhớ dài hạn; ở đây tối ưu **readiness trước một mốc ngày cố định** | 2026-09-10 |
| 4 | Adaptation rule-based, không ML | Cần giải thích được cho người học; dữ liệu một người quá ít để học máy | 2026-09-10 |
| 5 | Mastery 7 trạng thái thay vì boolean | Phân biệt "đọc rồi" với "làm được trong thời gian giới hạn" | 2026-09-10 |
| 6 | Nội dung tách khỏi code, có `verificationStatus` | Không để AI bịa quy tắc ngữ pháp thành dữ liệu chính thức | 2026-09-10 |
| 7 | Thêm tầng `src/shared/` cho hàm thuần (date/math/prng/id) | `engines/**` cần chúng; đặt trong `domain/` phá luật "domain không import gì", nhân bản vào từng engine phá `CLAUDE.md §0.5` | 2026-09-10 |
| 8 | `Timeline` mang cờ dẫn xuất `isExamOver`, `isNearExam` | Giữ `PhaseEngine` là nơi DUY NHẤT so sánh ngưỡng ngày (`CLAUDE.md §4`); nơi khác đọc cờ, không đọc số | 2026-09-10 |
| 9 | `MasteryEngine.applyAttempt` nhận thêm tham số `evidence` (optional) | Bộ đếm trên `GrammarMastery` không biểu diễn được vị từ "5 attempt gần nhất thuộc MINIMAL_PAIR" (`CLAUDE.md §5.1`); engine vẫn pure, vẫn không I/O | 2026-09-10 |
| 10 | Ngân sách mock = 40s/80s/80s (đúng 20 phút) | `CLAUDE.md §13` chốt tổng 20 phút; mốc 35/60/60 là MỤC TIÊU tốc độ Phase 3, chặt hơn ngân sách phòng thi. Hai con số phục vụ hai mục đích khác nhau | 2026-09-10 |
| 11 | Dependency + luật nội dung thi hành bằng test thay vì `eslint-plugin-boundaries` | Một bộ test đọc AST-lite chạy cùng `vitest`, không thêm dependency, và kiểm được cả luật không thuộc phạm vi ESLint (chuỗi tiếng Nhật trong `.tsx`, magic number trong `engines/review/**`) | 2026-09-10 |

> Mọi dependency mới hoặc thay đổi kiến trúc phải thêm một dòng vào bảng này.

---

### ADR #12 — Bài xếp lớp KHÔNG được đổi `MasteryState` (P5)

**Bối cảnh.** Mục đích của bài xếp lớp là không phí ngày học cho mẫu người học đã biết.
Cách làm hiển nhiên là đặt thẳng `state = RECOGNIZED` cho mẫu trả lời đúng.

**Vấn đề.** `CLAUDE.md §5.1` quy định `INTRODUCED → RECOGNIZED` đòi **≥ 3 lần đúng trải trên
≥ 2 ngày khác nhau**, và `UNSEEN → INTRODUCED` đòi đã hoàn thành learn card. Bài xếp lớp
diễn ra trong **một ngày** và **không có learn card**. Thăng cấp từ đây là vi phạm trực tiếp.

**Quyết định.** Tách hẳn hai thứ:
- Kết quả xếp lớp ghi vào trường **mới** `GrammarMastery.placementResult: 'KNOWN' | 'UNKNOWN'`.
- Trường này **chỉ** được đọc ở một chỗ duy nhất: hàm sắp xếp hàng đợi LEARN trong `SessionEngine`.
- `MasteryState`, `baseRank`, `correctCount`… hoàn toàn không bị đụng tới.
- Mẫu `KNOWN` **vẫn nằm trong kế hoạch**, chỉ học sau. Không mẫu nào bị loại.

**Hệ quả.** Lợi ích nhỏ hơn phương án thăng cấp thẳng (chỉ đổi thứ tự, không rút ngắn coverage),
nhưng không phá vỡ điều khoản nghiêm ngặt nhất của máy trạng thái. Đổi lại, mẫu đã biết vẫn
được học — chỉ là muộn hơn — nên nếu người học tự đánh giá sai thì không mất gì.

Khoá bằng test: `placement.test.ts` kiểm tra `applyPlacement` không đổi bất kỳ trường nào khác,
và `session.test.ts` kiểm tra `KNOWN` bị đẩy khỏi nhóm học đầu nhưng không biến mất khỏi kế hoạch.

---

## 17. TÌNH TRẠNG CÁC MỤC CHƯA QUYẾT

| # | Mục | Tình trạng sau lần triển khai đầu | Ai quyết |
|---|---|---|---|
| 1 | **Tài liệu nguồn** cho grammar/questions | ✅ ĐÃ CÓ. Người học cung cấp ドリル＆ドリル日本語能力試験N1文法 (ユニコム, 2011) — đăng ký là `drill-drill-n1`, `kind: WORKBOOK`, `trustLevel: PRIMARY`. Đã trích **210 mẫu** vào `content-inventory/drill-drill-n1.json` và soạn **183 mẫu VERIFIED** (lô 1, lô 2, lô 3a, lô 3b) có trích dẫn trang 別冊 — tức toàn bộ mẫu HIGH và MEDIUM. 12 mẫu seed AI cũ vẫn `NEEDS_REVIEW`. Lô 4 (22 mẫu LOW, chủ yếu 敬語) người học đã quyết **KHÔNG làm**. | người học |
| 2 | **Số mẫu N1 mục tiêu** (120/150/180) | ⏳ CHƯA CHỐT, nhưng cận trên đã rõ: sách nguồn có **210 mẫu**. Không chặn code: `coverageTarget` suy từ số mẫu thực có trong content. | người học |
| 3 | **Ngày thi cụ thể** | ✅ KHÔNG còn là câu hỏi — người học tự khai ở `/onboarding`, mọi thứ tính ngược từ đó. | — |
| 4 | **Placement quiz** ở onboarding | ✅ ĐÃ LÀM (P5, 2026-09-11). 40 câu `MEANING_MC`/`FORM_MC`, trải đều family, ưu tiên mẫu hay ra đề. Bỏ qua được, làm lại được. | — |
| 5 | **Đồng bộ nhiều thiết bị** | ❌ KHÔNG làm (giữ ADR #1). Bù bằng export/import JSON ở `/settings` + nhắc sao lưu mỗi 7 ngày. | — |

> Hệ quả của mục 1 đã được GIẢI QUYẾT: 183/195 mẫu nay là `VERIFIED` nên đủ điều kiện đạt
> `EXAM_READY` (`CLAUDE.md §16.4`). 12 mẫu seed AI còn lại vẫn `NEEDS_REVIEW` và vì vậy vẫn
> không thể đạt `EXAM_READY` — đúng theo thiết kế; `/settings` hiển thị cảnh báo giải thích.
>
> ⚠️ **Nhưng còn một chặn khác, thuộc về NỘI DUNG chứ không phải trạng thái xác minh:**
> `COMPARABLE → EXAM_READY` đòi câu dạng đề thật (`CLOZE_MC` / `SENTENCE_BUILD` / `TEXT_GRAMMAR`).
> Hiện **100/195 mẫu (toàn bộ nhóm MEDIUM) chưa có câu dạng đề thật nào**, nên trên thực tế
> chúng không thể lên `EXAM_READY`. Xem hàng đầu bảng ưu tiên ở `§18`.

---

## 18. BẢNG ƯU TIÊN HOÀN THIỆN (sau lô 3b, 2026-09-11)

Đo trên kho nội dung thực tế: 195 grammar · 708 câu hỏi · 82 ComparisonSet.

| # | Việc | Bằng chứng | Vì sao ảnh hưởng điểm thi | Khối lượng |
|---|---|---|---|---|
| ~~P1~~ | ~~Câu dạng đề thật cho 100 mẫu MEDIUM~~ | ✅ **XONG** (2026-09-11): đã soạn 100 câu `CLOZE_MC` có `trap`, mỗi mẫu MEDIUM một câu | Nay mọi mẫu VERIFIED đều lên được `EXAM_READY`. Khoá bằng test `mọi mẫu VERIFIED đều có câu dạng đề thật…` ở `coverage.test.ts` | — |
| ~~P2~~ | ~~Đủ đề mock cho Phase 3~~ | ✅ **XONG** (2026-09-11): +9 `SENTENCE_BUILD`, +2 đoạn văn và +10 `TEXT_GRAMMAR`, tất cả `VERIFIED` | Nay dựng được **4 đề mock liên tiếp không trùng câu**. Khoá bằng test `dựng được 4 đề mock liên tiếp…` ở `coverage.test.ts` | — |
| ~~P3~~ | ~~Câu COMPARE cho 6 mẫu còn thiếu~~ | ✅ **XONG** (2026-09-11): 6 bộ so sánh mới ＋ 12 `MINIMAL_PAIR`, gồm cả cụm 「に至る／に至るまで／に至っては」mà `CLAUDE.md §3` lấy làm ví dụ mẫu | Thang mastery nay thông suốt cho cả 195 mẫu. Khoá bằng test `mọi mẫu đều có câu COMPARE…` | — |
| ~~P4~~ | ~~Nâng độ dày câu hỏi~~ | ✅ **XONG** (2026-09-11): 132 câu `VALID_OR_INVALID` soạn từ `restrictions` đã ghi trong content, cân bằng 62 đáp án 〇 / 76 đáp án × | Mọi mẫu nay có ≥ 6 câu. Khoá bằng test `mọi mẫu đạt mức khuyến nghị ≥ 6 câu hỏi` và test chống đoán mẹo ○× | — |
| ~~P5~~ | ~~Placement quiz ở onboarding~~ | ✅ **XONG** (2026-09-11): `engines/placement` + `/placement` + 40 câu. **KHÔNG** bỏ qua mẫu nào và **KHÔNG** thăng cấp mẫu nào — chỉ ghi `placementResult` để xếp lại thứ tự LEARN (xem ADR #12) | Mẫu đã chắc được đẩy xuống cuối hàng đợi; mẫu chưa biết học trước | — |
| **P6** | Kiểm thử trên máy thật | Đã deploy: **https://huyen2207.github.io/** (GitHub Pages, Actions). Mới chỉ kiểm ở khung 375px trong trình duyệt nội bộ. | `CLAUDE.md §28`: DoD đòi chạy được offline, một tay, 375px trên thiết bị thật | người học tự kiểm |

Thứ tự này bám theo `CLAUDE.md §19`: việc nào mở khoá được bậc mastery cao hơn thì lên trước.

