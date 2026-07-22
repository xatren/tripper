import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isValidLoginIdentifier,
  loginIdentifierToEmail,
  usernameToEmail,
} from '../lib/auth/username.ts'

test('usernames map to internal auth emails consistently', () => {
  assert.equal(usernameToEmail(' Road_Tripper '), 'road_tripper@accounts.tripper.app')
  assert.equal(loginIdentifierToEmail(' Road_Tripper '), 'road_tripper@accounts.tripper.app')
})

test('legacy email logins are preserved instead of being converted into usernames', () => {
  assert.equal(loginIdentifierToEmail(' Person@Example.com '), 'person@example.com')
})

test('login identifiers accept valid usernames or emails and reject malformed input', () => {
  assert.equal(isValidLoginIdentifier('road_tripper'), true)
  assert.equal(isValidLoginIdentifier('person@example.com'), true)
  assert.equal(isValidLoginIdentifier('x'), false)
  assert.equal(isValidLoginIdentifier('not an email@example.com'), false)
})
