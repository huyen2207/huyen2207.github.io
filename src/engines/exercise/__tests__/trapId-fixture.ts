import type { Question } from '@/domain/question';

/**
 * Câu TRAP_ID dựng riêng cho test.
 *
 * Dạng câu này đã bị gỡ khỏi kho nội dung (xem implementation-decisions.md D-04),
 * nhưng engine vẫn phải chấm đúng nếu sau này dựng lại một dạng dễ hiểu hơn.
 * Fixture nằm cạnh test để engine không phụ thuộc vào việc kho nội dung còn giữ
 * một id cụ thể nào.
 */
export const TRAP_ID_QUESTION: Question = {
  id: 'fixture-trapid',
  type: 'TRAP_ID',
  phaseHint: ['PHASE_3_DETECT'],
  targetGrammarIds: ['ni-itatte'],
  stemJa: '「被害が広がる___、政府は動いた。」この問題の罠は何か。',
  choices: [
    { id: 'LOOKALIKE_FORM', textJa: '見た目がそっくりな形', isCorrect: true },
    {
      id: 'REGISTER_MISMATCH',
      textJa: '文体の不一致',
      isCorrect: false,
      wrongBecause: 'TRAP_ERROR',
      whyWrongVi: 'Cả bốn đáp án đều cùng văn phong trang trọng.',
    },
    {
      id: 'SUBJECT_MISMATCH',
      textJa: '主体の不一致',
      isCorrect: false,
      wrongBecause: 'TRAP_ERROR',
      whyWrongVi: 'Chủ thể không phải điểm bị cài bẫy ở câu này.',
    },
    {
      id: 'COLLOCATION_TRAP',
      textJa: '決まった言い回しの罠',
      isCorrect: false,
      wrongBecause: 'TRAP_ERROR',
      whyWrongVi: 'Không có cụm cố định nào bị đánh tráo.',
    },
  ],
  correctChoiceId: 'LOOKALIKE_FORM',
  explanationVi: 'Bốn đáp án cùng gốc 「に至」, khác nhau chỉ ở phần đuôi.',
  keyClueVi: 'Đuôi của mỗi đáp án mới là chỗ khác nhau.',
  solvingStrategy: [{ order: 1, labelJa: '選択肢の差分を見る', labelVi: 'So sánh phần khác nhau giữa các đáp án' }],
  trap: {
    trapType: 'LOOKALIKE_FORM',
    trapExplanationVi: 'Đề dựa vào việc người học chỉ đọc phần đầu của đáp án.',
    fastestPathVi: 'Đọc từ phải sang trái: đuôi đáp án trước.',
    strength: 3,
  },
  targetTimeMs: 30_000,
  sourceId: 'ai-seed',
  verificationStatus: 'NEEDS_REVIEW',
  testedSkill: 'DETECT',
  difficultyStatic: 3,
  stemVi: 'Đến khi thiệt hại lan rộng, chính phủ mới ra tay.',
};
