import assert from 'node:assert/strict'

import {
  VALIDATED_CLAUDE_CODE_VERSIONS,
  getClaudeCodeAdapterForVersion,
  resolveClaudeCodeAdapter,
} from '../dist/claudeCodeAdapter.js'

assert.deepEqual(VALIDATED_CLAUDE_CODE_VERSIONS, ['2.1.112'])

const validatedAdapter = getClaudeCodeAdapterForVersion('2.1.112')
assert.equal(validatedAdapter?.id, 'official-2.1.112')

assert.equal(resolveClaudeCodeAdapter('2.1.112', false).id, 'official-2.1.112')
assert.equal(resolveClaudeCodeAdapter('2.1.999', true).id, 'official-2.1.112')
assert.equal(resolveClaudeCodeAdapter(null, true).id, 'official-2.1.112')

assert.throws(
  () => resolveClaudeCodeAdapter('2.1.999', false),
  /No Claude Code patch adapter/,
)

console.log('claude-code adapter regression passed')
