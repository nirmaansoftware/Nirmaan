/**
 * A tool an agent can be offered. Shaped to map directly onto the
 * Anthropic API's tool-use format (name/description/input_schema) so it
 * can be passed straight through once something actually wires live
 * tool-calling into runAgent() — that wiring doesn't exist yet (see
 * README), this is the tool layer it will call into.
 */
export interface ToolDefinition<TInput = Record<string, unknown>> {
  name: string;
  description: string;
  /** JSON Schema for the tool's input, in the shape Anthropic's API expects. */
  inputSchema: Record<string, unknown>;
  /** Which declared agent permission(s) unlock this tool — see registry.ts#toolsForAgent. */
  requiresPermission: "read" | "write" | "execute";
  handler: (input: TInput) => Promise<ToolResult>;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}
