# Claude Command Center

A Claude Code mod that gives you one place for all your projects and the Claude sessions that belong to them.

In the Claude desktop app's Code tab the **Command Center** pane opens beside the chat by itself. In a terminal, open it with `/command-center`.

## What it does

- **Projects.** Add any folder you run Claude Code in (`/cc-add`, or **Add this folder** in the pane). Each project keeps its folder, repository and any links you pin to it, such as claude.ai projects or chats. Projects are kept between sessions.
- **Sessions per project.** Every Claude Code session started in the project's folder (or below it) is listed with its title, branch, message count and last activity, read straight from `~/.claude/projects`. Sessions you started anywhere else show under **Other folders**, where one click turns a folder into a project.
- **Start work, all inside the app.** **Start a background task** runs a Claude agent in the project's folder from the session you're in. It shows in the app's subagent pane and in the project's **Background tasks**, where **Message** sends it more instructions.
- **Open past sessions.** **Open here** switches the current tab to a listed session with the built-in `/resume`. Where the app has no `/resume`, the pane tells you which session to pick from the sidebar.
- **Talk to a running session.** **Message** sends text into another Claude Code session that is running, so one session can hand work to another.
- **Act as you.** **Ask Claude here to act on this project** sends a prompt to the current session with the project's folder and links attached. For clicking and typing in the Claude desktop app or on claude.ai, Claude uses its own computer use or Claude in Chrome.

## Install

**In the Claude desktop app** (Code tab):

1. Click **+** next to the prompt box, then **Plugins**.
2. Choose **Add marketplace** and enter `deepratna-awale/claude-command-center`.
3. Choose **Add plugin** and pick **command-center**.

Start a local session in the Code tab and the Command Center pane opens beside the chat. You can also type `/command-center` to open it again.

**In a terminal session:**

```
/plugin install command-center --marketplace deepratna-awale/claude-command-center
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it load everywhere, including the desktop app's local sessions).

Needs Claude Code 2.1.287 or later (2.1.286 in the desktop app). Mods run in the desktop app's Code tab, not in its Chat tab.

## Settings

| Option | Values | Default |
| --- | --- | --- |
| `openInDesktop` | `true`, `false` | `true` |

## Developing

```
claude --plugin-dir .            # load this folder for one session; edits reload live
claude plugin validate .         # what the mod hooks and calls
claude plugin test .             # tests in tests/
```
