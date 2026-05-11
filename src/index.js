import 'dotenv/config';
import { ChannelType, Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { chat, getMode, hasCodebase, resetChannel, setMode } from './claude.js';
import { logInbound, logOutbound } from './log.js';

const { DISCORD_TOKEN, CLAUDE_CODE_OAUTH_TOKEN } = process.env;

const COMMANDS_LIST = [
  '**Available commands**',
  '• `!commands` — show this list',
  '• `!hickey` — switch this channel to the Hickey persona (the default)',
  '• `!support` — switch this channel to T5 support (non-developer assistant)',
  '• `!private` — open a DM with the bot for a private conversation',
  '• `!reset` — clear this channel\'s conversation history without changing mode',
].join('\n');

if (!DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in environment.');
  process.exit(1);
}
if (!CLAUDE_CODE_OAUTH_TOKEN) {
  console.error('Missing CLAUDE_CODE_OAUTH_TOKEN in environment. Run: claude setup-token');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

async function sendAndLog(channel, content) {
  await channel.send(content);
  logOutbound(channel, content);
}

async function replyAndLog(message, content) {
  await message.reply(content);
  logOutbound(message.channel, content);
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  const announcement = [
    '**Server restarted.**',
    '*Returned to my post. Prior dispatches discarded — every channel begins clean.*',
    '',
    COMMANDS_LIST,
  ].join('\n');
  for (const guild of c.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isTextBased()) continue;
      const perms = channel.permissionsFor(c.user);
      if (!perms?.has(['ViewChannel', 'SendMessages'])) continue;
      try {
        await sendAndLog(channel, announcement);
      } catch (err) {
        console.warn(
          `Failed to announce in #${channel.name} (${channel.id}):`,
          err.message,
        );
      }
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  if (!content) return;

  logInbound(message);

  if (content === '!commands') {
    const mode = getMode(message.channel.id);
    await replyAndLog(message, `${COMMANDS_LIST}\n\nCurrent mode: **${mode}**`);
    return;
  }

  if (content === '!support') {
    if (!hasCodebase) {
      await replyAndLog(message, 'Support mode requires `T5_PATH` to be set in `.env`.');
      return;
    }
    setMode(message.channel.id, 'support');
    await replyAndLog(message, 'Switched to T5 support mode for this channel. Conversation reset.');
    return;
  }

  if (content === '!hickey') {
    setMode(message.channel.id, 'hickey');
    await replyAndLog(message, 'Switched to Hickey mode for this channel. Conversation reset.');
    return;
  }

  if (content === '!private') {
    if (message.channel.type === ChannelType.DM) {
      await replyAndLog(message, 'We are already in a private channel, Soldat.');
      return;
    }
    try {
      const dm = await message.author.createDM();
      await sendAndLog(dm, 'Acknowledged. Continue here at your discretion.');
      await replyAndLog(message, 'DM sent.');
    } catch (err) {
      console.error('Failed to open DM:', err);
      await replyAndLog(
        message,
        'I could not DM you. Check **User Settings → Privacy & Safety → "Allow direct messages from server members"** is enabled, then try again.',
      );
    }
    return;
  }

  if (content === '!reset') {
    resetChannel(message.channel.id);
    await replyAndLog(message, 'Channel conversation cleared.');
    return;
  }

  const typingInterval = setInterval(() => {
    message.channel.sendTyping().catch(() => {});
  }, 5000);

  const speaker =
    message.member?.displayName ??
    message.author.displayName ??
    message.author.username;
  const prompt = `[${speaker}] ${content}`;

  try {
    await message.channel.sendTyping();
    const reply = await chat(message.channel.id, prompt);
    if (!reply) {
      await replyAndLog(message, '(no response)');
      return;
    }
    for (const chunk of chunkForDiscord(reply)) {
      await sendAndLog(message.channel, chunk);
    }
  } catch (err) {
    console.error('Error from Claude:', err);
    const msg = err?.message ?? String(err);
    await replyAndLog(message, `Error: ${msg.slice(0, 1900)}`);
  } finally {
    clearInterval(typingInterval);
  }
});

function chunkForDiscord(text) {
  const MAX = 2000;
  if (text.length <= MAX) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > MAX) {
    let cut = rest.lastIndexOf('\n', MAX);
    if (cut < MAX / 2) cut = rest.lastIndexOf(' ', MAX);
    if (cut <= 0) cut = MAX;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, '');
  }
  if (rest.length) chunks.push(rest);
  return chunks;
}

client.login(DISCORD_TOKEN);
