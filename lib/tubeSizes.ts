/**
 * Standard tube sizes from Arapoush's size chart: for each diameter, the lengths it is made in
 * and the nominal fill volume of each. Volumes are catalogue values, not π·r²·L — the shoulder
 * and crimp take ~30–50 mm of length that holds no product.
 */
export type TubeSize = { d: number; l: number; ml: number };

const chart: Record<number, [l: number, ml: number][]> = {
  19: [[50, 5], [65, 10], [84, 15], [102, 20]],
  25: [[65, 15], [76, 20], [85, 25], [96, 30], [105, 35], [115, 40], [135, 50]],
  30: [[80, 30], [85, 35], [95, 40], [110, 50], [124, 60], [142, 75], [149, 80]],
  35: [[82, 40], [90, 50], [100, 60], [120, 75], [125, 80], [137, 90], [147, 100]],
  40: [[85, 60], [98, 75], [102, 80], [110, 90], [120, 100], [136, 120], [146, 130], [154, 140], [164, 150], [184, 175]],
  // shortcut: 110/115/118/132 mm volumes were cut off in the chart screenshot; inferred from the Ø40 series. Confirm with Arapoush.
  50: [[95, 100], [105, 120], [110, 130], [115, 140], [118, 150], [132, 175], [147, 200], [160, 225], [176, 250], [186, 275], [198, 300]],
  60: [[140, 250], [148, 275], [155, 300], [165, 325], [175, 350], [185, 375]],
};

export const DIAMETERS = Object.keys(chart).map(Number);

export const sizesFor = (d: number): TubeSize[] => (chart[d] ?? []).map(([l, ml]) => ({ d, l, ml }));

export const ALL_SIZES = DIAMETERS.flatMap(sizesFor);

/** Every standard volume, ascending, each listed once. */
export const VOLUMES = [...new Set(ALL_SIZES.map((s) => s.ml))].sort((a, b) => a - b);

export const sizesWithVolume = (ml: number) => ALL_SIZES.filter((s) => s.ml === ml);

export const LENGTH_RANGE = { min: Math.min(...ALL_SIZES.map((s) => s.l)), max: Math.max(...ALL_SIZES.map((s) => s.l)) };

/** The size in `list` whose volume is closest to `ml` — keeps the result steady when the diameter changes. */
export const nearestByVolume = (list: TubeSize[], ml: number) =>
  list.reduce((best, s) => (Math.abs(s.ml - ml) < Math.abs(best.ml - ml) ? s : best), list[0]!);
