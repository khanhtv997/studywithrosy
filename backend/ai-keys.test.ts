import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyKeyError, type AiKeysService } from './ai/ai-keys.service';
import { AiService } from './ai/ai.service';

test('provider errors are sorted into quota, invalid key and other', () => {
  assert.equal(classifyKeyError(Object.assign(new Error('got status: 429 Too Many Requests'), { status: 429 })), 'quota');
  assert.equal(classifyKeyError(new Error('{"error":{"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota"}}')), 'quota');
  assert.equal(classifyKeyError(new Error('API key not valid. Please pass a valid API key. [API_KEY_INVALID]')), 'invalid');
  assert.equal(classifyKeyError(Object.assign(new Error('forbidden'), { status: 403 })), 'invalid');
  assert.equal(classifyKeyError(Object.assign(new Error('The model is overloaded'), { status: 503 })), 'other');
  assert.equal(classifyKeyError(new Error('This operation was aborted')), 'other');
});

/** A fake key whose generateContent answers per model. */
const fakeKey = (id: string, answer: (model: string) => string | Error) => ({
  id, label: id,
  client: { models: { generateContent: async ({ model }: { model: string }) => {
    const result = answer(model);
    if (result instanceof Error) throw result;
    return { text: result };
  } } },
});

function setup(keys: ReturnType<typeof fakeKey>[]) {
  const log: string[] = [];
  const service = {
    usableKeys: async () => keys,
    recordSuccess: async (id: string) => { log.push(`ok:${id}`); },
    recordFailure: async (id: string, kind: string) => { log.push(`${kind}:${id}`); },
  } as unknown as AiKeysService;
  const ai = new AiService(service);
  (ai as unknown as { models: string[] }).models.splice(0, Infinity, 'm1', 'm2');
  return { ai, log, generate: (ai as unknown as { generate: (c: string) => Promise<{ text: string; model: string } | null> }).generate.bind(ai) };
}

test('a key out of quota is rested and the next key answers', async () => {
  const quota = Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
  const { generate, log } = setup([fakeKey('k1', () => quota), fakeKey('k2', () => 'hello')]);
  assert.deepEqual(await generate('x'), { text: 'hello', model: 'm1' });
  assert.deepEqual(log, ['quota:k1', 'ok:k2']);
});

test('an overloaded model moves to the next model on the same key', async () => {
  const busy = Object.assign(new Error('overloaded'), { status: 503 });
  const { generate, log } = setup([fakeKey('k1', model => model === 'm1' ? busy : 'from m2'), fakeKey('k2', () => 'unused')]);
  assert.deepEqual(await generate('x'), { text: 'from m2', model: 'm2' });
  assert.deepEqual(log, ['ok:k1']);
});

test('when every model is down for reasons unrelated to keys, other keys are not tried', async () => {
  const busy = Object.assign(new Error('overloaded'), { status: 503 });
  let k2Calls = 0;
  const { generate } = setup([fakeKey('k1', () => busy), fakeKey('k2', () => { k2Calls++; return 'unused'; })]);
  assert.equal(await generate('x'), null);
  assert.equal(k2Calls, 0);
});

test('an invalid key is marked and skipped', async () => {
  const { generate, log } = setup([fakeKey('k1', () => new Error('API key not valid [API_KEY_INVALID]')), fakeKey('k2', () => 'ok')]);
  assert.equal((await generate('x'))?.text, 'ok');
  assert.deepEqual(log, ['invalid:k1', 'ok:k2']);
});
