import { describe, expect, it } from 'vitest';
import { coverageFeasibility } from './index';
import { computeTimeline } from '@/engines/phase';
import { createInitialMastery } from '@/engines/mastery';
import { listRawGrammar } from '@/content/repository';
import type { LearnerProfile } from '@/domain/learner';
import { NEW_PER_DAY_HARD_CAP } from '@/config/learning.config';

const NOW = new Date('2026-09-11T09:00:00+07:00');
const allGrammar = listRawGrammar();
const mastery = allGrammar.map((g) => createInitialMastery(g.id));

function profile(daysPerWeek: number): LearnerProfile {
  return {
    id: 'me',
    examDate: '2026-12-06T00:00:00+07:00',
    studyStartDate: '2026-09-11T00:00:00+07:00',
    availableMinutesPerDay: 45,
    daysPerWeek,
    selfAssessedLevel: 'N2_SOLID',
    grammarAlreadyStudiedCount: 0,
    targetScoreBand: 'COMFORTABLE',
    initialConfidence: 2,
    dayBoundaryHour: 4,
    furiganaEnabled: false,
    createdAt: NOW.toISOString(),
  };
}

function feasibility(daysPerWeek: number) {
  const p = profile(daysPerWeek);
  return coverageFeasibility({
    profile: p,
    timeline: computeTimeline(p, NOW),
    allGrammar,
    mastery,
    now: NOW,
  });
}

describe('RoadmapEngine — Phase 1 có kịp phủ hết kho mẫu không', () => {
  it('7 buổi/tuần thì đủ, không cảnh báo', () => {
    const f = feasibility(7);
    expect(f.shortfall).toBe(0);
    expect(f.suggestedDaysPerWeek).toBeNull();
  });

  it('5 buổi/tuần thì THIẾU, và gợi ý đúng số buổi tối thiểu để hết thiếu', () => {
    const f = feasibility(5);
    expect(f.shortfall).toBeGreaterThan(0);
    expect(f.capacity).toBeLessThan(f.required);
    expect(f.suggestedDaysPerWeek).not.toBeNull();
    // Gợi ý phải thực sự giải quyết được vấn đề.
    expect(feasibility(f.suggestedDaysPerWeek!).shortfall).toBe(0);
    // …và phải là số nhỏ nhất có thể, không đẩy người học lên 7 một cách thừa thãi.
    expect(feasibility(f.suggestedDaysPerWeek! - 1).shortfall).toBeGreaterThan(0);
  });

  it('càng ít buổi học thì càng thiếu nhiều', () => {
    expect(feasibility(4).shortfall).toBeGreaterThan(feasibility(5).shortfall);
  });

  it('công suất không bao giờ vượt trần cứng 8 mẫu/ngày (§8.2)', () => {
    for (const dpw of [3, 4, 5, 6, 7]) {
      const f = feasibility(dpw);
      expect(f.capacity).toBeLessThanOrEqual(f.phase1Days * NEW_PER_DAY_HARD_CAP);
    }
  });
});
