"use client";

import { useEffect, useState } from "react";

/**
 * Destructive buttons ask for a second tap: the first arms it (for 3 seconds),
 * the second runs the action. Returns [armed, onClick].
 */
export function useTapToConfirm(action: () => void): [boolean, () => void] {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return [armed, () => (armed ? action() : setArmed(true))];
}
