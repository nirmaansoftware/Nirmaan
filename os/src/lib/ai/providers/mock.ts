import type { CompletionRequest, CompletionResult, ModelProvider } from "@/lib/ai/providers/types";

/**
 * Deterministic, no-network provider used ONLY to test the runtime's
 * plumbing (frontmatter parsing, file writing, defaults) without needing
 * API credentials. Its output is NOT a real agent response — do not use it
 * to produce anything that will be read as if an agent actually reasoned
 * about it. See src/lib/agents/runAgent.test.ts for how it's used.
 */
export class MockProvider implements ModelProvider {
  constructor(
    private response?: string,
    /** Set only by tests that need to exercise the cost-estimation path — a real run never has fabricated usage, so this stays undefined by default, matching "no usage" rather than pretending to a real number. */
    private usage?: CompletionResult["usage"],
    /** Overrides the reported model — only meaningful together with `usage`, to exercise cost estimation against a model that's actually in pricing.ts. Defaults to "mock-echo", which is deliberately absent from pricing.ts. */
    private modelOverride?: string
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const text =
      this.response ??
      [
        "---",
        'status: "ready-for-handoff"',
        'confidence: "MEDIUM"',
        "assumptions:",
        '  - "This is mock provider output, not a real agent response."',
        "risks: []",
        "open_questions: []",
        "review_required: true",
        "---",
        "",
        "# Mock Output",
        "",
        `No live model was called. Received a prompt of ${req.userPrompt.length} characters for model "${req.model}".`,
      ].join("\n");

    return { text, provider: "mock", model: this.modelOverride ?? "mock-echo", usage: this.usage };
  }
}
