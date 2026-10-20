"use client";

import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-wide transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold min-h-11 px-4",
  {
    variants: {
      variant: {
        gold: "bg-gradient-to-b from-gold-bright to-gold text-ink shadow-[0_8px_24px_rgba(212,177,90,0.25)]",
        burgundy: "bg-burgundy text-white shadow-lg",
        ghost: "bg-white/5 text-white hover:bg-white/10 border border-white/10",
        outline: "border border-gold/40 text-gold-bright hover:bg-gold/10",
        danger: "bg-[#5c1220] text-white hover:bg-[#7a1d2c]",
        felt: "bg-[#0e3b26] text-white border border-emerald-400/20 hover:bg-[#145c3a]",
      },
      size: {
        sm: "min-h-10 text-sm px-3",
        md: "min-h-11 text-sm",
        lg: "min-h-12 text-base px-6",
      },
    },
    defaultVariants: { variant: "gold", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
