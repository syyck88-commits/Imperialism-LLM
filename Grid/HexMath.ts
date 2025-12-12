/**
 * HexMath.ts
 * Pure mathematical functions for a Pointy-Topped Hexagonal Grid.
 * Uses Axial coordinates (q, r) as the primary storage format.
 * Implements conversions for Cube coordinates and Odd-R Offset coordinates.
 *
 * Reference: https://www.redblobgames.com/grids/hexagons/
 */

// --- Types ---

/**
 * Axial Coordinate
 * q = column/x axis (diagonal)
 * r = row/z axis
 * s is implicit (-q - r)
 */
export interface Hex {
  q: number;
  r: number;
}

/**
 * Cube Coordinate
 * Constraint: q + r + s = 0
 * Useful for algorithms (distance, line drawing, rotation)
 */
export interface CubeHex {
  q: number;
  r: number;
  s: number;
}

/**
 * Offset Coordinate (Odd-R)
 * Used for 2D array storage or rectangular display.
 * "Odd-R" means odd rows are shoved right by 1/2 hex width.
 */
export interface OffsetCoord {
  col: number;
  row: number;
}

// --- Constants ---

/**
 * Direction vectors for Pointy-Topped Hexes.
 * Order: E, SE, SW, W, NW, NE
 */
export const HEX_DIRECTIONS: Hex[] = [
  { q: 1, r: 0 },  // East
  { q: 0, r: 1 },  // South East
  { q: -1, r: 1 }, // South West
  { q: -1, r: 0 }, // West
  { q: 0, r: -1 }, // North West
  { q: 1, r: -1 }, // North East
];

// --- Conversions ---

/**
 * Converts Axial (q, r) to Cube (q, r, s)
 */
export const axialToCube = (hex: Hex): CubeHex => {
  return {
    q: hex.q,
    r: hex.r,
    s: -hex.q - hex.r,
  };
};

/**
 * Converts Cube (q, r, s) to Axial (q, r)
 */
export const cubeToAxial = (cube: CubeHex): Hex => {
  return {
    q: cube.q,
    r: cube.r,
  };
};

/**
 * Converts Odd-R Offset coordinates (col, row) to Axial (q, r).
 * Pointy-topped orientation.
 */
export const offsetToAxial = (offset: OffsetCoord): Hex => {
  // q = col - (row - (row&1)) / 2
  const q = offset.col - (offset.row - (offset.row & 1)) / 2;
  const r = offset.row;
  return { q, r };
};

/**
 * Converts Axial (q, r) to Odd-R Offset coordinates (col, row).
 * Pointy-topped orientation.
 */
export const axialToOffset = (hex: Hex): OffsetCoord => {
  // col = q + (r - (r&1)) / 2
  const col = hex.q + (hex.r - (hex.r & 1)) / 2;
  const row = hex.r;
  return { col, row };
};

// --- Algorithms ---

export const hexToString = (hex: Hex): string => {
  return `${hex.q},${hex.r}`;
};

/**
 * Calculates the Manhattan distance between two hexes.
 */
export const getHexDistance = (a: Hex, b: Hex): number => {
  const ac = axialToCube(a);
  const bc = axialToCube(b);
  return (Math.abs(ac.q - bc.q) + Math.abs(ac.r - bc.r) + Math.abs(ac.s - bc.s)) / 2;
};

/**
 * Returns all 6 immediate neighbors of a given hex.
 */
export const getHexNeighbors = (hex: Hex): Hex[] => {
  return HEX_DIRECTIONS.map((dir) => ({
    q: hex.q + dir.q,
    r: hex.r + dir.r,
  }));
};

/**
 * Returns all hexes within a given radius (inclusive of center).
 */
export const getHexRange = (center: Hex, radius: number): Hex[] => {
  const results: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (Math.abs(q + r) > radius) continue;
      results.push({ q: center.q + q, r: center.r + r });
    }
  }
  return results;
};

/**
 * Rounds floating point cube coordinates to the nearest valid hex.
 * Useful for pixel-to-hex picking logic.
 */
export const hexRound = (frac: CubeHex): Hex => {
  let q = Math.round(frac.q);
  let r = Math.round(frac.r);
  let s = Math.round(frac.s);

  const qDiff = Math.abs(q - frac.q);
  const rDiff = Math.abs(r - frac.r);
  const sDiff = Math.abs(s - frac.s);

  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s;
  } else if (rDiff > sDiff) {
    r = -q - s;
  } else {
    s = -q - r;
  }

  return { q, r };
};

/**
 * Checks if two hex coordinates refer to the same location.
 */
export const areHexesEqual = (a: Hex, b: Hex): boolean => {
  return a.q === b.q && a.r === b.r;
};