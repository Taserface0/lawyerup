# Security policy

## Reporting a vulnerability

Please email **security@[[your-domain]]** with steps to reproduce. Don't open a public issue. We aim to acknowledge reports within 2 working days.

## Current security model (prototype)

- The Anthropic API key is used only by the server (`server/`). It must never be added as a `VITE_` variable. CI fails if a key-like string appears in `dist/`.
- `/api/chat` is rate-limited per IP, size-limited, validates roles, and redacts Aadhaar, PAN, phone, email, IFSC and card numbers before calling the model. Logs contain no message text.
- **Not production-ready:** accounts, passwords (base64), sessions, KYC, OTP and payments are client-side mocks in `localStorage`. The mock admin console has no authentication and is excluded from production builds unless `VITE_ENABLE_MOCK_ADMIN=true`.

See `docs/AUDIT.md` for the full list of fixed and open items.
