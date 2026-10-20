"use client";

export function VideoPlayer({
  stream,
  enabled,
  cameraEnabled,
  cameraOn,
  muted = true,
  label,
  name,
}: {
  stream?: MediaStream | null;
  enabled?: boolean;
  cameraEnabled?: boolean;
  cameraOn?: boolean;
  muted?: boolean;
  label?: string;
  name?: string;
}) {
  const active = enabled ?? cameraEnabled ?? cameraOn ?? Boolean(stream);
  const title = label ?? name;
  return (
    <video
      className="h-full w-full object-cover"
      autoPlay
      playsInline
      muted={muted}
      aria-label={title}
      ref={(node) => {
        if (!node) return;
        if (active && stream && node.srcObject !== stream) {
          node.srcObject = stream;
          node.muted = muted;
          void node.play().catch(() => {
            node.muted = true;
            void node.play().catch(() => undefined);
          });
        }
        if (!active) node.srcObject = null;
      }}
    />
  );
}
