// Files offered on /developers/downloads. They are placed under apps/site/public/downloads/ by the lanes that build
// them (the SDK tarball and its checksum by the SDK lane); the page lists each one and says plainly when it is not
// published yet.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { SITE_PUBLIC, repoRoot } from "./repo.ts";

export type Download = { file: string; href: string; title: string; about: string; bytes: number | null };

const FILES: Array<Omit<Download, "href" | "bytes">> = [
  {
    file: "munim-sdk-0.3.1.tgz",
    title: "Munim TypeScript SDK",
    about: "Typed client for every /v1 route, generated from the same contracts as this reference. Install it with npm or pnpm straight from the file.",
  },
  {
    file: "munim-sdk-0.3.1.tgz.sha256",
    title: "SDK checksum",
    about: "SHA-256 of the SDK package, to check the file you downloaded.",
  },
];

export function downloads(root: string = repoRoot()): Download[] {
  return FILES.map((f) => {
    const path = join(root, ...SITE_PUBLIC, "downloads", f.file);
    return { ...f, href: `/downloads/${f.file}`, bytes: existsSync(path) ? statSync(path).size : null };
  });
}
