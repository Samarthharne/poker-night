"use client";

import { useEffect, useState } from "react";

export function VideoSetupNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    void fetch("/api/video/config")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => {
        if (!d.configured) setShow(true);
      });
  }, []);
  if (!show) return null;
  return (
    <p className="px-4 pb-2 text-center text-[11px] text-white/35">
      Multi-user video uses LiveKit. Add LIVEKIT keys in `.env.local` to enable friend-to-friend
      streams. Your own camera preview works now.
    </p>
  );
}
