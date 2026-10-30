// Server only. Whether core-api serves the supply graph (R68): the deployment says so once, with the setting core-api reads,
// MUNIM_GRAPH. Unset or "postgres" (core's default backend, which has no /v1/graph/* route): no "Supplier map" link, and
// /staff/suppliers/map is not found. A graph adapter's mode: the links show and the map renders; while the graph database is not
// answering, the screen meets core's 503 itself. Read from process.env like every server setting here (demo-session.ts), when a
// page renders: at build time for the static ones (/staff/suppliers, the map), so set it for the build as for the server.
// This app cannot list the adapters' modes without naming them, so it accepts any mode-shaped name (core's own syntax,
// packages/config) and refuses the rest loudly, on/off words included: a build with such a value fails.
const MODE = /^[a-z][a-z0-9_-]{0,31}$/;
const NOT_A_BACKEND = new Set(["on", "off", "true", "false", "yes", "no", "enabled", "disabled", "none"]);

export function graphServed(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.MUNIM_GRAPH?.trim() ?? "";
  if (v === "" || v === "postgres") return false;
  if (!MODE.test(v) || NOT_A_BACKEND.has(v)) throw new Error('MUNIM_GRAPH must be unset, "postgres" or a graph backend\'s mode, as core-api reads it');
  return true;
}
