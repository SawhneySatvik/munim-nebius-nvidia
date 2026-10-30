"""The Cup repo's history (T-123, `scripts/export-cup.sh --history`): this repo's history filtered to the export,
on a throwaway clone, never on this repo.

  history.py filter SRC WORK TREE OUT
      SRC   a git repository (this repo, or a clone of it) whose HEAD is exported
      WORK  an empty scratch directory (the throwaway clone lives here and is deleted after)
      TREE  `export.py tree`'s output for the same commit: the final commit makes the history's tree equal to it
      OUT   where the filtered repository goes: a fresh clone, no remote, no reflog, no filter-repo state

  Pass 1 re-roots the storefront's 12 commits (their own repo kept files at its root) under apps/web/, so the path
  rules see them where they now live. Pass 2 applies rules.keep, the reviewed text map, rules.subject (one plain line
  per commit, R60) and the mailmap (one identity, R60), and drops commits left empty. A final commit adds what the export generates (the root overlay, the filtered pnpm
  workspace and lockfile, recomputed stamps).

  history.py gate OUT TREE
      every blob in the object store, every path, every commit message and identity: no forbidden word, no secret
      shape; one author/committer identity (rules.AUTHOR); one-line messages; OUT's HEAD tree equals TREE.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import rules  # noqa: E402

# The storefront's own history (fetched with R54 P-1's merge 68bb04b): its tip; every ancestor of it is that lineage.
STOREFRONT_TIP = "0382306"
STOREFRONT_COMMITS = 12
FINAL_MESSAGE = "Add the README, architecture doc, env template, CI workflow, and the pnpm workspace and lockfile for this repository"


def run(*args: str, cwd: Path | None = None, env: dict[str, str] | None = None) -> str:
    r = subprocess.run(list(args), cwd=cwd, capture_output=True, text=True, env={**os.environ, **(env or {})})
    if r.returncode != 0:
        sys.exit(f"history: {' '.join(args[:3])}… failed ({r.returncode}): {r.stderr.strip()[-2000:]}")
    return r.stdout


def filter_history(src: Path, work: Path, tree: Path, out: Path) -> None:
    if out.exists():
        sys.exit(f"history: {out} exists")
    clone = work / "filter"
    run("git", "clone", "--quiet", "--no-local", str(src), str(clone))
    run("git", "remote", "remove", "origin", cwd=clone)
    ids = run("git", "rev-list", STOREFRONT_TIP, cwd=clone).split()
    if len(ids) != STOREFRONT_COMMITS:
        sys.exit(f"history: expected {STOREFRONT_COMMITS} storefront commits under {STOREFRONT_TIP}, found {len(ids)}")
    (work / "storefront-ids").write_text("\n".join(ids) + "\n")
    rules_dir = str(HERE)

    # Pass 1: the storefront's commits, re-rooted under apps/web/ (nothing else changes).
    run("git", "filter-repo", "--force", "--quiet", "--commit-callback", f"""
ids = set(open({str(work / "storefront-ids")!r}, "rb").read().split())
if commit.original_id in ids:
    for change in commit.file_changes:
        change.filename = b"apps/web/" + change.filename
""", cwd=clone)
    after_pass1 = commit_map(clone)

    # Pass 2: the export's paths, the text map, one-line messages (R60), one identity (the mailmap); empty commits dropped.
    load = f"import sys\nsys.path.insert(0, {rules_dir!r})\nimport rules\n"
    run("git", "filter-repo", "--force", "--quiet",
        "--filename-callback", load + "return filename if rules.keep(filename.decode()) else None",
        "--replace-text", str(HERE / "replace-text.txt"),
        "--commit-callback", load + "commit.message = rules.subject(commit.message, [c.filename for c in commit.file_changes])",
        "--mailmap", str(HERE / "mailmap.txt"),
        cwd=clone)
    after_pass2 = commit_map(clone)
    # filter-repo composes its map across runs on one repository (it keys pass 2 by the original ids); accept either key.
    final = {i: after_pass2.get(i) or after_pass2.get(after_pass1.get(i, ""), "0" * 40) for i in ids}
    kept = [i for i, new in final.items() if new != "0" * 40]
    print(f"history: the storefront's commits kept: {len(kept)} of {STOREFRONT_COMMITS}")
    if len(kept) != STOREFRONT_COMMITS:
        sys.exit("history: a storefront commit was dropped")

    # The generated files: make the tree exactly the tree export's.
    run("git", "checkout", "--quiet", "HEAD", cwd=clone)
    for p in clone.iterdir():
        if p.name != ".git":
            shutil.rmtree(p) if p.is_dir() else p.unlink()
    shutil.copytree(tree, clone, dirs_exist_ok=True)
    run("git", "add", "--all", cwd=clone)
    changed = run("git", "diff", "--cached", "--name-status", cwd=clone).splitlines()
    print(f"history: the final commit adds or changes {len(changed)} generated path(s):")
    for line in changed:
        print(f"  {line}")
    name, email = (x.decode() for x in rules.AUTHOR)
    who = {"GIT_AUTHOR_NAME": name, "GIT_AUTHOR_EMAIL": email, "GIT_COMMITTER_NAME": name, "GIT_COMMITTER_EMAIL": email}
    run("git", "commit", "--quiet", "--no-verify", "-m", FINAL_MESSAGE, cwd=clone, env=who)

    # A fresh clone: no reflog, no .git/filter-repo, no remote, packed objects only from the filtered history.
    run("git", "clone", "--quiet", "--no-local", str(clone), str(out))
    run("git", "remote", "remove", "origin", cwd=out)
    run("git", "reflog", "expire", "--expire=now", "--all", cwd=out)
    shutil.rmtree(clone)
    print(f"history: {run('git', 'rev-list', '--count', 'HEAD', cwd=out).strip()} commits in {out}")


def gate(out: Path, tree: Path) -> None:
    failures = 0
    # Every object in the store (not only reachable history).
    objs = run("git", "cat-file", "--batch-all-objects", "--batch-check=%(objectname) %(objecttype)", cwd=out).split("\n")
    blobs = [o.split()[0] for o in objs if o.endswith(" blob")]
    data = subprocess.run(["git", "cat-file", "--batch"], cwd=out, input="".join(b + "\n" for b in blobs).encode(), capture_output=True, check=True).stdout
    words: dict[str, int] = {}
    secrets = 0
    i = 0
    while i < len(data):
        nl = data.index(b"\n", i)
        size = int(data[i:nl].split()[2])
        blob = data[nl + 1 : nl + 1 + size]
        i = nl + 1 + size + 1
        for m in rules.FORBIDDEN.finditer(blob):
            w = m.group(0).decode(errors="replace").lower()
            words[w] = words.get(w, 0) + 1
        secrets += len(rules.secret_hits(blob))
    print(f"gate: {len(blobs)} blobs — forbidden words {sum(words.values())} {words or ''}; secret shapes {secrets}")
    failures += sum(words.values()) + secrets
    paths = set(run("git", "log", "--all", "--name-only", "--format=", cwd=out).split("\n")) - {""}
    bad_paths = sorted(p for p in paths if rules.FORBIDDEN.search(p.encode()) or not (rules.keep(p) or (Path(tree) / p).exists()))
    print(f"gate: {len(paths)} paths in history — {len(bad_paths)} with a forbidden word or outside the export {bad_paths[:10]}")
    failures += len(bad_paths)
    log = run("git", "log", "--all", "--format=%H%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x01", cwd=out)
    commits = [c for c in log.split("\x01") if c.strip()]
    msg_hits = [c.split("\x00")[0].strip()[:10] for c in commits if rules.FORBIDDEN.search(c.encode()) or rules.secret_hits(c.encode())]
    idents = sorted({tuple(c.strip().split("\x00")[1:5]) for c in commits})
    print(f"gate: {len(commits)} commits — {len(msg_hits)} with a forbidden word or secret in a message or identity {msg_hits[:10]}")
    print(f"gate: identities {idents}")
    failures += len(msg_hits)
    one = (*(x.decode() for x in rules.AUTHOR),) * 2
    others = [i for i in idents if i != one]
    print(f"gate: author/committer identities other than {one[0]} <{one[1]}>: {len(others)} {others[:5]}")
    failures += len(others)
    multi = [c.split("\x00")[0].strip()[:10] for c in commits if "\n" in c.split("\x00")[5].strip()]
    print(f"gate: messages longer than one line: {len(multi)} {multi[:5]}")
    failures += len(multi)
    internal = re.compile(r"\bT-[0-9]{3}|\bR[0-9]{1,2}\b|\b(?:lane|orchestrator|council|handoff|ledger|shipyard)s?\b", re.I)
    leaks = [c.split("\x00")[5].strip()[:60] for c in commits if internal.search(c.split("\x00")[5])]
    print(f"gate: messages with a ticket id, a ledger id or a process word: {len(leaks)} {leaks[:3]}")
    failures += len(leaks)
    head = set(run("git", "ls-tree", "-r", "--name-only", "HEAD", cwd=out).split("\n")) - {""}
    exported = {str(p.relative_to(tree)) for p in Path(tree).rglob("*") if p.is_file()}
    differ = [p for p in sorted(head | exported) if p not in head or p not in exported or (Path(tree) / p).read_bytes() != run_bytes(out, p)]
    print(f"gate: HEAD tree vs the tree export — {len(differ)} path(s) differ {differ[:10]}")
    failures += len(differ)
    extras = [x for x in (run("git", "remote", cwd=out).strip(), run("git", "reflog", cwd=out).strip()) if x]
    stray = [p for p in ("filter-repo", "refs/original") if (out / ".git" / p).exists()]
    print(f"gate: remotes, reflog entries and filter-repo state left: {len(extras) + len(stray)}")
    failures += len(extras) + len(stray)
    if failures:
        sys.exit(f"history gate: FAIL ({failures})")
    print("history gate: ok")


def commit_map(repo: Path) -> dict[str, str]:
    """filter-repo's record of the last run: old commit id → new (all zeros when the commit was pruned)."""
    lines = (repo / ".git" / "filter-repo" / "commit-map").read_text().split("\n")[1:]
    return dict(line.split() for line in lines if line.strip())


def run_bytes(repo: Path, path: str) -> bytes:
    return subprocess.run(["git", "show", f"HEAD:{path}"], cwd=repo, capture_output=True, check=True).stdout


if __name__ == "__main__":
    cmd, *a = sys.argv[1:]
    if cmd == "filter":
        filter_history(Path(a[0]).resolve(), Path(a[1]).resolve(), Path(a[2]).resolve(), Path(a[3]).resolve())
    elif cmd == "gate":
        gate(Path(a[0]).resolve(), Path(a[1]).resolve())
    else:
        sys.exit(f"history.py: unknown command {cmd}")
