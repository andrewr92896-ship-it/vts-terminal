// Offline check of the provider seam (`provider.ts`).
//
// The migration cannot be proven by a typecheck: a wrong field name, a wrong
// image encoding or a missing JSON-mode flag all compile perfectly and only
// show up as a screenshot the model will not read — which is exactly the
// failure the switch to OpenAI is meant to remove. So the request the terminal
// would actually send is inspected here, with `fetch` replaced rather than
// called. Nothing reaches a network and no key is needed.
//
//     npm run verify:ai-provider          (root or @vts/api)
//
// Exits non-zero on the first mismatch.

process.env.AI_PROVIDER ??= 'openai';
process.env.OPENAI_API_KEY ??= 'test-key-not-real';
process.env.SESSION_SECRET ??= 'verify-only-session-secret-value';
process.env.CREDENTIALS_KEY ??= (await import('node:crypto')).randomBytes(32).toString('base64');

const { completeText, completeVision, aiConfigured, activeProvider } = await import('./provider.js');

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}\n       expected ${e}\n       actual   ${a}`);
  }
}
function ok(label: string, condition: boolean): void {
  check(label, condition, true);
}

type Sent = { url: string; body: any; headers: Record<string, string> };
const sent: Sent[] = [];
let reply: unknown = { choices: [{ message: { content: '{"ok":true}' } }] };
let status = 200;

globalThis.fetch = (async (url: string, init: any) => {
  sent.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => reply,
    text: async () => JSON.stringify(reply),
  };
}) as unknown as typeof fetch;

const PNG = 'iVBORw0KGgoAAAANSUhEUg==';

console.log('\n[the seam reports the provider it is actually serving]');
check('the provider is the configured one', activeProvider(), 'openai');
// The OpenAI key is what matters when OpenAI is serving. Reading the Anthropic
// key here would report "configured" on an install that cannot make a call.
ok('configured on the OpenAI key alone', aiConfigured());

console.log('\n[a screenshot is sent as an image the model can actually read]');
sent.length = 0;
await completeVision({
  imageBase64: PNG, mediaType: 'image/png', system: 'SYSTEM', prompt: 'PROMPT',
  maxTokens: 1500, thinking: true, json: true,
});
const vision = sent[0]!;
check('it posts to chat completions', vision.url, 'https://api.openai.com/v1/chat/completions');
check('the key travels as a bearer token', vision.headers.Authorization, 'Bearer test-key-not-real');
check('the system prompt is its own message', vision.body.messages[0], { role: 'system', content: 'SYSTEM' });
const parts = vision.body.messages[1].content;
// A data URI, not a bare base64 string: OpenAI reads the media type off the
// prefix, and without it the image is not an image.
check('the image is a data URI carrying its media type', parts[0].image_url.url, `data:image/png;base64,${PNG}`);
check('it asks for full detail', parts[0].image_url.detail, 'high');
check('the instruction follows the image', parts[1], { type: 'text', text: 'PROMPT' });
check('the budget uses the field the current models want', vision.body.max_completion_tokens, 1500);
ok('the deprecated max_tokens is not sent', vision.body.max_tokens === undefined);
// The whole point of the move: a parse can no longer come back as prose.
check('JSON mode is on for a parsed answer', vision.body.response_format, { type: 'json_object' });
// Anthropic-only. Sending it to OpenAI is a 400 on every screenshot.
ok('extended thinking is not sent to OpenAI', vision.body.thinking === undefined);

console.log('\n[prose is asked for as prose]');
sent.length = 0;
reply = { choices: [{ message: { content: 'An answer.' } }] };
const text = await completeText({
  turns: [{ role: 'user', content: 'Q1' }, { role: 'assistant', content: 'A1' }, { role: 'user', content: 'Q2' }],
  system: 'SYSTEM', maxTokens: 400,
});
check('the answer comes back trimmed', text, 'An answer.');
const chat = sent[0]!;
check('the turns keep their order', chat.body.messages.map((m: any) => `${m.role}:${m.content}`),
  ['system:SYSTEM', 'user:Q1', 'assistant:A1', 'user:Q2']);
// Forcing JSON on the assistant would make it answer a question in braces.
ok('JSON mode is off when nothing will parse it', chat.body.response_format === undefined);

console.log('\n[a refusal is reported, never returned as an answer]');
status = 400;
reply = { error: { message: 'model not available to this account' } };
let message = '';
await completeText({ turns: [{ role: 'user', content: 'x' }], maxTokens: 10 }).catch((e) => { message = String(e.message) });
ok('the status is named', message.includes('400'));
ok('the provider says why', message.includes('model not available'));
ok('the key is never in the message', !message.includes('test-key-not-real'));

status = 200;
// An empty completion reaches a parser as "unreadable", which sends the user to
// check a screenshot for a fault that is ours.
reply = { choices: [{ message: { content: '' }, finish_reason: 'length' }] };
message = '';
await completeVision({ imageBase64: PNG, mediaType: 'image/png', system: 's', prompt: 'p', maxTokens: 10 })
  .catch((e) => { message = String(e.message) });
ok('running out of room says so', message.includes('ran out of room'));

reply = { choices: [{ message: { content: '   ' } }] };
message = '';
await completeText({ turns: [{ role: 'user', content: 'x' }], maxTokens: 10 }).catch((e) => { message = String(e.message) });
ok('an empty answer is refused rather than passed on', message.includes('empty'));

console.log(failures ? `\n✗ ${failures} failed\n` : '\n✓ provider seam verified\n');
process.exit(failures ? 1 : 0);
