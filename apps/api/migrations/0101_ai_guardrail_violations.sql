-- AI guardrail violations — the rule-breaking record behind Admin ▸ Rule Breaking.
--
-- One row each time VTS AI refuses a request for financial or investment advice.
-- The row carries the conversation that produced it, because an administrator
-- reviewing "did the terminal get this right?" cannot answer that from a
-- timestamp — and because the second offense costs the user thirty minutes, so
-- the evidence has to be there before anyone acts on it.
--
-- SCOPE: this is the ONLY AI conversation storage in the terminal (owner
-- decision). Ordinary AI chats are not stored anywhere, before or after this
-- migration — only a conversation that actually tripped the limits is kept.
CREATE TABLE ai_violations (
  id TEXT PRIMARY KEY,
  -- The account that made the request. ON DELETE CASCADE, and the row is in the
  -- admin per-user delete list: unlike credential_audit and employee_audit_log,
  -- this trail describes a conversation rather than access to somebody's money,
  -- so it goes when the account goes.
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Which AI surface: 'ask' | 'tutor'. Support intake is deliberately never here
  -- — the complaints channel is not gated on the thing being complained about.
  surface TEXT NOT NULL,
  -- The conversation as it stood when the refusal happened, JSON:
  -- [{ role, content }]. Trimmed to the last few turns by the writer.
  conversation TEXT NOT NULL,
  -- What the terminal replied (sentinel already stripped).
  reply TEXT NOT NULL,
  -- Whether this one carried a timeout. The FIRST violation in a window is a
  -- warning only: false positives are inevitable and locking someone out on
  -- their first encounter with the rule punishes them for the system's mistake.
  timed_out INTEGER NOT NULL DEFAULT 0,
  -- When the timeout expires, or NULL when this was a warning only.
  timeout_until INTEGER,
  -- Review state: 'open' | 'dismissed' | 'warned' | 'actioned'.
  -- 'open' is what surfaces in the admin bell.
  status TEXT NOT NULL DEFAULT 'open',
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at INTEGER,
  review_note TEXT,
  -- The user pressed "I think the AI made a mistake". Not an appeal that changes
  -- anything automatically — it flags the row for a human, which is the point:
  -- it is the terminal's own feedback channel on whether the guardrails misfire.
  disputed INTEGER NOT NULL DEFAULT 0,
  disputed_at INTEGER,
  dispute_note TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint

-- The two reads this table gets: "what is waiting on an admin" (status) and
-- "has this user tripped it recently" (user + time), which is the hot one — it
-- runs before every AI call.
CREATE INDEX ai_violations_user_created_idx ON ai_violations (user_id, created_at);
--> statement-breakpoint
CREATE INDEX ai_violations_status_idx ON ai_violations (status, created_at);
