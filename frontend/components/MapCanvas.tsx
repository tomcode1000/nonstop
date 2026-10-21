"use client";

import DeckGL from "@deck.gl/react";
import type { Layer, MapViewState, PickingInfo } from "@deck.gl/core";
import Map from "react-map-gl/maplibre";

// Free CARTO basemap, no labels so routes and taste stay the focus.
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

export const US_VIEW: MapViewState = { longitude: -96.5, latitude: 38.5, zoom: 3.6, pitch: 35, bearing: 0 };

type Props = {
  layers: Layer[];
  initialView?: MapViewState;   // remount (change `key`) to fly somewhere new
  tooltip?: (info: PickingInfo) => string | null;
};

export default function MapCanvas({ layers, initialView, tooltip }: Props) {
  return (
    <DeckGL
      layers={layers}
      initialViewState={initialView ?? US_VIEW}
      controller={{ dragRotate: true }}
      getTooltip={(info) => {
        const text = tooltip?.(info);
        return text
          ? { text, style: { background: "#0d1424", color: "#e7ecf5", border: "1px solid #1e2a44", borderRadius: "8px", fontSize: "12px", padding: "8px 10px" } }
          : null;
      }}
    >
      <Map mapStyle={STYLE} attributionControl={{ compact: true }} />
    </DeckGL>
  );
}
