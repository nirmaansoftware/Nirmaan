// Starts one fresh reviewer process: `claude -p`, read-only tools, no MCP, no
// project customizations, no tokens in its environment. Returns what happened
// as data; it never throws for a failed call.

import { spawn } from 'node:child_process';

export const READ_ONLY_TOOLS = 'Read,Grep,Glob';
// Belt and braces: even if a future default set grows, these stay off. Bash is
// off on purpose: `git diff --output=<file>` writes files and diff drivers or
// textconv run programs, so the script computes the diff and log itself.
export const DENIED_TOOLS = 'Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task,Agent';

// The reviewer's environment is an allowlist: no GH_TOKEN, GITHUB_TOKEN, App
// variables, ANTHROPIC_API_KEY (which would bill a key instead of the plan),
// or anything else the caller happens to hold.
export const ENV_ALLOWLIST = ['HOME', 'PATH', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'TERM', 'SHELL', 'CLAUDE_CONFIG_DIR'];

export function reviewerEnv(env = process.env) {
  const out = {};
  for (const k of ENV_ALLOWLIST) if (env[k] !== undefined) out[k] = env[k];
  return out;
}

export function claudeArgs({ model, systemPrompt, addDirs = [], schema }) {
  const args = [
    '-p',
    '--output-format', 'json',
    '--model', model,
    '--system-prompt', systemPrompt,
    '--tools', READ_ONLY_TOOLS,
    '--allowedTools', READ_ONLY_TOOLS,
    '--disallowedTools', DENIED_TOOLS,
    '--permission-mode', 'dontAsk',
    '--safe-mode',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--disable-slash-commands',
  ];
  for (const d of addDirs) args.push('--add-dir', d);
  if (schema) args.push('--json-schema', JSON.stringify(schema));
  return args;
}

// A plan's session limit ("You've hit your session limit · resets 3:10am")
// is a rate limit too, even when claude reports it as subtype "success".
const RATE_LIMIT = /rate.?limit|usage limit|session limit|too many requests|\b429\b|overloaded|limit reached|try again later/i;

// Classify one finished process. Returns {kind: ok|rate_limit|error, ...}.
export function interpret({ code, stdout, stderr }) {
  let data;
  try { data = JSON.parse(stdout); } catch {
    const detail = `${stderr || ''}\n${stdout || ''}`.trim().split('\n').pop() || 'no output';
    return { kind: RATE_LIMIT.test(`${stderr} ${stdout}`) ? 'rate_limit' : 'error', error: `claude exited ${code} without a JSON result: ${detail.slice(0, 300)}` };
  }
  const usage = data.usage || {};
  const tokens = {
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    cache_read_tokens: usage.cache_read_input_tokens ?? null,
    cache_write_tokens: usage.cache_creation_input_tokens ?? null,
  };
  const reportedModel = Object.keys(data.modelUsage || {})[0] ?? null;
  if (data.is_error || data.subtype !== 'success') {
    const text = String(data.result ?? data.error ?? data.subtype ?? 'error');
    return { kind: RATE_LIMIT.test(text) ? 'rate_limit' : 'error', error: `claude reported ${data.subtype || 'an error'}: ${text.slice(0, 300)}`, tokens, reportedModel };
  }
  return { kind: 'ok', text: typeof data.result === 'string' ? data.result : '', structured: data.structured_output ?? null, tokens, reportedModel };
}

// Run once. {bin, args, input, cwd, env, timeoutMs} -> interpret() result
// plus {durationMs}; a timeout is {kind: 'timeout'}.
export function runOnce({ bin, args, input, cwd, env, timeoutMs }) {
  const started = Date.now();
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ kind: 'error', error: `claude could not start: ${e.message}`, durationMs: 0 });
      return;
    }
    let stdout = '', stderr = '', done = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve({ ...r, durationMs: Date.now() - started }); } };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      finish({ kind: 'timeout', error: `claude did not answer within ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => finish({ kind: 'error', error: `claude could not start: ${e.message}` }));
    child.on('close', (code) => finish(interpret({ code, stdout, stderr })));
    child.stdin.on('error', () => { /* the process may exit before reading */ });
    child.stdin.end(input);
  });
}

// Run with one backoff retry on any failed call. `onAttempt(result, n)` is
// called after each attempt (for the call log).
export async function runWithRetry(opts, { backoffMs, onAttempt, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let r = await runOnce(opts);
  onAttempt?.(r, 1);
  if (r.kind === 'ok') return r;
  await sleep(backoffMs);
  r = await runOnce(opts);
  onAttempt?.(r, 2);
  return r;
}
