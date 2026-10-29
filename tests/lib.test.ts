import { expect, test } from 'claude-code/testing'

import { claudeLine, terminalArgv, webUrlOf } from '../hooks/lib/launch'
import { dirBelongsTo, isInside, projectDirName, sessionLabel, summarise } from '../hooks/lib/transcripts'

const TRANSCRIPT = [
  JSON.stringify({ type: 'ai-title', aiTitle: 'Fix login bug', sessionId: 's1' }),
  JSON.stringify({ type: 'user', isMeta: true, cwd: '/Users/d/app', message: { role: 'user', content: '<context>ignored</context>' } }),
  JSON.stringify({ type: 'user', cwd: '/Users/d/app', gitBranch: 'feature/login', message: { role: 'user', content: 'The   login\nbutton is broken' } }),
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Looking' }] } }),
  JSON.stringify({ type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [] } }),
  'not json',
].join('\n')

test('a transcript is summarised from its lines', async () => {
  const s = summarise('/x/s1.jsonl', 's1', 1000, TRANSCRIPT)
  expect(s.title).toBe('Fix login bug')
  expect(s.firstPrompt).toBe('The login button is broken')
  expect(s.cwd).toBe('/Users/d/app')
  expect(s.gitBranch).toBe('feature/login')
  expect(s.messageCount).toBe(3)
  expect(sessionLabel({ sessionId: 'abcdef123456' })).toBe('Session abcdef12')
})

test('transcript folders map to project folders', async () => {
  expect(projectDirName('/Users/d/my.app/')).toBe('-Users-d-my-app')
  expect(dirBelongsTo('-Users-d-app', '/Users/d/app')).toBe(true)
  expect(dirBelongsTo('-Users-d-app-web', '/Users/d/app')).toBe(true)
  expect(dirBelongsTo('-Users-d-apple', '/Users/d/app')).toBe(false)
  expect(isInside('/Users/d/app/web', '/Users/d/app')).toBe(true)
  expect(isInside('/Users/d/apple', '/Users/d/app')).toBe(false)
})

test('launch lines quote what they pass to the shell', async () => {
  expect(claudeLine("/Users/d/it's", ['--resume', 'abc'])).toBe(`cd '/Users/d/it'\\''s' && claude '--resume' 'abc'`)
  const argv = terminalArgv('echo "hi"', 'Terminal')
  expect(argv[0]).toBe('osascript')
  expect(argv[2]).toContain('do script "echo \\"hi\\""')
})

test('git remotes become web links', async () => {
  expect(webUrlOf('git@github.com:deep/cc.git')).toBe('https://github.com/deep/cc')
  expect(webUrlOf('https://token@github.com/deep/cc.git')).toBe('https://github.com/deep/cc')
  expect(webUrlOf(null)).toBe(undefined)
})
