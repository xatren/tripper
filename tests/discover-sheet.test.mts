import assert from 'node:assert/strict'
import test from 'node:test'
import { levelFromGesture, type SheetLevel } from '../lib/mobile/draggable-sheet.ts'

test('a large enough upward drag advances one level at a time', () => {
  assert.equal(levelFromGesture('collapsed', -50), 'half')
  assert.equal(levelFromGesture('half', -50), 'expanded')
  // Already at the top: an upward drag is a no-op, not a wrap-around.
  assert.equal(levelFromGesture('expanded', -50), 'expanded')
})

test('a large enough downward drag retreats one level at a time', () => {
  assert.equal(levelFromGesture('expanded', 50), 'half')
  assert.equal(levelFromGesture('half', 50), 'collapsed')
  // Already at the bottom: a downward drag is a no-op, not a wrap-around.
  assert.equal(levelFromGesture('collapsed', 50), 'collapsed')
})

test('a drag inside the +-45px threshold changes nothing', () => {
  const levels: SheetLevel[] = ['collapsed', 'half', 'expanded']
  for (const level of levels) {
    assert.equal(levelFromGesture(level, 44), level)
    assert.equal(levelFromGesture(level, -44), level)
    assert.equal(levelFromGesture(level, 0), level)
  }
})

test('the threshold is exclusive at exactly +-45px', () => {
  assert.equal(levelFromGesture('half', 45), 'half')
  assert.equal(levelFromGesture('half', -45), 'half')
})
