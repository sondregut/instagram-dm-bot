import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRunLegacyAutomation } from './runtimeMode';

test('never runs legacy AI automation for the Athlete Mindset target account', () => {
  assert.equal(shouldRunLegacyAutomation('disabled', true), false);
  assert.equal(shouldRunLegacyAutomation('test', true), false);
  assert.equal(shouldRunLegacyAutomation('mindset', true), false);
  assert.equal(shouldRunLegacyAutomation('full', true), false);
});

test('allows legacy automation only for other accounts in explicit full mode', () => {
  assert.equal(shouldRunLegacyAutomation('disabled', false), false);
  assert.equal(shouldRunLegacyAutomation('test', false), false);
  assert.equal(shouldRunLegacyAutomation('mindset', false), false);
  assert.equal(shouldRunLegacyAutomation('full', false), true);
});
