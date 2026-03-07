"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { type SlashCommandItem } from "./SlashCommandExtension";

interface Props {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

const SlashMenu = forwardRef<{ onKeyDown: (e: { event: KeyboardEvent }) => boolean }, Props>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }: { event: KeyboardEvent }) {
        if (event.key === "ArrowUp") {
          setSelected((s) => (s - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          command(items[selected]);
          return true;
        }
        return false;
      },
    }));

    if (!items.length) return null;

    return (
      <div className="slash-menu">
        {items.map((item, i) => (
          <button
            key={item.title}
            className={`slash-menu-item w-full text-left ${i === selected ? "is-selected" : ""}`}
            onMouseEnter={() => setSelected(i)}
            onClick={() => command(item)}
          >
            <span className="slash-menu-item-icon font-mono text-xs text-[var(--text-muted)]">
              {item.icon}
            </span>
            <span className="flex flex-col">
              <span className="text-[var(--text)] text-sm leading-tight">{item.title}</span>
              <span className="text-[var(--text-muted)] text-xs leading-tight">{item.description}</span>
            </span>
          </button>
        ))}
      </div>
    );
  }
);

SlashMenu.displayName = "SlashMenu";
export default SlashMenu;
