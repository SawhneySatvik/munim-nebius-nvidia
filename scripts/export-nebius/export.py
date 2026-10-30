"""The Nebius export, driven by scripts/export-nebius.sh. Python 3.11+, standard library only. It reuses the Cup export's workspace
and lockfile filter, its stamp recompute and its secret shapes (scripts/export-cup/, unchanged) with this export's rules.

  export.py tree    REF OUT     REF's kept files (rules.keep) with the file map and then the text map applied, the shared docs (REF's
                                docs/shared/ pages), the overlay (root/), the pnpm workspace and lockfile filtered to the exported
                                packages, the generated stamps recomputed where a map changed one of their inputs
  export.py closure REF         the exported workspace packages are the closure of what the services, the web app and worldgen build
                                from, plus the adapters the composition roots load
  export.py source  REF         forbidden words in REF's exported files before the maps, except the reviewed ones → exit 1
  export.py words   DIR         forbidden words in any path or file under DIR → exit 1
  export.py secrets DIR         secret shapes in any file under DIR, beyond the reviewed synthetic test values → exit 1
  export.py overlay DIR         process words or planning ids in the docs this export writes (the overlay and the shared docs) → exit 1
  export.py licence DIR         LICENSE is not the Apache License 2.0, byte for byte, at the top of DIR → exit 1
  export.py links   DIR         a relative link in an exported Markdown file that names no exported file → exit 1
  export.py commit  DIR         DIR becomes a git repository with one commit (rules.AUTHOR, rules.MESSAGE), checked after
"""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
import re
import subprocess
import sys
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
OVERLAY = HERE / "root"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    sys.modules[name] = mod
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


rules = _load("nebius_rules", HERE / "rules.py")
# The Cup's export module imports a module named `rules`; it is handed this export's, so nothing of the Cup's keep list is used.
sys.modules["rules"] = rules
cup = _load("cup_export", HERE.parent / "export-cup" / "export.py")
del sys.modules["rules"]

# The shared docs (provider-neutral) the export carries under docs/, by their published names.
SHARED_DOCS = {
    "docs/shared/overview.md": "docs/overview.md",
    "docs/shared/architecture.md": "docs/core-architecture.md",
    "docs/shared/ai-layer.md": "docs/ai-agents.md",
    "docs/shared/security.md": "docs/security.md",
    "docs/shared/glossary.md": "docs/glossary.md",
}

# The Apache License 2.0 as the Apache Software Foundation publishes it (https://www.apache.org/licenses/LICENSE-2.0.txt), the text
# the hosting sites' licence detection matches.
APACHE_2_SHA256 = "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"


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
    mapped = set()
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
            new = rules.replace(rules.file_map(m.name, data))
            if m.name in rules.FILE_MAP:
                mapped.add(m.name)
            if new != data:
                rewritten += 1
                stamped_changed |= m.name.startswith(cup.STAMPED_INPUTS)
            dest = out / m.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(new)
            dest.chmod(0o755 if m.mode & 0o111 else 0o644)
            kept += 1
    unmapped = sorted(set(rules.FILE_MAP) - mapped)
    if unmapped:
        sys.exit(f"export: the file map names files the export does not carry (moved or left out; review it): {unmapped}")
    for src, dst in SHARED_DOCS.items():
        dest = out / dst
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(git("show", f"{ref}:{src}"))
    overlay = files_under(OVERLAY)
    for src in overlay:
        dest = out / src.relative_to(OVERLAY)
        if dest.exists():
            sys.exit(f"export: the overlay's {src.relative_to(OVERLAY)} would replace an exported file; exclude it in rules.py first")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(src.read_bytes())
        dest.chmod(0o755 if os.access(src, os.X_OK) else 0o644)
    cup.workspace(ref, out)
    cup.lockfile(ref, out)
    if stamped_changed:
        cup.restamp(out)
    print(f"export: {kept} files kept from {ref} ({rewritten} reworded by the maps, {len(mapped)} by the file map), {dropped} left out, "
          f"{len(SHARED_DOCS)} shared docs, {len(overlay)} from the overlay{', generated stamps recomputed' if stamped_changed else ''}")


# ---- closure -------------------------------------------------------------------------------------------------------
ROOTS = ["apps/web", "services/core-api", "services/core-worker", "tools/worldgen"]
# Loaded by the composition roots at run time (by path or by mode), not through a workspace dependency.
LOADED = ("adapters/dev/", "adapters/gcp/", "adapters/falkordb")


def closure(ref: str) -> None:
    """Every workspace package the roots depend on (dependencies and devDependencies, transitively) is exported, and every
    exported package is one of those, a root, or an adapter a composition root loads."""
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
    extra = sorted(p for p in exported if p not in need and not p.startswith(LOADED))
    print(f"closure: {len(need)} packages needed ({', '.join(sorted(need))}); exported {len(exported)}")
    if missing or extra:
        sys.exit(f"closure: FAIL — needed but left out: {missing}; exported but not needed: {extra}")


# ---- gates ---------------------------------------------------------------------------------------------------------
def unreviewed(name: str, data: bytes) -> list[bytes]:
    """One file's forbidden words before the maps that no review covers: the reviewed rules-file references and, in a file the
    file map names, exactly its reviewed lines are taken out first (a pair that no longer matches once is itself a failure)."""
    for old, _ in rules.FILE_MAP.get(name, []):
        if data.count(old) != 1:
            return [b"(the reviewed rewrite no longer matches once: " + old[:50] + b")"]
        data = data.replace(old, b"")
    return rules.FORBIDDEN.findall(rules.REVIEWED.sub(b"", data))


def source(ref: str) -> None:
    hits, reviewed = [], 0
    with tarfile.open(fileobj=io.BytesIO(git("archive", "--format=tar", ref))) as tar:
        for m in tar.getmembers():
            if not m.isfile() or not rules.keep(m.name):
                continue
            data = tar.extractfile(m).read()  # type: ignore[union-attr]
            if rules.FORBIDDEN.search(m.name.encode()):
                hits.append(f"{m.name}: (path)")
            rest = unreviewed(m.name, data)
            reviewed += max(0, len(rules.FORBIDDEN.findall(data)) - len(rest))
            hits += [f"{m.name}: {w.decode(errors='replace')}" for w in rest]
    print(f"source: {len(hits)} forbidden word(s) in {ref}'s exported files; {reviewed} reviewed (reworded or removed by the maps)")
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
    leaked = [str(p.relative_to(root)) for p in files_under(root)
              if re.search(r"(^|/)\.env(\.(?!example$)[^/]*)?$|(^|/)\.run/", str(p.relative_to(root)))]
    print(f"secrets: {len(hits)} secret-shaped string(s) beyond the {len(rules.SECRET_ALLOW) + len(rules.cup.SECRET_ALLOW)} reviewed synthetic "
          f"test values; {len(leaked)} .env or .run file(s)")
    for h in (hits + leaked)[:40]:
        print(f"  {h}")
    if hits or leaked:
        sys.exit(1)


def written_docs(root: Path) -> list[Path]:
    """The docs this export writes itself: the overlay's text files except the licence (its text is the Apache Software
    Foundation's, checked byte for byte by `licence`), and the shared docs."""
    text = {root / p.relative_to(OVERLAY) for p in files_under(OVERLAY) if b"\0" not in p.read_bytes()[:8192] and p.name != "LICENSE"}
    return sorted(text | {root / d for d in SHARED_DOCS.values()})


def overlay(root: Path) -> None:
    hits = []
    for p in written_docs(root):
        for m in rules.OVERLAY_WORDS.finditer(p.read_bytes()):
            hits.append(f"{p.relative_to(root)}: {m.group(0).decode(errors='replace')}")
    print(f"overlay: {len(hits)} process word(s) or planning id(s) in the {len(written_docs(root))} docs this export writes")
    for h in hits[:40]:
        print(f"  {h}")
    if hits:
        sys.exit(1)


def licence(root: Path) -> None:
    p = root / "LICENSE"
    got = hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else "(no LICENSE)"
    print(f"licence: LICENSE sha256 {got[:16]}…, the Apache License 2.0 is {APACHE_2_SHA256[:16]}…")
    if got != APACHE_2_SHA256:
        sys.exit("licence: FAIL — LICENSE is not the Apache License 2.0 text, byte for byte")


LINK = re.compile(r"\]\(([^)\s]+)\)")


def links(root: Path) -> None:
    """Every relative link (no scheme, not an anchor) in an exported .md names a file or directory in the export."""
    bad, n = [], 0
    for p in files_under(root):
        if p.suffix != ".md" or "node_modules" in p.parts:
            continue
        for target in LINK.findall(p.read_text(errors="replace")):
            if re.match(r"^[a-z]+:|^#|^mailto:", target):
                continue
            n += 1
            path = target.split("#", 1)[0]
            if path and not (p.parent / path).resolve().exists():
                bad.append(f"{p.relative_to(root)}: {target}")
    print(f"links: {n} relative link(s) in the exported Markdown; {len(bad)} name no exported file")
    for b in bad[:40]:
        print(f"  {b}")
    if bad:
        sys.exit(1)


def commit(root: Path) -> None:
    """One fresh commit: no template (so no hooks), no signing, the one identity as author and committer, the message as given."""
    name, email = rules.AUTHOR
    env = {**os.environ, "GIT_AUTHOR_NAME": name, "GIT_AUTHOR_EMAIL": email, "GIT_COMMITTER_NAME": name, "GIT_COMMITTER_EMAIL": email,
           "GIT_CONFIG_NOSYSTEM": "1"}
    g = ["git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false"]
    subprocess.run(["git", "init", "--quiet", "--template=", "-b", "main"], cwd=root, check=True, env=env)
    subprocess.run([*g, "add", "--all", "--force", "."], cwd=root, check=True, env=env)
    subprocess.run([*g, "commit", "--quiet", "--no-verify", "-m", rules.MESSAGE], cwd=root, check=True, env=env)
    show = lambda fmt: subprocess.run(["git", "log", "-1", f"--format={fmt}"], cwd=root, check=True, capture_output=True, text=True, env=env).stdout
    count = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=root, check=True, capture_output=True, text=True).stdout.strip()
    remotes = subprocess.run(["git", "remote"], cwd=root, check=True, capture_output=True, text=True).stdout.strip()
    tracked = subprocess.run(["git", "ls-files"], cwd=root, check=True, capture_output=True, text=True).stdout.splitlines()
    on_disk = [str(p.relative_to(root)) for p in files_under(root)]
    problems = []
    if count != "1":
        problems.append(f"{count} commits")
    if show("%an <%ae>|%cn <%ce>").strip() != f"{name} <{email}>|{name} <{email}>":
        problems.append(f"identity {show('%an <%ae>|%cn <%ce>').strip()}")
    if show("%B").rstrip("\n") != rules.MESSAGE:
        problems.append(f"message {show('%B')!r}")
    if rules.FORBIDDEN.search(show("%B").encode()):
        problems.append("a forbidden word in the message")
    if remotes:
        problems.append(f"remotes {remotes}")
    if sorted(tracked) != sorted(on_disk):
        problems.append(f"{len(on_disk)} files on disk but {len(tracked)} tracked")
    if any(re.search(r"(^|/)\.env(\.(?!example$)[^/]*)?$|(^|/)\.run/", t) for t in tracked):
        problems.append("a .env or .run file is tracked")
    if "LICENSE" not in tracked:
        problems.append("no LICENSE")
    print(f"commit: {show('%h')[:12].strip()} {show('%s').strip()!r} by {show('%an <%ae>').strip()}; {len(tracked)} files; "
          f"{'no remote' if not remotes else 'remotes!'}")
    if problems:
        sys.exit(f"commit: FAIL — {'; '.join(problems)}")


if __name__ == "__main__":
    cmd, *rest = sys.argv[1:]
    if cmd == "tree":
        tree(rest[0], Path(rest[1]).resolve())
    elif cmd == "closure":
        closure(rest[0])
    elif cmd == "source":
        source(rest[0])
    elif cmd in ("words", "secrets", "overlay", "licence", "links", "commit"):
        {"words": words, "secrets": secrets, "overlay": overlay, "licence": licence, "links": links, "commit": commit}[cmd](Path(rest[0]).resolve())
    else:
        sys.exit(f"export.py: unknown command {cmd}")
