import { stageTint } from "@/lib/stage-colors";
import { cn } from "@/lib/utils";

/** Píldora de etapa del mock: fondo tintado + dot + texto del color de la etapa. */
export function StageTag({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-extrabold",
        className
      )}
      style={{ background: stageTint(color), color }}
    >
      <span
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ background: color }}
      />
      {name}
    </span>
  );
}
