// The Cypher texts the product depends on (design §4), one file each under cypher/: the reads under read/, the projector's writes
// under write/ in the order they run. The texts are static; data only ever fills parameters.
import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("../cypher/", import.meta.url);
const text = (path: string) => readFileSync(new URL(path, DIR), "utf8").trim();
const files = (sub: string) => readdirSync(new URL(`${sub}/`, DIR)).filter((f) => f.endsWith(".cypher")).sort();

/** Read name → text (GRAPH.RO_QUERY only). */
export const READ: Readonly<Record<string, string>> = Object.fromEntries(files("read").map((f) => [f.slice(0, -".cypher".length), text(`read/${f}`)]));

export const NODE_LABELS = ["outlet", "supplier", "ingredient", "recipe", "item", "finding", "draft"] as const;
export const EDGE_TYPES = ["supplies", "quoted", "used_in", "makes", "stocked_as", "sold_at", "about", "answers", "targets"] as const;
export type NodeLabel = (typeof NODE_LABELS)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];

/** `NN_<name>.cypher`: 00 the indexes (one statement a line), 01–07 the nodes, 10–18 the edges, 19 the projection record. */
const WRITE = files("write").map((f) => ({ name: f.replace(/^\d+_|\.cypher$/g, ""), text: text(`write/${f}`) }));
export const INDEXES = WRITE.find((w) => w.name === "indexes")!.text.split("\n");
export const PROJECTION_NODE = WRITE.find((w) => w.name === "projection")!.text;
export const WRITES: ReadonlyArray<{ name: NodeLabel | EdgeType; kind: "node" | "edge"; text: string }> = WRITE
  .filter((w) => w.name !== "indexes" && w.name !== "projection")
  .map((w) => {
    const kind = (NODE_LABELS as readonly string[]).includes(w.name) ? "node" : (EDGE_TYPES as readonly string[]).includes(w.name) ? "edge" : null;
    if (!kind) throw new Error(`cypher/write: unknown write ${w.name}`);
    return { name: w.name as NodeLabel | EdgeType, kind, text: w.text };
  });
if (WRITES.length !== NODE_LABELS.length + EDGE_TYPES.length) throw new Error("cypher/write: a node or edge write is missing");

/** One rebuild's rows (projection.sql's `doc`): a list per node label and per edge type. */
export type GraphDoc = { as_of: string } & Record<NodeLabel | EdgeType, Array<Record<string, unknown>>>;
