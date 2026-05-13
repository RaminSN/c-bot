# c-bot

Personal Discord bridge to Claude. One Node process connects out to Discord and
to the Claude Agent SDK. Each Discord channel becomes its own persistent
Claude conversation; `!reset` in a channel clears that conversation.

This is a demo / personal-use bot. It authenticates with your Claude Code
subscription via `CLAUDE_CODE_OAUTH_TOKEN`, not with an Anthropic API key.

## Prerequisites

- Node.js 20 or newer — https://nodejs.org/
- A Claude Code subscription, already logged in via the `claude` CLI
- A Discord account and a server you can add a bot to

## 1. Create the Discord bot

1. Go to https://discord.com/developers/applications and click **New Application**. Name it whatever you want.
2. Open the **Bot** tab.
   - Under **Privileged Gateway Intents**, enable **Message Content Intent**. Save.
   - Click **Reset Token** and copy the token. This is your `DISCORD_TOKEN`. Treat it like a password.
3. Open the **OAuth2** → **URL Generator** tab.
   - Scopes: check **bot**.
   - Bot Permissions: **View Channels**, **Send Messages**, **Read Message History**.
   - Copy the generated URL at the bottom, open it in a browser, and invite the bot to your server.
The bot will respond to messages in **every** channel of **every** server it's invited to. Only invite it to servers where you want it to participate.

## 2. Generate a Claude OAuth token

In a terminal where the `claude` CLI is logged in:

```powershell
claude setup-token
```

This prints a one-year token. Copy it — that's your `CLAUDE_CODE_OAUTH_TOKEN`.

## 3. Configure the project

```powershell
cd C:\Users\RaminSoltanzadeh\Documents\Code\c-bot
copy .env.example .env
notepad .env
```

Fill in the required values:

```
DISCORD_TOKEN=...
CLAUDE_CODE_OAUTH_TOKEN=...
```

### Optional: give the bot read access to a codebase

Add `T5_PATH` pointing at an absolute folder path. With this set, the bot
gains `Read`, `Glob`, and `Grep` tools rooted at that path — it can search
and read files (but never modify them) when a question requires it:

```
T5_PATH=C:\Users\RaminSoltanzadeh\Documents\GitHub\T5
```

Leave `T5_PATH` empty (or omit it) to run text-only with no file access.

The bot also has read-only git access when `T5_PATH` is set, scoped to that
repository: `git log`, `git show`, `git blame`, `git diff`, `git status`,
`git branch`, `git tag`, `git reflog`, `git rev-parse`, `git ls-files`,
`git ls-tree`. No mutating git operations and no other shell commands —
the SDK runs in `dontAsk` permission mode, which denies anything not on
the allowlist.

### Optional: Azure DevOps access

Set `ADO_ORG` to your Azure DevOps organization name (the bit after
`dev.azure.com/` in your ADO URL) and `ADO_PAT` to a Personal Access Token.
With both present, the bot launches Microsoft's official
[`@azure-devops/mcp`](https://github.com/microsoft/azure-devops-mcp) server
as a subprocess and exposes its tools to Claude — work items, repos, pull
requests, pipelines, wikis.

```
ADO_ORG=contoso
ADO_PAT=your_pat_here
ADO_EMAIL=c-bot         # optional; any non-empty string works
```

What the bot can actually do is determined by your PAT's scope, not by the
bot. For read-only access, create the PAT with only `Read` scopes for the
areas you want (Work Items, Code, Build, Wiki, etc.). The bot base64-encodes
`ADO_EMAIL:ADO_PAT` and passes it to the MCP server as
`PERSONAL_ACCESS_TOKEN` — you don't need to encode it yourself.

### Commands

These can be typed in any channel (or in a DM with the bot):

- `!commands` — list available commands and show the current mode.
- `!support` — switch this channel into **T5 support mode**: the bot becomes
  a patient, plain-language assistant for non-developer users asking about
  T5's behavior, configuration, and suspected bugs. The bot may consult the
  codebase silently but will never paste code or file paths at the user.
  Requires `T5_PATH` to be set. Resets the channel's conversation.
- `!hickey` — switch this channel back to the Hickey persona (the default
  for any fresh channel). Resets the channel's conversation.
- `!private` — bot opens a DM with you and you can continue the conversation
  there. Has its own conversation, separate from any channel.
- `!reset` — clear this channel's conversation history without changing mode.

Mode is per-channel and lives in memory only; on restart everything reverts
to the Hickey persona.

### Restart announcements

On startup the bot posts a single "back on duty, context wiped" line into
every text channel it has send-permission for, across every server it's in.
This is so coworkers know a restart happened and channel conversations have
been reset. DMs are not announced into (they aren't enumerable at startup
without persistence). No configuration is required.

The bot is instructed (via the system prompt) to refuse reading signing
materials (`*.pfx`, `*.key`, `*.pem`), config files that may carry
credentials (`appsettings.*.json`, `secrets.json`, `.env*`), and noise
(`bin/`, `obj/`, `node_modules/`, `.git/`). This is a soft guardrail, not
a sandbox — anyone with shell-level access to the host can read anything
the bot's user can read.

## 4. Install dependencies

```powershell
npm install discord.js dotenv @anthropic-ai/claude-agent-sdk
```

This will populate the `dependencies` section in `package.json`.

## 5. Run

```powershell
npm start
```

You should see `Logged in as <bot-name>#xxxx` and the list of allowed guild IDs.
Send a message in any channel of an allowed server — the bot replies.

- Each channel has its own conversation history (lives in memory; dies when you
  Ctrl+C).
- Type `!reset` in a channel to clear that channel's conversation.

Closing the terminal stops the bot. Open it again with `npm start` to bring it back.

## Push to GitHub

The repo is already initialized locally. To push:

### Option A — with the GitHub CLI (`gh`)

```powershell
gh repo create c-bot --private --source . --remote origin --push
```

That creates a private repo on your GitHub account, wires up the remote, and pushes.

### Option B — without `gh`

1. Go to https://github.com/new, create an **empty** repo named `c-bot` (no README, no .gitignore — those exist locally already).
2. Copy the HTTPS URL it gives you, e.g. `https://github.com/<you>/c-bot.git`.
3. Then locally:

```powershell
git remote add origin https://github.com/<you>/c-bot.git
git branch -M main
git push -u origin main
```

After the first push, future updates are just:

```powershell
git add -A
git commit -m "your message"
git push
```

## File layout

```
c-bot/
├── package.json
├── .gitignore
├── .env.example      <- template; copy to .env and fill in
├── README.md
└── src/
    ├── index.js      <- Discord gateway + message handler
    └── claude.js     <- Agent SDK wrapper, per-channel session resume
```
