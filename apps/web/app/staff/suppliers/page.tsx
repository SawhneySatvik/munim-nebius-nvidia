import { Suspense } from "react";
import type { Metadata } from "next";
import { SuppliersScreen } from "@/components/staff/pages/suppliers";
import { graphServed } from "@/lib/server/graph-flag";

export const metadata: Metadata = { title: "Suppliers" };

export default function Page() {
  return <Suspense fallback={<div className="min-h-[100dvh]" aria-busy="true" />}><SuppliersScreen graph={graphServed()} /></Suspense>;
}
