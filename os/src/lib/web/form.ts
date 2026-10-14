/** Small, strict readers for FormData values. */
export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export function int(form: FormData, key: string, label: string): number {
  const raw = str(form, key).replace(/[,\s₹]/g, "");
  if (raw === "") return 0;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`${label} must be a whole number.`);
  return n;
}

export function bool(form: FormData, key: string): boolean {
  const v = str(form, key);
  return v === "on" || v === "true" || v === "yes";
}

export function dateOrNull(form: FormData, key: string): Date | null {
  const v = str(form, key);
  if (!v) return null;
  const d = new Date(`${v}T23:59:59`);
  if (Number.isNaN(d.getTime())) throw new Error("That date isn't valid.");
  return d;
}
