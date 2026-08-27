import { config } from '../config.js';

const admittedUserIds = new Set(
  (config.PRIVATE_ACCESS_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

export function isPrivateUserAllowed(userId: string): boolean {
  if (!config.isProd && admittedUserIds.size === 0) return true;
  return admittedUserIds.has(userId);
}

export function privateAdmissionConfigured(): boolean {
  return admittedUserIds.size > 0;
}
