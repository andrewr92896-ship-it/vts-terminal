import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

// THE ONE PLACE A MODEL IS CALLED.
//
// Every AI feature in the terminal comes down to six calls — four that read a
// screenshot and two that write prose or JSON — so the provider sits behind one
// small seam rather than being threaded through the nineteen flows above it.
// Prompt composition and answer parsing are provider-agnostic and stay where
// they are; only the request shape differs, and it differs here.
//
// The seam exists because the two providers cannot be swapped atomically with
// any confidence: a screenshot flow has to be proven against real broker images
// one at a time. `AI_PROVIDER` decides, it defaults to what the terminal did
// before, and switching back is the same variable.

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export type Provider = 'anthropic' | 'openai';
export const activeProvider = (): Provider => config.AI_PROVIDER;

/** The key for whichever provider is actually serving. */
export function aiConfigured(): boolean {
  return activeProvider() === 'openai' ? !!config.OPENAI_API_KEY : !!config.ANTHROPIC_API_KEY;
}

export const textModel = (): string =>
  activeProvider() === 'openai' ? config.OPENAI_MODEL_DEFAULT : config.ANTHROPIC_MODEL_DEFAULT;
export const visionModel = (): string =>
  activeProvider() === 'openai' ? config.OPENAI_MODEL_ANALYSIS : config.ANTHROPIC_MODEL_ANALYSIS;

// ---- Anthropic -------------------------------------------------------------

let anthropic: Anthropic | null = null;
function anthropicClient(): Anthropic {
  if (!config.ANTHROPIC_API_KEY) throw new Error('AI is not configured');
  if (!anthropic) anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  return anthropic;
}

/** The concatenated text of a Messages response, skipping thinking blocks. */
function anthropicText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// ---- OpenAI ----------------------------------------------------------------
//
// Plain fetch rather than the SDK. Two request shapes do not need a dependency,
// and the file that spends money on somebody's behalf is better off small
// enough to read in one sitting — the same reason the two broker files that can
// trade are kept apart from the ones that only read.

interface OpenAiPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}
interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAiPart[];
}

async function openAiComplete(
  messages: OpenAiMessage[],
  model: string,
  maxTokens: number,
  json: boolean,
): Promise<string> {
  if (!config.OPENAI_API_KEY) throw new Error('AI is not configured');
  const response = await fetch(`${config.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: maxTokens,
      // JSON mode, where the caller is going to parse the answer. It is what
      // stops a screenshot read coming back as a sentence about the screenshot,
      // which no parser can do anything with.
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!response.ok) {
    // The body carries the reason (a rate limit, a model the account cannot
    // reach, an over-long image). Surfacing it beats "request failed", and the
    // key is never in the body.
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI request failed (${response.status})${detail ? `: ${detail.slice(0, 400)}` : ''}`);
  }

  const body = (await response.json()) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  };
  const choice = body.choices?.[0];
  const text = choice?.message?.content;
  // An empty completion is not an answer. It happens when the whole budget went
  // on a long image, and returning '' would reach a parser as "unreadable" —
  // which sends the user to check their screenshot for a fault that is ours.
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error(
      choice?.finish_reason === 'length'
        ? 'The model ran out of room before it answered. Try a smaller image.'
        : 'The model returned an empty answer.',
    );
  }
  return text.trim();
}

// ---- The seam --------------------------------------------------------------

export interface TextRequest {
  turns: Turn[];
  system?: string;
  maxTokens: number;
  /** The answer is going to be parsed as JSON. */
  json?: boolean;
}

export async function completeText({ turns, system, maxTokens, json }: TextRequest): Promise<string> {
  const model = textModel();
  if (activeProvider() === 'openai') {
    return openAiComplete(
      [...(system ? [{ role: 'system' as const, content: system }] : []), ...turns],
      model,
      maxTokens,
      !!json,
    );
  }
  const message = await anthropicClient().messages.create({
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: turns.map((t) => ({ role: t.role, content: t.content })),
  });
  return anthropicText(message);
}

export interface VisionRequest {
  imageBase64: string;
  mediaType: ImageMediaType;
  prompt: string;
  system: string;
  maxTokens: number;
  /** Anthropic only: extended thinking, for the one flow that judges a setup. */
  thinking?: boolean;
  json?: boolean;
}

export async function completeVision(request: VisionRequest): Promise<{ text: string; model: string }> {
  const model = visionModel();
  if (activeProvider() === 'openai') {
    const text = await openAiComplete(
      [
        { role: 'system', content: request.system },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${request.mediaType};base64,${request.imageBase64}`, detail: 'high' } },
            { type: 'text', text: request.prompt },
          ],
        },
      ],
      model,
      request.maxTokens,
      !!request.json,
    );
    return { text, model };
  }
  const message = await anthropicClient().messages.create({
    model,
    max_tokens: request.maxTokens,
    ...(request.thinking ? { thinking: { type: 'adaptive' as const } } : {}),
    system: request.system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: request.mediaType, data: request.imageBase64 } },
          { type: 'text', text: request.prompt },
        ],
      },
    ],
  });
  return { text: anthropicText(message), model };
}
