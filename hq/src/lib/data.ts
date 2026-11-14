import "server-only";
import { readFile } from "node:fs/promises";
import { sampleSnapshot } from "./sample";
import { SNAPSHOT_VERSION, forbiddenIn, type Snapshot } from "./snapshot";

/**
 * Where hq gets its snapshot. The only place that knows.
 *
 * - HQ_SNAPSHOT_FILE set (running on the founder's Mac): read the publisher's
 *   file (publisher/publish.mjs writes it atomically every ~15 s).
 * - Otherwise: the labelled sample. The deployed site will read the store here
 *   (hq-plan step 2); the browser never holds a store key.
 *
 * A snapshot with the wrong version or a forbidden field is never served.
 */
export async function getSnapshot(): Promise<Snapshot> {
  const file = process.env.HQ_SNAPSHOT_FILE;
  if (file) {
    try {
      const snap = JSON.parse(await readFile(file, "utf8")) as Snapshot;
      if (snap.version === SNAPSHOT_VERSION && forbiddenIn(snap).length === 0) return snap;
    } catch {
      // fall through to the sample, which says plainly that it is a sample
    }
  }
  return sampleSnapshot();
}
