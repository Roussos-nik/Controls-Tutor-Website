"use client";

import { useEffect, useRef } from "react";
import { useControlsStore } from "@/lib/controlsStore";
import { encodeState, decodeState, readHash, writeHash } from "@/lib/urlState";

// ─────────────────────────────────────────────────────────────────────────────
// UrlStateSync — renders nothing. On mount it restores plant+controller config
// from the URL hash (if present); thereafter it writes a compact hash on every
// config change, debounced so a slider drag produces one URL update, not dozens.
// Drop <UrlStateSync /> once near the top of the page.
// ─────────────────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 250;

export default function UrlStateSync() {
  const restored = useRef(false);

  // 1) Restore from hash on first mount (client-only → no SSR mismatch).
  useEffect(() => {
    const h = readHash();
    if (h) {
      const decoded = decodeState(h);
      if (decoded) {
        useControlsStore.setState({
          plantConfig: decoded.plantConfig,
          controllerConfig: decoded.controllerConfig,
        });
      }
    }
    restored.current = true;
  }, []);

  // 2) Write to hash on change (debounced). Subscribing AFTER the restore
  //    effect means the restore itself doesn't trigger a redundant write.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useControlsStore.subscribe((state) => {
      if (!restored.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        writeHash(encodeState(state.plantConfig, state.controllerConfig));
      }, DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);

  return null;
}
