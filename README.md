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

Fill in both values:

```
DISCORD_TOKEN=...
CLAUDE_CODE_OAUTH_TOKEN=...
```

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
