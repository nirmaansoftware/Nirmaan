import type { ModelConfig } from "@/lib/ai/router";
import type { ModelProvider } from "@/lib/ai/providers/types";
import { ClaudeCodeCliProvider } from "@/lib/ai/providers/claudeCodeCli";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { MockProvider } from "@/lib/ai/providers/mock";

/** The concrete provider for a routed model config. One place, shared by runAgent and callModel. */
export function providerFor(config: ModelConfig): ModelProvider {
  switch (config.provider) {
    case "claude-code-cli":
      return new ClaudeCodeCliProvider();
    case "anthropic":
      return new AnthropicProvider();
    default:
      return new MockProvider();
  }
}

/**
 * Like providerFor, but the model may search and read the public web. Used
 * only by prospecting's web search. Mock stays mock (tests, offline).
 */
export function webResearchProvider(config: ModelConfig): ModelProvider {
  switch (config.provider) {
    case "claude-code-cli":
      // A real web search takes 3–4 minutes and about $1 of usage for 5 businesses (measured 2026-09-26).
      return new ClaudeCodeCliProvider(undefined, 600_000, undefined, 3, { webTools: true });
    case "anthropic":
      return new AnthropicProvider(undefined, { webTools: true });
    default:
      return new MockProvider();
  }
}
