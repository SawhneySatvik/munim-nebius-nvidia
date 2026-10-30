// Dependency-free helpers for the mock storefront API. SIMULATED: synthetic data only.
import { createHash, timingSafeEqual } from "node:crypto";

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Deterministic uuid-v7-shaped id (version nibble 7, variant 8-b) so every id validates as Uuid7. */
export function stableId(seed: string): string {
  const h = sha256(`munim-mock:${seed}`);
  const variant = "89ab"[parseInt(h[16]!, 16) % 4]!;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isUuid7 = (v: unknown): v is string => typeof v === "string" && UUID7.test(v);

/** Timing-safe string compare (CLAUDE.md gotcha 16): hash both so lengths match, never early-exit on length. */
export function safeEqual(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** round-half-up of a*b/c for non-negative integers (the pack's `half_up_per_line`). */
export const mulDiv = (a: number, b: number, c: number): number => Math.floor((a * b * 2 + c) / (2 * c));

/** Stable key order so "same body" compares equal regardless of property order. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

// ---- time (Intl only; one place) ----
const DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
export type Local = { y: number; m: number; d: number; hh: number; mm: number; dow: number; date: string; hhmm: string };

export function localParts(at: Date, tz: string): Local {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" })
      .formatToParts(at).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const y = +p.year!, m = +p.month!, d = +p.day!, hh = +p.hour!, mm = +p.minute!;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { y, m, d, hh, mm, dow: DOW[p.weekday!]!, date: `${y}-${pad(m)}-${pad(d)}`, hhmm: `${pad(hh)}:${pad(mm)}` };
}

function offsetMs(at: Date, tz: string): number {
  const l = localParts(at, tz);
  return Date.UTC(l.y, l.m - 1, l.d, l.hh, l.mm) - Math.floor(at.getTime() / 60000) * 60000;
}

/** Wall-clock time in `tz` to an instant (handles the DST offset on that date). */
export function zonedInstant(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMs(new Date(guess), tz);
  const off2 = offsetMs(new Date(t), tz);
  t = guess - off2;
  return new Date(t);
}
