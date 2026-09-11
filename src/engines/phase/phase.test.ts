import { describe, expect, it } from 'vitest';
import {
  allowedExamFrequencies,
  computePhaseBoundaries,
  computeTimeline,
  modeOf,
  phaseRatiosFor,
} from './index';
import type { LearnerProfile } from '@/domain/learner';

function profile(over: Partial<LearnerProfile> = {}): LearnerProfile {
  return {
    id: 'me',
    examDate: '2026-12-06T00:00:00.000Z',
    studyStartDate: '2026-09-07T00:00:00.000Z',
    availableMinutesPerDay: 45,
    daysPerWeek: 7,
    selfAssessedLevel: 'N2_SOLID',
    grammarAlreadyStudiedCount: 0,
    targetScoreBand: 'COMFORTABLE',
    initialConfidence: 3,
    dayBoundaryHour: 4,
    furiganaEnabled: false,
    createdAt: '2026-09-07T00:00:00.000Z',
    ...over,
  };
}

describe('PhaseEngine — bảng tỉ lệ CLAUDE.md §4.1', () => {
  it('chọn đúng dòng theo tổng số ngày', () => {
    expect(phaseRatiosFor(90).know).toBe(0.33);
    expect(phaseRatiosFor(75).know).toBe(0.35);
    expect(phaseRatiosFor(45).know).toBe(0.4);
    expect(phaseRatiosFor(20).know).toBe(0.45);
    expect(phaseRatiosFor(9).know).toBe(0);
  });

  it('90 ngày → 33/33/34 quy ra 30/29/31 ngày', () => {
    const b = computePhaseBoundaries(90);
    expect(b.knowEndsDay).toBe(30);
    expect(b.compareEndsDay - b.knowEndsDay).toBe(29);
    expect(90 - b.compareEndsDay).toBe(31);
  });

  it('45 ngày → tỉ lệ 40/30/30, TRIAGE không bật (45 ≥ 30)', () => {
    const b = computePhaseBoundaries(45);
    expect(b.knowEndsDay).toBe(18);
    expect(b.compareEndsDay - b.knowEndsDay).toBe(13);
    expect(45 - b.compareEndsDay).toBe(14);
    expect(modeOf(45)).toBe('NORMAL');
  });

  it('Phase 3 luôn ≥ 7 ngày khi tổng ≥ 14', () => {
    for (let total = 14; total <= 120; total++) {
      const b = computePhaseBoundaries(total);
      expect(total - b.compareEndsDay).toBeGreaterThanOrEqual(7);
    }
  });

  it('dưới 15 ngày → không còn phase KNOW', () => {
    const b = computePhaseBoundaries(10);
    expect(b.knowEndsDay).toBe(0);
  });
});

describe('PhaseEngine — mode', () => {
  it('TRIAGE bật khi daysRemaining < 30', () => {
    expect(modeOf(30)).toBe('NORMAL');
    expect(modeOf(29)).toBe('TRIAGE');
    expect(modeOf(20)).toBe('TRIAGE');
  });
  it('FINAL_14 / FINAL_7 override', () => {
    expect(modeOf(14)).toBe('FINAL_14');
    expect(modeOf(8)).toBe('FINAL_14');
    expect(modeOf(7)).toBe('FINAL_7');
    expect(modeOf(1)).toBe('FINAL_7');
  });
  it('qua ngày thi → NORMAL, không crash', () => {
    expect(modeOf(0)).toBe('NORMAL');
    expect(modeOf(-5)).toBe('NORMAL');
  });
  it('TRIAGE lọc examFrequency', () => {
    expect(allowedExamFrequencies(45)).toHaveLength(3);
    expect(allowedExamFrequencies(20)).toEqual(['HIGH', 'MEDIUM']);
    expect(allowedExamFrequencies(10)).toEqual(['HIGH']);
  });
});

describe('PhaseEngine — computeTimeline', () => {
  it('ngày đầu tiên là Day 1', () => {
    const t = computeTimeline(profile(), new Date('2026-09-07T10:00:00.000Z'));
    expect(t.studyDayIndex).toBe(1);
    expect(t.currentPhase).toBe('PHASE_1_KNOW');
    expect(t.progressExpected).toBe(0);
  });

  it('daysPerWeek < 7 nén tổng số ngày học', () => {
    const t = computeTimeline(profile({ daysPerWeek: 5 }), new Date('2026-09-07T10:00:00.000Z'));
    expect(t.totalStudyDays).toBeLessThan(90);
    expect(t.totalStudyDays).toBeGreaterThan(50);
  });

  it('không chia cho 0 khi đã qua ngày thi', () => {
    const t = computeTimeline(profile(), new Date('2027-01-10T10:00:00.000Z'));
    expect(t.daysRemaining).toBe(0);
    expect(t.mode).toBe('NORMAL');
    expect(Number.isFinite(t.progressExpected)).toBe(true);
  });

  it('pure — gọi hai lần cho cùng kết quả', () => {
    const now = new Date('2026-10-10T09:00:00.000Z');
    expect(computeTimeline(profile(), now)).toEqual(computeTimeline(profile(), now));
  });
});
