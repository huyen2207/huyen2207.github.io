import { getGrammar, getQuestion, listRawGrammar, getQuestionsForGrammar } from '@/content/repository';
import type { ErrorEnv } from '@/engines/error';
import type { AnalyticsEnv } from '@/engines/analytics';

export const errorEnv: ErrorEnv = {
  familiesOf: (id) => getGrammar(id)?.families ?? [],
  patternOf: (id) => getGrammar(id)?.pattern ?? id,
  trapTypeOf: (qid) => getQuestion(qid)?.trap?.trapType,
  skillOf: (qid) => getQuestion(qid)?.testedSkill,
};

export const analyticsEnv: AnalyticsEnv = {
  familiesOf: errorEnv.familiesOf,
  hasTrap: (qid) => Boolean(getQuestion(qid)?.trap),
  patternOf: errorEnv.patternOf,
  contentGaps: () =>
    listRawGrammar()
      .filter((g) => getQuestionsForGrammar(g.id).length < 2)
      .map((g) => g.id),
};
