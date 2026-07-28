import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

// Outbound email. Today this exists for exactly one thing — delivering the
// Employee Portal's sign-in codes — and it is written to stay that narrow: no
// templating layer, no queue, no retry policy. A code is worth one attempt at
// the moment it is asked for, and if that attempt fails the employee asks for
// another one.
//
// SMTP is optional. With no SMTP_HOST configured the code is written to the
// server log instead, which is the same fallback the first-boot admin password
// uses. That is deliberately not a silent no-op: a misconfigured deploy must
// not be able to lock every employee out of the portal, and an operator with
// log access is already trusted with far more than a one-time code.

let transporter: Transporter | null = null;

export function mailConfigured(): boolean {
  return !!config.SMTP_HOST;
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
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
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

// Returns whether the message actually went out over SMTP. `false` means it was
// logged instead (or the send failed) — the caller decides what to tell the
// user, and must never leak the code itself into a response.
export async function sendMail(mail: Mail): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    console.warn(
      `[mail] SMTP is not configured — not sending "${mail.subject}" to ${mail.to}. Body:\n${mail.text}`,
    );
    return false;
  }
  try {
    await transport.sendMail({
      from: config.SMTP_FROM,
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
