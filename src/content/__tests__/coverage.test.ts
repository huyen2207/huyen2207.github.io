import { describe, expect, it } from 'vitest';
import {
  contentStats,
  getGrammar,
  listQuestions,
  listRawGrammar,
} from '../repository';
import { buildMockSet, type ExposureHistory, type PickCriteria } from '@/engines/exercise';
import { MOCK_MIN_HIGH_RATIO, MOCK_COOLDOWN_DAYS } from '@/config/learning.config';
import { MOCK_STRUCTURE } from '@/config/timing.config';
import type { QuestionType } from '@/domain/enums';

const NOW = new Date('2026-11-01T09:00:00.000Z');
const MOCK_TOTAL = MOCK_STRUCTURE.reduce((s, p) => s + p.count, 0);
const env = { grammarById: getGrammar };

function criteria(over: Partial<PickCriteria> = {}): Omit<PickCriteria, 'delivery' | 'types'> {
  return {
    phase: 'PHASE_3_DETECT',
    mode: 'NORMAL',
    daysUntilExam: 25,
    seed: 4242,
    now: NOW,
    ...over,
  } as Omit<PickCriteria, 'delivery' | 'types'>;
}

const emptyHistory: ExposureHistory = { byQuestion: {}, recentQuestionIdsToday: [] };

/** Đánh dấu một loạt câu là "vừa gặp hôm nay" để mô phỏng người học đã luyện. */
function historyWith(questionIds: string[], at = NOW): ExposureHistory {
  return {
    byQuestion: Object.fromEntries(
      questionIds.map((id) => [id, { seenCount: 1, lastSeenAt: at.toISOString(), wrongCount: 0, lastWasWrong: false }]),
    ),
    recentQuestionIdsToday: [],
  };
}

const grammars = listRawGrammar();
const questions = listQuestions();

describe('Quy mô kho câu hỏi (arch §12)', () => {

  // SÀN CỨNG — khớp grammar-schema V11 ("grammar chỉ xuất hiện trong ≤ 1 câu hỏi" là vấn đề).
  // Dưới mức này thì mẫu KHÔNG học được: LEARN không có câu recall đi kèm.
  it('mọi mẫu có ≥ 2 câu hỏi (sàn cứng — đủ để vào session)', () => {
    const unusable = grammars
      .map((g) => ({ id: g.id, n: questions.filter((q) => q.targetGrammarIds.includes(g.id)).length }))
      .filter((x) => x.n < 2);
    expect(unusable).toEqual([]);
  });

  it('mọi mẫu có ≥ 1 câu nhận diện nghĩa và ≥ 1 câu 接続 (đủ cho block RECALL)', () => {
    const missing = grammars
      .map((g) => {
        const own = questions.filter((q) => q.targetGrammarIds.includes(g.id));
        return {
          id: g.id,
          meaning: own.some((q) => q.type === 'MEANING_MC'),
          form: own.some((q) => q.type === 'FORM_MC'),
        };
      })
      .filter((x) => !x.meaning || !x.form);
    expect(missing).toEqual([]);
  });

  // MỐC MVP (arch §12) — chưa đạt thì KHÔNG chặn build, nhưng phải nhìn thấy khoảng cách.
  it('báo cáo khoảng cách tới mốc ≥ 6 câu/mẫu của arch §12', () => {
    const gap = grammars
      .map((g) => ({ id: g.id, n: questions.filter((q) => q.targetGrammarIds.includes(g.id)).length }))
      .filter((x) => x.n < 6);
    const covered = grammars.length - gap.length;
    // Ghi lại để mỗi lần bổ sung nội dung là thấy ngay tiến độ.
    expect(covered).toBeGreaterThanOrEqual(12);
    expect(gap.every((x) => x.n >= 2)).toBe(true);
  });

  it('không có id câu hỏi nào trùng nhau', () => {
    const ids = questions.map((q) => q.id);
    expect(ids.length - new Set(ids).size).toBe(0);
  });

  it('mỗi dạng đề thật có đệm ≥ 2× nhu cầu của một đề mock', () => {
    for (const part of MOCK_STRUCTURE) {
      const n = questions.filter((q) => q.type === part.type).length;
      expect(n, `${part.type} chỉ có ${n} câu, cần ≥ ${part.count * 2}`).toBeGreaterThanOrEqual(part.count * 2);
    }
  });

  it('có ≥ 20 câu cài bẫy để nuôi Phase 3', () => {
    expect(questions.filter((q) => q.trap).length).toBeGreaterThanOrEqual(20);
  });
});

describe('Mock dựng được đề đầy đủ (exercise-engine §8)', () => {
  it('dựng được 4 đề mock liên tiếp, không đề nào trùng câu với đề trước', () => {
    // CLAUDE.md §14.5 xếp mock ở cuối chuỗi ưu tiên Phase 3; khuyến nghị ≥ 4 lần.
    // Từng chỉ đủ cho 2 đề vì SENTENCE_BUILD/TEXT_GRAMMAR quá mỏng.
    const seen = new Set<string>();
    const hist: ExposureHistory = { byQuestion: {}, recentQuestionIdsToday: [] };
    for (let i = 0; i < 4; i += 1) {
      const at = new Date(NOW.getTime() + i * 3 * 86_400_000);
      const res = buildMockSet(listQuestions(), criteria({ seed: 1000 + i, now: at }), hist, env);
      expect(res.shortfall).toBe(0);
      expect(res.questions).toHaveLength(MOCK_TOTAL);
      for (const q of res.questions) {
        expect(seen.has(q.id)).toBe(false);
        seen.add(q.id);
        hist.byQuestion[q.id] = { seenCount: 1, lastSeenAt: at.toISOString(), wrongCount: 0, lastWasWrong: false };
      }
    }
    expect(seen.size).toBe(MOCK_TOTAL * 4);
  });

  it('đề đầu tiên đủ 20 câu, đúng cấu trúc 10/5/5', () => {
    const res = buildMockSet(listQuestions(), criteria(), emptyHistory, env);
    expect(res.shortfall).toBe(0);
    expect(res.questions).toHaveLength(MOCK_TOTAL);
    const byType: Partial<Record<QuestionType, number>> = {};
    for (const q of res.questions) byType[q.type] = (byType[q.type] ?? 0) + 1;
    for (const part of MOCK_STRUCTURE) expect(byType[part.type]).toBe(part.count);
  });

  it('vẫn đủ 20 câu sau khi người học đã luyện một buổi trong ngày', () => {
    // Mô phỏng: 12 câu dạng đề đã gặp hôm nay.
    const seen = listQuestions()
      .filter((q) => ['CLOZE_MC', 'SENTENCE_BUILD', 'TEXT_GRAMMAR'].includes(q.type))
      .slice(0, 12)
      .map((q) => q.id);
    const res = buildMockSet(listQuestions(), criteria(), historyWith(seen), env);
    expect(res.shortfall).toBe(0);
    expect(res.questions).toHaveLength(MOCK_TOTAL);
  });

  it('hai đề mock liên tiếp không dùng lại câu nào (K5 — cửa sổ 14 ngày)', () => {
    const first = buildMockSet(listQuestions(), criteria(), emptyHistory, env);
    const second = buildMockSet(
      listQuestions(),
      criteria({ seed: 99 }),
      historyWith(first.questions.map((q) => q.id)),
      env,
    );
    expect(second.shortfall).toBe(0);
    expect(second.questions).toHaveLength(MOCK_TOTAL);
    const overlap = second.questions.filter((q) => first.questions.some((f) => f.id === q.id));
    expect(overlap).toEqual([]);
  });

  it('K5 — cửa sổ tránh lặp của mock là 14 ngày, dài hơn cooldown thường', () => {
    const first = buildMockSet(listQuestions(), criteria(), emptyHistory, env);
    const tenDaysAgo = new Date(NOW.getTime() - 10 * 86_400_000);
    const res = buildMockSet(
      listQuestions(),
      criteria({ seed: 7 }),
      historyWith(first.questions.map((q) => q.id), tenDaysAgo),
      env,
    );
    // 10 ngày < 14 ⇒ vẫn bị loại, dù đã quá cooldown thường (7 ngày).
    const overlap = res.questions.filter((q) => first.questions.some((f) => f.id === q.id));
    expect(overlap).toEqual([]);
    expect(MOCK_COOLDOWN_DAYS).toBeGreaterThan(7);
  });

  it('K5 — ≥ 60% câu trong đề nhắm grammar tần suất HIGH', () => {
    const res = buildMockSet(listQuestions(), criteria(), emptyHistory, env);
    const high = res.questions.filter((q) =>
      q.targetGrammarIds.some((g) => getGrammar(g)?.examFrequency === 'HIGH'),
    ).length;
    expect(high / res.questions.length).toBeGreaterThanOrEqual(MOCK_MIN_HIGH_RATIO);
  });

  it('mock không bao giờ lọt câu ngoài 3 dạng của đề thật', () => {
    const res = buildMockSet(listQuestions(), criteria(), emptyHistory, env);
    for (const q of res.questions) {
      expect(['CLOZE_MC', 'SENTENCE_BUILD', 'TEXT_GRAMMAR']).toContain(q.type);
    }
  });
});

describe('Vệ sinh dữ liệu', () => {
  it('không ký tự Cyrillic hay Hy Lạp lọt vào nội dung tiếng Nhật', () => {
    // Đã lọt 3 lần khi soạn nội dung hàng loạt (люди / широко / три) — khoá lại bằng test.
    const foreign = /[\u0400-\u04FF\u0370-\u03FF]/;
    const offenders: string[] = [];
    for (const q of questions) {
      if (foreign.test(q.stemJa)) offenders.push(`${q.id}: stemJa`);
      if (q.contextJa && foreign.test(q.contextJa)) offenders.push(`${q.id}: contextJa`);
      for (const c of q.choices) if (foreign.test(c.textJa)) offenders.push(`${q.id}: choice ${c.id}`);
    }
    for (const g of grammars) {
      for (const ex of g.examples) if (foreign.test(ex.ja)) offenders.push(`${g.id}: example`);
      for (const st of g.structure) if (foreign.test(st.form)) offenders.push(`${g.id}: structure`);
    }
    expect(offenders).toEqual([]);
  });

  it('mọi mẫu đạt mức khuyến nghị ≥ 6 câu hỏi', () => {
    // project-architecture.md §12. Trước P4 có 132/195 mẫu chỉ có 5 câu.
    const thin = grammars
      .map((g) => ({ id: g.id, n: questions.filter((q) => q.targetGrammarIds.includes(g.id)).length }))
      .filter((x) => x.n < 6);
    expect(thin).toEqual([]);
  });

  it('đáp án đúng luôn nằm vị trí đầu trong DỮ LIỆU — nên mọi màn hình phải xáo trộn', () => {
    // Ghi lại sự thật này thành test để không ai quên: nếu một trang hiển thị
    // choices theo đúng thứ tự dữ liệu thì đáp án luôn là nút số 1.
    // Đã từng thủng ở PlacementPage (P5).
    const firstIsCorrect = questions.filter((q) => q.choices[0]?.id === q.correctChoiceId).length;
    expect(firstIsCorrect).toBe(questions.length);
  });

  it('câu ○× không đoán được bằng mẹo: cả hai đáp án đều xuất hiện đáng kể', () => {
    // Nếu gần như câu nào cũng là × thì người học chỉ cần luôn chọn × là qua.
    const voi = questions.filter((q) => q.type === 'VALID_OR_INVALID');
    const yes = voi.filter((q) => q.choices.find((c) => c.isCorrect)!.textJa.startsWith('〇')).length;
    const ratio = yes / voi.length;
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
  });

  it('mọi mẫu đều có câu COMPARE để lên được COMPARABLE', () => {
    // CLAUDE.md §5.1: RECOGNIZED → COMPARABLE đòi MINIMAL_PAIR / WHY_NOT_OTHER.
    // Đã từng thủng: 6 mẫu không có câu nào thuộc hai dạng này nên kẹt ở RECOGNIZED.
    const compareTypes = ['MINIMAL_PAIR', 'WHY_NOT_OTHER'];
    const offenders = grammars
      .filter((g) => !questions.some((q) => q.targetGrammarIds.includes(g.id) && compareTypes.includes(q.type)))
      .map((g) => g.id);
    expect(offenders).toEqual([]);
  });

  it('mọi mẫu VERIFIED đều có câu dạng đề thật để lên được EXAM_READY', () => {
    // CLAUDE.md §5.1: COMPARABLE → EXAM_READY đòi CLOZE_MC / SENTENCE_BUILD / TEXT_GRAMMAR.
    // Đã từng thủng: 100/195 mẫu MEDIUM không có câu nào thuộc ba dạng này nên kẹt vĩnh viễn.
    const examTypes = ['CLOZE_MC', 'SENTENCE_BUILD', 'TEXT_GRAMMAR'];
    const offenders = grammars
      .filter((g) => g.verificationStatus === 'VERIFIED')
      .filter((g) => !questions.some((q) => q.targetGrammarIds.includes(g.id) && examTypes.includes(q.type)))
      .map((g) => g.id);
    expect(offenders).toEqual([]);
  });

  it('bản dịch nghĩa câu không được lẫn chữ Nhật', () => {
    // Đã lọt 1 lần khi soạn hàng loạt (viết tên nhóm động từ bằng tiếng Nhật vào bản dịch).
    const ja = /[\u3040-\u30ff\u4e00-\u9faf]/;
    const offenders = questions.filter((q) => q.stemVi && ja.test(q.stemVi)).map((q) => q.id);
    expect(offenders).toEqual([]);
  });

  it('mọi câu CÓ câu ví dụ thật đều có bản dịch nghĩa', () => {
    // Câu hỏi VỀ bản thân mẫu (nghĩa/接続/từ loại đứng trước) không có câu nào để dịch.
    const meta = /^「〜?[^」]+」(\([^)]*\))?(の(意味|接続|前に|元になって)|と組み合わせ|を使う文|が「)/;
    const sentenceTypes = [
      'CLOZE_MC', 'FORM_MC', 'MINIMAL_PAIR', 'VALID_OR_INVALID', 'CONTEXT_MATCH',
      'GRAMMAR_RECOGNITION', 'TRAP_ID', 'WHY_NOT_OTHER', 'SENTENCE_BUILD',
    ];
    const offenders = questions
      .filter((q) => sentenceTypes.includes(q.type) && !meta.test(q.stemJa) && !q.stemVi)
      .map((q) => q.id);
    expect(offenders).toEqual([]);
  });

  it('không có chữ Latin lọt vào câu hoặc đáp án tiếng Nhật', () => {
    // Đã lọt 1 lần khi soạn P1 (「family のため」thay vì 「家族のため」) — khoá lại bằng test.
    const latin = /[A-Za-z]{2,}/;
    const offenders = questions
      .filter((q) => latin.test(q.stemJa) || q.choices.some((c) => latin.test(c.textJa)))
      .map((q) => q.id);
    expect(offenders).toEqual([]);
  });

  it('mọi câu tiếng Nhật đều thực sự chứa chữ Nhật', () => {
    const ja = /[\u3040-\u30ff\u4e00-\u9faf]/;
    const offenders = questions.filter((q) => !ja.test(q.stemJa)).map((q) => q.id);
    expect(offenders).toEqual([]);
  });
});

describe('Thống kê nội dung', () => {
  it('không có hai mẫu ngữ pháp trùng nhau', () => {
    // Đã từng thủng: 「〜ならでは」nhập hai lần với hai id khác nhau. Hậu quả không chỉ là
    // đếm sai coverage — H9 coi chúng là hai mẫu khác nhau, nên câu so sánh nhắm mẫu này
    // bị loại vì "chưa học" mẫu kia, dù người học đã học đúng cái đó rồi.
    const norm = (p: string) => p.replace(/[〜～・\s（）()]/g, '');
    const seen = new Map<string, string>();
    for (const g of listRawGrammar()) {
      const key = norm(g.pattern);
      expect(seen.has(key), `${g.id} trùng mẫu với ${seen.get(key)}: ${g.pattern}`).toBe(false);
      seen.set(key, g.id);
    }
  });

  it('quy mô hiện tại', () => {
    const s = contentStats();
    // 194 chứ không phải 195: 「〜ならでは」từng bị nhập hai lần (nara-dewa + narade-wa), đã gộp.
    expect(s.grammar).toBe(194);
    expect(s.questions).toBeGreaterThanOrEqual(971);
    expect(s.comparisonSets).toBe(88);
  });

  it('nội dung ai-seed vẫn KHÔNG được xác minh (CLAUDE.md §16.3)', () => {
    const seedGrammar = listRawGrammar().filter((g) => g.sourceId === 'ai-seed');
    expect(seedGrammar.length).toBe(12);
    expect(seedGrammar.every((g) => g.verificationStatus === 'NEEDS_REVIEW')).toBe(true);
  });

  it('nội dung trích từ sách có nguồn PRIMARY và đủ số trang để đối chiếu', () => {
    const fromBook = listRawGrammar().filter((g) => g.sourceId === 'drill-drill-n1');
    expect(fromBook.length).toBe(182);
    expect(fromBook.every((g) => g.verificationStatus === 'VERIFIED')).toBe(true);
    expect(fromBook.every((g) => Boolean(g.sourcePage))).toBe(true);
  });
});
