"use client";

import { useEffect, useState } from "react";

export type LonLat = [number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in km. */
export function km(a: LonLat, b: LonLat) {
  const [lo1, la1, lo2, la2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])];
  const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * A flight path: `n` points along the great circle from a to b, lifted into a 3D arc (metres) whose
 * height grows with distance. The same path feeds both the route line and the animated "comet", so
 * they always line up.
 */
export function flightPath(a: LonLat, b: LonLat, n = 48): [number, number, number][] {
  const [lo1, la1, lo2, la2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  const peak = Math.min(260_000, 70 * km(a, b)); // metres
  const out: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = d === 0 ? 1 - f : Math.sin((1 - f) * d) / Math.sin(d);
    const B = d === 0 ? f : Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    out.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.sqrt(x * x + y * y))), peak * Math.sin(Math.PI * f)]);
  }
  return out;
}

/** Timestamps 0..duration along a path, offset so many comets don't launch in lockstep. */
export function timestamps(n: number, duration: number, offset: number) {
  return Array.from({ length: n + 1 }, (_, i) => offset + (i / n) * duration);
}

/** A clock for deck.gl TripsLayer: loops from 0 to `loop`, `speed` units per second. Pauses when hidden. */
export function useLoopClock(loop: number, speed = 20) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setT((v) => (v + ((now - last) / 1000) * speed) % loop);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [loop, speed]);
  return t;
}
