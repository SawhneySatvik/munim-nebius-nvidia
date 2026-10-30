"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavGroup = { title: string; links: Array<{ href: string; label: string }> };

function List({ groups, path }: { groups: NavGroup[]; path: string }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.title}>
          <p className="dev-nav-h">{g.title}</p>
          <ul className="dev-nav-list">
            {g.links.map((l) => {
              const current = path === l.href;
              return (
                <li key={l.href}>
                  <Link href={l.href} aria-current={current ? "page" : undefined}>
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

export function DevNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname() ?? "";
  return (
    <aside className="dev-nav" aria-label="Developer portal">
      <details className="dev-nav-toggle">
        <summary>Developer portal menu</summary>
        <nav aria-label="Developer portal (mobile)">
          <List groups={groups} path={path} />
        </nav>
      </details>
      <nav className="dev-nav-desktop" aria-label="Developer portal sections">
        <List groups={groups} path={path} />
      </nav>
    </aside>
  );
}
