import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";

/** A Messages API response as the SDK returns it, with prompt-cache usage. */
function messageFixture(usage: Partial<Anthropic.Usage>): Anthropic.Message {
  return {
    id: "msg_fixture",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [{ type: "text", text: "hello from the api", citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 21,
      output_tokens: 340,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      ...usage,
    },
  } as Anthropic.Message;
}

/** Stands in for the SDK client so the test never reaches the network. */
function fakeClient(message: Anthropic.Message): Anthropic {
  return { messages: { create: async () => message } } as unknown as Anthropic;
}

const REQUEST = { systemPrompt: "s", userPrompt: "u", model: "claude-sonnet-5", maxTokens: 100 };

test("complete() keeps cache_read_input_tokens and cache_creation_input_tokens from the API usage block", async () => {
  const message = messageFixture({ cache_read_input_tokens: 15_200, cache_creation_input_tokens: 2_048 });
  const provider = new AnthropicProvider(undefined, { client: fakeClient(message) });
  const result = await provider.complete(REQUEST);

  assert.equal(result.text, "hello from the api");
  assert.equal(result.provider, "anthropic");
  assert.deepEqual(result.usage, {
    inputTokens: 21,
    outputTokens: 340,
    cacheReadInputTokens: 15_200,
    cacheCreationInputTokens: 2_048,
  });
});

test("complete() leaves the cache fields undefined, not 0, when the API reports them as null", async () => {
  const provider = new AnthropicProvider(undefined, { client: fakeClient(messageFixture({})) });
  const result = await provider.complete(REQUEST);
  assert.deepEqual(result.usage, { inputTokens: 21, outputTokens: 340 });
});

test("complete() drops a negative or non-integer cache field instead of keeping it", async () => {
  const message = messageFixture({ cache_read_input_tokens: -5, cache_creation_input_tokens: 2.5 });
  const provider = new AnthropicProvider(undefined, { client: fakeClient(message) });
  const result = await provider.complete(REQUEST);
  assert.deepEqual(result.usage, { inputTokens: 21, outputTokens: 340 });
});
