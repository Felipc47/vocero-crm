"use client";

import { cn } from "@/lib/utils";

/** Switch del mock SEOMOS: track redondo con thumb blanco deslizante. */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  size = "md",
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  "aria-label"?: string;
}) {
  const track =
    size === "md" ? "h-[30px] w-[52px]" : "h-[26px] w-[46px]";
  const thumb = size === "md" ? "h-6 w-6" : "h-5 w-5";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex shrink-0 items-center rounded-full p-[3px] transition-all duration-200",
        track,
        checked ? "justify-end bg-brand" : "justify-start bg-border-strong",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn("rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.3)]", thumb)}
      />
    </button>
  );
}
