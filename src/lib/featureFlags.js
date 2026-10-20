// Build-time feature flags (Vite inlines import.meta.env at build time).

// The mock admin console approves lawyers and edits KYC with no login at
// all, so it must never ship in a public production build by accident.
export const ADMIN_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_ADMIN === 'true';
