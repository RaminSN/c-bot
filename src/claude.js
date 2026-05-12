import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';

function loadPrompt(file) {
  return readFileSync(
    fileURLToPath(new URL(`../prompts/${file}`, import.meta.url)),
    'utf8',
  ).trim();
}

const globalRules = loadPrompt('global.md');

const systemPrompts = {
  hickey: `${loadPrompt('hickey.md')}\n\n${globalRules}`,
  support: `${loadPrompt('support.md')}\n\n${globalRules}`,
};

const codebasePath = process.env.T5_PATH?.trim() || null;
export const hasCodebase = Boolean(codebasePath);

const sessionByChannel = new Map();
const modeByChannel = new Map();

export function getMode(channelId) {
  return modeByChannel.get(channelId) ?? 'hickey';
}

export function setMode(channelId, mode) {
  modeByChannel.set(channelId, mode);
  sessionByChannel.delete(channelId);
}

export function resetChannel(channelId) {
  sessionByChannel.delete(channelId);
}

export async function chat(channelId, input) {
  const { text = '', images = [] } = typeof input === 'string' ? { text: input } : input;
  const mode = getMode(channelId);
  const resume = sessionByChannel.get(channelId);
  const options = {
    hooks: {},
    settingSources: [],
    systemPrompt: systemPrompts[mode],
  };
  if (codebasePath) {
    options.cwd = codebasePath;
    options.allowedTools = [
      'Read',
      'Glob',
      'Grep',
      'Bash(git log *)',
      'Bash(git show *)',
      'Bash(git blame *)',
      'Bash(git diff *)',
      'Bash(git status*)',
      'Bash(git branch *)',
      'Bash(git tag *)',
      'Bash(git reflog *)',
      'Bash(git rev-parse *)',
      'Bash(git ls-files *)',
      'Bash(git ls-tree *)',
    ];
    options.permissionMode = 'dontAsk';
  } else {
    options.allowedTools = [];
    options.permissionMode = 'dontAsk';
  }
  if (resume) options.resume = resume;

  const prompt = images.length === 0 ? text : buildStructuredPrompt(text, images);

  let finalText = '';

  for await (const message of query({ prompt, options })) {
    if (message.type === 'system' && message.subtype === 'init' && message.session_id) {
      sessionByChannel.set(channelId, message.session_id);
    } else if (message.type === 'result' && typeof message.result === 'string') {
      finalText = message.result;
    }
  }

  return finalText;
}

async function* buildStructuredPrompt(text, images) {
  const content = [];
  if (text) content.push({ type: 'text', text });
  for (const img of images) {
    content.push({ type: 'image', source: { type: 'url', url: img.url } });
  }
  yield {
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null,
  };
}
