"use client";

import DeckGL from "@deck.gl/react";
import type { Layer, MapViewState, PickingInfo } from "@deck.gl/core";
import type { StyleSpecification } from "maplibre-gl";
import { useEffect, useState } from "react";
import Map from "react-map-gl/maplibre";
import { chartStyle, nonstopStyle } from "@/lib/mapStyle";

export const US_VIEW: MapViewState = { longitude: -97, latitude: 37.6, zoom: 3.75, pitch: 42, bearing: -8 };

type Props = {
  layers: Layer[];
  initialView?: MapViewState;   // remount (change `key`) to fly somewhere new
  tooltip?: (info: PickingInfo) => string | null;
  interactive?: boolean;        // false: a still "window" (landing page), so page scrolling is not captured
  vignette?: boolean;
  theme?: "night" | "chart";    // chart = light, paper-coloured map that blends into the landing page
};

export default function MapCanvas({ layers, initialView, tooltip, interactive = true, vignette = true, theme = "chart" }: Props) {
  const [style, setStyle] = useState<StyleSpecification | null>(null);
  useEffect(() => {
    (theme === "chart" ? chartStyle() : nonstopStyle()).then(setStyle).catch(() => null);
  }, [theme]);

  return (
    <div className={`absolute inset-0 ${theme === "chart" ? "bg-[var(--paper)] chart-map" : "bg-[#04070e]"}`}>
      <DeckGL
        layers={layers}
        initialViewState={initialView ?? US_VIEW}
        controller={interactive ? { dragRotate: true, inertia: 300 } : false}
        getTooltip={(info) => {
          const text = tooltip?.(info);
          return text
            ? { text, style: { background: "rgba(255,255,255,0.97)", color: "#0b1626", border: "1px solid #e2dccd", boxShadow: "0 12px 30px -16px rgba(11,22,38,0.4)", borderRadius: "10px", fontSize: "12px", lineHeight: "1.5", padding: "8px 12px", fontFamily: "var(--font-sans)" } }
            : null;
        }}
      >
        {style && <Map mapStyle={style} attributionControl={{ compact: true }} />}
      </DeckGL>
      {/* Vignette: pulls the eye to the centre and hides the map's hard edges. */}
      {vignette && <div className={`pointer-events-none absolute inset-0 ${theme === "chart" ? "shadow-[inset_0_0_140px_40px_rgba(244,241,232,0.95)]" : "shadow-[inset_0_0_160px_60px_rgba(4,7,14,0.85)]"}`} />}
    </div>
  );
}
