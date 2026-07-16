import assert from 'node:assert/strict';
import test from 'node:test';

import {
  budgetError,
  currencyError,
  dateError,
  destinationsError,
  titleError,
  vibeError,
} from '../lib/trip-validation.ts';

test('title and vibe are required and constrained', () => {
  assert.match(titleError('  ') ?? '', /name/);
  assert.equal(titleError('Summer escape'), null);
  assert.match(vibeError(null) ?? '', /vibe/);
  assert.match(vibeError('Unknown') ?? '', /vibe/);
  assert.equal(vibeError('Road'), null);
});

test('dates may be omitted together but must otherwise be complete and ordered', () => {
  assert.equal(dateError('', ''), null);
  assert.match(dateError('', '2026-08-10') ?? '', /departure/);
  assert.match(dateError('2026-08-10', '') ?? '', /return/);
  assert.match(dateError('2026-08-10', '2026-08-09') ?? '', /on or after/);
  assert.equal(dateError('2026-08-10', '2026-08-10'), null);
});

test('destinations require valid country data and coordinates', () => {
  assert.match(destinationsError([]) ?? '', /at least one/);
  assert.equal(destinationsError([{ name: 'Japan', flag: 'JP', lat: 36, lng: 138 }]), null);
  assert.match(destinationsError([{ name: 'Nowhere', flag: 'X', lat: 91, lng: 0 }]) ?? '', /invalid/);
});

test('budget is optional or nonnegative and within the database numeric range', () => {
  assert.equal(budgetError(''), null);
  assert.equal(budgetError('0'), null);
  assert.match(budgetError('-1') ?? '', /negative/);
  assert.match(budgetError('Infinity') ?? '', /valid/);
  assert.equal(budgetError('99999999.99'), null);
  assert.match(budgetError('100000000') ?? '', /99,999,999/);
});

test('currency is restricted to persisted values', () => {
  assert.equal(currencyError('EUR'), null);
  assert.match(currencyError('CAD') ?? '', /supported/);
});
