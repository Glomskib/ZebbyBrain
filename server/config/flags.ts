// Feature flags for incremental rollout
export const FF = {
  WEATHER: process.env.FF_WEATHER === 'true',
  AI_TRENDS: process.env.FF_AI_TRENDS === 'true',
  BODY_PARTS: process.env.FF_BODY_PARTS === 'true',
  AVATAR: process.env.FF_AVATAR === 'true',
  SHOPIFY: process.env.FF_SHOPIFY === 'true',
  GROUPS: process.env.FF_GROUPS === 'true',
  HERD: process.env.FF_HERD === 'true',
  REFERRALS: process.env.FF_REFERRALS === 'true',
  REWARDS: process.env.FF_REWARDS === 'true',
};

// Helper to check if feature is enabled
export function isFeatureEnabled(flag: keyof typeof FF): boolean {
  return FF[flag];
}
