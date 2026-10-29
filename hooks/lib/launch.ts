/** Quotes a value for a POSIX shell. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** The shell line that starts or resumes Claude Code in `cwd`. */
export function claudeLine(cwd: string, args: string[]): string {
  return `cd ${shellQuote(cwd)} && claude ${args.map(shellQuote).join(' ')}`.trimEnd()
}

/** osascript arguments that run `line` in a new Terminal or iTerm window. */
export function terminalArgv(line: string, app: 'Terminal' | 'iTerm'): string[] {
  const script =
    app === 'iTerm'
      ? `tell application "iTerm"\n  activate\n  set w to (create window with default profile)\n  tell current session of w to write text ${appleScriptString(line)}\nend tell`
      : `tell application "Terminal"\n  activate\n  do script ${appleScriptString(line)}\nend tell`
  return ['osascript', '-e', script]
}

/** The command that opens a URL with the system's default handler. */
export function openArgv(url: string, os: 'mac' | 'linux' | 'windows'): string[] {
  if (os === 'mac') return ['open', url]
  if (os === 'windows') return ['cmd', '/c', 'start', '', url]
  return ['xdg-open', url]
}

/** A random v4 UUID, used to pin a new session's id before it starts. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** A browsable https URL for a git remote, or undefined when it has no web form. */
export function webUrlOf(remote: string | null | undefined): string | undefined {
  if (!remote) return undefined
  const ssh = remote.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?\/?$/)
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`
  const http = remote.match(/^https?:\/\/(?:[^@/]+@)?(.+?)(?:\.git)?\/?$/)
  return http ? `https://${http[1]}` : undefined
}
