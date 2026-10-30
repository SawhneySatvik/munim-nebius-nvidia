"""The Cup export (T-123), driven by scripts/export-cup.sh. Python 3.11+, standard library only.

  export.py tree    REF OUT     REF's kept files (rules.keep) with the text map applied, the root overlay (root/), the
                                pnpm workspace and lockfile filtered to the exported packages, the generated stamps
                                recomputed where the map changed one of their inputs
  export.py closure REF         the exported packages are the workspace closure of what the live services build from
  export.py source  REF         forbidden words in REF's exported files before the map, except the reviewed ones → exit 1
  export.py words   DIR         forbidden words in any path or file under DIR → exit 1
  export.py secrets DIR         secret shapes in any file under DIR → exit 1
  export.py imports DIR         an import specifier that reaches adapters/dev, or a dev-mapping loader outside config → exit 1
"""

from __future__ import annotations

import fnmatch
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import rules  # noqa: E402

REPO = HERE.parents[1]
OVERLAY = HERE / "root"
# Where the generators record hashes of their inputs; recomputed in the export when the map changed an input.
STAMPED_INPUTS = ("db/migrations/", "packages/contracts/src/", "packages/contracts/scripts/", "packages/contracts/package.json")


def git(*args: str, cwd: Path = REPO) -> bytes:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True).stdout


def files_under(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*") if p.is_file() and ".git" not in p.relative_to(root).parts)


# ---- tree ----------------------------------------------------------------------------------------------------------
def tree(ref: str, out: Path) -> None:
    if out.exists() and any(out.iterdir()):
        sys.exit(f"export: {out} exists and is not empty")
    out.mkdir(parents=True, exist_ok=True)
    kept = dropped = rewritten = 0
    stamped_changed = False
    with tarfile.open(fileobj=io.BytesIO(git("archive", "--format=tar", ref))) as tar:
        for m in tar.getmembers():
            if not (m.isfile() or m.issym()):
                continue
            if not rules.keep(m.name):
                dropped += 1
                continue
            if m.issym():
                sys.exit(f"export: {m.name} is a symlink; the export carries files only")
            data = tar.extractfile(m).read()  # type: ignore[union-attr]
            new = rules.replace(data)
            if new != data:
                rewritten += 1
                stamped_changed |= m.name.startswith(STAMPED_INPUTS)
            dest = out / m.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(new)
            dest.chmod(0o755 if m.mode & 0o111 else 0o644)
            kept += 1
    overlay = files_under(OVERLAY)
    for src in overlay:
        dest = out / src.relative_to(OVERLAY)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dest)
    workspace(ref, out)
    lockfile(ref, out)
    if stamped_changed:
        restamp(out)
    print(f"export: {kept} files kept from {ref} ({rewritten} reworded by the map), {dropped} left out, {len(overlay)} from the overlay"
          f"{', generated stamps recomputed' if stamped_changed else ''}")


def exported_packages(out: Path) -> list[str]:
    return sorted(str(p.parent.relative_to(out)) for p in out.rglob("package.json") if "node_modules" not in p.parts and p.parent != out)


def workspace(ref: str, out: Path) -> None:
    """REF's pnpm-workspace.yaml with only the package patterns that match an exported package."""
    text = git("show", f"{ref}:pnpm-workspace.yaml").decode()
    pkgs = exported_packages(out)
    lines, dropped = [], []
    for line in text.splitlines():
        m = re.match(r'^  - "([^"]+)"$', line)
        if m and not any(fnmatch.fnmatch(p, m.group(1)) for p in pkgs):
            dropped.append(m.group(1))
            continue
        lines.append(line)
    (out / "pnpm-workspace.yaml").write_text("\n".join(lines) + "\n")
    print(f"export: pnpm-workspace.yaml without {', '.join(dropped) or 'nothing'}")


def prune_unreached(text: str) -> tuple[str, int]:
    """The lockfile without the `packages:` and `snapshots:` entries no importer reaches: `pnpm install --lockfile-only`
    skips resolution when the remaining importers are unchanged, so a package only a dropped importer used stays behind (the
    graph adapter's client named a database the Cup leaves out). Only removes whole entries; returns the text and how many."""
    lines = text.split("\n")

    def unq(k: str) -> str:
        return k[1:-1] if len(k) > 1 and k[0] == k[-1] == "'" else k

    section, deps, seeds, cur = "", {}, set(), None
    for line in lines:
        if re.match(r"^\S", line):
            section, cur = line.rstrip(":"), None
        elif section == "importers" and (m := re.match(r"^      (\S.*):$", line)):
            cur = unq(m.group(1))
        elif section == "importers" and cur and (m := re.match(r"^        version: (\S+)$", line)) and not m.group(1).startswith("link:"):
            seeds.add(f"{cur}@{m.group(1)}")
        elif section == "snapshots" and (m := re.match(r"^  (\S.*?):( \{\})?$", line)):
            cur = unq(m.group(1))
            deps[cur] = []
        elif section == "snapshots" and cur and (m := re.match(r"^      (\S+): (\S+)$", line)) and not m.group(2).startswith("link:"):
            deps[cur].append(f"{unq(m.group(1))}@{m.group(2)}")
    reached, queue = set(), list(seeds)
    while queue:
        k = queue.pop()
        if k not in reached:
            reached.add(k)
            queue.extend(deps.get(k, []))
    packages = {k.split("(", 1)[0] for k in reached}
    out, section, keep, dropped = [], "", True, 0
    for line in lines:
        if re.match(r"^\S", line):
            section, keep = line.rstrip(":"), True
        elif section in ("packages", "snapshots") and (m := re.match(r"^  (\S.*?):( \{\})?$", line)):
            key = unq(m.group(1))
            keep = key in (packages if section == "packages" else reached)
            dropped += not keep
        if keep:
            out.append(line)
    return "\n".join(out), dropped


def lockfile(ref: str, out: Path) -> None:
    """REF's lockfile without the importers of packages the export leaves out, then pruned by pnpm itself (offline,
    nothing re-resolved) and of the entries no remaining importer reaches. Refused unless the result only removes lines
    from REF's lockfile."""
    original = git("show", f"{ref}:pnpm-lock.yaml").decode()
    pkgs = set(exported_packages(out))
    keep_lines, skipping, removed = [], False, []
    in_importers = False
    for line in original.splitlines():
        if line == "importers:":
            in_importers = True
        elif in_importers and re.match(r"^\S", line):
            in_importers = False
        m = re.match(r"^  (\S[^:]*):", line) if in_importers else None
        if m:
            skipping = m.group(1) not in pkgs and m.group(1) != "."
            if skipping:
                removed.append(m.group(1))
        if not skipping:
            keep_lines.append(line)
    (out / "pnpm-lock.yaml").write_text("\n".join(keep_lines) + "\n")
    subprocess.run(["pnpm", "install", "--lockfile-only", "--offline", "--ignore-scripts", "--reporter=silent"], cwd=out, check=True,
                   env={**os.environ, "CI": "true"})
    pruned, orphans = prune_unreached((out / "pnpm-lock.yaml").read_text())
    (out / "pnpm-lock.yaml").write_text(pruned)
    final = pruned.splitlines()
    added = [line for line in final if line not in set(original.splitlines())]
    if added:
        sys.exit(f"export: the filtered lockfile adds {len(added)} line(s) REF's does not have, e.g. {added[:3]}")
    print(f"export: pnpm-lock.yaml without the importers {', '.join(removed)} and {orphans} entries none of the rest reaches; "
          f"{len(original.splitlines()) - len(final)} lines removed, none added")


RESTAMP_JS = r"""
import { readFileSync, writeFileSync } from "node:fs";
import { sourcesDigest, STAMP_FILE } from "./packages/contracts/scripts/stamp.ts";
import { inputsDigest, ONTOLOGY_FILE } from "./packages/contracts/src/ontology/stamp.ts";
const s = JSON.parse(readFileSync(STAMP_FILE, "utf8"));
s.sources = sourcesDigest();
writeFileSync(STAMP_FILE, JSON.stringify(s, null, 2) + "\n");
const o = JSON.parse(readFileSync(ONTOLOGY_FILE, "utf8"));
o.stamp.inputs = inputsDigest();
writeFileSync(ONTOLOGY_FILE, JSON.stringify(o, null, 2) + "\n");
"""


def restamp(out: Path) -> None:
    """The map touched a generator input (a comment in a migration or a contracts source): the outputs are unchanged, so
    only the recorded input hashes are recomputed, with the export's own stamp code."""
    subprocess.run(["node", "--input-type=module", "-e", RESTAMP_JS], cwd=out, check=True)


# ---- closure -------------------------------------------------------------------------------------------------------
ROOTS = ["apps/web", "services/core-api", "services/core-worker", "tools/worldgen"]


def closure(ref: str) -> None:
    """Every workspace package the live services depend on (dependencies and devDependencies, transitively) is in
    rules.INCLUDE, and every package rules.INCLUDE names is one of those, a root, or a cloud adapter."""
    paths = [p for p in git("ls-tree", "-r", "--name-only", ref).decode().splitlines() if p.endswith("/package.json")]
    by_name, deps = {}, {}
    for p in paths:
        d = json.loads(git("show", f"{ref}:{p}"))
        if "name" in d:
            by_name[d["name"]] = p[: -len("/package.json")]
            deps[p[: -len("/package.json")]] = [k for k, v in {**d.get("dependencies", {}), **d.get("devDependencies", {})}.items() if str(v).startswith("workspace:")]
    need, todo = set(ROOTS), list(ROOTS)
    while todo:
        for name in deps.get(todo.pop(), []):
            if by_name[name] not in need:
                need.add(by_name[name])
                todo.append(by_name[name])
    missing = sorted(p for p in need if not rules.keep(f"{p}/package.json"))
    exported = sorted(p for p in deps if rules.keep(f"{p}/package.json"))
    extra = sorted(p for p in exported if p not in need and not p.startswith("adapters/gcp/"))
    print(f"closure: {len(need)} packages needed ({', '.join(sorted(need))}); exported {len(exported)}")
    if missing or extra:
        sys.exit(f"closure: FAIL — needed but left out: {missing}; exported but not needed: {extra}")


# ---- gates ---------------------------------------------------------------------------------------------------------
# Before the map: the only forbidden words an exported source file may hold are references to the repo's rules file
# (uppercase CLAUDE / CLAUDE.md in comments, which the map rewords), and applied migrations are immutable, so their
# comments are reworded by the map too (the Cup database is fresh). Anything else fails the export: the map is never a
# way to launder a new word (a planted "supabase" in services/ must stop the export, not be rewritten).
RULES_FILE_REF = re.compile(rb"\bCLAUDE(?:\.md)?\b")
MIGRATION = re.compile(r"^db/migrations/[0-9]{4}_[a-z0-9_]+\.sql$")


def unreviewed(name: str, data: bytes) -> tuple[list[bytes], int]:
    """One exported file's forbidden words before the map that no review covers, and how many the reviews cover."""
    found = rules.FORBIDDEN.findall(data)
    if MIGRATION.match(name):
        return [], len(found)
    rest = rules.FORBIDDEN.findall(RULES_FILE_REF.sub(b"", data))
    return rest, len(found) - len(rest)


def source(ref: str) -> None:
    hits, reviewed = [], 0
    with tarfile.open(fileobj=io.BytesIO(git("archive", "--format=tar", ref))) as tar:
        for m in tar.getmembers():
            if not m.isfile() or not rules.keep(m.name):
                continue
            data = tar.extractfile(m).read()  # type: ignore[union-attr]
            if rules.FORBIDDEN.search(m.name.encode()):
                hits.append(f"{m.name}: (path)")
            rest, n = unreviewed(m.name, data)
            reviewed += n
            hits += [f"{m.name}: {w.decode(errors='replace')}" for w in rest]
    print(f"source: {len(hits)} forbidden word(s) in {ref}'s exported files; {reviewed} reviewed (rules-file references and applied migrations' comments, reworded by the map)")
    for h in hits[:40]:
        print(f"  {h}")
    if hits:
        sys.exit(1)


def words(root: Path) -> None:
    hits = []
    for p in files_under(root):
        rel = str(p.relative_to(root))
        if rules.FORBIDDEN.search(rel.encode()):
            hits.append(f"{rel}: (path)")
        for m in rules.FORBIDDEN.finditer(p.read_bytes()):
            hits.append(f"{rel}: {m.group(0).decode(errors='replace')}")
    print(f"words: {len(hits)} forbidden word(s) in {len(files_under(root))} files")
    for h in hits[:40]:
        print(f"  {h}")
    if hits:
        sys.exit(1)


def secrets(root: Path) -> None:
    hits = [f"{p.relative_to(root)}: {h[:12].decode(errors='replace')}…" for p in files_under(root) for h in rules.secret_hits(p.read_bytes())]
    print(f"secrets: {len(hits)} secret-shaped string(s) beyond the {len(rules.SECRET_ALLOW)} reviewed synthetic test values")
    for h in hits[:40]:
        print(f"  {h}")
    if hits:
        sys.exit(1)


SPECIFIER = re.compile(rb"""(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'`]([^"'`]+)["'`]""")
CODE = re.compile(r"\.(ts|tsx|mts|mjs|js|cjs|py)$")
DEV_LOADER = b'"adapters", "dev"'  # the computed path packages/config builds for its optional dev mapping


def imports(root: Path) -> None:
    """No import specifier in exported code names adapters/dev, `@munim-dev/` is imported only by web's demo sign-in (it
    resolves to web's own null slot here), and the one loader of a dev mapping is packages/config's (it finds none here)."""
    bad, loaders = [], []
    for p in files_under(root):
        rel = str(p.relative_to(root))
        if not CODE.search(rel) or "node_modules" in p.parts:
            continue
        data = p.read_bytes()
        for m in SPECIFIER.finditer(data):
            if b"adapters/dev" in m.group(1) or (m.group(1).startswith(b"@munim-dev/") and rel != "apps/web/lib/server/demo-session.ts"):
                bad.append(f"{rel}: {m.group(1).decode()}")
        if DEV_LOADER in data:
            loaders.append(rel)
    print(f"imports: {len(bad)} import(s) of adapters/dev; dev-mapping loaders {loaders}")
    for b in bad:
        print(f"  {b}")
    if bad or loaders != ["packages/config/src/index.ts"]:
        sys.exit(1)


if __name__ == "__main__":
    cmd, *rest = sys.argv[1:]
    if cmd == "tree":
        tree(rest[0], Path(rest[1]).resolve())
    elif cmd == "closure":
        closure(rest[0])
    elif cmd == "source":
        source(rest[0])
    elif cmd in ("words", "secrets", "imports"):
        {"words": words, "secrets": secrets, "imports": imports}[cmd](Path(rest[0]).resolve())
    else:
        sys.exit(f"export.py: unknown command {cmd}")
