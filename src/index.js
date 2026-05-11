import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { chat, resetChannel } from './claude.js';

const { DISCORD_TOKEN, CLAUDE_CODE_OAUTH_TOKEN } = process.env;

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
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  if (!content) return;

  if (content === '!reset') {
    resetChannel(message.channel.id);
    await message.reply('Channel conversation cleared.');
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
