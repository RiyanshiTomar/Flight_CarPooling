"use client";

import { useRef } from "react";

/** Six boxes that behave like one field: auto-advance, backspace goes back, paste fills all, SMS autofill works. */
export function OtpInput({
  value,
  onChange,
  disabled,
  invalid,
  onComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  onComplete?: (v: string) => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  function set(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, 6);
    onChange(clean);
    if (clean.length === 6) onComplete?.(clean);
    return clean;
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid}
          autoFocus={i === 0}
          maxLength={i === 0 ? 6 : 1}
          className="input !h-14 !w-full !min-w-0 !px-0 text-center text-2xl font-bold"
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "");
            if (raw.length > 1) {
              // SMS autofill or paste into one box
              const v = set(raw);
              refs.current[Math.min(v.length, 5)]?.focus();
              return;
            }
            const arr = digits.slice();
            arr[i] = raw;
            set(arr.join(""));
            if (raw && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) {
              const arr = digits.slice();
              arr[i - 1] = "";
              set(arr.join(""));
              refs.current[i - 1]?.focus();
              e.preventDefault();
            }
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const v = set(e.clipboardData.getData("text"));
            refs.current[Math.min(v.length, 5)]?.focus();
          }}
        />
      ))}
    </div>
  );
}
