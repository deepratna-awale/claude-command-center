import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'command-center',
  component: 'Pane',
  requestId: 'command-center',
  props: {
    title: 'Command Center',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const ROOT = '/Users/d/.claude/projects'
const TRANSCRIPT = [
  JSON.stringify({ type: 'ai-title', aiTitle: 'Fix login bug' }),
  JSON.stringify({ type: 'user', cwd: '/Users/d/app', message: { role: 'user', content: 'fix login' } }),
].join('\n')

test('add this folder, then see its sessions', async ($, on) => {
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/Users/d' : undefined }))
  on('session.root', () => ({ value: '/Users/d/app' }))
  on('session.repo', () => ({ value: { root: '/Users/d/app', remote: 'git@github.com:d/app.git', internal: false, name: 'app' } }))
  on('fs.list', (_, e) => {
    if (e.path === ROOT) return { value: [{ name: '-Users-d-app', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }
    return { value: [{ name: 's1.jsonl', kind: 'file', size: 10, mtimeMs: 1000, isLink: false }] }
  })
  on('fs.read', () => ({ value: TRANSCRIPT }))
  on('clock.now', () => ({ value: 61_000 }))
  on('store.set', () => ({ value: undefined }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    if (surface === 'terminal') {
      expect((await ui.find({ type: 'Text', text: /No projects yet/ }))?.text).toContain('No projects yet')
      await ui.press({ key: 'add-here' })
    }
    // The view stays on the project across surfaces.
    const name = await ui.find({ type: 'Text', text: /^app$/ })
    expect(name?.text).toBe('app')
    expect((await ui.find({ type: 'Text', text: /Fix login bug/ }))?.text).toBe('Fix login bug')
    await ui.unmount()
  }
})

test('start a session in Terminal and message a running one', async ($, on) => {
  const ran: string[][] = []
  const sent: unknown[] = []
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/Users/d' : undefined }))
  on('session.root', () => ({ value: '/Users/d/app' }))
  on('session.repo', () => ({ value: null }))
  on('fs.list', (_, e) => {
    if (e.path === ROOT) return { value: [{ name: '-Users-d-app', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }
    return { value: [{ name: 's1.jsonl', kind: 'file', size: 10, mtimeMs: 1000, isLink: false }] }
  })
  on('fs.read', () => ({ value: TRANSCRIPT }))
  on('clock.now', () => ({ value: 61_000 }))
  on('store.set', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: e.argv[0] === 'uname' ? 'Darwin\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.send', (_, e) => {
    sent.push(e)
    return { isDelivered: true }
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'add-here' })
  await ui.input({ key: 'launch', text: 'add dark mode' })

  const osascript = ran.find(argv => argv[0] === 'osascript')
  expect(osascript?.[2]).toContain("claude '--session-id'")
  expect(osascript?.[2]).toContain("'add dark mode'")
  expect((await ui.find({ type: 'Text', text: /Started/ }))?.text).toBe('Started "add dark mode" in Terminal.')
  expect(await ui.find({ type: 'Text', text: /waiting for its first message/ })).toBeDefined()

  await ui.press({ key: 'msg-s1' })
  await ui.input({ key: 'send-s1', text: 'status?' })
  expect(sent).toHaveLength(1)
  expect((await ui.find({ type: 'Text', text: /delivered/ }))?.text).toBe('Message delivered.')
  await ui.unmount()
})

test('the pane opens by itself in the desktop app, not in the terminal', async ($, on) => {
  const opened: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('store.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/Users/d/app', surface: 'terminal', isInteractive: true })
  expect(opened).toHaveLength(0)
  await $.session.start({ cwd: '/Users/d/app', surface: 'desktop', isInteractive: true })
  expect(opened).toEqual(['command-center'])
})
