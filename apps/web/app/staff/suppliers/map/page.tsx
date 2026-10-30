import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SupplierMapScreen } from "@/components/staff/pages/supplier-map";
import { graphServed } from "@/lib/server/graph-flag";

export const metadata: Metadata = { title: "Supplier map" };

// Only where core-api serves the supply graph (MUNIM_GRAPH, lib/server/graph-flag.ts); elsewhere this route does not exist.
export default function Page() {
  if (!graphServed()) notFound();
  return <Suspense fallback={<div className="min-h-[100dvh]" aria-busy="true" />}><SupplierMapScreen /></Suspense>;
}
