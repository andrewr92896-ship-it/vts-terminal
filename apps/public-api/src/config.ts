export type PublicConfig = {
  databaseUrl: string;
  sessionKey: string;
  challengePepper: string;
  trustedDeviceKey: string;
  allowedOrigins: Set<string>;
  // Where the terminal is served, for links inside emails. Derived from the
  // first allowed origin rather than a variable of its own: a separate one
  // could disagree with the origin guard, and a deployment that got it wrong
  // would send confirmation links pointing somewhere that refuses them.
  siteUrl: string;
  cookieDomain?: string;
  cookieSecure: true;
  mailFrom: string;
  smtpUrl: string;
  marketProviderUrl?: string;
  marketProviderToken?: string;
  port: number;
};

const required = (env: NodeJS.ProcessEnv, name: string) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required public-only environment variable: ${name}`);
  return value;
};

export function loadPublicConfig(env: NodeJS.ProcessEnv = process.env): PublicConfig {
  const sessionKey = required(env, 'PUBLIC_SESSION_SIGNING_KEY');
  const challengePepper = required(env, 'PUBLIC_CHALLENGE_PEPPER');
  const trustedDeviceKey = required(env, 'PUBLIC_TRUSTED_DEVICE_SIGNING_KEY');
  for (const [name, value] of Object.entries({ PUBLIC_SESSION_SIGNING_KEY: sessionKey, PUBLIC_CHALLENGE_PEPPER: challengePepper, PUBLIC_TRUSTED_DEVICE_SIGNING_KEY: trustedDeviceKey })) {
    if (Buffer.byteLength(value) < 32) throw new Error(`${name} must contain at least 32 bytes`);
  }
  if (env.PUBLIC_COOKIE_SECURE !== 'true') throw new Error('PUBLIC_COOKIE_SECURE must be exactly true');
  const origins = required(env, 'PUBLIC_ALLOWED_ORIGINS').split(',').map((v) => v.trim()).filter(Boolean);
  if (!origins.length || origins.some((origin) => !origin.startsWith('https://'))) throw new Error('PUBLIC_ALLOWED_ORIGINS must contain HTTPS origins only');
  const smtpUrl = required(env, 'PUBLIC_SMTP_URL');
  if (!smtpUrl.startsWith('smtp://') && !smtpUrl.startsWith('smtps://')) throw new Error('PUBLIC_SMTP_URL must use smtp:// or smtps://');
  const providerUrl = env.PUBLIC_MARKET_PROVIDER_URL?.trim();
  if (providerUrl && !providerUrl.startsWith('https://')) throw new Error('PUBLIC_MARKET_PROVIDER_URL must use HTTPS');
  return {
    databaseUrl: required(env, 'PUBLIC_DATABASE_URL'),
    sessionKey,
    challengePepper,
    trustedDeviceKey,
    allowedOrigins: new Set(origins),
    siteUrl: origins[0] as string,
    cookieDomain: env.PUBLIC_COOKIE_DOMAIN?.trim() || undefined,
    cookieSecure: true,
    mailFrom: required(env, 'PUBLIC_MAIL_FROM'),
    smtpUrl,
    marketProviderUrl: providerUrl,
    marketProviderToken: env.PUBLIC_MARKET_PROVIDER_TOKEN?.trim() || undefined,
    port: Number(env.PUBLIC_PORT || 4101),
  };
}

export const PUBLIC_ENV_NAMES = [
  'PUBLIC_DATABASE_URL', 'PUBLIC_SESSION_SIGNING_KEY', 'PUBLIC_CHALLENGE_PEPPER',
  'PUBLIC_TRUSTED_DEVICE_SIGNING_KEY', 'PUBLIC_ALLOWED_ORIGINS', 'PUBLIC_COOKIE_DOMAIN',
  'PUBLIC_COOKIE_SECURE', 'PUBLIC_MAIL_FROM', 'PUBLIC_SMTP_URL',
  'PUBLIC_MARKET_PROVIDER_URL', 'PUBLIC_MARKET_PROVIDER_TOKEN', 'PUBLIC_PORT',
] as const;
