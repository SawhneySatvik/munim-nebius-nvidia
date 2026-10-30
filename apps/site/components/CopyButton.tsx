"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => setState("done"),
          () => setState("failed"),
        );
        setTimeout(() => setState("idle"), 1600);
      }}
    >
      <span aria-live="polite">{state === "done" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}</span>
    </button>
  );
}
