# Capability build-out and hierarchy: decisions (P0, Nirmaan, 2026-10-18)

Status: DECIDED by the decision meeting (round 2, chaired by the Orchestrator),
except where marked PROPOSAL. Two items change the review system's own gates,
which the founder keeps, so the meeting could only propose them: the deputy
and rate-limit rules (D4.4) and the narrowing of the `money` and
`market-claims` content rules (D5.2). Each takes effect only if the founder
approves the founder class A PR that implements it. These and the other
founder-class items wait for the founder (section 9). The founder may
overrule any decision here, and this record will say so.

Process: [docs/operations/decision-meetings.md](../../docs/operations/decision-meetings.md).
27 seats gave independent positions (every agent role except the chair). The
chair read every position and checked the disputed facts against the code at
`main` bac3965 (the merge of #110 on 2026-10-18, an ancestor of today's
`main`). Internal minutes, with every position, are kept outside this
repository, as is "the plan": the internal capability build-out plan (v3)
that this record amends. Every amendment is stated here in full, so the
record reads on its own.

How to read the chart: L0 is the founder (human); L1 is the agent apex; L2 a
chief; L3 a VP; L4 a head of department; L5 a lead (only above 8 ICs); L6 an
individual contributor (IC). Every position is held by an agent unless it says
"human". "hire" means a new agent spec is added by a hiring PR; "planned" means
the position exists in the chart but holds nothing yet (rule D1.2).

## 1. Corrections to the facts the plan stated

The plan's section 2.1 is corrected before anything quotes it (raised by
qa-engineer and technical-writer; checked by the chair):

| Plan said | Fact |
|---|---|
| The README team table and `review-teams.yml` "do not agree" | They agree role for role (`agents/README.md:32-40`, `.github/review-teams.yml:36-71`). They are unchecked copies. |
| "Nothing is validated" | `review-teams.mjs` fails a lead, member or checklist role with no spec, and `allAgentsLoad.test.ts` requires `reviewed_by`. Not checked today: a line manager, span, cycles, that every agent has a team, that the README matches the YAML. |
| "No agent has a manager" | Correct wording: no agent has a recorded line manager. `pr-review.md` already calls the orchestrator the level "which manages all teams". |
| Four relations | There are five. `reviewed_by` is live: `os/src/lib/orchestrator/dispatch.ts:229` creates artifact review tasks from it. |
| "CTO" for the engineering chief | "CTO" already names the orchestrator spec (`agents/orchestrator/agent.md:13`, "Orchestrator (CTO Agent)") and a human OS role that holds `approval:decide` (`os/src/lib/auth/permissions.ts:64`). "Project manager" is also a human OS role. |
| Head of Finance and Head of Clients | They are on the v3 chart but missing from both the mapping and the hire list. |
| Span | Rule 2.3.5 says a manager needs 3 reports; section 10 says 4 ICs. |

## 2. Decisions

### D1. Span, activation and vacancies

1. **The number is 3.** A manager position has 3 to 8 direct line reports.
   Staff roles do not count toward the minimum, but they do count toward the
   maximum. There are at most 6 layers below the founder, and layers may be
   skipped, but a chain must rise strictly. Section 10 of the plan is amended
   from "4 or more ICs" to "3 or more reports". Why 3: Design and Brand and
   Content already work at 3. ASSUMPTION (unsourced; market-research flagged
   it): for agents, the limit is reviewer context, not coaching time. A
   minimum of 4
   would force hires made only to satisfy a number.
2. **Activation rule (principal-architect's, adopted).** Every position is
   `active` or `planned`. A manager position is active only when it has an
   occupant (an agent spec on `main`) and at least 3 active line reports.
   - A planned position holds no key, no deputy duty, no path, no skill and no
     stage.
   - The reports of a planned position report to its nearest active ancestor
     until it activates.
   - A hiring PR that creates a manager brings its unit to at least 3 reports
     in the same PR.
   - No manager position is ever hired empty.
3. **Vacancy roll-up for keys.** Paths are owned only by active units, so key 1
   never rolls up: a hiring PR moves paths to a unit only when that unit
   activates. Key 2 is computed over active positions only, so a planned VP or
   chief is skipped and key 2 goes to the next active manager up (D4).
4. **Interim units.** Today's six review teams are recorded in the chart as
   interim units with their current leads and keys. Each hiring PR splits an
   interim unit into target units. It must leave no path, checklist or agent
   without an active owner, and it names a new owner for every "Fails when"
   item of the key-1 holder it replaces.
5. **Exceptions.** An exception to span or deputies carries a reason and a
   `review_by` date in the chart. The validator fails once that date has
   passed. Recorded exceptions at decision time:
   - Product interim, with 2 members, until wave 6.
   - Legal and Compliance has no deputy, permanently (D4.4, a proposal).
   - The interim units that fall below 3 members while a split is in
     progress.

### D2. The Nirmaan chart

#### D2.1 Target chart

Span column: line reports, plus staff where shown. Every manager is checked
against 3 to 8.

```text
L0 Founder (human)
└─ L1 Orchestrator · orchestrator · manager · 4 reports
   ├─ L2 Chief of Engineering · hire (wave 1) · manager · 5 reports + 1 staff
   │  ├─ staff Principal Architect · principal-architect · staff · 0 reports (architecture authority, ADRs)
   │  ├─ L3 VP Product Engineering · planned, hire (wave 10) · manager · 3
   │  │  ├─ L4 Head of Web · hire (wave 2) · manager · 3
   │  │  │  ├─ L6 frontend-engineer (deputy)
   │  │  │  ├─ L6 backend-engineer
   │  │  │  └─ L6 cms-ecommerce-engineer · hire
   │  │  ├─ L4 Head of Mobile and Desktop · planned, hire (wave 10) · manager · 3
   │  │  │  ├─ L6 ios-engineer · hire
   │  │  │  ├─ L6 android-engineer · hire
   │  │  │  └─ L6 cross-platform-engineer · hire (React Native, Flutter, Electron, Tauri)
   │  │  └─ L4 Head of Integrations · planned, hire (wave 3) · manager · 3
   │  │     ├─ L6 payments-india-stack-engineer · hire (deputy)
   │  │     ├─ L6 business-systems-engineer · hire (ERP, CRM, Tally, Zoho, RPA)
   │  │     └─ L6 messaging-telephony-engineer · hire (WhatsApp, telephony, email)
   │  ├─ L3 VP Data, AI and Platform · planned, hire (wave 7) · manager · 3
   │  │  ├─ L4 Head of AI and ML · hire (wave 1, pilot) · manager · 3
   │  │  │  ├─ L6 ai-ml-engineer (deputy; LLM applications)
   │  │  │  ├─ L6 ml-engineer · hire (classical ML, deep learning, forecasting)
   │  │  │  └─ L6 mlops-engineer · hire (serving, monitoring)
   │  │  ├─ L4 Head of Data · hire (wave 4) · manager · 3
   │  │  │  ├─ L6 database-engineer (deputy)
   │  │  │  ├─ L6 data-engineer · hire (batch, streaming, CDC, orchestration)
   │  │  │  └─ L6 analytics-engineer · hire (modelling, BI, product analytics, experiments)
   │  │  └─ L4 Head of Platform · hire (wave 7) · manager · 3
   │  │     ├─ L6 sre (deputy)
   │  │     ├─ L6 devops-engineer
   │  │     └─ L6 performance-engineer (owns load testing)
   │  ├─ L4 Head of Security · security-engineer · manager · 3
   │  │  ├─ L6 appsec-engineer · hire (P1; deputy)
   │  │  ├─ L6 cloud-security-engineer · hire (cloud, identity, CI/CD)
   │  │  └─ L6 privacy-engineer · hire (privacy engineering)
   │  ├─ L4 Head of Quality · hire (wave 8) · manager · 3
   │  │  ├─ L6 qa-engineer (deputy)
   │  │  ├─ L6 test-automation-engineer · hire (e2e, contract, visual regression)
   │  │  └─ L6 accessibility-test-engineer · hire
   │  └─ L4 Head of Systems and Frontier · planned, hire (wave 11) · manager · 4
   │     ├─ L6 systems-engineer · hire (C, C++, Rust, Go, OS, networking, distributed, HPC)
   │     ├─ L6 embedded-iot-engineer · hire (RTOS, embedded Linux, MQTT, BLE, robotics)
   │     ├─ L6 web3-engineer · hire
   │     └─ L6 xr-games-engineer · hire (AR, VR, 3D, games; knowledge only at first)
   ├─ L2 Chief of Product · hire (wave 6) · manager · 3
   │  ├─ L4 Head of Product · hire (wave 6) · manager · 4
   │  │  ├─ L6 product-manager (deputy; PRDs, delivery planner until D2.4 moves it)
   │  │  ├─ L6 business-analyst
   │  │  ├─ L6 market-research
   │  │  └─ L6 product-owner · hire (Nirmaan's own products, pricing and packaging)
   │  ├─ L4 Head of Design · creative-director · manager · 4
   │  │  ├─ L6 ui-designer (deputy)
   │  │  ├─ L6 ux-designer
   │  │  ├─ L6 design-system-engineer
   │  │  └─ L6 user-researcher · hire (wave 2)
   │  └─ L4 Head of Brand and Content · brand-strategist · manager · 3
   │     ├─ L6 content-strategist (deputy)
   │     ├─ L6 technical-writer
   │     └─ L6 seo-specialist
   ├─ L2 Chief of Operations · planned, hire (wave 9) · manager · 3
   │  ├─ L4 Head of Commercial · hire (P1) · manager · 6
   │  │  ├─ L6 sales-partnerships (deputy; holds account management for now)
   │  │  ├─ L6 client-communication (drafts, never sends)
   │  │  ├─ L6 customer-support · hire (wave 5; drafts, never publishes)
   │  │  ├─ L6 pre-sales-solutions-architect · hire (wave 5; never prices)
   │  │  ├─ L6 finance-estimation
   │  │  └─ L6 tax-accounts
   │  ├─ L4 Head of Delivery · hire (wave 9) · manager · 3
   │  │  ├─ L6 delivery-manager · hire (deputy; milestones, status, client voice in build)
   │  │  ├─ L6 delivery-planner · hire (task plan and staffing; takes planner.ts after its evals pass)
   │  │  └─ L6 service-delivery-manager · hire (care and maintenance plans, SLAs, handover)
   │  └─ L4 Head of Capability · hire (P1) · manager · 3
   │     ├─ L6 org-designer · hire (deputy; chart and hiring PRs)
   │     ├─ L6 capability-programme-manager · hire (queue, tracker, pacing)
   │     └─ L6 knowledge-quality-reviewer · hire (skill validator, check-record standards)
   └─ L4 Head of Legal and Compliance (agent; not a lawyer) · legal-compliance · manager · 3, no deputy
      ├─ L6 legal-counsel (never holds a key, never a deputy)
      ├─ L6 privacy-counsel · hire (P1; agent; not a lawyer; not a statutory officer)
      └─ L6 licensing-counsel · hire (P1; open-source, dataset and model licences, trademarks)
```

Span check: Orchestrator 4; Chief of Engineering 5 line reports plus 1 staff;
both VPs 3; Chief of Product 3; Chief of Operations 3; every head 3 to 6. The
maximum depth is 5 layers below the founder (L1, L2, L3, L4, L6). No L5 lead
exists, because no department has more than 8 ICs.

#### D2.2 Chart on the day the P1 hires merge (interim)

```text
L0 Founder (human)
└─ L1 Orchestrator · 8 reports (the chiefs and VPs are planned, so their units roll up here)
   ├─ L4 Engineering (interim) · principal-architect · 4: frontend-engineer, backend-engineer (deputy), database-engineer, ai-ml-engineer
   ├─ L4 Platform and Quality (interim) · security-engineer · 5: sre, devops-engineer, qa-engineer, performance-engineer, appsec-engineer (deputy)
   ├─ L4 Product (interim, exception: 2 members until wave 6) · product-manager · 2: business-analyst (deputy), market-research
   ├─ L4 Head of Brand and Content · brand-strategist · 3
   ├─ L4 Head of Design · creative-director · 3 (4 after wave 2)
   ├─ L4 Head of Commercial · hire · 4: sales-partnerships (deputy), client-communication, finance-estimation, tax-accounts
   ├─ L4 Head of Legal and Compliance · legal-compliance · 3: legal-counsel, privacy-counsel, licensing-counsel; no deputy
   └─ L4 Head of Capability · hire · 3: org-designer (deputy), capability-programme-manager, knowledge-quality-reviewer
```

From the pilot on, the Chief of Engineering is active. Its first three active
reports are Engineering (interim), Platform and Quality (interim), and AI and
ML, which reaches it by roll-up through the planned VP. Each later hiring PR
moves paths from an interim unit to the new unit.

#### D2.3 Structural choices and who disagreed

1. **VP layer: two VPs, each planned until it has 3 active heads.** The shape
   is market-research's: Product Engineering (Web, Mobile and Desktop,
   Integrations) and Data, AI and Platform. The plan's VP AI and Data and VP
   Platform and Security each had 2 heads; both are dropped. Principal
   Architect, ai-ml-engineer, devops-engineer, database-engineer and sre asked
   for no VP until 3 heads exist, and the activation rule gives them that.
   Web3 and Emerging stop being departments: they are practices inside Head
   of Systems and Frontier (market-research), which removes one VP and two
   heads who would have had no ICs.
2. **Quality is not under the VP whose work it tests.** Head of Quality reports
   to the Chief of Engineering directly (qa-engineer). Security-engineer
   proposed a "VP Platform, Security and Quality". That is rejected: a VP who
   runs Platform would then manage both of the units that check Platform's
   work. Head of Security also reports to the Chief of Engineering directly
   (market-research). Load testing has one owner, Platform
   (performance-engineer). performance-engineer stays in Platform, not Quality
   as qa-engineer proposed: moving it would leave both units below 3.
3. **Head of Business is dropped. Legal does not manage sales.** Head of Legal
   and Compliance reports to the Orchestrator directly, as a control function
   outside the commercial line it checks (legal-compliance). Sales, client
   communication, support, pre-sales, estimation and tax form one
   Commercial department. Splitting Commercial into Clients and Finance is
   planned for when Finance has 3 ICs. Until then, a Head of Finance with 2
   reports would break D1. finance-estimation proposed keeping one Business
   department led by legal-compliance; that is rejected, because it keeps
   legal over the sales it checks.
4. **Head of Finance and Head of Clients.** Head of Commercial covers both.
   It is the first hire on the business side (P1), so the conflict in point 3
   ends before any knowledge wave.
5. **Platform** owns cloud, DevOps, SRE, performance (including load testing),
   FinOps, release engineering, backup and disaster recovery, and the PR
   review platform's runbook and SLO.
6. **Security** keeps key 1 on the control plane (`.github/**`, `.claude/**`,
   `AGENTS.md`, `CLAUDE.md`), auth, runtime security (headers, SSRF guard, the
   env file) and dependency manifests (with Platform). It co-owns `agents/**`,
   because specs and skills become prompts.
7. **Delivery and Product boundary (product-manager, business-analyst,
   client-communication).**
   - Product owns *what*: problem, MVP scope, acceptance criteria, and the
     scope verdict on each change request.
   - Delivery owns *who and when*: the task plan and staffing, milestones,
     status, the change-request log, handover and post-mortems.
   - Delivery never changes scope, and Product never changes staffing.
   - The Orchestrator keeps task dispatch inside a project.
   - `planner.ts`, which today runs as product-manager "acting as delivery
     planner", stays with Product until delivery-planner passes its evals.
   - The `operations-process` docs move to Delivery when Delivery activates;
     `governance-docs` move to Capability.
8. **Design stays central** (ui-designer). Mobile and Systems and Frontier get
   design by staffing, not by having their own designers. Design gains key 1
   on OS screens (ux-designer). Nirmaan's Design department is the single owner of the
   shared design system (D7).
9. **Chief of Operations** (brand-strategist; same job as IP Nirmaan's COO):
   Commercial, Delivery and Capability. It stays planned until all three are
   active, and they report to the Orchestrator until then.
10. **Capability office** is hired in P1: the pilot needs its queue, check-record
    standards and org-design work. Eval harness code stays with AI and ML;
    the plan's separate "eval engineering" seat is not created.

#### D2.4 Stage ownership: one owner and one client voice per stage

This table goes into the chart, and a test checks that every lead status
(`NEW` to `SPAM`) and every project stage (`os/prisma/schema.prisma:51-53`) has
exactly one owning unit and exactly one client-voice unit, both active
(business-analyst, client-communication).

| Stages | Stage owner | Client voice | Notes |
|---|---|---|---|
| Lead NEW, DISCOVERY, QUALIFIED, PROPOSAL, WON, LOST, SPAM | Commercial | Commercial | business-analyst works pre-sale discovery when staffed by Commercial |
| Project LEAD | Commercial | Commercial | |
| DISCOVERY, REQUIREMENTS | Product | Commercial | Product supplies the scope facts |
| ESTIMATION, PROPOSAL | Commercial | Commercial | finance-estimation prices. pre-sales-solutions-architect never prices. Before a proposal is SENT, a feasibility check is recorded by the engineering head who would staff the project, under the Principal Architect's architecture authority (sales-partnerships) |
| APPROVED to DEPLOYMENT | Delivery | Delivery (the project's delivery-manager) | Work by Design, the engineering heads, Quality (QA stage), Security (SECURITY_REVIEW) and Platform (DEPLOYMENT) |
| MONITORING | Platform | Commercial (customer-support) | |
| MAINTENANCE | Delivery (service-delivery-manager) | Commercial (customer-support) | |

- Until Delivery is active, Product owns APPROVED to DEPLOYMENT and Commercial
  is the client voice.
- In every stage, client-communication writes the draft and a person sends
  it.
- No agent sends or publishes to a client, and that includes support replies.
  An OS support reply is shown to the client at once
  (`os/src/lib/portal/service.ts`), so customer-support drafts only.
- Delay notices and scope disputes are read by both Head of Commercial and the
  delivery-manager before a person sends them.
- No agent position grants an OS role or holds a project gate. Lifecycle gates
  stay recorded human approvals.

#### D2.5 Titles

- L1 is "Orchestrator". The "(CTO Agent)" suffix is removed from
  `agents/orchestrator/agent.md:13`.
- L2 titles are "Chief of Engineering", "Chief of Product" and "Chief of
  Operations". No agent position is titled CTO or Project manager, because
  both are human OS roles (`permissions.ts:117-118`). The validator fails a
  chart title equal to any OS role label.
- "VP" is used for L3 only, "Head of" for L4 only, and "Lead" for L5 only.
- Legal positions carry "agent; not a lawyer". No "General Counsel", "CLO" or
  "DPO" title is used.
- Every position records `holder: agent` or `holder: human`.
- Generated views always show the title and the occupant together, for
  example "Head of Design (creative-director)".
- To clients, agents are never titled as people. No client text says "our CTO"
  or names an agent's layer; this is a rule in the client-communication
  checklist (brand-strategist R4).

### D3. Where the chart lives and what it validates

1. **File: `agents/org-chart.yml`** (principal-architect, technical-writer,
   backend-engineer). It is already founder class A through `agents/**`, it
   is mirrored in CODEOWNERS, and it is in the runtime image
   (`Dockerfile.os:22`), under `AGENTS_ROOT`. A root `org/chart.yml`
   (creative-director, ai-ml-engineer, devops-engineer, qa-engineer) would
   need a new class A glob, a CODEOWNERS line and an image change, and would
   add nothing.
2. **Contents:**
   - positions, each with `id`, `title`, `layer`, `kind` (manager, staff or
     ic), `holder`, `occupant` (a slug, or none when planned), `reports_to`,
     `status` and `deputy`;
   - units, each with `id`, `head` and `members`;
   - the stage map (D2.4);
   - exceptions, each with a reason and `review_by`;
   - `serves: [nirmaan, ip-nirmaan]` on units that serve both organisations;
   - `legal_entity: undetermined (founder decision)`.

   Positions are kept apart from slugs, so a promotion renames nothing in
   `agents/` or `review-teams.yml` (brand-strategist).
3. **The validator** (dependency-free, in repo-checks, with a fixture that
   must fail for each check):
   - one root, the founder; one `reports_to` each; no cycles; depth of 6 or
     less; layers rising strictly;
   - staff and ICs have no reports; staff hold no key; an active manager has
     3 to 8 reports, or a dated exception;
   - every `agents/<slug>/agent.md` holds exactly one position, and every
     occupant has a spec;
   - planned positions own no path, skill or stage;
   - each active manager's deputy is an active IC in the same unit, is not
     the head, is not in `no_key_roles`, and deputises for one unit only;
   - the teams in `review-teams.yml` equal the active key-1 units, and each
     team's lead is that unit's head;
   - every `checklists:` role is a member of the rule's teams (staff hold a
     declared allowance);
   - every path resolves to an active unit;
   - the stage map is complete;
   - the title rules hold (D2.5);
   - every `reviewed_by` target exists;
   - the README team table is regenerated and diffed. `pr-review.md` links to
     it instead of copying it. The "I am a member of" sentence in each spec is
     checked against the chart.
4. **Plannable agents come from the chart.** They are active positions of kind
   ic or staff, without `plannable: false`. Managers never own tasks. The
   hand-kept exclusion list in `planner.ts:26-28` moves into the chart as
   `plannable: false`. Managers need no `AGENT_TASK_TYPES` entry
   (business-analyst, backend-engineer).
5. **Five relations, kept apart:**

   | Relation | Meaning | Where |
   |---|---|---|
   | reports_to | Line management | The chart |
   | review keys | Who passes a PR | Derived (D4) |
   | reviewed_by | Peer review of artifacts inside a project | Spec frontmatter (unchanged) |
   | decides | Who may decide what | Decision meetings; founder classes A to F |
   | staffs | Who works on a project | Delivery (until then, the planner) |

   Line managers own quality through skill files, evals and key 1, not
   through `reviewed_by`.
6. **Each spec gets a "Your line" block** generated from the chart: manager,
   deputy and escalation rung (backend-engineer). 26 specs hardcode "Escalate
   to the Orchestrator" today.

### D4. Review keys

1. **Derive key 2, but shadow first.** The P1 derivation module computes the
   derived key 2 on every PR and logs it beside the actual key 2. Posting
   does not change: the Orchestrator stays key 2 on every PR until a switch PR
   (founder class A) passes the shadow gate (G7). With the chart as decided,
   every PR goes to the Orchestrator until a chief is active anyway, and PRs
   that span Engineering and Product (the shared layer, website JS, pages)
   always will.
2. **The rule.**
   - Key 1: the head of each active unit that owns a changed path.
   - Key 2: the lowest active manager strictly above all key-1 holders.
     Planned positions are skipped. Key 2 is never a key-1 holder on the same
     PR.
   - Apex floor: the Orchestrator is key 2 for founder classes A and B, and
     for any PR touching `agents/**`, `.github/**`, `.claude/**`, `AGENTS.md`,
     `CLAUDE.md`, the review map, the checklists or the review scripts. No
     manager reviews a change to its own authority.
   - Founder classes A to F are unchanged. The check names stay, so the
     ruleset is untouched.
3. **Security-engineer's controls, adopted in full:**
   - the chart is founder class A and is added to `fixer_forbidden`, which
     lacks `agents/**` today (`.github/scripts/pr-loop/config.json`);
   - the derivation module lives in `.github/scripts/pr-review/`, so
     `differsFromMain` (`review.mjs:390-391`) covers it, and the chart
     validator is added to that list;
   - the verdict cache key includes the role (`review.mjs:271` keys by team
     only);
   - the generic Key 2 checklist always loads (`review.mjs:345` drops it when
     the role has its own section);
   - a missing spec or Key 2 section on `main` is a deferral, never a hand-off
     to a lower role;
   - only the founder overrides a Security fail;
   - a timeout moves a question up a rung and never turns a block into a pass.
4. **Deputies and rate limits (rule 2.3.6): PROPOSAL, not in effect.** These
   rules change when a key may pause and who may take a key, which is a
   review-gate change the founder keeps. The meeting proposes them; they take
   effect only through the founder's own approval of the founder class A PR
   that implements them (section 9, item 2). Until then, `main`'s rules in
   `docs/operations/pr-review.md` apply unchanged: a deferred key, including
   one deferred for a rate limit, stops the loop with `needs-founder`, and no
   other role takes a key. The proposal:
   - **Rate or session limit:** the key pauses and stays pending. The loop
     retries after the reset, with no `needs-founder` label and no deputy,
     because a deputy on the same plan fails the same way (sre).
   - **Timeout, or a process failure with no output:** one deputy try, marked
     "deputy" on the check and the comment, then `needs-founder` (security,
     sre).
     - For key 1, the deputy is the unit's named deputy.
     - For key 2, it is the next active manager up, never an IC.
   - **Invalid output or failed validation:** no deputy. The PR stops for the
     founder, as it does today, because PR text can induce this (security).
     sre dissents (section 7). The shadow run counts these cases, and the
     pilot retrospective revisits the rule with that data.
   - **legal-counsel is never a deputy and never holds a key.** Legal and
     Compliance has no deputy: if Legal's key 1 defers, the PR stops for the
     founder (legal-compliance, legal-counsel).
   - Platform's head never deputises for Security.
5. **Escalation timing (rule 2.3.7):** a daily digest of `needs-founder` PRs
   older than 48 hours, and of founder waits older than 7 days. Nothing
   escalates above the founder (sre).

### D5. Path split and content rules (before new heads hold keys)

1. **Split `os/**` in P1, before any new head holds key 1.**
   - The new rule ids keep the interim Engineering team. Each hiring PR then
     only re-points a rule.
   - Target owners:
     - `os/src/app/**` pages and `_components` go to Web plus Design (with the
       ux-designer checklist);
     - `os/prisma/**` goes to Data;
     - `os/src/lib/ai/**`, `os/src/lib/agents/**` and
       `os/src/lib/evaluation/**` go to AI and ML;
     - auth and runtime security go to Security plus Web;
     - the rest of `os/src/lib/**` goes to Web.
   - The catch-all goes to Platform, not Web (frontend-engineer,
     backend-engineer, ux-designer).
   - Web's key 1 adds to Design, Brand and Commercial keys and replaces none.
   - The Principal Architect keeps the engineering key 1 on each path,
     including the shared layer, until that path's head is active.
2. **Content rules scoped for the knowledge folders (backend-engineer,
   legal-compliance).**
   - PROPOSAL, not in effect: content rules gain `exclude`, and `money` (C)
     and `market-claims` (E) exclude `skills/**`, `examples/**` and
     `capability/**`, so a skill that says "payments", "GST" or "versus" is
     not founder class. Instead, the skill validator fails currency amounts
     and company-claim voice. This narrows founder classes, which the founder
     keeps: it takes effect only through the founder's own approval of the
     founder class A PR that implements it (section 9, item 3). Until then the
     rules on `main` (`.github/review-teams.yml`) match those folders as they
     do today.
   - `legal-and-data` (D) keeps its scope, the product surfaces that collect
     data. A new rule, `knowledge-legal`, covers the knowledge folders. It
     adds Legal as key 1, with no founder class, and matches personal data,
     datasets, licences, model weights, "legal advice", DPDP, GDPR, HIPAA and
     third-party scripts. legal-compliance asked for founder class D here; see
     section 7.
   - A new rule, `internal-org` (E), runs on `website/src/**`. It adds Brand
     and Content and matches skill level words, "knowledge only", the
     capability map, "orchestrator", and counts of agents, roles or skills
     (brand-strategist R2).
   - `shared-layer` gains `notify: [ip-council-chair]` (creative-director,
     design-system-engineer).
   - When `business` splits, `client-names` and `send-gate-roles` name Legal
     and Commercial and keep the client-communication and sales-partnerships
     checklists (sales-partnerships). `legal_teams` in the review config
     becomes `[legal]`. The send gate stays founder class F.

### D6. Capability model

1. **Paths and ids.**
   - Skills live in `skills/<unit>/<skill-id>.md`, worked examples in
     `examples/<skill-id>/`, and records and generated levels in
     `capability/`.
   - A skill id is global, unique and immutable, and never encodes the unit.
     A reorganisation moves files but never renames ids (database-engineer).
   - None of these folders is founder class.
2. **`held_by` lives in the skill's front matter, not in `agent.md`**
   (technical-writer). A "Skills held" list in `agents/**` would make every
   assignment founder class.
   - The validator checks every `held_by` slug against the chart.
   - A generated index lists the skills each role holds.
   - Because auto-merged skill files become prompt text:
     - the runtime puts skills in a delimited reference block, and the spec's
       constraints win;
     - the validator and the Knowledge PR checklist fail any text that
       instructs an agent to change permissions, escalation or review;
     - reviewers never load skills (security-engineer).
3. **Runtime loading (principal-architect, backend-engineer, ai-ml-engineer,
   performance-engineer):**
   - skill ids are passed explicitly (`skills?: string[]`). There is no tag or
     semantic matching, and Task gets no new column in P1;
   - at most K = 3 skills per call;
   - ids are checked on the server against `held_by`, and an id the role does
     not hold throws;
   - no named skill means no skill text;
   - one prompt composer serves all four call sites: `runAgent.ts:120`,
     `planner.ts:108`, `architecture.ts:103` and `runDiscovery.ts:127`;
   - a byte budget test asserts on the assembled prompt (the role spec plus
     the largest allowed skill set) at 64 KiB or less. The system prompt is
     one argv value (`claudeCodeCli.ts:66`), and Linux caps one argument at
     128 KiB;
   - the loaded `id@sha` is recorded in handoff metadata;
   - the pilot runs an A/B test with and without skills, and a skill that
     adds bytes without raising the score is not loaded by default;
   - the runtime image gains `skills/`.
4. **Skill file format (content-strategist, technical-writer):**
   - Front matter: `id`, `name`, `unit`, `tier` (`runnable` or
     `knowledge-only`), `prerequisites`, `related` (including the other
     organisation's skills), `tools` (free and connected, or paid and known
     only), `eval_cases`, `held_by`, `owners` (writer role, checker role,
     unit), `volatility`, `as_of` and `review_by`. There is no level and no
     check record in the front matter.
   - Line 1 of the body is "Use when: ...".
   - Then the plan's 8 headings, exact and in order. An empty section says
     "None: <reason>". Section 7 is always present, and a knowledge-only file
     says why it has no example.
   - Limits: 700 to 2,500 body words, not counting Sources, and 16 KB per
     file. The validator and the runtime budget share these numbers, and the
     pilot may tune them.
   - Dates: `as_of` is when the sources were last checked. `review_by`
     follows volatility: fast 3 months, medium 6, stable 12. A stale file
     cannot gain a level.
   - Voice lint: no em or en dashes, no "expert", no positioning "Never"
     list, no company-claim voice, no currency amounts. Skills teach the
     work; they never sell it.
   - Style rules live in `skills/README.md` and `skills/_template.md`, owned
     by Brand and Content. The validator is owned by Capability. Brand and
     Content holds no key on `skills/**`.
5. **Citations inline.**
   - `[S1]` markers resolve to a Sources list (title, publisher, URL, version
     or access date, licence).
   - Every factual sentence in sections 2, 4 and 5 carries one, and section 3
     procedures cite a repository path.
   - `[NEEDS SOURCE]` fails the validator, so it blocks merge.
   - Model memory is never a source.
   - The checker fails any run of 12 or more words copied from a source
     outside quotation marks, and quotations total at most 50 words per file.
   - Standards are cited by number and summarised, never copied.
6. **Licence.** The Nirmaan repository has no licence today: there is no
   LICENSE file, while IP Nirmaan is Apache-2.0. The outbound licence is a
   founder item (section 9, item 4). Content is linked, never copied,
   across repositories. Each knowledge PR lists the licences of its datasets, model weights and
   dependencies. Compliance skills say "not legal advice".
7. **Levels are renamed: Checked, Tested, Used** (they were Knowledge,
   Practised, Proven). "Proven" clashes with the site's "proven technology"
   (`technology.njk:4,5,12`), and the tier "practising" was confusable with
   the level "Practised". brand-strategist proposed "Written, Tested, Used";
   "Checked" replaces "Written" because the first level needs a checker's
   check record.
8. **Records (database-engineer, qa-engineer):**
   - `capability/records/*.jsonl` are append-only and committed: one line per
     event (`check`, `eval_run`, `pr_use`).
   - Each line records the record id, skill id, agent, commit, skill file
     SHA, model and provider, judge type (tool, rubric or heuristic), the
     command and exit code, n, result, evidence pointer and writer session.
   - Corrections are new lines with `supersedes`; nothing is edited.
   - `levels.json` is a pure function of the records. CI regenerates it and
     fails on a diff.
   - Check records are written by the checker session and eval lines by the tool
     run, never by the writer.
   - A check record binds to the file's SHA, so an edit or a model-route change
     makes the level stale, and levels can drop.
   - Evidence from client work stays private.
9. **Evals.**
   - Tested needs a tool judge: a test run, a schema check or a scored
     metric, with n of at least 3 and all failures kept.
   - Keyword or heuristic checkers (`os/src/lib/evaluation/types.ts`) and
     mock runs never count toward Tested.
   - Rubric-judged results are labelled "rubric" and shown apart.
   - Used counts only when a key-1 verdict cites the skill. A PR-text tag is
     an untrusted claim, and a revert removes it.
   - Simulated users never count as research evidence (ux-designer).
   - CI runs examples and tool-judged cases without any model token or
     secret. Live model evals run locally on the existing plan and are
     committed as records.

### D7. Shared services, the entity question and public wording

1. **Shared policy, separate seats. No reporting line crosses the two
   repositories, and no role holds a key in the other repository**
   (security-engineer, finance-estimation, sales-partnerships).

   | Item | Shared or per organisation | Owning seat in Nirmaan |
   |---|---|---|
   | Legal positions (privacy and terms already cover both sites) | One answer | legal-compliance. IP Nirmaan keeps export control, RTL licensing and its Apache-2.0 notices |
   | Tax positions | One answer, with a specialist split: tax on IP licensing stays with IP Nirmaan | tax-accounts; open questions for a chartered accountant are kept privately |
   | Estimation and licence pricing | Per organisation | finance-estimation |
   | Shared site layer and design tokens | Shared, one owner; IP Nirmaan is a pinned consumer; `/os` consumes the tokens | Head of Design |
   | Brand names | Founder class E | founder |
   | Positioning, voice, copy | Per organisation | brand-strategist |
   | Sales and clients | Per organisation; one shared consent and do-not-contact register, one set of outreach consent rules, one lead-routing rule | Head of Commercial |
   | PR review platform | Shared, one owner; code founder class A | Head of Platform (interim: Platform and Quality) |

   tax-accounts and legal-counsel proposed shared Finance and Legal units
   whose reports would cross both repositories; this is declined for now
   (section 7). Both IP Nirmaan seats map to their own org roles, which the IP
   Nirmaan meeting decides.
2. **One legal entity or two is a founder question** (section 9, item 5).
   It goes to a qualified lawyer and a chartered accountant. Until the founder answers:
   - the chart records `legal_entity: undetermined`;
   - treatments between the two organisations stay low confidence;
   - drafts take party names only from that field, never from unit names.
3. **Public wording.** No public page or README describes Nirmaan and IP
   Nirmaan as a group, as two companies, or as having a common owner, and
   none implies a lawyer on staff, until the founder confirms the facts. The
   consistent public phrasing today is the terms page's: "Open-source
   projects we publish, such as IP Nirmaan, are covered by the license in
   their own repository" (`website/src/terms.njk:33`).
4. **Public claims (brand-strategist):**
   - No agent level, skill count, roster or capability claim appears on any
     public page, with or without records. Records may back client outcomes,
     never agent claims, and plan section 8 is amended to match.
   - The `internal-org` rule enforces this (D5).
   - No skill file adds a row to `services.json` or `technology.njk`. Service
     pages change only by the founder's decision.
   - Usage reporting stays internal.

### D8. Pilot and wave order

1. **Pilot: AI and ML.** product-manager, frontend-engineer and
   backend-engineer asked for Web; see section 7.
   - Why AI and ML: the pilot exists to test the new machinery, which is
     runtime skill loading, the eval harness and the records. AI and ML is the
     department whose skills run inside that machinery
     (`os/src/lib/ai`, `os/src/lib/evaluation`).
   - Web's case is strong but weaker on that test. It has the most
     deterministic judges, and Web runs second, reusing the pilot's harness.
   - The web concern that CI cannot run models is answered: CI runs only
     deterministic parts, and live evals are local records.
   - Scope (ai-ml-engineer): 14 skills. 10 aim at Tested by tool judges:
     problem classification, structured outputs, tool definition design, LLM
     evals, RAG systems (recall at k on this repository's own docs), model
     routing, LLM fallback, classical supervised ML, ML metrics and
     forecasting baselines. 4 are knowledge-only: fine-tuning, agentic
     workflows, MLOps serving and responsible AI.
   - The vector database skill is written during the pilot, owned by Data
     (database-engineer).
   - Exit: the plan's criteria, plus at least half the pilot skills reach
     Tested through tool judges without a model in CI, and a retrospective.
2. **Wave order.** Each wave carries the hiring PR that activates its unit.

   | Wave | Department | Activates |
   |---|---|---|
   | P1 | Appsec hire; Legal and Commercial split; Capability office | Commercial, Legal, Capability |
   | 1 | AI and ML (pilot) | Chief of Engineering, Head of AI and ML |
   | 2 | Web, with Design (user-researcher; web SEO engineering) | Head of Web |
   | 3 | Integrations and India stack | Head of Integrations |
   | 4 | Data | Head of Data; interim Engineering ends |
   | 5 | Commercial and Legal knowledge (customer-support, pre-sales hires) | |
   | 6 | Product, with Brand and Content knowledge | Head of Product, Chief of Product |
   | 7 | Platform | Head of Platform, VP Data, AI and Platform |
   | 8 | Security and Quality (two hiring PRs) | Heads of Security and Quality; interim Platform and Quality ends |
   | 9 | Delivery | Head of Delivery, Chief of Operations |
   | 10 | Mobile and Desktop (with platform design skills from Design) | Head of Mobile and Desktop, VP Product Engineering |
   | 11 | Systems and Frontier | Head of Systems and Frontier |

   - The rule behind the order: business value first, then reach to Tested
     with free tools, then dependencies.
   - Design gates every visual PR (creative-director, ui-designer,
     seo-specialist), so it goes with Web.
   - Integrations moves up for the ideal customer's pain (product-manager,
     market-research).
   - Data comes after Integrations to end the interim Engineering unit.
   - The plan's list had no product, design, brand or business waves; they
     are now placed.
3. **Pace.** One wave at a time until the usage review (T28). After that, a
   Product or Operations wave may run beside an engineering wave only if the
   review allows it (finance-estimation).

### D9. Delivery machinery and usage pacing

1. **Authoring.**
   - Authoring is session-driven first (unanimous). The author loop comes
     after the pilot and needs its own meeting, because it is founder class A.
   - Knowledge PRs carry 3 to 5 skill files from one unit, with their eval
     cases and examples, and have a diff-size cap. The plan said 3 to 8.
   - The checker writes the eval cases, and no case text appears in the skill
     file.
   - Reviews take priority over authoring.
2. **Author-side usage is logged** in the same format as review calls,
   outside the repository, before any wave pace is set (finance-estimation).
   Usage reporting is owned by finance-estimation and stays internal.
3. **Session-limit classifier bug** (sre).
   - `RATE_LIMIT` in `.github/scripts/pr-review/claude.mjs:44` does not match
     "You've hit your session limit", so a session limit is logged as an
     error.
   - It is fixed first. If the founder approves the D4.4 proposal, rate
     limits then pause instead of stopping.
4. **Cache tokens undercounted** (performance-engineer, narrowed by the
   chair). The review log already records cache-read and cache-write tokens
   (`claude.mjs:49-54`). The OS runtime providers record only input and
   output tokens (`claudeCodeCli.ts:102`, `anthropic.ts:39`), and
   `RunAgentResult` has no duration. P1 adds cache tokens and `durationMs`
   to every OS call. The pace is set from cache-aware numbers.
5. **Examples CI** (devops-engineer):
   - one always-reporting `examples` job that runs only the changed examples,
     with a weekly full sweep;
   - per example: its own lockfile, `npm ci --ignore-scripts`, a time budget,
     actions pinned by SHA, and read-only permissions;
   - no secrets and no model tokens;
   - standard free runners only.
6. **Hiring PRs.**
   - There is one hiring PR per department. It carries the specs, the chart
     entries, the `review-teams.yml` re-pointing and the `agentConfig`
     entries together.
   - Each hiring PR shows that the span holds, a deputy is named, no checklist
     coverage is dropped, and every "Fails when" item of an outgoing key
     holder has a new owner.
   - The Design hiring PR also adds the manager duties to creative-director
     and fixes `agents/creative-director/agent.md:83` (visual-direction.md
     exists).

### D10. Coverage added for P2 (Appendix A)

These areas go into the P2 capability map, each with a proposed owner unit:

| Area | Owner unit | Proposed by |
|---|---|---|
| Software architecture and system design; build systems and developer experience | Principal Architect (staff), Platform | principal-architect |
| Supply chain (SBOM, pinning, provenance), LLM and agent security, prompt injection, threat modelling, incident response, CI/CD security, security operations and GRC | Security | security-engineer, ai-ml-engineer, market-research |
| Release engineering, containers, DNS, CDN and edge, backup and disaster recovery, secrets management, capacity planning, LLM observability for our own loop | Platform | devops-engineer, sre, performance-engineer |
| Profiling, mobile performance, query tuning, caching, real-user monitoring, LLM inference performance | Platform | performance-engineer |
| Webhooks, background jobs, caching, realtime, file storage, multi-tenancy, API versioning and contract tests, PDF generation, Ruby on Rails, media streaming and WebRTC | Web | backend-engineer |
| Frontend security (CSP, SRI), HTML email, data visualisation, Indic web fonts, low-end Android budgets, design to code | Web | frontend-engineer |
| SEO engineering (owned by Web, with seo-specialist as checker); search and on-page SEO (owned by Brand and Content) | Web; Brand and Content | seo-specialist |
| Data modelling, data quality, lineage and governance, CDC, database reliability, time-series and cache stores, anonymisation and retention, experimentation statistics | Data | database-engineer |
| Indic NLP and speech, document AI, operations research, fraud detection, AI governance (with Legal) | AI and ML | ai-ml-engineer |
| Contract, end-to-end, visual regression, device and LLM-eval testing; test data | Quality | qa-engineer |
| Accessibility split into `design/accessible-interaction` (owned by Design) and `quality/accessibility-testing` (owned by Quality) | Design; Quality | ux-designer |
| User research, IA, interaction and service design, UX writing, inclusive design, design tokens (DTCG), motion, data visualisation UX, conversational and AI feature UX, platform guidelines, India context, consent UX, theming, spatial UX (knowledge only) | Design | ux-designer, ui-designer, creative-director |
| Marketing and growth: web analytics and measurement, local search, Indian-language SEO, conversion optimisation, answer-engine visibility; paid acquisition is knowledge only | Brand and Content | seo-specialist |
| UX writing, documentation engineering (docs as code, API reference), localisation | Brand and Content | content-strategist, technical-writer |
| Account management, bid and tender management, outbound compliance (DPDP consent, TRAI, WhatsApp policy, anti-spam), sales operations, incident communication, client onboarding | Commercial | sales-partnerships, client-communication |
| Bookkeeping, statutory payroll, TDS, reverse charge, cost sharing between the two organisations (knowledge only until the founder supplies facts) | Commercial | tax-accounts |
| Privacy support, trademark and name clearance, contract register (private), export control (IP Nirmaan) | Legal and Compliance | legal-counsel, legal-compliance |
| Industry knowledge as skill packs | Product | market-research |
| ServiceNow, Guidewire, Power Platform, Dynamics; AUTOSAR and functional safety (knowledge only) | Integrations; Systems and Frontier | market-research |

Deferred hires, which need P2 evidence of skills that no role holds:
visual-designer, growth-marketer, account-manager, engineering manager or
technical program manager, developer relations, HR and recruiting, and
bookkeeping.

## 3. Mapping of the 28 existing agents (none removed)

| Agent | Today | Target position | Unit | Layer, kind | Interim and notes |
|---|---|---|---|---|---|
| orchestrator | Executive; key 2 on every PR | Orchestrator | apex | L1, manager | Title loses "(CTO Agent)". Key 2 until the switch, then the apex floor |
| principal-architect | Engineering lead, key 1 | Principal Architect | staff to Chief of Engineering | staff | Leads interim Engineering and keeps key 1 on each path until that path's head is active and shadow-reviewed. Then holds a staff checklist on schema, auth and boundary rules |
| security-engineer | Platform and Quality lead, key 1 | Head of Security | Security | L4, manager | Leads interim Platform and Quality until wave 8 |
| sre | Platform and Quality member | IC, deputy | Platform | L6, ic | Owns the loop SLO and runbook |
| devops-engineer | Platform and Quality member | IC | Platform | L6, ic | Owns examples CI |
| performance-engineer | Platform and Quality member | IC | Platform | L6, ic | Owns load testing. Its checklist moves to Head of Platform's key 1 when that head is active |
| qa-engineer | Platform and Quality member | IC, deputy | Quality | L6, ic | Its missing page checklist is fixed in the Quality hiring PR |
| frontend-engineer | Engineering member | IC, deputy | Web | L6, ic | |
| backend-engineer | Engineering member | IC | Web | L6, ic | Deputy of interim Engineering |
| database-engineer | Engineering member | IC, deputy | Data | L6, ic | Stays in interim Engineering until wave 4 (recorded exception) |
| ai-ml-engineer | Engineering member | IC, deputy (LLM applications) | AI and ML | L6, ic | |
| product-manager | Product lead, key 1 | IC, deputy | Product | L6, ic | Leads interim Product until Head of Product is hired (wave 6). Keeps PRDs and the planner until D2.3 point 7 |
| business-analyst | Product member | IC | Product | L6, ic | Deputy of interim Product |
| market-research | Product member | IC | Product | L6, ic | |
| creative-director | Design lead, key 1 | Head of Design | Design | L4, manager | Gains the manager duties in the Design hiring PR |
| ux-designer | Design member | IC | Design | L6, ic | |
| ui-designer | Design member | IC, deputy | Design | L6, ic | A native checklist variant is added before any native PR |
| design-system-engineer | Design member | IC | Design | L6, ic | Shared design system; `/os` token drift goes on the Design backlog |
| brand-strategist | Brand and Content lead, key 1 | Head of Brand and Content | Brand and Content | L4, manager | Owns the `skills/` style rules |
| content-strategist | Brand and Content member | IC, deputy | Brand and Content | L6, ic | |
| technical-writer | Brand and Content member | IC | Brand and Content | L6, ic | |
| seo-specialist | Brand and Content member | IC | Brand and Content | L6, ic | Checker on `web/seo-engineering` |
| legal-compliance | Business lead, key 1 | Head of Legal and Compliance | Legal and Compliance | L4, manager, reports to L1 | No deputy |
| legal-counsel | Business member, no key | IC | Legal and Compliance | L6, ic | Never holds a key, never a deputy |
| finance-estimation | Business member | IC | Commercial | L6, ic | Owns the internal usage report |
| tax-accounts | Business member | IC | Commercial | L6, ic | |
| sales-partnerships | Business member | IC, deputy | Commercial | L6, ic | Holds account management until recorded clients justify a separate role |
| client-communication | Business member | IC | Commercial | L6, ic | Drafts and never sends; Delivery staffs it, Commercial manages it |

## 4. Hire list, in order

| Order | Hiring PR | New agents | When |
|---|---|---|---|
| 1 | H1 Security deputy | appsec-engineer (joins interim Platform and Quality as deputy) | P1 |
| 2 | H2 Legal and Commercial split | Head of Commercial, privacy-counsel, licensing-counsel | P1 |
| 3 | H3 Capability office | Head of Capability, org-designer, capability-programme-manager, knowledge-quality-reviewer | P1 |
| 4 | H4 Pilot | Chief of Engineering, Head of AI and ML, ml-engineer, mlops-engineer | Wave 1 |
| 5 | H5 Web | Head of Web, cms-ecommerce-engineer | Wave 2 |
| 6 | H6 Design | user-researcher (plus creative-director's manager duties) | Wave 2 |
| 7 | H7 Integrations | Head of Integrations, payments-india-stack-engineer, business-systems-engineer, messaging-telephony-engineer | Wave 3 |
| 8 | H8 Data | Head of Data, data-engineer, analytics-engineer | Wave 4 |
| 9 | H9 Commercial | customer-support, pre-sales-solutions-architect | Wave 5 |
| 10 | H10 Product | Chief of Product, Head of Product, product-owner | Wave 6 |
| 11 | H11 Platform | Head of Platform, VP Data, AI and Platform | Wave 7 |
| 12 | H12 Security | cloud-security-engineer, privacy-engineer | Wave 8 |
| 13 | H13 Quality | Head of Quality, test-automation-engineer, accessibility-test-engineer | Wave 8 |
| 14 | H14 Delivery | Chief of Operations, Head of Delivery, delivery-manager, delivery-planner, service-delivery-manager | Wave 9 |
| 15 | H15 Mobile and Desktop | VP Product Engineering, Head of Mobile and Desktop, ios-engineer, android-engineer, cross-platform-engineer | Wave 10 |
| 16 | H16 Systems and Frontier | Head of Systems and Frontier, systems-engineer, embedded-iot-engineer, web3-engineer, xr-games-engineer | Wave 11 |

The plan expected about 12 to 15 hiring PRs; this is 16, because the business
split and the Security deputy are pulled forward.

## 5. P1 foundations

The ordered list of P1 PRs, with files, founder class, owner role and
verification, is kept with the internal minutes and will be published as the
P1 tracker. The P1 exit criterion is unchanged: CI is green, a first real
skill goes through the full loop and merges, and the founder has approved the
class A PRs.

## 6. Plan amendments

- 2.1 is corrected as in section 1.
- 2.3.3 has five relations.
- 2.3.5 sets the minimum at 3 and adds the activation rule.
- 2.3.6 has the deputy rules of D4.4, if the founder approves them
  (proposal).
- 2.4 is applied through the shadow run.
- 2.6 is replaced by D2.
- 3.1 and 3.4 are replaced by D6.
- The level names become Checked, Tested and Used.
- Section 8 bans public level words.
- Section 10 sets the minimum at "3 or more reports".
- Section 7 uses the wave order of D8.

## 7. Dissent

| Seat | Wanted | Decided | Why |
|---|---|---|---|
| product-manager, frontend-engineer, backend-engineer | Web as the pilot | AI and ML pilot; Web second | The pilot must test runtime loading and the eval harness. CI concerns are answered by local live evals as records. frontend-engineer declared a bias |
| finance-estimation | Keep one Business department under legal-compliance | Separate Legal (under L1) and Commercial | That shape keeps legal over the sales it checks |
| security-engineer | Quality under a VP Platform, Security and Quality; deputies on rate limits | Quality and Security report to the Chief of Engineering directly; proposed (D4.4): rate limits pause | Platform's VP would manage both checkers of Platform's work. A deputy on the same plan hits the same limit (sre) |
| sre | One deputy try on bad output | Proposed (D4.4): no deputy on invalid output; the PR stops for the founder | PR text can induce invalid output (security). The shadow run measures it, and the pilot retrospective revisits the rule |
| legal-compliance | `legal-and-data` (founder class D) widened to the knowledge folders; the entity question answered before the first knowledge PR | `knowledge-legal` adds Legal key 1 without a founder class. The licence is a gate (G4); the entity question gates shared arrangements and public wording only | Class D on every web skill would make the founder the bottleneck. Legal still reviews every match |
| tax-accounts | A shared Finance unit across both repositories with 4 ICs; no Nirmaan finance manager | Shared tax positions, separate seats; finance inside Commercial | Two review systems; no role holds keys across repositories; the entity facts are unknown |
| legal-counsel | A shared Legal unit containing IP Nirmaan seats | Nirmaan Legal reaches 3 with privacy-counsel and licensing-counsel | Same reason; the IP Nirmaan meeting decides IP Nirmaan's seats |
| qa-engineer | performance-engineer moved to Quality | performance-engineer stays in Platform | Moving it leaves both units below 3 (performance-engineer) |
| creative-director, ai-ml-engineer, devops-engineer, qa-engineer | `org/chart.yml` at the root | `agents/org-chart.yml` | Already class A, in CODEOWNERS and in the image |
| creative-director | A visual-designer hire | Deferred | Visual design and motion are skills of the existing designers; the bloat rule applies |
| market-research | Systems and Emerging under one head, and a sources-based case for fewer managers | Adopted as Head of Systems and Frontier; the minimum stays 3 | The activation rule prevents empty managers; human span data does not transfer directly to agents |
| ai-ml-engineer | A 48 KB prompt cap | 64 KiB, with K = 3 and 16 KB files | 48 KB cannot hold a role spec plus three files at the agreed file cap; the pilot may lower it |
| technical-writer | `[NEEDS SOURCE]` blocks the Checked level | It blocks merge | One rule, enforced by the validator, is sharper |
| brand-strategist | Levels named Written, Tested, Used | Checked, Tested, Used | The first level needs a checker's check record |
| client-communication | Customer support under Clients | Adopted, under Commercial | |
| design-system-engineer | Deputy candidacy for Design | ui-designer is the Design deputy | ui-designer's checklist already runs on every visual PR |

## 8. Gates

| Gate | Condition | Owner role |
|---|---|---|
| G1 | The chart validator, with failing fixtures, is merged before any hiring PR | qa-engineer |
| G2 | `os/**` is split before any new head holds key 1 | principal-architect |
| G3 | The content rules are scoped and `knowledge-legal` and `internal-org` are live before the first knowledge PR | legal-compliance (rules), backend-engineer (fixtures) |
| G4 | The founder records Nirmaan's outbound licence decision, which may be "unlicensed", before the first knowledge PR merges | legal-compliance |
| G5 | The classifier fix is merged (and the rate-limit pause, if the founder approves D4.4), and the OS records cache tokens and duration, before the pilot | sre, performance-engineer |
| G6 | Author-side usage is logged before any wave pace is set | finance-estimation |
| G7 | The derived key 2 switch needs: the derived role active; at least 20 shadowed PRs, including planted-defect PRs, where the derived reviewer catches at least what the Orchestrator caught; the security controls of D4.3 merged; the founder's approval | qa-engineer, security-engineer |
| G8 | No level is shown anywhere until the records generator and its CI diff are merged | database-engineer |
| G9 | No skill loads at runtime until the single composer and the byte budget test are merged | performance-engineer |
| G10 | Each hiring PR shows span, deputy, checklist continuity, new owners for every outgoing "Fails when" item, and `agentConfig` entries | principal-architect (engineering), orchestrator (all) |
| G11 | Examples CI runs with no secret or model token, on free runners | devops-engineer |
| G12 | The loop SLO, runbook and `needs-founder` digest exist before P3 | sre |
| G13 | No website change mentions agent capability; the `internal-org` rule enforces this | brand-strategist |
| G14 | Head of Web is active before Web knowledge PRs, or principal-architect holds interim key 1 | frontend-engineer |
| G15 | The pilot exit criteria are met (D8.1), and the retrospective decides format and pace changes | orchestrator |

## 9. Founder items

1. Approve the founder-class P1 PRs and each hiring PR (class A).
2. Whether to adopt the D4.4 proposal: a rate-limited key pauses and retries
   without `needs-founder`, and after a timeout or a process failure with no
   output one deputy role may take the key. It takes effect only through the
   founder's own approval of the class A PR that implements it; until then
   `main`'s rules apply.
3. Whether to adopt the D5.2 proposal: the `money` (C) and `market-claims`
   (E) content rules exclude `skills/**`, `examples/**` and `capability/**`.
   It takes effect only through the founder's own approval of the class A PR
   that implements it; until then those folders stay founder class C and E
   when they match.
4. Nirmaan's outbound licence for the repository, or for `skills/` and
   `examples/`, recorded before the first knowledge PR merges (G4).
   Choosing "unlicensed" explicitly is a valid answer.
5. Whether Nirmaan and IP Nirmaan are one legal entity or two, with a
   qualified lawyer and a chartered accountant. Public wording follows the
   answer.
6. Switching key 2 from the Orchestrator to the derived rule, after G7. The
   switch adds a dated "Superseded by" note to
   `docs/operations/pr-review-decisions.md`.
7. The weekly pace at the usage review (T28).
8. Whether a statutory data protection officer is required (with counsel).
9. Any sandbox or third-party accounts that Integrations examples would need
   (no spending).
10. Any overrule of the decisions above.

## 10. Not decided here

IP Nirmaan's chart, "one seat, one org role" and practice leads are for the
IP Nirmaan meeting. Shared items in D7 need that meeting's matching decision.
