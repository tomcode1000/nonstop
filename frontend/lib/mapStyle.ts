import type { StyleSpecification } from "maplibre-gl";

/**
 * "Nonstop Night": our own map style, built at runtime from CARTO's free vector tiles (OpenStreetMap
 * data). Roads, buildings and land use are dropped; water goes ink-dark, land slate, and coastlines and
 * borders get a faint cyan glow so routes and Qloo taste stay the focus.
 */
const SOURCE = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

const LAND = "#0b1322";
const WATER = "#04070e";
const KEEP = new Set(["background", "water", "boundary_state", "boundary_country_inner"]);

let cached: Promise<StyleSpecification> | null = null;

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
          layers.push({ id: "coast-glow", type: "line", source: src, "source-layer": "water",
            paint: { "line-color": "rgba(61, 214, 245, 0.10)", "line-width": 4, "line-blur": 3 } });
          layers.push({ id: "coast", type: "line", source: src, "source-layer": "water",
            paint: { "line-color": "rgba(120, 200, 230, 0.32)", "line-width": 0.7 } });
        } else if (layer.id === "boundary_state") {
          layers.push({ ...layer, minzoom: 2, paint: { "line-color": "rgba(120, 170, 210, 0.16)", "line-width": 0.6, "line-dasharray": [3, 2] } } as typeof layer);
        } else {
          layers.push({ ...layer, paint: { "line-color": "rgba(140, 190, 230, 0.35)", "line-width": 0.9 } } as typeof layer);
        }
      }
      return { ...base, layers };
    });
  return cached;
}
