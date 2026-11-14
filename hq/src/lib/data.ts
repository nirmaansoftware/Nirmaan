import "server-only";
import { sampleSnapshot } from "./sample";
import type { Snapshot } from "./snapshot";

/**
 * Where hq gets its snapshot. Today: the sample. When the publisher and the
 * store exist (hq-plan steps 1-2), this reads the latest snapshot from the
 * store server-side; the browser never holds a store key.
 */
export async function getSnapshot(): Promise<Snapshot> {
  return sampleSnapshot();
}
