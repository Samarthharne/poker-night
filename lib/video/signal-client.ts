type VideoSignal = {
  from: string;
  description?: { type: RTCSdpType; sdp?: string };
  candidate?: RTCIceCandidateInit | null;
};

type Handler = (signal: VideoSignal) => void;

const handlers = new Set<Handler>();

export function onVideoSignal(handler: Handler) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function emitVideoSignal(signal: VideoSignal) {
  for (const handler of handlers) handler(signal);
}
