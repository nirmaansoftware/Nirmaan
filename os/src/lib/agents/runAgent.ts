import matter from "gray-matter";
import { loadAgent } from "./loadAgent";
import { composeSystemPrompt, skillRefs } from "./composePrompt";
import { resolveModel, type TaskType, type ModelConfig } from "@/lib/ai/router";
import { providerFor } from "@/lib/ai/providerFor";
import type { ModelProvider, TokenUsage } from "@/lib/ai/providers/types";
import type { HandoffMetadata } from "./types";
import { writeVersionedArtifact, projectsRoot, stripUndefined } from "./artifactWriter";

export interface RunAgentInput {
  agentSlug: string;
  taskType: TaskType;
  projectId: string;
  /** The raw brief/context/prior artifacts this run is working from. */
  userInput: string;
  /** Path under /projects/{projectId}/ to write the resulting artifact to, e.g. "requirements/prd.md". */
  outputRelativePath: string;
  /** Inject a provider (used by tests to avoid a live network call). Defaults to the model router's choice. */
  provider?: ModelProvider;
  /** Passed straight through to resolveModel(taskType, overrides) — e.g. dispatch.ts's per-instance complexity adjustment (src/lib/orchestrator/complexityHeuristic.ts). Takes precedence over both the router's default and any env-var override for this task type. */
  modelOverrides?: Partial<ModelConfig>;
  /** Skill ids to load for this run (at most 3, each held by the agent). None named means no skill text. */
  skills?: string[];
}

export interface RunAgentResult {
  filePath: string;
  metadata: HandoffMetadata;
  rawResponse: string;
  /** Which model actually answered — for cost estimation and observability. */
  model: string;
  provider: string;
  /** Real usage when the provider reports one (Anthropic does; MockProvider doesn't). Never a guess — see src/lib/ai/costs/. */
  usage?: TokenUsage;
  /** Real provider-reported USD cost when available (claude-code-cli reports it directly). */
  costUsd?: number;
  /** Wall-clock time of the model call alone, in milliseconds. Excludes loading the agent and writing the artifact, so it measures model latency. */
  durationMs: number;
}

export { projectsRoot };

const OUTPUT_CONTRACT = [
  "## Output format — read carefully",
  "",
  "Respond with a single document in this exact shape: YAML frontmatter",
  "(delimited by --- lines) followed by a markdown body. The frontmatter",
  "must include these fields:",
  "",
  "  status: one of \"ready-for-handoff\", \"blocked-on-input\", \"in-progress\"",
  "  confidence: one of \"HIGH\", \"MEDIUM\", \"LOW\"",
  "  assumptions: a YAML list of strings (empty list if none)",
  "  risks: a YAML list of strings (empty list if none)",
  "  open_questions: a YAML list of strings (empty list if none)",
  "  review_required: true or false",
  "",
  "Set confidence honestly — LOW confidence with real open_questions is a",
  "correct and expected output, not a failure. Do not invent information",
  "that was not given to you or clearly implied by it; put genuine gaps in",
  "open_questions instead of guessing.",
  "",
  "Everything after the closing --- is the actual deliverable content, in markdown.",
].join("\n");

function buildUserPrompt(input: RunAgentInput): string {
  return [
    `Project: ${input.projectId}`,
    `Task type: ${input.taskType}`,
    "",
    "Input:",
    input.userInput,
  ].join("\n");
}

function parseAgentResponse(
  raw: string,
  input: RunAgentInput,
  agentSlug: string
): { metadata: HandoffMetadata; body: string } {
  const parsed = matter(raw);
  const data = parsed.data as Partial<HandoffMetadata>;

  const metadata: HandoffMetadata = {
    project: input.projectId,
    task: data.task,
    agent: agentSlug,
    // Absent or unparseable structure defaults to the safe end: low
    // confidence, review required. An agent's output is never silently
    // trusted just because it parsed.
    status: data.status ?? "in-progress",
    confidence: data.confidence ?? "LOW",
    assumptions: Array.isArray(data.assumptions) ? data.assumptions : [],
    inputs: Array.isArray(data.inputs) ? data.inputs : [`${input.userInput.slice(0, 120)}${input.userInput.length > 120 ? "..." : ""}`],
    outputs: Array.isArray(data.outputs) ? data.outputs : [input.outputRelativePath],
    decisions: Array.isArray(data.decisions) ? data.decisions : [],
    risks: Array.isArray(data.risks) ? data.risks : [],
    open_questions: Array.isArray(data.open_questions) ? data.open_questions : [],
    next_agent: data.next_agent,
    review_required: data.review_required ?? true,
  };

  return { metadata, body: parsed.content.trim() };
}

/**
 * Load an agent definition, run it against structured input through the
 * model router, and write the resulting artifact (with handoff metadata
 * frontmatter) into /projects/{projectId}/{outputRelativePath}.
 *
 * This never overwrites an existing artifact in place — see
 * writeVersionedArtifact in artifactWriter.ts.
 */
export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const agent = loadAgent(input.agentSlug, { skills: input.skills });
  const modelConfig = resolveModel(input.taskType, input.modelOverrides);
  const provider = input.provider ?? providerFor(modelConfig);

  const started = performance.now();
  const completion = await provider.complete({
    systemPrompt: composeSystemPrompt({
      agent,
      intro: `You are the ${agent.role} agent in an AI-native software agency's multi-agent system.`,
      contract: OUTPUT_CONTRACT,
    }),
    userPrompt: buildUserPrompt(input),
    model: modelConfig.model,
    maxTokens: modelConfig.maxTokens,
  });
  const durationMs = Math.round(performance.now() - started);

  const { metadata, body } = parseAgentResponse(completion.text, input, agent.slug);
  if (agent.skills.length) metadata.skills = skillRefs(agent);
  const filePath = writeVersionedArtifact(input.projectId, input.outputRelativePath, stripUndefined(metadata), body);

  return {
    filePath,
    metadata,
    rawResponse: completion.text,
    model: completion.model,
    provider: completion.provider,
    usage: completion.usage,
    costUsd: completion.costUsd,
    durationMs,
  };
}
