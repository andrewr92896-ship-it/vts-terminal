import { askClaude } from './claude.js';
import { enforceAiLimit } from './usage.js';

// Shared helper for the dashboard "Brief me" buttons: enforce the per-user AI
// limit, then ask Sonnet to turn a compact data summary into a short plain-text
// read. Callers handle aiConfigured() and error mapping (429 for AiLimitError).
export async function generateBrief(
  userId: string,
  kind: string,
  system: string,
  data: string,
): Promise<string> {
  await enforceAiLimit(userId, kind);
  return askClaude(data, system);
}
