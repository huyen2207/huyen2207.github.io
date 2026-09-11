import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QuestionRunner } from '../components/QuestionRunner';
import { LearnCard } from '../components/LearnCard';
import { ComparisonTable } from '../components/ComparisonTable';
import { completeOnboarding } from '@/app/services/onboardingService';
import { loadContext } from '@/app/services/context';
import { getOrCreateTodaySession } from '@/app/services/sessionService';
import { useAppStore } from '@/app/stores/appStore';
import { getComparisonSet, getGrammarView, getQuestion } from '@/content/repository';
import { attemptRepo, resetAllData } from '@/storage/repositories';
import vi from '@/i18n/vi';

const NOW = new Date('2026-09-07T09:00:00.000Z');

async function primeStore() {
  await completeOnboarding(
    {
      examDate: '2026-12-06T00:00:00.000Z',
      selfAssessedLevel: 'N2_SOLID',
      grammarAlreadyStudiedCount: 0,
      availableMinutesPerDay: 45,
      daysPerWeek: 7,
      targetScoreBand: 'COMFORTABLE',
      initialConfidence: 3,
    },
    NOW,
  );
  const ctx = (await loadContext(NOW))!;
  const session = await getOrCreateTodaySession(ctx);
  useAppStore.setState({ status: 'READY', ctx, session, errorMessage: null });
  return { ctx, session };
}

function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(async () => {
  await resetAllData();
  await primeStore();
});

describe('Luồng học chính — trả lời một câu', () => {
  it('bắt buộc chọn mức chắc chắn trước khi nộp (CLAUDE.md §12)', async () => {
    const user = userEvent.setup();
    const question = getQuestion('q-ni-itatte-cloze-01')!;
    wrap(<QuestionRunner question={question} delivery="PRACTICE" blockType="APPLY" onNext={() => {}} />);

    const submit = screen.getByRole('button', { name: vi['question.submit'] });
    expect(submit).toBeDisabled();

    await user.click(screen.getByText('に至って'));
    expect(submit).toBeDisabled(); // đã chọn đáp án nhưng chưa chọn confidence

    await user.click(screen.getByRole('radio', { name: vi['confidence.CONFIDENT'] }));
    expect(submit).toBeEnabled();
  });

  it('trả lời đúng → hiện phản hồi đầy đủ và ghi Attempt', async () => {
    const user = userEvent.setup();
    const question = getQuestion('q-ni-itatte-cloze-01')!;
    wrap(<QuestionRunner question={question} delivery="PRACTICE" blockType="APPLY" onNext={() => {}} />);

    await user.click(screen.getByText('に至って'));
    await user.click(screen.getByRole('radio', { name: vi['confidence.CONFIDENT'] }));
    await user.click(screen.getByRole('button', { name: vi['question.submit'] }));

    expect(screen.getByText(vi['question.correct'])).toBeInTheDocument();
    expect(screen.getByText(vi['question.whyCorrect'])).toBeInTheDocument();
    expect(screen.getByText(vi['question.keyClue'])).toBeInTheDocument();
    expect(screen.getByText(vi['question.solvingStrategy'])).toBeInTheDocument();

    await waitFor(async () => {
      expect(await attemptRepo.count()).toBe(1);
    });
    const [attempt] = await attemptRepo.all();
    expect(attempt.isCorrect).toBe(true);
    expect(attempt.confidence).toBe('CONFIDENT');
    expect(attempt.questionId).toBe(question.id);
  });

  it('trả lời sai → hiện vì sao sai từng đáp án và loại bẫy', async () => {
    const user = userEvent.setup();
    const question = getQuestion('q-ni-itatte-cloze-01')!;
    wrap(<QuestionRunner question={question} delivery="PRACTICE" blockType="APPLY" onNext={() => {}} />);

    await user.click(screen.getByText('に至っては'));
    await user.click(screen.getByRole('radio', { name: vi['confidence.CONFIDENT'] }));
    await user.click(screen.getByRole('button', { name: vi['question.submit'] }));

    expect(screen.getByText(vi['question.incorrect'])).toBeInTheDocument();
    expect(screen.getByText(vi['question.whyWrong'])).toBeInTheDocument();
    expect(screen.getByText(vi['trap.LOOKALIKE_FORM'])).toBeInTheDocument();
    expect(screen.getByText(question.trap!.trapExplanationVi)).toBeInTheDocument();
    // Giải thích cho ĐÚNG đáp án đã chọn phải có mặt.
    const chosen = question.choices.find((c) => c.textJa === 'に至っては')!;
    expect(screen.getByText(chosen.whyWrongVi!, { exact: false })).toBeInTheDocument();
  });

  it('MOCK không lộ bất kỳ phản hồi nào', async () => {
    const user = userEvent.setup();
    const question = getQuestion('q-ni-itatte-cloze-01')!;
    let advanced = false;
    wrap(
      <QuestionRunner
        question={question}
        delivery="MOCK"
        blockType="APPLY"
        onNext={() => {
          advanced = true;
        }}
      />,
    );

    await user.click(screen.getByText('に至っては'));
    await user.click(screen.getByRole('button', { name: vi['question.submit'] }));

    expect(advanced).toBe(true);
    expect(screen.queryByText(vi['question.whyCorrect'])).toBeNull();
    expect(screen.queryByText(vi['question.keyClue'])).toBeNull();
    expect(screen.queryByText(vi['trap.LOOKALIKE_FORM'])).toBeNull();
  });

  it('TIMED chỉ hiện đáp án + manh mối, KHÔNG hiện bẫy', async () => {
    const user = userEvent.setup();
    const question = getQuestion('q-ni-itatte-cloze-01')!;
    wrap(<QuestionRunner question={question} delivery="TIMED" blockType="APPLY" onNext={() => {}} />);

    await user.click(screen.getByText('に至って'));
    await user.click(screen.getByRole('radio', { name: vi['confidence.UNSURE'] }));
    await user.click(screen.getByRole('button', { name: vi['question.submit'] }));

    expect(screen.getByText(vi['question.keyClue'])).toBeInTheDocument();
    expect(screen.queryByText(vi['question.whyCorrect'])).toBeNull();
    expect(screen.queryByText(vi['trap.LOOKALIKE_FORM'])).toBeNull();
  });
});

describe('Learn card — active recall bắt buộc', () => {
  it('nghĩa bị che cho tới khi người học tự nhớ xong (CLAUDE.md §11)', async () => {
    const user = userEvent.setup();
    const grammar = getGrammarView('ni-itatte')!;
    wrap(<LearnCard grammar={grammar} onDone={() => {}} />);

    expect(screen.getByText(vi['learn.recallPrompt'])).toBeInTheDocument();
    expect(screen.queryByText(grammar.meaningVi)).toBeNull();

    await user.click(screen.getByRole('button', { name: vi['learn.recallReveal'] }));

    expect(screen.getByText(grammar.meaningVi)).toBeInTheDocument();
    expect(screen.getByText(grammar.coreImage)).toBeInTheDocument();
  });

  it('ràng buộc (注意) hiển thị TRƯỚC ví dụ', async () => {
    const user = userEvent.setup();
    const grammar = getGrammarView('narade-wa')!;
    const { container } = wrap(<LearnCard grammar={grammar} onDone={() => {}} />);
    await user.click(screen.getByRole('button', { name: vi['learn.recallReveal'] }));

    const html = container.innerHTML;
    expect(html.indexOf(vi['learn.restrictions'])).toBeGreaterThan(-1);
    expect(html.indexOf(vi['learn.restrictions'])).toBeLessThan(html.indexOf(vi['learn.examples']));
  });

  it('badge Chưa xác minh hiện với nội dung NEEDS_REVIEW', () => {
    const grammar = getGrammarView('ni-itatte')!;
    wrap(<LearnCard grammar={grammar} />);
    expect(screen.getByText(`⚠ ${vi['common.needsReview']}`)).toBeInTheDocument();
  });
});

describe('Compare Lab — bảng so sánh', () => {
  it('hiện điểm khác biệt quyết định và đủ cột cho mọi mẫu', () => {
    const set = getComparisonSet('cmp-time-01')!;
    wrap(<ComparisonTable set={set} />);

    expect(screen.getByText(set.decisiveDifferenceVi)).toBeInTheDocument();
    for (const gid of set.grammarIds) {
      const pattern = getGrammarView(gid)!.pattern;
      expect(screen.getAllByText(pattern).length).toBeGreaterThan(0);
    }
    for (const row of set.rows) {
      expect(screen.getByText(vi[`axis.${row.axis}`])).toBeInTheDocument();
    }
  });
});

describe('Khả năng truy cập', () => {
  it('đáp án là nút full-width, không phụ thuộc hoàn toàn vào màu', async () => {
    const question = getQuestion('q-ni-itatte-cloze-01')!;
    const { container } = wrap(
      <QuestionRunner question={question} delivery="PRACTICE" blockType="APPLY" onNext={() => {}} />,
    );
    const buttons = container.querySelectorAll('button.choice-tap');
    expect(buttons.length).toBe(question.choices.length);
    for (const b of buttons) {
      expect(b.className).toContain('w-full');
      expect(b.getAttribute('aria-pressed')).toBeDefined();
    }
  });

  it('nhóm chọn mức chắc chắn có vai trò radiogroup', () => {
    const question = getQuestion('q-ni-itatte-cloze-01')!;
    wrap(<QuestionRunner question={question} delivery="PRACTICE" blockType="APPLY" onNext={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: vi['confidence.prompt'] })).toBeInTheDocument();
  });
});
