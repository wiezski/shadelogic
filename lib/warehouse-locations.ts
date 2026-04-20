// ── Shared warehouse location helpers ───────────────────────
// Used by warehouse page, quote page, and settings.

export type WarehouseLocation = { name: string; notes: string };

export const DEFAULT_LOCATIONS: WarehouseLocation[] = [
  { name: "Warehouse", notes: "" },
  { name: "Garage", notes: "" },
  { name: "Shelf A", notes: "" },
  { name: "Shelf B", notes: "" },
  { name: "Shop", notes: "" },
  { name: "Truck", notes: "" },
];

export function getLocationNames(locations: WarehouseLocation[] | null | undefined): string[] {
  if (locations && locations.length > 0) return locations.map(l => l.name);
  return DEFAULT_LOCATIONS.map(l => l.name);
}

export function getLocationNote(locations: WarehouseLocation[] | null | undefined, name: string): string {
  if (!locations) return "";
  const loc = locations.find(l => l.name === name);
  return loc?.notes || "";
}
