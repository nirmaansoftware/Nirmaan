import type { HealthStatus, LaneStatus, ModelFamily, ReviewStage, SkillLevel } from "@/lib/snapshot";
import { modelFamily, modelLabel } from "@/lib/snapshot";

/**
 * hq's own parts, drawn with the OS design system's tokens (os-system.css is a
 * byte-for-byte copy of os/src/app/globals.css; never restyle it here).
 */

const CELLS = 24;

/**
 * Progress as square blocks, the logo's pixel grid laid in a row: ink = done,
 * blue = being laid, panel = still to do. The count is exact in the label;
 * the blocks are rounded so a started item always shows at least one cell.
 */
export function Blocks({ done, active, total, label }: { done: number; active: number; total: number; label: string }) {
  const safeTotal = Math.max(total, 1);
  const pct = Math.round((done / safeTotal) * 100);
  let doneCells = Math.floor((done / safeTotal) * CELLS);
  let activeCells = Math.ceil(((done + active) / safeTotal) * CELLS) - doneCells;
  if (done > 0 && doneCells === 0) doneCells = 1;
  if (active > 0 && activeCells === 0) activeCells = 1;
  activeCells = Math.min(activeCells, CELLS - doneCells);
  return (
    <div
      className="blocks"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${done} of ${total} done, ${active} in progress (${pct}%)`}
    >
      {Array.from({ length: CELLS }, (_, i) => (
        <span key={i} className={i < doneCells ? "done" : i < doneCells + activeCells ? "active" : undefined} />
      ))}
    </div>
  );
}

const HEALTH_TONE: Record<HealthStatus | "none", string> = { ok: "good", warn: "warn", down: "bad", paused: "info", none: "" };

/** A square status light (no circles: square corners everywhere). */
export function Light({ status, label }: { status: HealthStatus | "none"; label?: string }) {
  return <span className={`light ${HEALTH_TONE[status]}`.trim()} role="img" aria-label={label ?? status} />;
}

const LANE_TONE: Record<LaneStatus, string> = { working: "info", waiting: "warn", paused: "", done: "good", failed: "bad" };

export function LaneBadge({ status }: { status: LaneStatus }) {
  return <span className={`badge ${LANE_TONE[status]}`.trim()}>{status}</span>;
}

/** A model name with its family colour swatch. */
export function ModelChip({ model }: { model: string }) {
  const f: ModelFamily = modelFamily(model);
  return (
    <span className={`model-chip m-${f}`} title={model}>
      {modelLabel(model)}
    </span>
  );
}

export const STAGES: { id: ReviewStage; label: string }[] = [
  { id: "key1", label: "key 1" },
  { id: "fix", label: "fix" },
  { id: "key2", label: "key 2" },
  { id: "proxy", label: "proxy" },
  { id: "ready", label: "ready" },
  { id: "merged", label: "merged" },
];

/** Where a PR is in the two-key pipeline (OS .stages: done ink, current blue). */
export function StagePipe({ stage, fixRounds = 0 }: { stage: ReviewStage; fixRounds?: number }) {
  if (stage === "needs-founder") return <span className="badge bad">needs founder</span>;
  const at = STAGES.findIndex((s) => s.id === stage);
  return (
    <span className="stages" aria-label={`stage: ${stage}${fixRounds ? `, ${fixRounds} fix rounds` : ""}`}>
      {STAGES.map((s, i) => {
        // A passed fix step only counts as done when a fix round actually ran.
        const skipped = s.id === "fix" && i < at && fixRounds === 0;
        const cls = i === at ? "current" : i < at && !skipped ? "done" : undefined;
        return (
          <span key={s.id} className={cls}>
            {s.id === "fix" && fixRounds > 1 ? `fix ×${fixRounds}` : s.label}
          </span>
        );
      })}
    </span>
  );
}

const LEVEL_TONE: Record<SkillLevel, string> = { practised: "good", knowledge: "info", none: "" };

export function LevelBadge({ level }: { level: SkillLevel }) {
  return <span className={`badge ${LEVEL_TONE[level]}`.trim()}>{level}</span>;
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}
