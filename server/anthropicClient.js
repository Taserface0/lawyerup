// Thin wrapper that turns the official SDK into the `createMessage(params)`
// function chatHandler.js expects. Kept separate so the handler stays
// testable without network access or an API key.

import Anthropic from '@anthropic-ai/sdk';

export function createAnthropicMessageFn(apiKey) {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return (params) =>
    client.beta.messages.create({
      ...params,
      // On a safety-classifier decline, let the API re-run the turn on its
      // recommended fallback model instead of returning a bare refusal.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
}
