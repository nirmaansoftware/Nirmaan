import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { callModel } from "./callModel";
import { MockProvider } from "@/lib/ai/providers/mock";

test("callModel records cache-read and cache-creation tokens in the AiUsage row", async () => {
  const usage = { inputTokens: 4, outputTokens: 812, cacheReadInputTokens: 218_769, cacheCreationInputTokens: 12_480 };
  const { usageId } = await callModel({
    task: "test:cache-tokens",
    taskType: "requirements",
    systemPrompt: "s",
    userPrompt: "u",
    provider: new MockProvider("ok", usage, "claude-sonnet-5"),
  });
  try {
    const row = await prisma.aiUsage.findUniqueOrThrow({ where: { id: usageId } });
    assert.equal(row.inputTokens, 4);
    assert.equal(row.outputTokens, 812);
    assert.equal(row.cacheReadInputTokens, 218_769);
    assert.equal(row.cacheCreationInputTokens, 12_480);
    assert.ok(row.latencyMs >= 0);
  } finally {
    await prisma.aiUsage.delete({ where: { id: usageId } });
  }
});

test("callModel stores null cache columns, not 0, when the provider reports no cache fields", async () => {
  const { usageId } = await callModel({
    task: "test:cache-tokens",
    taskType: "requirements",
    systemPrompt: "s",
    userPrompt: "u",
    provider: new MockProvider("ok", { inputTokens: 10, outputTokens: 5 }, "claude-sonnet-5"),
  });
  try {
    const row = await prisma.aiUsage.findUniqueOrThrow({ where: { id: usageId } });
    assert.equal(row.cacheReadInputTokens, null);
    assert.equal(row.cacheCreationInputTokens, null);
  } finally {
    await prisma.aiUsage.delete({ where: { id: usageId } });
  }
});
