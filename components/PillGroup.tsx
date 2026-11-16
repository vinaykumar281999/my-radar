"use client";

import { cn } from "@/lib/utils";

type PillGroupProps<T extends string> = {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  renderOption?: (option: T) => React.ReactNode;
};

/** Single-select row of tappable pills (radio group semantics). */
export function PillGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  renderOption,
}: PillGroupProps<T>) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-muted-foreground">{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              {renderOption ? renderOption(option) : option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
