import type { InputHTMLAttributes, LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-xs uppercase tracking-[0.18em] text-gold/80", className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-base text-white placeholder:text-white/35 outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20",
        className,
      )}
      {...props}
    />
  );
}
