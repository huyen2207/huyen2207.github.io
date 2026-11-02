import { describe, it, expect } from 'vitest';
import { computeTimeline, phaseOfProgress } from './index';
import { PHASE_PROGRESS_THRESHOLDS } from '@/config/phase.config';
import type { LearnerProfile, LearnerProgress } from '@/domain/learner';

const T = PHASE_PROGRESS_THRESHOLDS;

function profile(over: Partial<LearnerProfile> = {}): LearnerProfile {
  return {
    id: 'me',
    studyStartDate: '2026-09-01T00:00:00.000Z',
    availableMinutesPerDay: 30,
    daysPerWeek: 7,
    selfAssessedLevel: 'N2_SOLID',
    grammarAlreadyStudiedCount: 0,
    targetScoreBand: 'COMFORTABLE',
    initialConfidence: 3,
    dayBoundaryHour: 4,
    furiganaEnabled: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

const progress = (over: Partial<LearnerProgress> = {}): LearnerProgress => ({
  recognizedShare: 0,
  comparableShare: 0,
  studyDaysDone: 0,
  ...over,
});

describe('Giai đoạn tính theo ĐỘ VỮNG (CLAUDE.md §3.2 sau sửa 2026-11-02)', () => {
  it('chưa vững phần nhận biết thì vẫn ở 文法を知る', () => {
    expect(phaseOfProgress(progress({ recognizedShare: T.knowToCompare - 0.01 }))).toBe('PHASE_1_KNOW');
  });

  it('đủ tỉ lệ nhận biết → sang 文法を比べる', () => {
    expect(phaseOfProgress(progress({ recognizedShare: T.knowToCompare }))).toBe('PHASE_2_COMPARE');
  });

  it('đủ tỉ lệ phân biệt → sang 問題を見抜く', () => {
    expect(
      phaseOfProgress(progress({ recognizedShare: 1, comparableShare: T.compareToDetect })),
    ).toBe('PHASE_3_DETECT');
  });

  it('LỊCH TRÔI QUA KHÔNG LÀM ĐỔI GIAI ĐOẠN — điểm mấu chốt của lần sửa này', () => {
    // Có ngày thi, lịch đã trôi gần hết, nhưng chưa vững mẫu nào.
    // Cách tính cũ đẩy thẳng sang 問題を見抜く; cách mới giữ người học ở 文法を知る.
    const t = computeTimeline(
      profile({ examDate: '2026-12-06T00:00:00.000Z' }),
      new Date('2026-11-20T09:00:00.000Z'),
      progress(),
    );
    expect(t.studyDayIndex).toBeGreaterThan(t.phaseBoundaries.compareEndsDay);
    expect(t.currentPhase).toBe('PHASE_1_KNOW');
  });

  it('học nhiều buổi mà chưa vững thì vẫn ở giai đoạn 1 — số buổi không phải thước đo', () => {
    const t = computeTimeline(profile(), new Date('2026-12-20T09:00:00.000Z'), progress({ studyDaysDone: 60 }));
    expect(t.studyDayIndex).toBeGreaterThan(t.phaseBoundaries.knowEndsDay);
    expect(t.currentPhase).toBe('PHASE_1_KNOW');
  });

  it('không khai ngày thi → không còn bất kỳ áp lực hạn chót nào', () => {
    const t = computeTimeline(profile(), new Date('2026-09-10T09:00:00.000Z'), progress());
    expect(t.hasDeadline).toBe(false);
    expect(t.isNearExam).toBe(false);
    expect(t.isExamOver).toBe(false);
    expect(t.mode).toBe('NORMAL'); // không TRIAGE, không FINAL_14/7
    // Không có mốc "đáng lẽ phải đạt" → không bị báo trễ tiến độ.
    expect(t.progressExpected).toBe(0);
  });

  it('đăng ký thi sau → các luật theo hạn chót sống lại', () => {
    const t = computeTimeline(
      profile({ examDate: '2026-09-20T00:00:00.000Z' }),
      new Date('2026-09-10T09:00:00.000Z'),
      progress(),
    );
    expect(t.hasDeadline).toBe(true);
    expect(t.isNearExam).toBe(true);
    expect(t.mode).toBe('FINAL_14');
    // Nhưng giai đoạn VẪN theo độ vững, không vì sát ngày thi mà nhảy cóc.
    expect(t.currentPhase).toBe('PHASE_1_KNOW');
  });

  it('số buổi đếm theo số ngày THỰC SỰ ngồi học, không theo ngày trên lịch', () => {
    const t = computeTimeline(
      profile(),
      new Date('2026-12-20T09:00:00.000Z'),
      progress({ studyDaysDone: 7 }),
    );
    expect(t.studyDayIndex).toBe(8);
  });
});
