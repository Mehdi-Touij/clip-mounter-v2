import { cn } from "@/lib/utils";

type Tone = "green" | "blue" | "amber" | "red" | "violet" | "muted";

const TONES: Record<Tone, string> = {
  green: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  blue: "bg-blue-500/12 text-blue-600 dark:text-blue-400 ring-blue-500/20",
  amber: "bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-amber-500/20",
  red: "bg-red-500/12 text-red-600 dark:text-red-400 ring-red-500/20",
  violet: "bg-primary/12 text-primary ring-primary/20",
  muted: "bg-muted text-muted-foreground ring-border",
};

const DOTS: Record<Tone, string> = {
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  violet: "bg-primary",
  muted: "bg-muted-foreground/60",
};

export function StatusPill({
  tone,
  children,
  pulse,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[tone], pulse && "animate-pulse")} />
      {children}
    </span>
  );
}
