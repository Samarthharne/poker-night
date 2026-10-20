"use client";

import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/sheet";
import { toast } from "sonner";

export function InviteModal({
  open,
  onClose,
  code,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
}) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : `/room/${code}`;

  async function share() {
    if (navigator.share) {
      await navigator.share({
        title: "Poker Night",
        text: "Join our private play-money poker room.",
        url,
      });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  }

  return (
    <BottomSheet open={open} title="Invite your friends" onClose={onClose}>
      <p className="mb-3 text-sm text-white/70">
        Room {code}. Share this link — no account required.
      </p>
      <p className="mb-4 break-all rounded-xl bg-black/40 p-3 text-sm">{url}</p>
      <div className="grid gap-2">
        <Button onClick={share}>Copy / Share invite link</Button>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </BottomSheet>
  );
}
