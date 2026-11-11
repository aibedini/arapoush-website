/** Client-safe helpers for content images (no server imports). */
export type Img = { src: string; width: number; height: number; alt?: string };

/** Finds an item by id, so content order can change without breaking the design's slots. */
export const byId = <T extends { id: string }>(list: T[] | undefined, id: string): T | undefined => list?.find((x) => x.id === id);
