import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { chat, resetChannel } from './claude.js';

const { DISCORD_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, ALLOWED_GUILD_IDS } = process.env;

if (!DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in environment.');
  process.exit(1);
}
if (!CLAUDE_CODE_OAUTH_TOKEN) {
  console.error('Missing CLAUDE_CODE_OAUTH_TOKEN in environment. Run: claude setup-token');
  process.exit(1);
}

const allowedGuilds = new Set(
  (ALLOWED_GUILD_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  if (allowedGuilds.size === 0) {
    console.warn('ALLOWED_GUILD_IDS is empty — bot will ignore every message.');
  } else {
    console.log('Allowed guild IDs:', [...allowedGuilds].join(', '));
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guildId || !allowedGuilds.has(message.guildId)) return;

  const content = message.content.trim();
  if (!content) return;

  if (content === '!reset') {
    resetChannel(message.channel.id);
    await message.reply('Channel conversation cleared.');
    return;
  }

  try {
    await message.channel.sendTyping();
    const reply = await chat(message.channel.id, content);
    if (!reply) {
      await message.reply('(no response)');
      return;
    }
    for (const chunk of chunkForDiscord(reply)) {
      await message.channel.send(chunk);
    }
  } catch (err) {
    console.error('Error from Claude:', err);
    const msg = err?.message ?? String(err);
    await message.reply(`Error: ${msg.slice(0, 1900)}`);
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
