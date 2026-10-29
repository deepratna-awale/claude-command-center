export type ProjectLink = { label: string; url: string }

export type Project = {
  id: string
  name: string
  /** The folder the project lives in. Claude Code sessions started inside it belong to it. */
  path: string
  repoUrl?: string
  links: ProjectLink[]
  createdAt: number
}

/** A session started from the Command Center, kept so it shows before its transcript exists. */
export type LaunchedSession = {
  projectId: string
  sessionId: string
  title: string
  launchedAt: number
}

export type SessionSummary = {
  sessionId: string
  file: string
  cwd?: string
  gitBranch?: string
  title?: string
  firstPrompt?: string
  lastActivityAt: number
  messageCount?: number
}

export type View =
  | { kind: 'home' }
  | { kind: 'project'; id: string }
  | { kind: 'add' }
  | { kind: 'unassigned' }

export type Draft = { name: string; path: string; repoUrl: string }

export type MessageTarget = { sessionId: string; title: string }

declare module 'claude-code' {
  interface PluginState {
    'command-center': {
      projects: Shaped<Project[]>
      launched: Shaped<LaunchedSession[]>
      view: View
      draft: Draft
      status: string | null
      messageTarget: MessageTarget | null
      tick: number
    }
  }
}
