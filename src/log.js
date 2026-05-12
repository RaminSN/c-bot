import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ChannelType } from 'discord.js';

const logsDir = fileURLToPath(new URL('../logs', import.meta.url));
if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

const startedAt = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = resolve(logsDir, `c-bot-${startedAt}.log`);
const stream = createWriteStream(logFile, { flags: 'a' });

console.log(`Logging to ${logFile}`);

function describeChannel(channel) {
  if (!channel) return '?';
  if (channel.type === ChannelType.DM) {
    return `DM:${channel.recipient?.tag ?? channel.recipient?.username ?? channel.id}`;
  }
  return `#${channel.name ?? channel.id}`;
}

function write(line) {
  console.log(line);
  stream.write(line + '\n');
}

export function logInbound(message, images = []) {
  const channelLabel = describeChannel(message.channel);
  const speaker =
    message.member?.displayName ?? message.author.displayName ?? message.author.username;
  const ts = new Date().toISOString();
  const imageNote = images.length ? ` [+${images.length} image${images.length === 1 ? '' : 's'}]` : '';
  write(`[${ts}] << ${channelLabel} <${speaker}>: ${message.content}${imageNote}`);
}

export function logOutbound(channel, content) {
  const channelLabel = describeChannel(channel);
  const ts = new Date().toISOString();
  write(`[${ts}] >> ${channelLabel}: ${content}`);
}
