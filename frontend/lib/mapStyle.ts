import type { StyleSpecification } from "maplibre-gl";

/**
 * "Nonstop Night": our own map style, built at runtime from CARTO's free vector tiles (OpenStreetMap
 * data). Roads, buildings and land use are dropped; black water, near-black land, and hairline grey
 * coastlines and borders, so routes and Qloo taste are the only colour on screen.
 */
const SOURCE = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

const LAND = "#0c0c0d";
const WATER = "#000000";
const KEEP = new Set(["background", "water", "boundary_state", "boundary_country_inner"]);

let cached: Promise<StyleSpecification> | null = null;
let cachedChart: Promise<StyleSpecification> | null = null;

/**
 * "Chart": the light variant for the landing page. Land is the page's own paper colour so the map melts
 * into the background; water is a pale chart tint; coastlines and borders are thin ink lines, like a
 * printed aeronautical chart.
 */
export function chartStyle(): Promise<StyleSpecification> {
  cachedChart ??= fetch(SOURCE)
    .then((r) => r.json() as Promise<StyleSpecification>)
    .then((base) => {
      const src = Object.keys(base.sources)[0];
      const layers: StyleSpecification["layers"] = [];
      for (const layer of base.layers) {
        if (!KEEP.has(layer.id)) continue;
        if (layer.id === "background") {
          layers.push({ ...layer, type: "background", paint: { "background-color": "#f4f1e8" } });
        } else if (layer.id === "water") {
          layers.push({ ...layer, type: "fill", paint: { "fill-color": "#e4e6df", "fill-antialias": true } } as typeof layer);
          layers.push({ id: "coast", type: "line", source: src, "source-layer": "water",
            paint: { "line-color": "rgba(11, 22, 38, 0.32)", "line-width": 0.8 } });
        } else if (layer.id === "boundary_state") {
          layers.push({ ...layer, minzoom: 2, paint: { "line-color": "rgba(11, 22, 38, 0.13)", "line-width": 0.7, "line-dasharray": [3, 2] } } as typeof layer);
        } else {
          layers.push({ ...layer, paint: { "line-color": "rgba(11, 22, 38, 0.35)", "line-width": 1 } } as typeof layer);
        }
      }
      return { ...base, layers };
    });
  return cachedChart;
}

export function nonstopStyle(): Promise<StyleSpecification> {
  cached ??= fetch(SOURCE)
    .then((r) => r.json() as Promise<StyleSpecification>)
    .then((base) => {
      const src = Object.keys(base.sources)[0];
      const layers: StyleSpecification["layers"] = [];
      for (const layer of base.layers) {
        if (!KEEP.has(layer.id)) continue;
        if (layer.id === "background") {
          layers.push({ ...layer, type: "background", paint: { "background-color": LAND } });
        } else if (layer.id === "water") {
          layers.push({ ...layer, type: "fill", paint: { "fill-color": WATER, "fill-antialias": true } } as typeof layer);
          // Coastline glow: two strokes along the water polygons, a soft wide one and a crisp thin one.
          layers.push({ id: "coast", type: "line", source: src, "source-layer": "water",
            paint: { "line-color": "rgba(255, 255, 255, 0.20)", "line-width": 0.6 } });
        } else if (layer.id === "boundary_state") {
          layers.push({ ...layer, minzoom: 2, paint: { "line-color": "rgba(255, 255, 255, 0.07)", "line-width": 0.6, "line-dasharray": [3, 2] } } as typeof layer);
        } else {
          layers.push({ ...layer, paint: { "line-color": "rgba(255, 255, 255, 0.24)", "line-width": 0.8 } } as typeof layer);
        }
      }
      return { ...base, layers };
    });
  return cached;
}
