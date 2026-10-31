import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BackgroundTask, Draft, MessageTarget, Project, SessionSummary, View } from '../types'
import { uuid, webUrlOf } from './lib/launch'
import { dirBelongsTo, isInside, sessionLabel, summarise, timeAgo } from './lib/transcripts'

const PANE = 'command-center'
const SESSIONS_PER_PROJECT = 25
const REFRESH_MS = 15_000

// Change a tag when the stored value's fields change: an older value then reads as the initial one.
const projects = atom({ plugin: 'command-center', key: 'projects' } as const, [], { shape: 'projects-1' })
const launched = atom({ plugin: 'command-center', key: 'launched' } as const, [], { shape: 'launched-2' })
const view = atom({ plugin: 'command-center', key: 'view' } as const, { kind: 'home' } as View)
const draft = atom({ plugin: 'command-center', key: 'draft' } as const, { name: '', path: '', repoUrl: '' } as Draft)
const status = atom({ plugin: 'command-center', key: 'status' } as const, null as string | null)
const messageTarget = atom({ plugin: 'command-center', key: 'messageTarget' } as const, null as MessageTarget | null)
const tick = atom({ plugin: 'command-center', key: 'tick' } as const, 0)

type $ = EngineInterface
// Transcript summaries by file, reused while the file is unchanged.
const summaries = new Map<string, SessionSummary>()
let autoOpen = true
let ready = false

async function transcriptsRoot($: $): Promise<string | undefined> {
  const configured = await $.env.get('CLAUDE_CONFIG_DIR')
  if (configured) return `${configured}/projects`
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  return home ? `${home}/.claude/projects` : undefined
}

async function transcriptDirs($: $): Promise<{ root: string; names: string[] }> {
  const root = await transcriptsRoot($)
  if (!root) return { root: '', names: [] }
  try {
    const entries = await $.fs.list(root)
    return { root, names: entries.filter(e => e.kind === 'dir').map(e => e.name) }
  } catch {
    return { root, names: [] }
  }
}

/** The newest sessions across `dirs`, summarised from their transcripts. */
async function sessionsIn($: $, root: string, dirs: string[], limit: number): Promise<SessionSummary[]> {
  const files: { file: string; sessionId: string; mtimeMs: number }[] = []
  for (const dir of dirs) {
    try {
      for (const e of await $.fs.list(`${root}/${dir}`)) {
        if (e.kind === 'file' && e.name.endsWith('.jsonl')) {
          files.push({ file: `${root}/${dir}/${e.name}`, sessionId: e.name.slice(0, -6), mtimeMs: e.mtimeMs })
        }
      }
    } catch {
      // The folder went away between listings.
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const out: SessionSummary[] = []
  for (const f of files.slice(0, limit)) {
    const hit = summaries.get(f.file)
    if (hit && hit.lastActivityAt === f.mtimeMs) {
      out.push(hit)
      continue
    }
    let s: SessionSummary
    try {
      s = summarise(f.file, f.sessionId, f.mtimeMs, await $.fs.read(f.file))
    } catch {
      // Over the read limit or unreadable: list it by id alone.
      s = { sessionId: f.sessionId, file: f.file, lastActivityAt: f.mtimeMs }
    }
    if (s.messageCount === 0) continue
    summaries.set(f.file, s)
    out.push(s)
  }
  return out
}

async function saveProjects($: $, fn: (list: Project[]) => Project[]): Promise<void> {
  await update($, projects, fn)
  await $.store.set('projects', await read($, projects))
}

async function saveLaunched($: $, fn: (list: BackgroundTask[]) => BackgroundTask[]): Promise<void> {
  await update($, launched, fn)
  await $.store.set('launched', await read($, launched))
}

function say($: $, text: string | null) {
  return update($, status, () => text)
}

async function addProject($: $, input: { name: string; path: string; repoUrl?: string }): Promise<Project> {
  const path = input.path.trim().replace(/[\\/]+$/, '')
  const existing = (await read($, projects)).find(p => p.path === path)
  if (existing) return existing
  const project: Project = {
    id: uuid(),
    name: input.name.trim() || path.split(/[\\/]/).pop() || path,
    path,
    repoUrl: input.repoUrl?.trim() || undefined,
    links: [],
    createdAt: await $.clock.now(),
  }
  await saveProjects($, list => [...list, project].sort((a, b) => a.name.localeCompare(b.name)))
  return project
}

/**
 * Opens a past session in this tab with the built-in /resume. Where the app has no
 * /resume, says where to find the session instead.
 */
async function openHere($: $, s: SessionSummary): Promise<void> {
  const commands = await $.command.list()
  if (!commands.some(c => c.name === 'resume')) {
    await say($, `Open "${sessionLabel(s)}" from the session list in the sidebar.`)
    return
  }
  await $.command.run({ command: 'resume', args: s.sessionId })
}

/** Starts a background agent that works in the project's folder, inside this app. */
async function launch($: $, project: Project, task: string): Promise<void> {
  const prompt = task.trim()
  if (!prompt) return
  const title = prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt
  const spawned = await $.agent.spawn({
    prompt: `You are working on the project "${project.name}" in ${project.path}. Work only inside that folder.\n\n${prompt}`,
    description: `${project.name}: ${title}`.slice(0, 80),
    cwd: project.path,
  })
  if (spawned.deny !== undefined) {
    await say($, `Could not start it: ${spawned.deny}`)
    return
  }
  const agentId = spawned.agentId ?? spawned.teammateId
  if (agentId) {
    const launchedAt = await $.clock.now()
    await saveLaunched($, list => [...list.slice(-49), { projectId: project.id, agentId, title, launchedAt }])
  }
  await say($, `Started "${title}" in the background. Follow it in the subagent pane.`)
}

/** Loads saved projects, registers the commands and starts the refresh timer, once per load. */
async function setUp($: $, again = false): Promise<void> {
  if (ready && !again) return
  // $.state lives for the session; $.store carries projects between sessions.
  const stored = await $.store.get('projects')
  if (Array.isArray(stored)) await update($, projects, () => stored as Project[])
  const storedLaunched = await $.store.get('launched')
  if (Array.isArray(storedLaunched)) await update($, launched, () => storedLaunched as BackgroundTask[])
  await $.command.register({ name: 'command-center', description: 'Open the Command Center: your projects and their Claude sessions' })
  await $.command.register({ name: 'cc-add', description: 'Add this folder to the Command Center as a project (optional: a name)', argumentHint: '[name]' })
  if (!ready) $.clock.every(REFRESH_MS, () => update($, tick, n => n + 1))
  ready = true
}

export const register: Register = (on, options) => {
  autoOpen = options.openInDesktop !== false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await setUp($)
    // The desktop app docks panes beside the chat, so the Command Center opens there by itself.
    if (autoOpen && e.surface === 'desktop') void $.ui.open({ id: PANE, title: 'Command Center' })
    return result
  })

  // A plugin installed mid-session never sees session.start, and /clear or /resume
  // reset $.state without one: set up again on the next of these instead.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    await setUp($, true)
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    await setUp($)
    return next(e)
  })

  on('command.run', { command: 'command-center' }, async $ => {
    const { isPlaced } = await $.ui.open({ id: PANE, title: 'Command Center' })
    return { text: isPlaced ? 'Command Center opened.' : 'This app shows no panes; use /cc-add to add projects.' }
  })

  on('command.run', { command: 'cc-add' }, async ($, e) => {
    const root = await $.session.root()
    const repo = await $.session.repo()
    const project = await addProject($, { name: e.args, path: root, repoUrl: webUrlOf(repo?.remote) })
    await update($, view, () => ({ kind: 'project', id: project.id }) as View)
    void $.ui.open({ id: PANE, title: 'Command Center' })
    return { text: `"${project.name}" is in the Command Center (${project.path}).` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Link } = els
    // Mobile draws no Input; the pane still lists everything there.
    const Input = 'Input' in els ? els.Input : undefined
    await read($, tick) // redraw on the refresh timer
    const current = await read($, view)
    const list = await read($, projects)
    const note = await read($, status)
    const now = await $.clock.now()
    const go = (v: View) => () => {
      void say($, null)
      void update($, messageTarget, () => null)
      return update($, view, () => v)
    }

    const header = (
      <Box flexDirection="column" marginBottom={1}>
        {note && (
          <Box gap={1}>
            <Text color="yellow" wrap="wrap">{note}</Text>
            <Button key="clear-status" label="OK" plain onPress={() => say($, null)} />
          </Box>
        )}
      </Box>
    )

    const sessionRow = (s: SessionSummary, project?: Project) => (
      <Box key={`s-${s.sessionId}`} flexDirection="column" marginBottom={1}>
        <Text wrap="truncate-end" bold>{sessionLabel(s)}</Text>
        <Text dimColor wrap="truncate-end">
          {timeAgo(s.lastActivityAt, now)}
          {s.messageCount ? ` · ${s.messageCount} msgs` : ''}
          {s.gitBranch ? ` · ${s.gitBranch}` : ''}
          {project && s.cwd && s.cwd !== project.path ? ` · ${s.cwd.slice(project.path.length + 1)}` : ''}
        </Text>
        <Box gap={1}>
          <Button key={`resume-${s.sessionId}`} label="Open here" onPress={() => openHere($, s)} />
          {Input && (
            <Button
              key={`msg-${s.sessionId}`}
              label="Message"
              onPress={() => update($, messageTarget, () => ({ to: { sessionId: s.sessionId }, key: s.sessionId, title: sessionLabel(s) }))}
            />
          )}
        </Box>
      </Box>
    )

    if (current.kind === 'add') {
      const d = await read($, draft)
      const root = await $.session.root()
      return (
        <Box flexDirection="column">
          {header}
          <Text bold>New project</Text>
          {Input ? (
            <Box flexDirection="column" gap={1}>
              <Input key="add-path" label="Folder" placeholder={root} value={d.path} onInput={v => update($, draft, x => ({ ...x, path: v }))} onSubmit={() => {}} />
              <Input key="add-name" label="Name" placeholder="Defaults to the folder's name" value={d.name} onInput={v => update($, draft, x => ({ ...x, name: v }))} onSubmit={() => {}} />
              <Input key="add-repo" label="Repository URL" placeholder="https://github.com/…" value={d.repoUrl} onInput={v => update($, draft, x => ({ ...x, repoUrl: v }))} onSubmit={() => {}} />
            </Box>
          ) : (
            <Text dimColor>Adding projects needs the terminal or desktop app.</Text>
          )}
          <Box gap={1} marginTop={1}>
            <Button
              key="add-save"
              label="Save"
              variant="primary"
              onPress={async () => {
                const p = await addProject($, { name: d.name, path: d.path || root, repoUrl: d.repoUrl })
                await update($, draft, () => ({ name: '', path: '', repoUrl: '' }))
                await update($, view, () => ({ kind: 'project', id: p.id }) as View)
              }}
            />
            <Button key="add-cancel" label="Cancel" onPress={go({ kind: 'home' })} />
          </Box>
        </Box>
      )
    }

    if (current.kind === 'project') {
      const project = list.find(p => p.id === current.id)
      if (!project) {
        void update($, view, () => ({ kind: 'home' }) as View)
        return <Text dimColor>That project was removed.</Text>
      }
      const { root, names } = await transcriptDirs($)
      const sessions = await sessionsIn($, root, names.filter(n => dirBelongsTo(n, project.path)), SESSIONS_PER_PROJECT)
      const agents = new Map((await $.agent.list().catch(() => [])).map(a => [a.id, a]))
      const tasks = (await read($, launched)).filter(t => t.projectId === project.id).reverse()
      const target = await read($, messageTarget)

      return (
        <Box flexDirection="column">
          {header}
          <Box gap={1}>
            <Button key="back" label="‹ Projects" plain onPress={go({ kind: 'home' })} />
          </Box>
          <Text bold size="heading">{project.name}</Text>
          <Text dimColor wrap="truncate-start">{project.path}</Text>
          <Box gap={1} flexWrap="wrap" marginBottom={1}>
            {project.repoUrl && <Link key="repo" href={project.repoUrl} label="Repository" />}
            {project.links.map((l, i) => (
              <Box key={`link-${i}`} gap={0}>
                <Link href={l.url} label={l.label} />
                <Button key={`unlink-${i}`} label="×" plain dimColor onPress={() => saveProjects($, ps => ps.map(p => (p.id === project.id ? { ...p, links: p.links.filter((_, j) => j !== i) } : p)))} />
              </Box>
            ))}
          </Box>

          {Input && (
            <Box flexDirection="column" gap={1} marginBottom={1}>
              <Input
                key="launch"
                label="Start a background task in this project"
                placeholder="What should Claude do in this folder?"
                submitLabel="Start"
                onSubmit={v => launch($, project, v)}
              />
              <Input
                key="ask"
                label="Ask Claude here to act on this project"
                placeholder="e.g. open its claude.ai project and summarise the last chat"
                submitLabel="Ask"
                onSubmit={v => {
                  if (!v.trim()) return
                  void $.prompt.submit({
                    text:
                      `[Command Center: project "${project.name}" at ${project.path}` +
                      `${project.links.length ? `; links: ${project.links.map(l => l.url).join(', ')}` : ''}]\n${v.trim()}\n\n` +
                      'Where this needs clicking or typing in the Claude desktop app or claude.ai, use computer use or Claude in Chrome.',
                  })
                }}
              />
              <Input
                key="link"
                label="Link a claude.ai chat, project or any URL"
                placeholder="https://claude.ai/project/…  (optional label after a space)"
                submitLabel="Link"
                onSubmit={v => {
                  const [url, ...rest] = v.trim().split(/\s+/)
                  if (!url || !/^https?:\/\//i.test(url)) return say($, 'Links start with http:// or https://')
                  const label = rest.join(' ') || url.replace(/^https?:\/\//, '').slice(0, 40)
                  return saveProjects($, ps => ps.map(p => (p.id === project.id ? { ...p, links: [...p.links, { label, url }] } : p)))
                }}
              />
            </Box>
          )}

          {target && Input && (
            <Box flexDirection="column" marginBottom={1}>
              <Input
                key={`send-${target.key}`}
                label={`Message to "${target.title}"`}
                autoFocus
                submitLabel="Send"
                onSubmit={async v => {
                  if (!v.trim()) return
                  const sent = await $.session.send({ to: target.to, text: v.trim() })
                  await say($, sent.isDelivered ? 'Message delivered.' : `Not delivered: ${sent.reason}`)
                  await update($, messageTarget, () => null)
                }}
              />
              <Button key="send-cancel" label="Cancel" plain onPress={() => update($, messageTarget, () => null)} />
            </Box>
          )}

          {tasks.length > 0 && <Text bold>Background tasks</Text>}
          {tasks.map(t => {
            const agent = agents.get(t.agentId)
            const state = agent ? agent.status : 'finished'
            return (
              <Box key={`t-${t.agentId}`} flexDirection="column" marginBottom={1}>
                <Text wrap="truncate-end">{t.title}</Text>
                <Text dimColor>
                  {state} · started {timeAgo(t.launchedAt, now)}
                </Text>
                <Box gap={1}>
                  {Input && (
                    <Button
                      key={`msg-${t.agentId}`}
                      label="Message"
                      onPress={() => update($, messageTarget, () => ({ to: { agentId: t.agentId }, key: t.agentId, title: t.title }))}
                    />
                  )}
                  <Button key={`forget-${t.agentId}`} label="Remove" plain dimColor onPress={() => saveLaunched($, ls => ls.filter(x => x.agentId !== t.agentId))} />
                </Box>
              </Box>
            )
          })}

          <Text bold>Sessions</Text>
          {sessions.length === 0 && (
            <Text dimColor>No Claude Code sessions in this folder yet.</Text>
          )}
          {sessions.map(s => sessionRow(s, project))}

          <Box marginTop={1}>
            <Button
              key="remove-project"
              label="Remove project"
              plain
              dimColor
              onPress={async () => {
                await saveProjects($, ps => ps.filter(p => p.id !== project.id))
                await saveLaunched($, ls => ls.filter(l => l.projectId !== project.id))
                await update($, view, () => ({ kind: 'home' }) as View)
                await say($, `Removed "${project.name}". Its sessions are untouched.`)
              }}
            />
          </Box>
        </Box>
      )
    }

    const { root, names } = await transcriptDirs($)
    const loose = names.filter(n => !list.some(p => dirBelongsTo(n, p.path)))

    if (current.kind === 'unassigned') {
      const sessions = await sessionsIn($, root, loose, 40)
      // One row per folder, from the newest session that ran there.
      const byFolder = new Map<string, { cwd: string; latest: SessionSummary; count: number }>()
      for (const s of sessions) {
        const cwd = s.cwd ?? s.file.split('/').slice(-2, -1)[0] ?? '?'
        const row = byFolder.get(cwd)
        if (row) row.count += 1
        else byFolder.set(cwd, { cwd, latest: s, count: 1 })
      }
      return (
        <Box flexDirection="column">
          {header}
          <Button key="back" label="‹ Projects" plain onPress={go({ kind: 'home' })} />
          <Text bold size="heading">Other folders</Text>
          <Text dimColor>Recent Claude Code sessions outside your projects.</Text>
          {byFolder.size === 0 && <Text dimColor>Nothing here.</Text>}
          {[...byFolder.values()].map(row => (
            <Box key={`f-${row.cwd}`} flexDirection="column" marginTop={1}>
              <Text bold wrap="truncate-start">{row.cwd}</Text>
              <Text dimColor wrap="truncate-end">
                {row.count} recent · {timeAgo(row.latest.lastActivityAt, now)} · {sessionLabel(row.latest)}
              </Text>
              <Box gap={1}>
                <Button
                  key={`adopt-${row.cwd}`}
                  label="Make project"
                  onPress={async () => {
                    const p = await addProject($, { name: '', path: row.cwd })
                    await update($, view, () => ({ kind: 'project', id: p.id }) as View)
                  }}
                />
                <Button key={`resume-${row.latest.sessionId}`} label="Open latest here" onPress={() => openHere($, row.latest)} />
              </Box>
            </Box>
          ))}
        </Box>
      )
    }

    // Home: every project with its latest activity.
    const rows = await Promise.all(
      list.map(async p => {
        const [latest] = await sessionsIn($, root, names.filter(n => dirBelongsTo(n, p.path)), 1)
        return { p, latest }
      }),
    )
    const here = await $.session.root()
    const hereIsProject = list.some(p => isInside(here, p.path))

    return (
      <Box flexDirection="column">
        {header}
        <Box gap={1} marginBottom={1}>
          <Button key="new" label="+ New project" variant="primary" onPress={go({ kind: 'add' })} />
          {!hereIsProject && (
            <Button
              key="add-here"
              label="Add this folder"
              onPress={async () => {
                const repo = await $.session.repo()
                const p = await addProject($, { name: '', path: here, repoUrl: webUrlOf(repo?.remote) })
                await update($, view, () => ({ kind: 'project', id: p.id }) as View)
              }}
            />
          )}
        </Box>
        {list.length === 0 && (
          <Text dimColor wrap="wrap">
            No projects yet. Add this folder, or any folder you run Claude Code in, and its sessions show up here.
          </Text>
        )}
        {rows.map(({ p, latest }) => (
          <Box key={`proj-${p.id}`} flexDirection="column" marginBottom={1}>
            <Button key={`open-${p.id}`} label={p.name} plain onPress={go({ kind: 'project', id: p.id })} />
            <Text dimColor wrap="truncate-end">
              {latest ? `${timeAgo(latest.lastActivityAt, now)} · ${sessionLabel(latest)}` : 'No sessions yet'}
            </Text>
          </Box>
        ))}
        {loose.length > 0 && (
          <Button key="unassigned" label={`Other folders (${loose.length})`} plain dimColor onPress={go({ kind: 'unassigned' })} />
        )}
      </Box>
    )
  })
}
