/**
 * Defensive secret redaction for anything that ends up in a durable,
 * dashboard-visible log (Event.message) or anywhere else agent/provider
 * output might get echoed back. Motivated by something that actually
 * happened in this project's own history: a real Anthropic API key was
 * pasted directly into a chat session. This can't prevent that, but it
 * can stop a key from propagating further if it ever ends up inside text
 * this system logs or displays — e.g. a Security Engineer agent quoting
 * back a secret it found while reviewing code.
 *
 * This is a safety net, not a guarantee: it only catches patterns it
 * knows about. It does not replace not putting secrets in
 * agent-observable input in the first place.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[a-zA-Z0-9_-]{20,}/g, // Anthropic API keys
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI-style keys
  /sk_live_[a-zA-Z0-9]{10,}/g, // Stripe live secret keys
  /sk_test_[a-zA-Z0-9]{10,}/g, // Stripe test secret keys
  /AKIA[0-9A-Z]{16}/g, // AWS access key IDs
  /gh[pousr]_[a-zA-Z0-9]{20,}/g, // GitHub personal/OAuth/app/refresh tokens (ghp_, gho_, ghu_, ghs_, ghr_)
];

export function redactSecrets(text: string): string {
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}
