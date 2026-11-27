import test from 'node:test';
import assert from 'node:assert/strict';

process.env.INCLUDE_DRAFT = '1';
const { getMentorContext, ruleResponse } = await import('../src/mentor.js');

const base = { attempt: 1, hintsUsed: 0, lastHintLevel: 0 };
const input = (taskId, errorProfile) => ({ storyId: 'case_001', taskId, skill: 'infer', lang: 'ru', errorProfile: { ...base, ...errorProfile } });
const strategyFor = (taskId, errorProfile) => {
  const request = input(taskId, errorProfile);
  const context = getMentorContext(request);
  assert.ok(context, `нет контекста для ${taskId}`);
  const answer = ruleResponse(context, request.errorProfile);
  assert.ok(context.hintIds.includes(answer.hintId) || answer.hintId, 'подсказка должна существовать');
  return answer.strategy;
};

test('ошибка только в ответе ведёт к locate', () => {
  assert.equal(strategyFor('t2', { answerWrong: true, evidenceWrong: false }), 'locate');
});

test('ошибка только в доказательстве: compare, а в claim_check check_contradiction', () => {
  assert.equal(strategyFor('t2', { answerWrong: false, evidenceWrong: true }), 'compare');
  assert.equal(strategyFor('t3', { answerWrong: false, evidenceWrong: true }), 'check_contradiction');
});

test('обе ошибки сначала ведут к locate (исходный факт), в любом типе задания', () => {
  assert.equal(strategyFor('t2', { answerWrong: true, evidenceWrong: true }), 'locate');
  assert.equal(strategyFor('t3', { answerWrong: true, evidenceWrong: true }), 'locate');
});

test('без ошибок остаётся compare и подсказка выдаётся по уровню', () => {
  assert.equal(strategyFor('t2', { answerWrong: false, evidenceWrong: false }), 'compare');
});
