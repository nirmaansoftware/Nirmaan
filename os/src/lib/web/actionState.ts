/**
 * The shape every form action returns, so one small client component
 * (os/_components/ActionForm.tsx) can show success, errors and one-time
 * links the same way everywhere.
 */
export interface ActionState {
  ok?: string;
  error?: string;
  /** A one-time secret link (proposal or status link) to show once and copy. */
  link?: string;
}

export const IDLE: ActionState = {};

/** Turns a thrown error into a message fit for the person who clicked. */
export function errorState(err: unknown): ActionState {
  if (err instanceof Error) {
    // Prisma "record not found" and similar internals shouldn't reach the UI verbatim.
    if (/Prisma|P20\d\d/.test(err.message)) return { error: "That record couldn't be found or changed. Refresh and try again." };
    return { error: err.message };
  }
  return { error: "Something went wrong. Please try again." };
}
