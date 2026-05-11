import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';

const systemPrompt = readFileSync(
  fileURLToPath(new URL('../prompts/system.md', import.meta.url)),
  'utf8',
).trim();

const sessionByChannel = new Map();

export function resetChannel(channelId) {
  sessionByChannel.delete(channelId);
}

export async function chat(channelId, userText) {
  const resume = sessionByChannel.get(channelId);
  const options = {
    allowedTools: [],
    hooks: {},
    settingSources: [],
    systemPrompt,
  };
  if (resume) options.resume = resume;

  let finalText = '';

  for await (const message of query({ prompt: userText, options })) {
    if (message.type === 'system' && message.subtype === 'init' && message.session_id) {
      sessionByChannel.set(channelId, message.session_id);
    } else if (message.type === 'result' && typeof message.result === 'string') {
      finalText = message.result;
    }
  }

  return finalText;
}
