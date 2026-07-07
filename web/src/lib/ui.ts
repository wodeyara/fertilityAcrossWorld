import type { CSSProperties } from "react";

/**
 * Shared style for a segmented toggle button (Scale / Views / mode).
 * Active buttons get a filled accent so the current selection is unmistakable;
 * the accent reads clearly against both light and dark backgrounds.
 */
export function toggleButtonStyle(active: boolean, extra?: CSSProperties): CSSProperties {
  return {
    padding: "4px 12px",
    borderRadius: 6,
    border: `1px solid ${active ? "#2563eb" : "rgba(128,128,128,0.4)"}`,
    background: active ? "#2563eb" : "transparent",
    color: active ? "#fff" : "inherit",
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    ...extra,
  };
}
