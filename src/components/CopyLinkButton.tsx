"use client";

import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CopyLinkButton — copies the current URL (including the state hash) to the
// clipboard, with a brief "Copied!" confirmation. The hash is kept up to date
// by UrlStateSync, so the copied link restores the exact plant + controller.
// ─────────────────────────────────────────────────────────────────────────────

export default function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (e.g. insecure context); select-fallback.
      const ok = window.prompt("Copy this link:", window.location.href);
      void ok;
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      {copied ? (
        <>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2.5 7l3 3 5-6.5" stroke="#16a34a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-emerald-600">Copied!</span>
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M5 8.5a2.5 2.5 0 010-3.5l2-2a2.5 2.5 0 013.5 3.5l-1 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M8 4.5a2.5 2.5 0 010 3.5l-2 2a2.5 2.5 0 01-3.5-3.5l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Copy Link
        </>
      )}
    </button>
  );
}
