import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSubmission, submissionBody, validateSubmission } from '../src/lib/submissions/core.mjs';

test('website draft accepts optional editorial sections and defaults its evidence', () => {
  const input = { name: 'Example AI', website: 'https://example.org/', purpose: 'Search documents with AI.' };
  const { values, errors } = validateSubmission(input);
  assert.deepEqual(errors, {});
  assert.equal(values.evidence, input.website);
  const body = submissionBody(values);
  assert.match(body, /### Problem it solves\n_No response_/);
  assert.equal(parseSubmission(body).purpose, input.purpose);
});
test('new and legacy headings preserve text, while duplicates and oversized lists fail', () => {
  const values = { repo: 'https://github.com/example/tool', purpose: 'Search documents with AI.', problem: 'Finding the right source takes time.', audience: 'Researchers\nSupport teams', reason: 'Answers link back to sources.', limitations: 'Requires a connected workspace.' };
  const body = submissionBody(values);
  const parsed = parseSubmission(body);
  assert.equal(parsed.audience, values.audience); assert.equal(parsed.problem, values.problem);
  assert.equal(parsed.limitations, values.limitations);
  assert.equal(parseSubmission(body.replace('### Summary', '### What does it do?').replace('### Why is it useful?', '### Why is it worth including?')).reason, values.reason);
  assert.throws(() => parseSubmission(body+'\n### What does it do?\nConflicting summary.'), /Duplicate/);
  assert.ok(validateSubmission({...values,audience:'x'.repeat(101)}).errors.audience);
});


test('tag IDs survive Markdown while malformed, oversized and duplicate sections fail', () => {
  const values = { name: 'Example AI', website: 'https://example.org/', purpose: 'Search documents with AI.', tags: 'search-retrieval, mcp' };
  assert.equal(parseSubmission(submissionBody(values)).tags, values.tags);
  assert.equal(validateSubmission({ ...values, tags: 'mcp, mcp' }).values.tags, 'mcp');
  for (const tags of ['one,two,three,four', '### Injected', 'a'.repeat(81)]) assert.ok(validateSubmission({ ...values, tags }).errors.tags);
  assert.throws(() => parseSubmission(submissionBody(values)+'\n### Tags\ncoding-agent'), /Duplicate/);
});

test('structured updates require a published revision and reject protected fields', async () => {
  const { inspectUpdate } = await import('../src/lib/submissions/updates.mjs');
  const project = { id: 'website:https://example.com', name: 'Example', updateRevision: 'a'.repeat(64), tags: [], links: [{ type: 'website', url: 'https://example.com/' }], editorial: { summary: 'Original summary.' } };
  const value = { version: 1, projectId: project.id, baseRevision: project.updateRevision, changes: { summary: 'Updated product description.' }, reason: 'Official documentation changed.', evidence: ['https://example.com/'], relationship: 'community' };
  const request = changes => ({ state: 'open', title: '[Update] Example', body: '### Update request\n```json\n' + JSON.stringify({ ...value, ...changes }) + '\n```' });
  assert.equal(inspectUpdate(request({}), [project], { tags: [], categories: [] }).changes[0].before, 'Original summary.');
  assert.throws(() => inspectUpdate(request({ baseRevision: 'b'.repeat(64) }), [project], { tags: [], categories: [] }), /listing changed/);
  assert.throws(() => inspectUpdate(request({ changes: { publication: 'published' } }), [project], { tags: [], categories: [] }), /unknown field/);
});
