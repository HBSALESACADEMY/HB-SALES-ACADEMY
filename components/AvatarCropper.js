import { useEffect, useRef, useState } from "react";

const BOX = 260; // Vorschau-Container in px (quadratisch, wird als Kreis maskiert)
const OUTPUT = 480; // Export-Auflösung in px

export default function AvatarCropper({ file, onCancel, onCropped }) {
  const imgRef = useRef(null);
  const [imgSize, setImgSize] = useState(null); // { natW, natH, baseScale }
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [src, setSrc] = useState(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onImgLoad(e) {
    const natW = e.target.naturalWidth;
    const natH = e.target.naturalHeight;
    const baseScale = BOX / Math.min(natW, natH);
    setImgSize({ natW, natH, baseScale });
    setZoom(1);
    setPos({ x: 0, y: 0 });
  }

  function startDrag(clientX, clientY) {
    dragRef.current = { startX: clientX, startY: clientY, origX: pos.x, origY: pos.y };
  }
  function moveDrag(clientX, clientY) {
    if (!dragRef.current) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }
  function endDrag() { dragRef.current = null; }

  async function confirmCrop() {
    if (!imgSize) return;
    setSaving(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    const drawScaleFactor = OUTPUT / BOX;

    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(OUTPUT / 2, OUTPUT / 2);
    ctx.translate(pos.x * drawScaleFactor, pos.y * drawScaleFactor);
    ctx.scale(zoom, zoom);
    const renderW = imgSize.natW * imgSize.baseScale * drawScaleFactor;
    const renderH = imgSize.natH * imgSize.baseScale * drawScaleFactor;
    ctx.drawImage(imgRef.current, -renderW / 2, -renderH / 2, renderW, renderH);
    ctx.restore();

    canvas.toBlob((blob) => {
      setSaving(false);
      if (blob) onCropped(blob);
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4" onMouseUp={endDrag} onMouseLeave={endDrag}>
      <div className="card max-w-sm w-full">
        <div className="font-display font-semibold text-white mb-1">Profilbild zuschneiden</div>
        <p className="text-xs text-textMuted mb-4">Ziehen zum Verschieben, Regler zum Zoomen.</p>

        <div
          className="mx-auto rounded-full overflow-hidden relative select-none"
          style={{ width: BOX, height: BOX, background: "var(--org-bg, #0A0C13)", cursor: "grab", border: "2px solid var(--org-line, #262B3D)" }}
          onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
          onMouseMove={(e) => e.buttons === 1 && moveDrag(e.clientX, e.clientY)}
          onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={endDrag}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt=""
              onLoad={onImgLoad}
              draggable={false}
              style={imgSize ? {
                position: "absolute", top: "50%", left: "50%",
                width: imgSize.natW * imgSize.baseScale,
                height: imgSize.natH * imgSize.baseScale,
                transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                pointerEvents: "none",
              } : { display: "none" }}
            />
          )}
        </div>

        <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="w-full mt-4" disabled={!imgSize} />

        <div className="flex items-center gap-2 mt-4">
          <button onClick={onCancel} className="btn-ghost text-xs flex-1">Abbrechen</button>
          <button onClick={confirmCrop} disabled={!imgSize || saving} className="btn text-xs flex-1 justify-center disabled:opacity-40">
            {saving ? "Speichert..." : "Übernehmen"}
          </button>
        </div>
      </div>
    </div>
  );
}
