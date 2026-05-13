import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { logOutbound } from './log.js';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

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

const adoOrg = process.env.ADO_ORG?.trim() || null;
const adoPat = process.env.ADO_PAT?.trim() || null;
const adoEmail = process.env.ADO_EMAIL?.trim() || 'c-bot';
export const hasAdo = Boolean(adoOrg && adoPat);
const adoEnvToken = hasAdo
  ? Buffer.from(`${adoEmail}:${adoPat}`).toString('base64')
  : null;

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

export async function chat(channelId, input, channel) {
  const { text = '', images = [] } = typeof input === 'string' ? { text: input } : input;
  const mode = getMode(channelId);
  const resume = sessionByChannel.get(channelId);
  const sent = { files: 0 };
  const discordServer = buildDiscordServer(channel, sent);
  const mcpServers = { discord: discordServer };
  const allowedTools = ['mcp__discord__send_file'];
  if (hasAdo) {
    mcpServers.ado = {
      type: 'stdio',
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['-y', '@azure-devops/mcp', adoOrg, '--authentication', 'pat'],
      env: { ...process.env, PERSONAL_ACCESS_TOKEN: adoEnvToken },
    };
    allowedTools.push('mcp__ado');
  }
  const options = {
    hooks: {},
    settingSources: [],
    systemPrompt: systemPrompts[mode],
    mcpServers,
    permissionMode: 'dontAsk',
    allowedTools,
  };
  if (codebasePath) {
    options.cwd = codebasePath;
    options.allowedTools.push(
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
    );
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

  return { text: finalText, sentFiles: sent.files };
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

function buildDiscordServer(channel, sent) {
  const sendFile = tool(
    'send_file',
    'Attach a file to your reply in the current Discord channel. Use this for any output that should be delivered as a file rather than pasted into chat: generated CSVs, JSON dumps, scripts, logs, large excerpts. Returns once the file has been sent.',
    {
      filename: z.string().describe('The filename Discord will show, including extension (e.g. "report.csv", "patch.diff").'),
      content: z.string().describe('The file body. Plain text by default; set encoding to "base64" for binary.'),
      encoding: z.enum(['utf8', 'base64']).optional().describe('Encoding of `content`. Defaults to "utf8".'),
    },
    async ({ filename, content, encoding }) => {
      if (!channel) {
        return errorResult('No Discord channel is available in this context.');
      }
      const buffer = Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8');
      if (buffer.byteLength > MAX_FILE_BYTES) {
        return errorResult(
          `File is ${buffer.byteLength} bytes, exceeds limit of ${MAX_FILE_BYTES}. Split the output or paste a shorter excerpt instead.`,
        );
      }
      try {
        await channel.send({ files: [{ attachment: buffer, name: filename }] });
        sent.files += 1;
        logOutbound(channel, `[file] ${filename} (${buffer.byteLength} bytes)`);
        return {
          content: [
            { type: 'text', text: `Sent ${filename} (${buffer.byteLength} bytes).` },
          ],
        };
      } catch (err) {
        return errorResult(`Failed to send file: ${err?.message ?? String(err)}`);
      }
    },
  );
  return createSdkMcpServer({ name: 'discord', tools: [sendFile] });
}

function errorResult(text) {
  return { content: [{ type: 'text', text }], isError: true };
}
