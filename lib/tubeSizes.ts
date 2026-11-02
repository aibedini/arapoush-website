import catalogue from "@/content/tube-catalogue.json";
import type { Catalogue } from "@/lib/configurator/model";

/** The configurator catalogue, typed. Edit content/tube-catalogue.json, not this file. */
export const tubeCatalogue = catalogue as Catalogue;

export type TubeSize = { d: number; l: number; ml: number };

const circular = tubeCatalogue.volumes.filter((v) => v.shape === "circular");

export const DIAMETERS = tubeCatalogue.shapes.circular.diameters;

export const sizesFor = (d: number): TubeSize[] => circular.filter((v) => v.d === d).map(({ d, l, ml }) => ({ d, l, ml }));

/** Every standard volume, ascending, each listed once. */
export const VOLUMES = [...new Set(circular.map((s) => s.ml))].sort((a, b) => a - b);
