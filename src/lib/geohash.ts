import geohash from "ngeohash";

export function encodeGeohash(lat: number, lng: number, precision = 7) {
  return geohash.encode(lat, lng, precision);
}

export type BBox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export function bboxFromCenter(lat: number, lng: number, radiusKm: number): BBox {
  const R = 6371; // km
  const dLat = (radiusKm / R) * (180 / Math.PI);
  const dLng = (radiusKm / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

export function geohashRangesForBBox(b: BBox, precision = 7) {
  // split bbox into a small grid and encode each corner; de-dup
  const steps = 4;
  const latStep = (b.maxLat - b.minLat) / steps;
  const lngStep = (b.maxLng - b.minLng) / steps;
  const set = new Set<string>();
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const lat = b.minLat + i * latStep;
      const lng = b.minLng + j * lngStep;
      set.add(encodeGeohash(lat, lng, precision));
    }
  }
  return Array.from(set);
}
