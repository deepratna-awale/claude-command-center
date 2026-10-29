import type { SessionSummary } from '../../types'

const MAX_PROMPT = 160

/** The folder name Claude Code keeps a working directory's transcripts under. */
export function projectDirName(cwd: string): string {
  return cwd.replace(/[\\/]+$/, '').replace(/[^a-zA-Z0-9]/g, '-')
}

/** True when transcripts in `dirName` were written by sessions at `path` or below it. */
export function dirBelongsTo(dirName: string, path: string): boolean {
  const own = projectDirName(path)
  return dirName === own || dirName.startsWith(`${own}-`)
}

/** True when `cwd` is `folder` or inside it. */
export function isInside(cwd: string | undefined, folder: string): boolean {
  if (!cwd) return false
  const a = cwd.replace(/[\\/]+$/, '')
  const b = folder.replace(/[\\/]+$/, '')
  return a === b || a.startsWith(`${b}/`) || a.startsWith(`${b}\\`)
}

function textOf(content: unknown): string | undefined {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  for (const part of content) {
    if (part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') return part.text
  }
  return undefined
}

/** A prompt the person typed, not context or a command wrapper Claude Code records as a user turn. */
function isTypedPrompt(text: string): boolean {
  const t = text.trimStart()
  return t.length > 0 && !t.startsWith('<') && !t.startsWith('Caveat:')
}

/** Summarises a Claude Code JSONL transcript; lines that do not parse are skipped. */
export function summarise(file: string, sessionId: string, mtimeMs: number, raw: string): SessionSummary {
  const s: SessionSummary = { sessionId, file, lastActivityAt: mtimeMs, messageCount: 0 }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let entry: Record<string, any>
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.type === 'ai-title' && typeof entry.aiTitle === 'string') s.title = entry.aiTitle
    if (entry.type === 'summary' && typeof entry.summary === 'string' && !s.title) s.title = entry.summary
    if (typeof entry.cwd === 'string' && !s.cwd) s.cwd = entry.cwd
    if (typeof entry.gitBranch === 'string' && entry.gitBranch !== 'HEAD') s.gitBranch = entry.gitBranch
    if ((entry.type === 'user' || entry.type === 'assistant') && !entry.isSidechain) {
      s.messageCount! += 1
      if (entry.type === 'user' && !entry.isMeta && !s.firstPrompt) {
        const text = textOf(entry.message?.content)
        if (text && isTypedPrompt(text)) {
          const flat = text.replace(/\s+/g, ' ').trim()
          s.firstPrompt = flat.length > MAX_PROMPT ? `${flat.slice(0, MAX_PROMPT - 1)}…` : flat
        }
      }
    }
  }
  return s
}

export function sessionLabel(s: Pick<SessionSummary, 'title' | 'firstPrompt' | 'sessionId'>): string {
  return s.title || s.firstPrompt || `Session ${s.sessionId.slice(0, 8)}`
}

export function timeAgo(ms: number, now: number): string {
  const seconds = Math.max(0, (now - ms) / 1000)
  if (seconds < 60) return 'just now'
  const units: [number, string][] = [
    [86400 * 365, 'y'],
    [86400 * 30, 'mo'],
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
  ]
  for (const [size, label] of units) if (seconds >= size) return `${Math.floor(seconds / size)}${label} ago`
  return ''
}
