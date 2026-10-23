#!/usr/bin/env node
// Review-teams coverage test (.github/review-teams.yml), and the check that
// .github/CODEOWNERS stays absent.
//
// Fails when:
//   - a tracked file maps to no team other than through the catch-all, and is
//     not on the catch-all allowlist;
//   - a glob in a rule, named file, generated mapping, founder class or
//     content rule matches no tracked file (a dead rule);
//   - a lead, member or checklist names a role with no agents/<role>/agent.md,
//     or a checklist names a role outside the rule's teams;
//   - a generated file under website/public/ has no tracked source, or its
//     founder class differs from its source's;
//   - a content rule's pattern does not compile, an example does not match,
//     or a marker file no longer contains a match or is excluded;
//   - .github/CODEOWNERS exists. The founder's delegation of 2026-10-18 made
//     the Founder Proxy (agent) the third reviewer of founder classes in place
//     of the founder's code-owner review, so a CODEOWNERS file would bring
//     back a human gate the review script no longer expects. Adding one back
//     is the founder's decision (founder class A), made by changing this check.
//
// The map is plain data in a small YAML subset (block mappings and lists,
// flow lists of scalars, quoted or plain scalars, comments). The parser here
// rejects anything outside it, so the file stays readable by any YAML parser
// and no dependency is installed in CI.
//
// Usage: node .github/scripts/review-teams.mjs [--summary]
// Run from the repository root. Exit 0 when every check passes, 1 when one
// fails, 2 on a usage, parse or git error.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MAP_PATH = '.github/review-teams.yml';
export const CODEOWNERS_PATH = '.github/CODEOWNERS';

// ---------------------------------------------------------------- YAML subset

class YamlError extends Error {}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function parseScalar(raw, lineNo) {
  const s = raw.trim();
  const fail = (why) => { throw new YamlError(`line ${lineNo}: ${why}: ${s}`); };
  if (s.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(s)) fail('bad double-quoted string');
    try { return JSON.parse(s); } catch { fail('unsupported escape in string'); }
  }
  if (s.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(s)) fail('bad single-quoted string');
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) fail('unclosed flow list');
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    const items = [];
    let quote = null, start = 0;
    for (let i = 0; i <= inner.length; i++) {
      const c = inner[i];
      if (i === inner.length || (!quote && c === ',')) {
        const item = inner.slice(start, i).trim();
        if (item === '') fail('empty item in flow list');
        if (/^[[{]/.test(item)) fail('nested flow collections are not supported');
        items.push(parseScalar(item, lineNo));
        start = i + 1;
      } else if (quote) {
        if (c === '\\' && quote === '"') i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
    }
    return items;
  }
  if (s === '') fail('empty value');
  if (/^[*&!|>{%@`\]]/.test(s)) fail('plain value starts with a YAML indicator; quote it');
  if (/: |:$| #/.test(s)) fail('plain value contains ": " or " #"; quote it');
  if (s === 'true' || s === 'false') return s === 'true';
  if (s === 'null' || s === '~') return null;
  if (/^(yes|no|on|off|y|n)$/i.test(s)) fail('ambiguous boolean-like plain value; quote it');
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^[-+.\d]/.test(s) && !Number.isNaN(Number(s))) fail('non-integer number; quote it');
  return s;
}

export function parseYaml(text) {
  const lines = [];
  text.split('\n').forEach((line, i) => {
    if (/^---|^\.\.\./.test(line)) throw new YamlError(`line ${i + 1}: document markers are not supported`);
    if (/^\t| \t|^ *\t/.test(line)) throw new YamlError(`line ${i + 1}: tabs are not allowed`);
    const content = stripComment(line).replace(/\s+$/, '');
    if (content.trim() === '') return;
    lines.push({ indent: content.length - content.trimStart().length, text: content.trimStart(), no: i + 1 });
  });
  let pos = 0;

  function parseNode(indent) {
    const first = lines[pos];
    return first.text === '-' || first.text.startsWith('- ') ? parseSeq(indent) : parseMap(indent);
  }

  function parseSeq(indent) {
    const out = [];
    while (pos < lines.length && lines[pos].indent === indent) {
      const line = lines[pos];
      if (!(line.text === '-' || line.text.startsWith('- '))) throw new YamlError(`line ${line.no}: expected a list item`);
      const rest = line.text.slice(1).trimStart();
      if (rest === '') {
        pos++;
        if (pos >= lines.length || lines[pos].indent <= indent) throw new YamlError(`line ${line.no}: empty list item`);
        out.push(parseNode(lines[pos].indent));
      } else if (/^[A-Za-z0-9_-]+:(\s|$)/.test(rest)) {
        // "- key: value" starts a mapping whose keys sit at the column of "key".
        lines[pos] = { indent: indent + (line.text.length - rest.length), text: rest, no: line.no };
        out.push(parseMap(lines[pos].indent));
      } else {
        pos++;
        out.push(parseScalar(rest, line.no));
      }
    }
    if (pos < lines.length && lines[pos].indent > indent) throw new YamlError(`line ${lines[pos].no}: bad indentation`);
    return out;
  }

  function parseMap(indent) {
    const out = {};
    while (pos < lines.length && lines[pos].indent === indent) {
      const line = lines[pos];
      const m = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(line.text);
      if (!m) throw new YamlError(`line ${line.no}: expected "key: value"`);
      const [, key, value] = m;
      if (Object.hasOwn(out, key)) throw new YamlError(`line ${line.no}: duplicate key ${key}`);
      pos++;
      if (value !== undefined && value !== '') {
        out[key] = parseScalar(value, line.no);
      } else {
        if (pos >= lines.length || lines[pos].indent <= indent) throw new YamlError(`line ${line.no}: ${key} has no value`);
        out[key] = parseNode(lines[pos].indent);
      }
    }
    if (pos < lines.length && lines[pos].indent > indent) throw new YamlError(`line ${lines[pos].no}: bad indentation`);
    return out;
  }

  if (lines.length === 0) return null;
  if (lines[0].indent !== 0) throw new YamlError(`line ${lines[0].no}: the document must start at column 0`);
  const doc = parseNode(0);
  if (pos < lines.length) throw new YamlError(`line ${lines[pos].no}: unexpected content`);
  return doc;
}

// ---------------------------------------------------------------- globs

// `*` within a segment, `**` across segments (including none), `?` one
// character, `{a,b}` alternatives. Anchored at both ends; paths are relative
// to the repository root with forward slashes.
export function globToRegExp(glob) {
  let re = '';
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      const atStart = i === 0 || glob[i - 1] === '/';
      const atEnd = i + 2 === glob.length;
      if (!atStart || !(atEnd || glob[i + 2] === '/')) throw new Error(`"**" must be a whole path segment: ${glob}`);
      if (atEnd) re += '.*';
      else { re += '(?:.*/)?'; i++; }
      i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') { re += '(?:'; braces++; }
    else if (c === '}' && braces > 0) { re += ')'; braces--; }
    else if (c === ',' && braces > 0) re += '|';
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  if (braces) throw new Error(`unclosed "{" in glob: ${glob}`);
  return new RegExp(`^${re}$`);
}

const globCache = new Map();
export function globMatch(glob, path) {
  if (!globCache.has(glob)) globCache.set(glob, globToRegExp(glob));
  return globCache.get(glob).test(path);
}
const anyMatch = (globs, path) => (globs ?? []).some((g) => globMatch(g, path));

// ---------------------------------------------------------------- the map

const list = (v) => (Array.isArray(v) ? v : []);

// Teams that own `file` through path rules and named files only (no
// generated-file or catch-all step). Returns the matching entries too.
export function explicitOwners(map, file) {
  const teams = new Set(), checklists = new Set(), entries = [];
  for (const rule of list(map.rules)) {
    if (anyMatch(rule.globs, file) && !anyMatch(rule.exclude, file)) {
      entries.push(rule);
    }
  }
  for (const named of list(map.named_files)) {
    if (list(named.paths).includes(file)) entries.push(named);
  }
  for (const e of entries) {
    list(e.teams).forEach((t) => teams.add(t));
    list(e.checklists).forEach((c) => checklists.add(c));
  }
  return { teams, checklists, entries };
}

// The source a generated file follows, or null when no `generated` entry
// matches it. `tracked` is the set of tracked paths.
export function generatedSource(map, file, tracked) {
  for (const gen of list(map.generated)) {
    if (!globMatch(gen.output, file)) continue;
    let source;
    if (gen.mirror) {
      const prefix = gen.output.replace(/\*\*$/, '');
      source = gen.mirror + file.slice(prefix.length);
    } else {
      const name = file.split('/').pop().replace(/\.[^.]+$/, '');
      source = gen.source.replace('<name>', name);
    }
    return { entry: gen, source, exists: tracked.has(source) };
  }
  return null;
}

export function founderClasses(map, file) {
  return list(map.founder_classes).filter((c) => anyMatch(c.paths, file)).map((c) => c.id);
}

// Full owner resolution for one file: union of explicit rules, generated
// source, and the catch-all when nothing else matches.
export function owners(map, file, tracked) {
  let path = file;
  const gen = generatedSource(map, file, tracked);
  if (gen) path = gen.source;
  const { teams, checklists, entries } = explicitOwners(map, path);
  const ipSiteImpact = entries.some((e) => e.ip_site_impact === true);
  const viaCatchAll = teams.size === 0;
  if (viaCatchAll) teams.add(map.catch_all.team);
  return { teams: [...teams], checklists: [...checklists], viaCatchAll, generatedFrom: gen?.source ?? null, ipSiteImpact, founder: founderClasses(map, file) };
}

// Content rules that fire for one changed line (or an added file). Used by the
// review script; tested here so the data stays meaningful.
export function contentHits(map, file, line, { addedFile = false } = {}) {
  const hits = [];
  for (const rule of list(map.content_rules)) {
    if (rule.applies_to && !anyMatch(rule.applies_to, file)) continue;
    if (anyMatch(rule.exclude, file)) continue;
    if (rule.trigger === 'added_files') {
      if (addedFile) hits.push(rule.id);
      continue;
    }
    if (line != null && list(rule.patterns).some((p) => new RegExp(p, 'i').test(line))) hits.push(rule.id);
  }
  return hits;
}

// ---------------------------------------------------------------- checks

// files: tracked paths. roleExists(slug): agents/<slug>/agent.md is tracked.
// readFile(path): its text (for content-rule markers).
export function checkMap(map, files, { roleExists, readFile }) {
  const problems = [];
  const p = (msg) => problems.push(msg);
  const tracked = new Set(files);
  const deadGlob = (where, glob) => {
    let n = 0;
    try { n = files.filter((f) => globMatch(glob, f)).length; } catch (e) { p(`${where}: ${e.message}`); return; }
    if (n === 0) p(`${where}: "${glob}" matches no tracked file (dead rule)`);
  };

  // Teams and roles.
  const teams = new Map();
  for (const t of list(map.teams)) {
    if (!t.id || !t.lead) { p(`team without id or lead: ${JSON.stringify(t)}`); continue; }
    if (teams.has(t.id)) p(`team ${t.id}: duplicate id`);
    teams.set(t.id, t);
    for (const role of [t.lead, ...list(t.members)]) {
      if (!roleExists(role)) p(`team ${t.id}: role ${role} has no agents/${role}/agent.md`);
    }
  }
  for (const role of list(map.no_key_roles)) {
    if ([...teams.values()].some((t) => t.lead === role)) p(`no_key_roles: ${role} is a team lead`);
    if (!roleExists(role)) p(`no_key_roles: role ${role} has no agents/${role}/agent.md`);
  }
  const teamRoles = (ids) => new Set(ids.flatMap((id) => (teams.has(id) ? [teams.get(id).lead, ...list(teams.get(id).members)] : [])));
  const checkEntryTeams = (where, entry) => {
    if (list(entry.teams).length === 0 && !entry.adds_teams) p(`${where}: no teams`);
    for (const id of list(entry.teams ?? entry.adds_teams)) if (!teams.has(id)) p(`${where}: unknown team ${id}`);
    const allowed = teamRoles(list(entry.teams ?? entry.adds_teams));
    for (const c of list(entry.checklists)) {
      if (!roleExists(c)) p(`${where}: checklist role ${c} has no agents/${c}/agent.md`);
      else if (!allowed.has(c)) p(`${where}: checklist role ${c} is not in the teams it names`);
    }
  };
  if (!map.catch_all || !teams.has(map.catch_all.team)) p('catch_all: missing or unknown team');

  // Rules and named files.
  const ids = new Set();
  const seenId = (where, id) => { if (!id) p(`${where}: missing id`); else if (ids.has(id)) p(`${where}: duplicate id ${id}`); ids.add(id); };
  for (const r of list(map.rules)) {
    const where = `rule ${r.id}`;
    seenId(where, r.id);
    checkEntryTeams(where, r);
    if (list(r.globs).length === 0) p(`${where}: no globs`);
    list(r.globs).forEach((g) => deadGlob(where, g));
    list(r.exclude).forEach((g) => deadGlob(`${where} exclude`, g));
  }
  for (const n of list(map.named_files)) {
    const where = `named file ${n.id}`;
    seenId(where, n.id);
    checkEntryTeams(where, n);
    if (list(n.teams).length < 2) p(`${where}: a named multi-owner file needs at least two teams`);
    for (const path of list(n.paths)) {
      if (/[*?{]/.test(path)) p(`${where}: "${path}" must be an exact path, not a glob`);
      else if (!tracked.has(path)) p(`${where}: "${path}" is not a tracked file (dead rule)`);
    }
  }

  // Generated mappings.
  for (const g of list(map.generated)) {
    const where = `generated ${g.output}`;
    if (!g.source === !g.mirror) p(`${where}: needs exactly one of source or mirror`);
    deadGlob(where, g.output);
    if (g.mirror && !g.output.endsWith('/**')) p(`${where}: a mirror output must end in /**`);
  }

  // Every tracked file.
  const allowlist = list(map.catch_all?.allowlist);
  allowlist.forEach((g) => deadGlob('catch_all allowlist', g));
  for (const file of files) {
    const gen = generatedSource(map, file, tracked);
    if (gen) {
      if (!gen.exists) { p(`${file}: generated from ${gen.source}, which is not tracked`); continue; }
      const src = founderClasses(map, gen.source).join(''), out = founderClasses(map, file).join('');
      if (src !== out) p(`${file}: founder class "${out}" differs from its source ${gen.source} ("${src}")`);
      if (explicitOwners(map, file).entries.length) p(`${file}: generated files follow their source; remove it from path rules`);
      continue;
    }
    const explicit = explicitOwners(map, file).entries.length > 0;
    const allowed = anyMatch(allowlist, file);
    if (!explicit && !allowed) p(`${file}: maps to no team (add a rule, or put it on the catch-all allowlist)`);
    if (explicit && allowed) p(`${file}: on the catch-all allowlist but matched by a rule`);
  }

  // Founder classes.
  const classIds = new Set();
  for (const c of list(map.founder_classes)) {
    if (classIds.has(c.id)) p(`founder class ${c.id}: duplicate`);
    classIds.add(c.id);
    for (const g of list(c.paths)) deadGlob(`founder class ${c.id}`, g);
  }
  for (const want of ['A', 'B', 'C', 'D', 'E', 'F']) if (!classIds.has(want)) p(`founder class ${want} is missing`);

  // Content rules.
  for (const r of list(map.content_rules)) {
    const where = `content rule ${r.id}`;
    seenId(where, r.id);
    checkEntryTeams(where, r);
    if (r.founder_class != null && !classIds.has(r.founder_class)) p(`${where}: unknown founder class ${r.founder_class}`);
    list(r.applies_to).forEach((g) => deadGlob(`${where} applies_to`, g));
    // A content rule's exclude may name a folder that does not exist yet:
    // excluding nothing narrows nothing, so it is not checked as a dead rule.
    if (r.trigger === 'added_files') {
      if (!r.applies_to) p(`${where}: an added_files trigger needs applies_to`);
      continue;
    }
    if (r.trigger != null) p(`${where}: unknown trigger ${r.trigger}`);
    let patterns;
    try { patterns = list(r.patterns).map((s) => new RegExp(s, 'i')); } catch (e) { p(`${where}: ${e.message}`); continue; }
    if (patterns.length === 0) p(`${where}: no patterns`);
    if (list(r.examples).length === 0) p(`${where}: needs at least one example`);
    for (const ex of list(r.examples)) if (!patterns.some((re) => re.test(ex))) p(`${where}: example "${ex}" matches no pattern`);
    for (const m of list(r.markers)) {
      if (!tracked.has(m.file)) { p(`${where}: marker file ${m.file} is not tracked`); continue; }
      if (r.applies_to && !anyMatch(r.applies_to, m.file)) p(`${where}: marker file ${m.file} is outside applies_to`);
      if (anyMatch(r.exclude, m.file)) p(`${where}: marker file ${m.file} is excluded`);
      const lines = readFile(m.file).split('\n');
      if (!lines.some((l) => patterns.some((re) => re.test(l)))) p(`${where}: marker ${m.file} no longer contains a match`);
    }
  }
  return problems;
}

// No CODEOWNERS file: founder-class pull requests are reviewed by the Founder
// Proxy (agent), not held for a code owner. `tracked` is the list of tracked
// paths.
export function checkNoCodeowners(tracked) {
  const found = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'].filter((p) => tracked.includes(p));
  return found.map((p) => `${p} exists: founder classes are reviewed by the Founder Proxy (agent) since the founder's delegation of 2026-10-18; bringing back a code-owner gate is the founder's decision and changes this check`);
}

export function summary(map, files) {
  const tracked = new Set(files);
  const perTeam = Object.fromEntries(list(map.teams).map((t) => [t.id, 0]));
  let catchAll = 0, founder = 0;
  const perClass = Object.fromEntries(list(map.founder_classes).map((c) => [c.id, 0]));
  for (const f of files) {
    const o = owners(map, f, tracked);
    o.teams.forEach((t) => { perTeam[t] = (perTeam[t] ?? 0) + 1; });
    if (o.viaCatchAll) catchAll++;
    if (o.founder.length) founder++;
    o.founder.forEach((c) => perClass[c]++);
  }
  return { files: files.length, perTeam, catchAll, founder, perClass };
}

// ---------------------------------------------------------------- CLI

function main(argv) {
  let files, map;
  try {
    files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
    map = parseYaml(readFileSync(MAP_PATH, 'utf8'));
  } catch (e) {
    console.error(`review-teams: ${e.message}`);
    return 2;
  }
  const tracked = new Set(files);
  const problems = checkMap(map, files, {
    roleExists: (slug) => tracked.has(`agents/${slug}/agent.md`),
    readFile: (path) => readFileSync(path, 'utf8'),
  });
  problems.push(...checkNoCodeowners(files));
  if (argv.includes('--summary') || problems.length === 0) {
    const s = summary(map, files);
    console.log(`${s.files} tracked files. Files per team (a file can count for several):`);
    for (const t of list(map.teams)) console.log(`  ${t.name.padEnd(22)} ${s.perTeam[t.id]}`);
    console.log(`  via catch-all only      ${s.catchAll}`);
    console.log(`Founder-class files: ${s.founder} (${Object.entries(s.perClass).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  }
  if (problems.length) {
    console.error(`review-teams: ${problems.length} problem(s):`);
    for (const m of problems) console.error(`  - ${m}`);
    return 1;
  }
  console.log('review-teams: every check passed.');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
