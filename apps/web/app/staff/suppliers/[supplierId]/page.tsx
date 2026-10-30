import { Suspense } from "react";
import type { Metadata } from "next";
import { SupplierScreen } from "@/components/staff/pages/supplier";
import { graphServed } from "@/lib/server/graph-flag";

export const metadata: Metadata = { title: "A supplier" };

export default function Page() {
  return <Suspense fallback={<div className="min-h-[100dvh]" aria-busy="true" />}><SupplierScreen graph={graphServed()} /></Suspense>;
}
