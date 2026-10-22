---
id: "<skill-id: lower-case words joined by hyphens, equal to the file name, never containing the unit>"
name: "<short plain name>"
unit: "<id of an active unit (a key-1 team in .github/review-teams.yml), equal to the folder>"
tier: "<runnable or knowledge-only>"
prerequisites: []
related: []
tools: ["<tool name> (free, connected)", "<tool name> (paid, known only)"]
eval_cases: ["<eval case id; at least one for a runnable skill>"]
held_by: ["<agent role slug>"]
owners:
  writer: "<agent role slug that writes the file>"
  checker: "<a different agent role slug that checks it>"
  unit: "<the unit id again>"
volatility: "<fast, medium or stable>"
as_of: "<YYYY-MM-DD: when the sources were last checked>"
review_by: "<YYYY-MM-DD: at most 3, 6 or 12 months after as_of for fast, medium or stable>"
---
Use when: <one sentence naming the task in which an agent should load this skill>.

## Scope

<What this skill covers, in two to four sentences. Then what it does not
cover, naming the skill ids that cover those parts when they exist. Keep one
skill to one kind of work: a topic that needs more than 2,500 words is two
skills.>

## Core concepts

<The ideas a reviewer expects the author to understand, in original writing.
Every factual sentence here carries a source marker, such as [S1]. Explain
each concept once, in plain words, with a concrete case from the kind of work
Nirmaan builds. Do not copy definitions from a source; summarise them and
cite them.>

## How we do it

<The procedure, as numbered steps or a checklist, in the order the work is
done. Each step names the repository path, script or command it follows, so a
reader can check it against the code. Say what to do when a step cannot be
done, and who decides, by role.>

## Standards and specifications

<The standards, specifications or versions the work must meet, each cited by
its number or version and summarised in a sentence, with a marker such as
[S1]. Never paste the text of a standard. If none applies, write None: and
the reason.>

## Common failures and pitfalls

<The mistakes that make this work fail review or fail in use, each with how
it shows up and how to avoid it. Factual claims carry a marker.>

## How good work is verified

<What a reviewer checks, as a list a key-1 reviewer can apply to a diff:
tests to run, outputs to compare, limits to measure. Name the check, the
command or the file, and the result that passes.>

## Worked example

<For a runnable skill: a link to examples/<skill-id>/ and one sentence on
what the example shows and how CI runs it. For a knowledge-only skill:
None: followed by why there is no example yet.>

## Sources

- [S1] <Title>. <Publisher>. <https://address of the source>. <Version 1.0, or: accessed YYYY-MM-DD>. Licence: <licence of the source>.
