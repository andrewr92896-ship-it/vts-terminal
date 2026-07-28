import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

// Outbound email. Today this exists for exactly one thing — delivering the
// Employee Portal's sign-in codes — and it is written to stay that narrow: no
// templating layer, no queue, no retry policy. A code is worth one attempt at
// the moment it is asked for, and if that attempt fails the employee asks for
// another one.
//
// Two ways out, tried in this order:
//
//   1. **Resend** (`RESEND_API_KEY`) — an HTTPS API on port 443. This is the
//      preferred path, and the reason is not preference at all: most PaaS hosts
//      block outbound SMTP. Railway blocks ports 25/465/587/2525 on everything
//      below its Pro plan, which presents as a ~10s connection timeout with no
//      error from the mail provider, because the provider is never reached. Port
//      443 is not blockable without breaking the whole app.
//   2. **SMTP** (`SMTP_HOST`) — kept for local development against a catcher
//      like MailHog, and for anyone hosting somewhere that permits it.
//
// With neither configured the code is written to the server log, the same
// "printed once to logs" fallback the first-boot admin password uses. That is
// deliberately not a silent no-op: a misconfigured deploy must not be able to
// lock every employee out of the portal, and an operator with log access is
// already trusted with far more than a one-time sign-in code.

// Every send is bounded. The sign-in path awaits delivery so it can report
// honestly whether the code went out, which means an unbounded send is an
// unbounded sign-in — see the note on the transport below.
const MAIL_TIMEOUT_MS = 10_000;

let transporter: Transporter | null = null;

export function mailConfigured(): boolean {
  return !!config.RESEND_API_KEY || !!config.SMTP_HOST;
}

// The From header. `MAIL_FROM` is the modern name covering both transports;
// `SMTP_FROM` is still honoured so an existing deployment keeps working.
function mailFrom(): string {
  return config.MAIL_FROM ?? config.SMTP_FROM;
}

function getTransport(): Transporter | null {
  if (!config.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      // Bound every stage of the conversation. Nodemailer's defaults are two
      // minutes to connect and ten on the socket, which is far too long for
      // something a sign-in waits on: a mail server that accepts the TCP
      // connection and then says nothing would hang the login request until the
      // browser gave up, and the employee would be locked out by a mail
      // misconfiguration rather than shown the "could not be emailed" notice
      // that is supposed to cover exactly this case.
      //
      // The classic way to land here is a port/secure mismatch — plaintext on
      // 465, or implicit TLS on 587 — where each side waits for the other to
      // speak first and neither ever does.
      connectionTimeout: MAIL_TIMEOUT_MS,
      greetingTimeout: MAIL_TIMEOUT_MS,
      socketTimeout: 15_000,
      ...(config.SMTP_USER
        ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASS ?? '' } }
        : {}),
    });
  }
  return transporter;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Resend's send endpoint. One POST, no SDK — the request is four fields and a
// bearer token, and a dependency here would buy nothing but supply-chain
// surface on the path that guards the door.
async function sendViaResend(mail: Mail): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mailFrom(),
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
      }),
      signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Resend answers a rejection with JSON explaining it — an unverified
      // sending domain being much the most likely. Surface that text verbatim:
      // it is the difference between "fix your DNS" and "fix your API key",
      // and the sign-in screen can only ever say "could not be emailed".
      const detail = await res.text().catch(() => '');
      console.error(`[mail] send failed: Resend returned ${res.status} ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    // Includes the AbortSignal timeout firing.
    console.error('[mail] send failed:', err);
    return false;
  }
}

// Returns whether the message actually went out. `false` means it was logged
// instead (or the send failed) — the caller decides what to tell the user, and
// must never leak the code itself into a response.
export async function sendMail(mail: Mail): Promise<boolean> {
  if (config.RESEND_API_KEY) return sendViaResend(mail);

  const transport = getTransport();
  if (!transport) {
    console.warn(
      `[mail] no mail transport configured (set RESEND_API_KEY, or SMTP_HOST) — not sending "${mail.subject}" to ${mail.to}. Body:\n${mail.text}`,
    );
    return false;
  }
  try {
    await transport.sendMail({
      from: mailFrom(),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      ...(mail.html ? { html: mail.html } : {}),
    });
    return true;
  } catch (err) {
    // Never rethrow into a sign-in path: a bounced code is a "try again",
    // not a 500 that tells an attacker the address exists.
    console.error('[mail] send failed:', err);
    return false;
  }
}
