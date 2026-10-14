import { prisma } from "../db/client";
import { loadAgent } from "../agents/loadAgent";
import { runAgent } from "../agents/runAgent";
import type { ModelProvider } from "@/lib/ai/providers/types";
import type { EvalCase, EvalRunResult } from "./types";

/**
 * Runs one eval case against its agent, applies the case's checker to the
 * result, and records an Evaluation row (Phase 3's Evaluation model) —
 * runAt, testCase, expectedOutcome, actualOutcome, passed. Never silently
 * skips recording, even on failure: a failed eval is exactly the kind of
 * thing that needs a durable record, not a log line.
 */
export async function runEvalCase(evalCase: EvalCase, options: { projectId: string; provider?: ModelProvider }): Promise<EvalRunResult> {
  const agentDef = loadAgent(evalCase.agentSlug); // throws clearly for an unknown slug, same as everywhere else

  const result = await runAgent({
    agentSlug: evalCase.agentSlug,
    taskType: evalCase.taskType,
    projectId: options.projectId,
    userInput: evalCase.input,
    outputRelativePath: evalCase.outputRelativePath,
    provider: options.provider,
  });

  const { passed, reason } = evalCase.checker(result);

  const agentRow = await prisma.agent.upsert({
    where: { slug: evalCase.agentSlug },
    update: {},
    create: { slug: evalCase.agentSlug, role: agentDef.role, status: "ACTIVE" },
  });

  await prisma.evaluation.create({
    data: {
      agentId: agentRow.id,
      testCase: evalCase.id,
      expectedOutcome: evalCase.expectedOutcome,
      actualOutcome: reason,
      passed,
    },
  });

  return { case: evalCase, passed, reason, rawOutput: result.rawResponse };
}

/** Runs a whole set of eval cases in sequence (not parallel — they share the same test-fixture project directory and could race on file writes otherwise) and returns all results. */
export async function runEvalSuite(cases: EvalCase[], options: { projectId: string; provider?: ModelProvider }): Promise<EvalRunResult[]> {
  const results: EvalRunResult[] = [];
  for (const evalCase of cases) {
    results.push(await runEvalCase(evalCase, options));
  }
  return results;
}
