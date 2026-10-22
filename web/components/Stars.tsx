"use client";

import { Icon } from "./Icon";

const WORDS = ["", "Poor", "Not great", "Okay", "Good", "Great"];

/** 1-5 star picker that works with keyboard (it is a radio group). */
export function StarPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label={label} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => onChange(n)}
            className={`rounded-lg p-1 transition ${n <= value ? "text-sun" : "text-line hover:text-sun/60"}`}
          >
            <Icon name="star" size={28} filled />
          </button>
        ))}
      </div>
      <span className="text-sm font-semibold text-muted">{WORDS[value]}</span>
    </div>
  );
}
