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
