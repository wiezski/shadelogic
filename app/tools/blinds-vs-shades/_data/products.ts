import type { ProductId } from "../_types";

export const PRODUCT_NAMES: Record<ProductId, string> = {
  wood_blinds: "Wood 2-inch horizontal blinds",
  faux_blinds: "Faux-wood 2-inch horizontal blinds",
  vertical_blinds: "Vertical blinds",
  shutters: "Plantation shutters",
  cellular: "Cellular shade",
  vertical_cellular: "Vertical cellular shade",
  roller: "Roller shade",
  screen: "Screen / solar shade",
  roman: "Roman shade",
  woven: "Woven wood / natural shade",
  zebra: "Dual / zebra / banded shade",
  panel_track: "Panel-track shade",
  drapery: "Drapery",
};

export const ALL_PRODUCTS: ReadonlyArray<ProductId> = [
  "wood_blinds",
  "faux_blinds",
  "vertical_blinds",
  "shutters",
  "cellular",
  "vertical_cellular",
  "roller",
  "screen",
  "roman",
  "woven",
  "zebra",
  "panel_track",
  "drapery",
];
