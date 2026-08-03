import { useRef, useState } from "react";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export default function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [speed, setSpeed] = useState(1);

  function setPlaybackRate(rate) {
    setSpeed(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }

  return (
    <div className="mt-2">
      <audio
        ref={audioRef}
        controls
        autoPlay
        src={src}
        className="w-full"
        onPlay={() => { if (audioRef.current) audioRef.current.playbackRate = speed; }}
      />
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="text-[10.5px] uppercase tracking-wide text-textMuted mr-0.5">Geschwindigkeit</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setPlaybackRate(s)}
            className={`px-2 py-0.5 rounded text-[10.5px] font-semibold border ${speed === s ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
