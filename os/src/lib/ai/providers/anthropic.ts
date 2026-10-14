import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, CompletionResult, ModelProvider } from "@/lib/ai/providers/types";

/**
 * `webTools: true` gives the model Anthropic's server-side web search (read
 * only). Only prospecting's web search asks for it; see claudeCodeCli.ts.
 */
export class AnthropicProvider implements ModelProvider {
  private client: Anthropic;

  constructor(apiKey?: string, private options: { webTools?: boolean } = {}) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Set it in the environment (e.g. os/.env.local) before running an agent against the real Anthropic provider."
      );
    }
    this.client = new Anthropic({ apiKey: key });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.systemPrompt,
      messages: [{ role: "user", content: req.userPrompt }],
      ...(this.options.webTools ? { tools: [{ type: "web_search_20250305" as const, name: "web_search" as const, max_uses: 8 }] } : {}),
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return {
      text,
      provider: "anthropic",
      model: req.model,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }
}
