export function isSafeModeActive(): { active: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const hasJwt = !!process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32;
  if (!hasJwt) {
    reasons.push('SESSION_SECRET not configured or too short');
  }

  const hasEncryption = !!process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length === 32;
  if (!hasEncryption) {
    reasons.push('ENCRYPTION_KEY not configured or wrong length');
  }

  return {
    active: reasons.length > 0,
    reasons
  };
}
