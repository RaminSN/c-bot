import { query } from '@anthropic-ai/claude-agent-sdk';

const sessionByChannel = new Map();

export function resetChannel(channelId) {
  sessionByChannel.delete(channelId);
}

export async function chat(channelId, userText) {
  const resume = sessionByChannel.get(channelId);
  const options = { allowedTools: [] };
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
