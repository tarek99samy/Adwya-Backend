/**
 * Delivery-fee resolution.
 *
 * DeliveryZone.areaPolygon holds a GeoJSON Polygon/MultiPolygon as text (the
 * schema is deliberately PostGIS-free for now). We match the delivery point
 * against those polygons in-process; when PostGIS lands this becomes a
 * ST_Contains query and this file goes away.
 */

export interface DeliveryZoneLike {
  id: string;
  name: string;
  areaPolygon: string | null;
  deliveryFee: unknown; // Prisma Decimal
}

export interface ResolvedZone {
  zoneId: string;
  zoneName: string;
  deliveryFee: number;
}

/** [longitude, latitude] pairs, per the GeoJSON axis order. */
type Ring = [number, number][];

/**
 * Picks the zone covering the delivery point.
 *
 * A zone with a null `areaPolygon` is a catch-all for its branch: it applies
 * when no polygon zone matches. That lets a pharmacy run a single flat fee
 * without drawing a map, which is how most will start.
 *
 * Returns null when the point falls outside every polygon and no catch-all
 * exists — the caller rejects the order as out of area.
 */
export function resolveDeliveryZone(
  zones: DeliveryZoneLike[],
  latitude: number,
  longitude: number,
): ResolvedZone | null {
  const polygonZones = zones.filter((zone) => zone.areaPolygon);
  const catchAll = zones.find((zone) => !zone.areaPolygon);

  // Cheapest matching polygon wins, so overlapping zones never overcharge.
  let best: ResolvedZone | null = null;

  for (const zone of polygonZones) {
    const rings = parseGeoJsonPolygon(zone.areaPolygon as string);
    if (!rings.some((ring) => pointInRing(longitude, latitude, ring))) {
      continue;
    }
    const fee = Number(zone.deliveryFee);
    if (!best || fee < best.deliveryFee) {
      best = { zoneId: zone.id, zoneName: zone.name, deliveryFee: fee };
    }
  }

  if (best) return best;

  if (catchAll) {
    return {
      zoneId: catchAll.id,
      zoneName: catchAll.name,
      deliveryFee: Number(catchAll.deliveryFee),
    };
  }

  return null;
}

/**
 * Pulls the outer rings out of a GeoJSON Polygon or MultiPolygon. Interior
 * rings (holes) are ignored — a pharmacy carving a hole out of its own
 * delivery area is not a case worth supporting before PostGIS.
 *
 * Malformed JSON yields no rings rather than throwing, so one bad zone row
 * cannot take down checkout for a whole branch.
 */
function parseGeoJsonPolygon(raw: string): Ring[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const geometry = (parsed as { geometry?: unknown }).geometry ?? parsed;
  const { type, coordinates } = (geometry ?? {}) as { type?: string; coordinates?: unknown };

  if (type === 'Polygon' && Array.isArray(coordinates)) {
    const outer = coordinates[0];
    return isRing(outer) ? [outer] : [];
  }

  if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
    return coordinates
      .map((polygon) => (Array.isArray(polygon) ? polygon[0] : undefined))
      .filter(isRing);
  }

  return [];
}

function isRing(value: unknown): value is Ring {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.every(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        typeof point[0] === 'number' &&
        typeof point[1] === 'number',
    )
  );
}

/**
 * Ray-casting point-in-polygon. Counts how many edges a ray cast east from the
 * point crosses; odd means inside.
 */
function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const straddles = yi > y !== yj > y;
    if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}
