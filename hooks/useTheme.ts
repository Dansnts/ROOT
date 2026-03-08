"use client";

import { useEffect, useState } from "react";
import { LS_KEYS } from "@/lib/constants";

export type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = (localStorage.getItem(LS_KEYS.theme) as Theme | null) ?? "dark";
    setThemeState(stored);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem(LS_KEYS.theme, t);
  }

  function toggle() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return { theme, toggle };
}
