// The contact address comes only from NEXT_PUBLIC_CONTACT_EMAIL (set by the founder at deploy time); the site never
// carries a hard-coded address. Anything that does not look like one plain address is treated as unset.
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function contactEmail(raw: string | undefined = process.env["NEXT_PUBLIC_CONTACT_EMAIL"]): string | null {
  const v = raw?.trim() ?? "";
  return EMAIL.test(v) ? v : null;
}
