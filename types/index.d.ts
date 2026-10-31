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

/** A background agent the Command Center started for a project, working in its folder. */
export type BackgroundTask = {
  projectId: string
  agentId: string
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

export type MessageTarget = { to: { sessionId: string } | { agentId: string }; key: string; title: string }

declare module 'claude-code' {
  interface PluginState {
    'command-center': {
      projects: Shaped<Project[]>
      launched: Shaped<BackgroundTask[]>
      view: View
      draft: Draft
      status: string | null
      messageTarget: MessageTarget | null
      tick: number
    }
  }
}
