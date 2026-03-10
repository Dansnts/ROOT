"use client";

import { useEffect, useState } from "react";
import { LS_KEYS } from "@/lib/constants";

export type Theme  = "dark" | "light";
export type Accent = "vert" | "bleu" | "violet" | "rose" | "ambre" | "ciel";

export const ACCENTS: { id: Accent; label: string; dark: string; light: string }[] = [
  { id: "vert",   label: "Émeraude", dark: "#4ade80", light: "#16a34a" },
  { id: "bleu",   label: "Océan",    dark: "#60a5fa", light: "#2563eb" },
  { id: "violet", label: "Violet",   dark: "#a78bfa", light: "#7c3aed" },
  { id: "rose",   label: "Rose",     dark: "#fb7185", light: "#e11d48" },
  { id: "ambre",  label: "Ambre",    dark: "#fbbf24", light: "#d97706" },
  { id: "ciel",   label: "Ciel",     dark: "#22d3ee", light: "#0891b2" },
];

const LS_ACCENT = "root-accent";

function applyAccent(a: Accent) {
  document.documentElement.setAttribute("data-accent", a);
}

export function useTheme() {
  const [theme,  setThemeState]  = useState<Theme>("dark");
  const [accent, setAccentState] = useState<Accent>("vert");

  useEffect(() => {
    const storedTheme  = (localStorage.getItem(LS_KEYS.theme)  as Theme  | null) ?? "dark";
    const storedAccent = (localStorage.getItem(LS_ACCENT)       as Accent | null) ?? "vert";
    setThemeState(storedTheme);
    setAccentState(storedAccent);
    document.documentElement.setAttribute("data-theme", storedTheme);
    applyAccent(storedAccent);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem(LS_KEYS.theme, t);
  }

  function setAccent(a: Accent) {
    setAccentState(a);
    applyAccent(a);
    localStorage.setItem(LS_ACCENT, a);
  }

  function toggle() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return { theme, toggle, accent, setAccent };
}
