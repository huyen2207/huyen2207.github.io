import type { Grammar } from '@/domain/grammar';
import type { Question } from '@/domain/question';
import type { GrammarMastery } from '@/domain/mastery';
import type { Confidence, PlacementResult, QuestionType } from '@/domain/enums';
import {
  EXAM_FREQUENCY_WEIGHT,
  PLACEMENT_QUESTION_COUNT,
  PLACEMENT_KNOWN_REQUIRES_NON_GUESS,
} from '@/config/learning.config';

/**
 * PlacementEngine — bài xếp lớp ở onboarding.
 *
 * Điều khoản quan trọng nhất của module này: nó KHÔNG BAO GIỜ đổi `MasteryState`.
 * `CLAUDE.md §5.1` đòi ≥ 2 ngày khác nhau mới lên `RECOGNIZED`, mà xếp lớp chỉ diễn ra
 * trong một ngày. Vì vậy kết quả chỉ ghi vào `placementResult` và chỉ dùng để
 * XẾP LẠI THỨ TỰ khối LEARN — không bỏ qua mẫu nào, không thăng cấp mẫu nào.
 */

/** Chỉ hỏi hai dạng nhận diện cơ bản; xếp lớp không phải bài thi. */
const PLACEMENT_TYPES: readonly QuestionType[] = ['MEANING_MC', 'FORM_MC'];

export interface PlacementQuizInput {
  grammars: Grammar[];
  questions: Question[];
  /** Mặc định PLACEMENT_QUESTION_COUNT; truyền vào được để test. */
  count?: number;
}

export interface PlacementAnswer {
  grammarId: string;
  isCorrect: boolean;
  confidence: Confidence;
}

/**
 * Chọn câu cho bài xếp lớp: ưu tiên mẫu hay ra đề, trải đều các family
 * để không dồn hết vào một nhóm. Thuần tuý — cùng input cho cùng output.
 */
export function buildPlacementQuiz(input: PlacementQuizInput): Question[] {
  const count = input.count ?? PLACEMENT_QUESTION_COUNT;
  if (count <= 0) return [];

  const byGrammar = new Map<string, Question>();
  for (const q of input.questions) {
    if (!PLACEMENT_TYPES.includes(q.type)) continue;
    if (q.targetGrammarIds.length !== 1) continue;
    const id = q.targetGrammarIds[0];
    const current = byGrammar.get(id);
    // Chốt lựa chọn theo id để hàm không phụ thuộc thứ tự mảng đầu vào.
    if (!current || q.id < current.id) byGrammar.set(id, q);
  }

  const candidates = input.grammars
    .filter((g) => byGrammar.has(g.id))
    .sort((a, b) => {
      const f = EXAM_FREQUENCY_WEIGHT[b.examFrequency] - EXAM_FREQUENCY_WEIGHT[a.examFrequency];
      if (f !== 0) return f;
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      return a.id.localeCompare(b.id);
    });

  // Chia vòng theo family: mỗi vòng lấy nhiều nhất một mẫu của mỗi family.
  const picked: Question[] = [];
  const used = new Set<string>();
  while (picked.length < count) {
    const seenFamilies = new Set<string>();
    let addedThisRound = 0;
    for (const g of candidates) {
      if (picked.length >= count) break;
      if (used.has(g.id)) continue;
      const fam = g.families[0] ?? '';
      if (seenFamilies.has(fam)) continue;
      seenFamilies.add(fam);
      used.add(g.id);
      picked.push(byGrammar.get(g.id)!);
      addedThisRound += 1;
    }
    if (addedThisRound === 0) break;
  }
  return picked;
}

/** Đúng VÀ không đoán thì mới tính là đã biết. */
export function resultOf(answer: PlacementAnswer): PlacementResult {
  if (!answer.isCorrect) return 'UNKNOWN';
  if (PLACEMENT_KNOWN_REQUIRES_NON_GUESS && answer.confidence === 'GUESS') return 'UNKNOWN';
  return 'KNOWN';
}

/**
 * Ghi kết quả xếp lớp vào mastery. Trả bản sao mới — KHÔNG đụng `state`,
 * `baseRank`, `correctCount` hay bất kỳ trường nào MasteryEngine sở hữu.
 */
export function applyPlacement(
  mastery: readonly GrammarMastery[],
  answers: readonly PlacementAnswer[],
): GrammarMastery[] {
  const resultById = new Map<string, PlacementResult>();
  for (const a of answers) resultById.set(a.grammarId, resultOf(a));
  return mastery.map((m) => {
    const r = resultById.get(m.grammarId);
    return r ? { ...m, placementResult: r } : m;
  });
}

/** Thứ tự LEARN: mẫu đã chứng minh là biết thì đẩy xuống cuối. 0 = học trước. */
export function placementRank(m: GrammarMastery | undefined): number {
  return m?.placementResult === 'KNOWN' ? 1 : 0;
}
