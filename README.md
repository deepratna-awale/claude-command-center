# Claude Command Center

A Claude Code mod that gives you one place for all your projects and the Claude sessions that belong to them.

Open it with `/command-center` and a **Command Center** pane opens beside the chat, in the terminal or in the Claude desktop app's Code tab.

## What it does

- **Projects.** Add any folder you run Claude Code in (`/cc-add`, or **Add this folder** in the pane). Each project keeps its folder, repository and any links you pin to it, such as claude.ai projects or chats. Projects are kept between sessions.
- **Sessions per project.** Every Claude Code session started in the project's folder (or below it) is listed with its title, branch, message count and last activity, read straight from `~/.claude/projects`. Sessions you started anywhere else show under **Other folders**, where one click turns a folder into a project.
- **Start and resume.** Start a new Claude Code session for a project, with an optional first prompt, or resume any listed one. It opens in a new Terminal (or iTerm) window on macOS. On other systems the pane shows the command to run.
- **Talk to a running session.** **Message** sends text into another Claude Code session that is running, so one session can hand work to another.
- **Act as you.** **Ask Claude here to act on this project** sends a prompt to the current session with the project's folder and links attached. For clicking and typing in the Claude desktop app or on claude.ai, Claude uses its own computer use or Claude in Chrome.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install command-center --marketplace deepratna-awale/claude-command-center
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it load everywhere). From a shell:

```
claude plugin install command-center --marketplace deepratna-awale/claude-command-center
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `deepratna-awale/claude-command-center`, then **Add plugin**.

Needs Claude Code 2.1.287 or later (2.1.286 in the desktop app).

## Settings

| Option | Values | Default |
| --- | --- | --- |
| `terminal` | `Terminal`, `iTerm` | `Terminal` |

Set it in the `/config` menu, or under `pluginConfigs.command-center` in `~/.claude/settings.json`.

## Developing

```
claude --plugin-dir .            # load this folder for one session; edits reload live
claude plugin validate .         # what the mod hooks and calls
claude plugin test .             # tests in tests/
```
