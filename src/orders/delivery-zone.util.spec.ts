import { resolveDeliveryZone } from './delivery-zone.util';

/** A square around central Cairo, in GeoJSON [lng, lat] order. */
const CAIRO_SQUARE = JSON.stringify({
  type: 'Polygon',
  coordinates: [
    [
      [31.2, 30.0],
      [31.3, 30.0],
      [31.3, 30.1],
      [31.2, 30.1],
      [31.2, 30.0],
    ],
  ],
});

/** A disjoint square well to the east. */
const FAR_SQUARE = JSON.stringify({
  type: 'Polygon',
  coordinates: [
    [
      [32.0, 30.0],
      [32.1, 30.0],
      [32.1, 30.1],
      [32.0, 30.1],
      [32.0, 30.0],
    ],
  ],
});

const zone = (id: string, areaPolygon: string | null, deliveryFee: number) => ({
  id,
  name: `zone-${id}`,
  areaPolygon,
  deliveryFee,
});

describe('resolveDeliveryZone', () => {
  it('matches a point inside the polygon', () => {
    const result = resolveDeliveryZone([zone('a', CAIRO_SQUARE, 25)], 30.05, 31.25);
    expect(result).toEqual({ zoneId: 'a', zoneName: 'zone-a', deliveryFee: 25 });
  });

  it('returns null when the point is outside every polygon and there is no catch-all', () => {
    expect(resolveDeliveryZone([zone('a', CAIRO_SQUARE, 25)], 30.05, 32.05)).toBeNull();
  });

  it('falls back to the catch-all zone when no polygon matches', () => {
    const zones = [zone('a', CAIRO_SQUARE, 25), zone('flat', null, 40)];
    expect(resolveDeliveryZone(zones, 30.05, 32.05)).toEqual({
      zoneId: 'flat',
      zoneName: 'zone-flat',
      deliveryFee: 40,
    });
  });

  it('prefers a matching polygon over the catch-all', () => {
    const zones = [zone('a', CAIRO_SQUARE, 25), zone('flat', null, 40)];
    expect(resolveDeliveryZone(zones, 30.05, 31.25)?.deliveryFee).toBe(25);
  });

  it('picks the cheapest zone when polygons overlap', () => {
    const zones = [zone('pricey', CAIRO_SQUARE, 50), zone('cheap', CAIRO_SQUARE, 15)];
    expect(resolveDeliveryZone(zones, 30.05, 31.25)?.zoneId).toBe('cheap');
  });

  it('reads [lng, lat] order, not [lat, lng]', () => {
    // Swapping the arguments must fall outside the Cairo square.
    expect(resolveDeliveryZone([zone('a', CAIRO_SQUARE, 25)], 31.25, 30.05)).toBeNull();
  });

  it('treats a point outside as outside even when other zones exist', () => {
    const zones = [zone('a', CAIRO_SQUARE, 25), zone('b', FAR_SQUARE, 30)];
    expect(resolveDeliveryZone(zones, 30.05, 31.55)).toBeNull();
    expect(resolveDeliveryZone(zones, 30.05, 32.05)?.zoneId).toBe('b');
  });

  it('ignores a zone whose polygon is malformed rather than throwing', () => {
    const zones = [zone('broken', '{not json', 10), zone('good', CAIRO_SQUARE, 25)];
    expect(resolveDeliveryZone(zones, 30.05, 31.25)?.zoneId).toBe('good');
  });

  it('accepts a MultiPolygon', () => {
    const multi = JSON.stringify({
      type: 'MultiPolygon',
      coordinates: [
        JSON.parse(CAIRO_SQUARE).coordinates,
        JSON.parse(FAR_SQUARE).coordinates,
      ],
    });
    expect(resolveDeliveryZone([zone('m', multi, 20)], 30.05, 31.25)?.zoneId).toBe('m');
    expect(resolveDeliveryZone([zone('m', multi, 20)], 30.05, 32.05)?.zoneId).toBe('m');
    expect(resolveDeliveryZone([zone('m', multi, 20)], 30.05, 31.55)).toBeNull();
  });

  it('accepts a wrapping GeoJSON Feature', () => {
    const feature = JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: JSON.parse(CAIRO_SQUARE),
    });
    expect(resolveDeliveryZone([zone('f', feature, 12)], 30.05, 31.25)?.deliveryFee).toBe(12);
  });

  it('returns null when a branch has no zones configured at all', () => {
    expect(resolveDeliveryZone([], 30.05, 31.25)).toBeNull();
  });
});
