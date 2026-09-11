import { describe, expect, it } from 'vitest';
import { buildPlacementQuiz, applyPlacement, resultOf, placementRank } from './index';
import { listRawGrammar, listQuestions } from '@/content/repository';
import { createInitialMastery } from '@/engines/mastery';
import { PLACEMENT_QUESTION_COUNT } from '@/config/learning.config';
import { shuffleChoices } from '@/engines/exercise';

const grammars = listRawGrammar();
const questions = listQuestions();

describe('PlacementEngine — chọn câu', () => {
  it('lấy đúng số câu, mỗi mẫu nhiều nhất một câu', () => {
    const quiz = buildPlacementQuiz({ grammars, questions });
    expect(quiz).toHaveLength(PLACEMENT_QUESTION_COUNT);
    const ids = quiz.map((q) => q.targetGrammarIds[0]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('chỉ dùng dạng nhận diện cơ bản, không dùng câu dạng đề thật', () => {
    const quiz = buildPlacementQuiz({ grammars, questions });
    for (const q of quiz) expect(['MEANING_MC', 'FORM_MC']).toContain(q.type);
  });

  it('thuần tuý — gọi hai lần cho kết quả giống hệt', () => {
    const a = buildPlacementQuiz({ grammars, questions }).map((q) => q.id);
    const b = buildPlacementQuiz({ grammars, questions: [...questions].reverse() }).map((q) => q.id);
    expect(a).toEqual(b);
  });

  it('trải đều family thay vì dồn hết vào một nhóm', () => {
    const quiz = buildPlacementQuiz({ grammars, questions, count: 14 });
    const famOf = new Map(grammars.map((g) => [g.id, g.families[0] ?? '']));
    const fams = quiz.map((q) => famOf.get(q.targetGrammarIds[0]));
    // 14 câu đầu phải phủ ít nhất 10 family khác nhau.
    expect(new Set(fams).size).toBeGreaterThanOrEqual(10);
  });
});

describe('PlacementEngine — chấm kết quả', () => {
  it('đúng + CONFIDENT là đã biết', () => {
    expect(resultOf({ grammarId: 'x', isCorrect: true, confidence: 'CONFIDENT' })).toBe('KNOWN');
  });

  it('đúng + GUESS KHÔNG tính là đã biết', () => {
    expect(resultOf({ grammarId: 'x', isCorrect: true, confidence: 'GUESS' })).toBe('UNKNOWN');
  });

  it('sai thì luôn là chưa biết, dù tự tin', () => {
    expect(resultOf({ grammarId: 'x', isCorrect: false, confidence: 'CONFIDENT' })).toBe('UNKNOWN');
  });
});

describe('PlacementEngine — bất biến quan trọng nhất', () => {
  it('KHÔNG đổi state, baseRank hay bất kỳ trường nào của MasteryEngine', () => {
    const before = [createInitialMastery('beku'), createInitialMastery('taru')];
    const after = applyPlacement(before, [
      { grammarId: 'beku', isCorrect: true, confidence: 'CONFIDENT' },
    ]);
    const target = after.find((m) => m.grammarId === 'beku')!;
    expect(target.placementResult).toBe('KNOWN');
    // Mọi thứ còn lại phải y nguyên — xếp lớp không phải bằng chứng thăng cấp (CLAUDE.md §5.1).
    expect({ ...target, placementResult: undefined }).toEqual({
      ...before[0],
      placementResult: undefined,
    });
  });

  it('không đụng tới mẫu không nằm trong bài xếp lớp', () => {
    const before = [createInitialMastery('beku'), createInitialMastery('taru')];
    const after = applyPlacement(before, [
      { grammarId: 'beku', isCorrect: true, confidence: 'CONFIDENT' },
    ]);
    expect(after.find((m) => m.grammarId === 'taru')!.placementResult).toBeUndefined();
  });

  it('mẫu đã biết bị đẩy xuống sau trong hàng đợi LEARN, nhưng vẫn còn trong hàng', () => {
    const known = { ...createInitialMastery('a'), placementResult: 'KNOWN' as const };
    const unknown = { ...createInitialMastery('b'), placementResult: 'UNKNOWN' as const };
    const untested = createInitialMastery('c');
    expect(placementRank(known)).toBe(1);
    expect(placementRank(unknown)).toBe(0);
    expect(placementRank(untested)).toBe(0);
    expect(placementRank(undefined)).toBe(0);
  });
});

describe('Xáo trộn lựa chọn — bẫy đã từng sập ở P5', () => {
  it('shuffleChoices thực sự đổi vị trí đáp án đúng cho phần lớn câu', () => {
    const quiz = buildPlacementQuiz({ grammars, questions });
    const moved = quiz.filter((q) => {
      const s = shuffleChoices(q, `placement-${q.id}`);
      return s.choices[0].id !== q.correctChoiceId;
    }).length;
    // Với 4 lựa chọn, kỳ vọng ~75% câu có đáp án đúng rời khỏi vị trí đầu.
    expect(moved / quiz.length).toBeGreaterThan(0.5);
  });
});
