"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 md:items-center md:p-6">
      <button className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 max-h-[82vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-[#12161a] p-4 pb-[calc(1rem+var(--safe-bottom))] md:max-w-md md:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/5"
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
