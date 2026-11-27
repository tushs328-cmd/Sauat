import test from 'node:test';
import assert from 'node:assert/strict';
import { aiStatus, createAiState } from '../src/ai.js';

test('AI health becomes available only after successful warmup', async () => {
  let calls = 0;
  const state = createAiState({
    baseUrl: 'http://ollama.test',
    timeoutMs: 50,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ response: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  assert.equal(state.status, 'warming');
  assert.equal(aiStatus(state), 'fallback');
  assert.equal(await state.ready, true);
  assert.equal(state.status, 'available');
  assert.equal(aiStatus(state), 'available');
  assert.equal(calls, 1);
});

test('failed warmup keeps AI health on fallback', async () => {
  const state = createAiState({
    baseUrl: 'http://ollama.test',
    timeoutMs: 50,
    fetchImpl: async () => new Response('{}', { status: 503 })
  });
  assert.equal(await state.ready, false);
  assert.equal(state.status, 'failed');
  assert.equal(aiStatus(state), 'fallback');
});
