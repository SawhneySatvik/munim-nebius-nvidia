import type { ReactNode } from "react";
import { DevNav, type NavGroup } from "../../components/DevNav.tsx";
import { loadGuides } from "../../lib/guides.ts";
import { sections } from "../../lib/openapi.ts";

export default function DevelopersLayout({ children }: { children: ReactNode }) {
  const guides = loadGuides();
  const groups: NavGroup[] = [
    {
      title: "Start",
      links: [
        { href: "/developers", label: "Overview" },
        { href: "/developers/getting-started", label: "Getting started" },
        { href: "/developers/mock", label: "Mock API" },
        { href: "/developers/authentication", label: "Authentication" },
        { href: "/developers/ai-contract", label: "AI contract" },
        { href: "/developers/errors", label: "Errors" },
        { href: "/developers/downloads", label: "Downloads" },
      ],
    },
    {
      title: "Guides",
      links: [{ href: "/developers/guides", label: "All guides" }, ...guides.map((g) => ({ href: `/developers/guides/${g.slug}`, label: g.title }))],
    },
    {
      title: "API reference",
      links: [{ href: "/developers/reference", label: "All operations" }, ...sections().map((s) => ({ href: `/developers/reference/${s.slug}`, label: s.title }))],
    },
  ];
  return (
    <div className="wrap dev-shell">
      <DevNav groups={groups} />
      <div className="dev-main">{children}</div>
    </div>
  );
}
