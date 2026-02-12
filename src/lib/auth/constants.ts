export const SESSION_COOKIE_NAME = 'ph_session';

// 30 days
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function isAuthDisabled(): boolean {
  const v = process.env.PATRON_HUB_DISABLE_AUTH;
  return v === '1' || v === 'true' || v === 'TRUE';
}
