"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { ActionState } from "@/lib/web/actionState";

/**
 * Every mutating form in the OS goes through this: it runs a server action,
 * disables the button while pending, and shows the result inline (success,
 * a plain-language error, or a one-time link to copy).
 *
 * React resets a form automatically after its action runs, which would wipe
 * what someone typed whenever there's an error. So with JavaScript the
 * submit is dispatched manually (no automatic reset), and fields are cleared
 * only after a success. Without JavaScript the plain `action` still works.
 */
export function ActionForm({
  action,
  children,
  submit,
  pendingLabel = "Working…",
  className = "form",
  variant = "",
  confirm,
  readOnly = false,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  submit: string;
  pendingLabel?: string;
  className?: string;
  variant?: "" | "ghost" | "danger" | "sm" | "ghost sm" | "danger sm";
  /** If set, the person must tick a confirmation before submitting. */
  confirm?: string;
  /** Render the fields without a submit button (e.g. a record that can no longer change). */
  readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [confirmed, setConfirmed] = useState(!confirm);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && !state.link) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      {!readOnly && confirm && (
        <label className="check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> {confirm}
        </label>
      )}
      {!readOnly && (
      <div className="row">
        <button className={`btn ${variant}`.trim()} type="submit" disabled={pending || !confirmed}>
          {pending ? pendingLabel : submit}
        </button>
      </div>
      )}
      <Result state={state} />
    </form>
  );
}

export function Result({ state }: { state: ActionState }) {
  if (state.error) return <p className="notice error" role="alert">{state.error}</p>;
  if (state.ok || state.link) {
    return (
      <div className="notice ok" role="status">
        {state.ok}
        {state.link && <CopyField value={state.link} />}
      </div>
    );
  }
  return null;
}

export function CopyField({ value }: { value: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <span className="copy">
      <input ref={ref} className="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
      <button
        type="button"
        className="btn ghost sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            ref.current?.select();
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
