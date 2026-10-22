"use client";

import DeckGL from "@deck.gl/react";
import type { Layer, MapViewState, PickingInfo } from "@deck.gl/core";
import type { StyleSpecification } from "maplibre-gl";
import { useEffect, useState } from "react";
import Map from "react-map-gl/maplibre";
import { nonstopStyle } from "@/lib/mapStyle";

export const US_VIEW: MapViewState = { longitude: -97, latitude: 37.6, zoom: 3.75, pitch: 42, bearing: -8 };

type Props = {
  layers: Layer[];
  initialView?: MapViewState;   // remount (change `key`) to fly somewhere new
  tooltip?: (info: PickingInfo) => string | null;
  interactive?: boolean;        // false: a still "window" (landing page), so page scrolling is not captured
  vignette?: boolean;
};

export default function MapCanvas({ layers, initialView, tooltip, interactive = true, vignette = true }: Props) {
  const [style, setStyle] = useState<StyleSpecification | null>(null);
  useEffect(() => {
    nonstopStyle().then(setStyle).catch(() => null);
  }, []);

  return (
    <div className="absolute inset-0 bg-[#04070e]">
      <DeckGL
        layers={layers}
        initialViewState={initialView ?? US_VIEW}
        controller={interactive ? { dragRotate: true, inertia: 300 } : false}
        getTooltip={(info) => {
          const text = tooltip?.(info);
          return text
            ? { text, style: { background: "rgba(10,16,30,0.96)", color: "#e7ecf5", border: "1px solid #1e2a44", borderRadius: "10px", fontSize: "12px", lineHeight: "1.5", padding: "8px 12px", fontFamily: "var(--font-sans)" } }
            : null;
        }}
      >
        {style && <Map mapStyle={style} attributionControl={{ compact: true }} />}
      </DeckGL>
      {/* Vignette: pulls the eye to the centre and hides the map's hard edges. */}
      {vignette && <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_160px_60px_rgba(4,7,14,0.85)]" />}
    </div>
  );
}
