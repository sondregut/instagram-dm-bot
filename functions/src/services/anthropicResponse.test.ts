import { strict as assert } from 'node:assert';
import test from 'node:test';
import { extractAnthropicText } from './anthropicResponse';

test('extracts Claude text even when a non-text block comes first', () => {
  assert.equal(extractAnthropicText([
    { type: 'thinking' },
    { type: 'text', text: 'No worries. What got in the way?' },
  ]), 'No worries. What got in the way?');
});

test('joins multiple Claude text blocks and rejects blank output', () => {
  assert.equal(extractAnthropicText([
    { type: 'text', text: 'First' },
    { type: 'tool_use' },
    { type: 'text', text: 'Second' },
  ]), 'First\nSecond');
  assert.equal(extractAnthropicText([
    { type: 'thinking' },
    { type: 'text', text: '   ' },
  ]), null);
});
