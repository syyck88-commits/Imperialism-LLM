
import { Hex, axialToOffset, offsetToAxial, getHexNeighbors, hexToString, getHexDistance } from './HexMath';

// --- Enums for Map Layers ---

export enum TerrainType {
  WATER = 0,
  PLAINS = 1,
  FOREST = 2,
  HILLS = 3,
  MOUNTAIN = 4,
  DESERT = 5,
  SWAMP = 6,
  TUNDRA = 7
}

export enum ResourceType {
  NONE = 0,
  // Raw
  WHEAT = 1,
  WOOD = 2,
  COAL = 3,
  IRON = 4,
  GOLD = 5,
  WOOL = 6,
  COTTON = 7,
  FRUIT = 8,
  OIL = 9,
  SPICE = 10,
  GEMS = 11,
  MEAT = 12, // Livestock
  FISH = 13,
  
  // Manufactured
  LUMBER = 20,
  STEEL = 21,
  FURNITURE = 22,
  FABRIC = 23,
  CLOTHING = 24,
  ARMAMENTS = 25,
  PAPER = 26,
  CANNED_FOOD = 27
}

export enum ImprovementType {
  NONE = 0,
  FARM = 1,
  MINE = 2,
  ROAD = 3,
  RAILROAD = 4,
  CITY = 5,
  LUMBER_MILL = 6,
  RANCH = 7,
  PLANTATION = 8,
  OIL_WELL = 9,
  DEPOT = 10,
  PORT = 11
}

// --- Interfaces ---

export interface TileData {
  terrain: TerrainType;
  resource: ResourceType;
  improvement: ImprovementType;
  improvementLevel: number; // 0=None, 1=Basic, 2=Advanced, 3=Expert
  owner: number; // 0 = Nature/None, >0 = Player IDs
  isHidden: boolean; // For Prospectors (resource exists but hidden)
  isProspected: boolean; // Has a prospector checked this tile?
}

// Event types
export type TileChangeListener = (q: number, r: number, data: Partial<TileData>) => void;

/**
 * GameMap
 * Handles the game world data using flat arrays for performance.
 */
export class GameMap {
  public readonly width: number;
  public readonly height: number;
  public readonly size: number;

  // Data Layers
  private terrain: Uint8Array;
  private resource: Uint8Array;
  private improvement: Uint8Array;
  private improvementLevel: Uint8Array;
  private owner: Uint8Array;
  private isHidden: Uint8Array; // Separate array for booleans (0/1)
  private isProspected: Uint8Array; // 0/1

  private listeners: TileChangeListener[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.size = width * height;

    // Initialize arrays
    this.terrain = new Uint8Array(this.size);
    this.resource = new Uint8Array(this.size);
    this.improvement = new Uint8Array(this.size);
    this.improvementLevel = new Uint8Array(this.size);
    this.owner = new Uint8Array(this.size);
    this.isHidden = new Uint8Array(this.size);
    this.isProspected = new Uint8Array(this.size);

    this.generateMap();
  }

  public onTileChanged(callback: TileChangeListener) {
      this.listeners.push(callback);
  }

  private notifyChange(q: number, r: number, data: Partial<TileData>) {
      for (const listener of this.listeners) {
          listener(q, r, data);
      }
  }

  /**
   * Creates a deep copy of the GameMap state.
   */
  public cloneDeep(): GameMap {
    // Create a new map instance (this will trigger generation, but we overwrite it immediately)
    const clone = new GameMap(this.width, this.height);
    
    // Fast memory copy of all data layers
    clone.terrain.set(this.terrain);
    clone.resource.set(this.resource);
    clone.improvement.set(this.improvement);
    clone.improvementLevel.set(this.improvementLevel);
    clone.owner.set(this.owner);
    clone.isHidden.set(this.isHidden);
    clone.isProspected.set(this.isProspected);

    return clone;
  }

  // --- Core Data Access ---

  /**
   * Validates if an Axial coordinate is within map bounds.
   */
  public isValid(q: number, r: number): boolean {
    const { col, row } = axialToOffset({ q, r });
    return col >= 0 && col < this.width && row >= 0 && row < this.height;
  }

  /**
   * Internal helper to convert Axial(q,r) to Array Index.
   * Returns -1 if out of bounds.
   */
  public getIndex(q: number, r: number): number {
    const { col, row } = axialToOffset({ q, r });
    if (col < 0 || col >= this.width || row < 0 || row >= this.height) {
      return -1;
    }
    return row * this.width + col;
  }

  /**
   * Get all data for a specific tile.
   * Returns null if out of bounds.
   */
  public getTile(q: number, r: number): TileData | null {
    const idx = this.getIndex(q, r);
    if (idx === -1) return null;

    return {
      terrain: this.terrain[idx],
      resource: this.resource[idx],
      improvement: this.improvement[idx],
      improvementLevel: this.improvementLevel[idx],
      owner: this.owner[idx],
      isHidden: this.isHidden[idx] === 1,
      isProspected: this.isProspected[idx] === 1
    };
  }

  /**
   * Set data for a specific tile. Only updates provided fields.
   */
  public setTile(q: number, r: number, data: Partial<TileData>): void {
    const idx = this.getIndex(q, r);
    if (idx === -1) return;

    if (data.terrain !== undefined) this.terrain[idx] = data.terrain;
    if (data.resource !== undefined) this.resource[idx] = data.resource;
    if (data.improvement !== undefined) this.improvement[idx] = data.improvement;
    if (data.improvementLevel !== undefined) this.improvementLevel[idx] = data.improvementLevel;
    if (data.owner !== undefined) this.owner[idx] = data.owner;
    if (data.isHidden !== undefined) this.isHidden[idx] = data.isHidden ? 1 : 0;
    if (data.isProspected !== undefined) this.isProspected[idx] = data.isProspected ? 1 : 0;

    this.notifyChange(q, r, data);
  }

  // --- Generation Logic ---

  /**
   * Generates a procedural map using pseudo-noise and a radial mask
   * to create an island shape.
   */
  public generateMap(): void {
    const seed = Math.random() * 1000;
    let habitableLandIndices: number[] = [];

    // Center coordinates
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.min(centerX, centerY);

    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const idx = row * this.width + col;
        
        // 1. Calculate Distance from Center (Normalized 0 to 1)
        const dx = col - centerX;
        const dy = row - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxRadius;

        // 2. Generate Noise Value
        // Scale down input for smoother noise
        const nx = col * 0.1 + seed;
        const ny = row * 0.1 + seed;
        const noise = this.pseudoNoise(nx, ny);
        
        // 3. Apply Island Mask (Gradient)
        // Values closer to center are kept high, edges are pushed down
        const elevation = noise + 0.25 - (Math.pow(dist, 1.8) * 1.5);

        // 4. Force Center to be Land
        // If we are very close to center (radius < 5 tiles), boost elevation
        let finalElevation = elevation;
        if (dist < 0.15) finalElevation += 0.4;

        // 5. Determine Terrain
        let type = TerrainType.WATER;

        if (finalElevation > 0.05) {
            type = TerrainType.PLAINS;
            
            const moisture = this.pseudoNoise(nx * 2 + 100, ny * 2 + 100);
            if (moisture > 0.55) type = TerrainType.FOREST;
            if (moisture < 0.2) type = TerrainType.DESERT;

            // Tuned thresholds to be less mountainous
            if (finalElevation > 0.75) type = TerrainType.HILLS;
            if (finalElevation > 0.92) type = TerrainType.MOUNTAIN;
            
            // Only add to habitable list if not mountain
            if (type !== TerrainType.MOUNTAIN) {
                habitableLandIndices.push(idx);
            }
        }

        this.terrain[idx] = type;
        
        // 6. Resources
        this.generateResource(idx, type);
      }
    }

    // 6b. Clean up Biome Boundaries to prevent Z-Fighting
    this.cleanUpBiomeBoundaries();

    // 7. Place Capital
    // Prefer center, but must be habitable (no mountains/water)
    const centerIdx = this.getIndex(Math.floor(this.width/2), Math.floor(this.height/2));
    
    // Simple search for best city spot near center
    let bestSpotIdx = -1;
    let minDist = Infinity;

    for (const idx of habitableLandIndices) {
       const r = Math.floor(idx / this.width);
       const c = idx % this.width;
       const d = Math.abs(c - centerX) + Math.abs(r - centerY);
       if (d < minDist) {
           minDist = d;
           bestSpotIdx = idx;
       }
    }

    let capitalHex: Hex;

    if (bestSpotIdx !== -1) {
        // Clear area around city to ensure it's not mountain-locked (Radius 2)
        const cityCol = bestSpotIdx % this.width;
        const cityRow = Math.floor(bestSpotIdx / this.width);
        capitalHex = offsetToAxial({ col: cityCol, row: cityRow });
        
        // Collect hexes within radius 2 using simple BFS
        const safeZonePoints = new Set<string>();
        safeZonePoints.add(hexToString(capitalHex));
        
        const q1 = [capitalHex];
        
        // Radius 1
        const r1 = getHexNeighbors(capitalHex);
        r1.forEach(h => {
             safeZonePoints.add(hexToString(h));
             q1.push(h);
        });

        // Radius 2
        r1.forEach(h1 => {
             getHexNeighbors(h1).forEach(h2 => {
                 safeZonePoints.add(hexToString(h2));
             });
        });

        // Apply clearing
        for (const key of safeZonePoints) {
            const parts = key.split(',');
            const q = parseInt(parts[0]);
            const r = parseInt(parts[1]);
            
            if (this.isValid(q, r)) {
                // Force flat land around the capital
                this.setTile(q, r, { 
                    terrain: TerrainType.PLAINS,
                    resource: ResourceType.NONE,
                    improvement: ImprovementType.NONE,
                    isHidden: false,
                    isProspected: false
                });
            }
        }

        // Place City
        this.setTile(capitalHex.q, capitalHex.r, { improvement: ImprovementType.CITY, improvementLevel: 1 });
    } else {
        // Fallback: Force center to be Plains if no valid land found
        this.terrain[centerIdx] = TerrainType.PLAINS;
        this.improvement[centerIdx] = ImprovementType.CITY;
        this.improvementLevel[centerIdx] = 1;
        this.resource[centerIdx] = ResourceType.NONE;
        this.isHidden[centerIdx] = 0;
        
        const col = centerIdx % this.width;
        const row = Math.floor(centerIdx / this.width);
        capitalHex = offsetToAxial({ col, row });
    }

    // 8. GUARANTEE ESSENTIAL RESOURCES
    this.ensureStartingResources(capitalHex);
  }

  /**
   * Post-processing step.
   * Iterates through the map and adds a PLAINS buffer between different "Big Biomes"
   * (Mountain, Hills, Desert). This ensures their large 2.5D sprites don't intersect.
   */
  private cleanUpBiomeBoundaries() {
      const isBigBiome = (t: TerrainType) => {
          return t === TerrainType.MOUNTAIN || t === TerrainType.HILLS || t === TerrainType.DESERT;
      };

      // Store changes to apply after iteration to avoid cascading effects during the loop
      const toDowngrade: number[] = [];

      for (let r = 0; r < this.height; r++) {
          for (let c = 0; c < this.width; c++) {
              const idx = r * this.width + c;
              const currentTerrain = this.terrain[idx];

              if (isBigBiome(currentTerrain)) {
                  // Check neighbors
                  const q = c - (r - (r & 1)) / 2;
                  const neighbors = getHexNeighbors({ q, r });
                  
                  let hasConflict = false;
                  for (const n of neighbors) {
                      if (this.isValid(n.q, n.r)) {
                          const nTile = this.getTile(n.q, n.r);
                          // Conflict: Neighbor is ALSO a big biome, but a DIFFERENT one
                          if (nTile && isBigBiome(nTile.terrain) && nTile.terrain !== currentTerrain) {
                              hasConflict = true;
                              break;
                          }
                      }
                  }

                  if (hasConflict) {
                      toDowngrade.push(idx);
                  }
              }
          }
      }

      // Apply changes
      for (const idx of toDowngrade) {
          this.terrain[idx] = TerrainType.PLAINS;
          // Optionally clear resource if it was something specific to the biome, but usually fine to keep
      }
  }

  private ensureStartingResources(center: Hex) {
      // We need Wood, Coal, and Iron nearby to make the game playable.
      // Scan radius 3.
      const scanRadius = 3;
      let hasWood = false;
      let hasCoal = false;
      let hasIron = false;

      const candidates: Hex[] = [];

      for(let q = -scanRadius; q <= scanRadius; q++) {
          for(let r = -scanRadius; r <= scanRadius; r++) {
              if (Math.abs(q+r) > scanRadius) continue;
              const h = { q: center.q + q, r: center.r + r };
              if (!this.isValid(h.q, h.r)) continue;
              
              if (h.q === center.q && h.r === center.r) continue; // Skip city center

              const t = this.getTile(h.q, h.r);
              if (!t) continue;

              if (t.resource === ResourceType.WOOD) hasWood = true;
              if (t.resource === ResourceType.COAL) hasCoal = true;
              if (t.resource === ResourceType.IRON) hasIron = true;
              
              // Prefer radius 2 for replacements
              if (getHexDistance(center, h) <= 2 && t.improvement === ImprovementType.NONE) {
                  candidates.push(h);
              }
          }
      }

      // Helper to force spawn
      const spawn = (res: ResourceType) => {
          if (candidates.length === 0) return;
          // Pick random candidate (deterministic-ish)
          const idx = Math.floor(Math.random() * candidates.length);
          const hex = candidates[idx];
          candidates.splice(idx, 1); // remove used

          if (res === ResourceType.WOOD) {
              this.setTile(hex.q, hex.r, { terrain: TerrainType.FOREST, resource: ResourceType.WOOD, isHidden: false });
          } else if (res === ResourceType.COAL) {
              this.setTile(hex.q, hex.r, { terrain: TerrainType.MOUNTAIN, resource: ResourceType.COAL, isHidden: false }); 
          } else if (res === ResourceType.IRON) {
              this.setTile(hex.q, hex.r, { terrain: TerrainType.MOUNTAIN, resource: ResourceType.IRON, isHidden: false });
          }
      };

      if (!hasWood) spawn(ResourceType.WOOD);
      if (!hasCoal) spawn(ResourceType.COAL);
      if (!hasIron) spawn(ResourceType.IRON);
  }

  private pseudoNoise(x: number, y: number): number {
    // Return range roughly 0 to 1
    const n = Math.sin(x) + Math.cos(y) * 0.5 + Math.sin(x*2 + y*1.5) * 0.25;
    // n is roughly -1.75 to 1.75. Normalize.
    return (n / 3.5) + 0.5;
  }

  private generateResource(idx: number, terrain: TerrainType): void {
     const rand = Math.random();
     let res = ResourceType.NONE;
     let hidden = false;

     if (terrain === TerrainType.WATER) {
         if (rand > 0.85) {
             res = ResourceType.FISH;
         }
     } else if (terrain === TerrainType.MOUNTAIN && rand > 0.8) {
         // Mountains: Coal, Iron, Gold, Gems (Hidden)
         const r2 = Math.random();
         if (r2 > 0.9) res = ResourceType.GEMS;
         else if (r2 > 0.7) res = ResourceType.GOLD;
         else if (r2 > 0.4) res = ResourceType.IRON;
         else res = ResourceType.COAL;
         hidden = true;
     } else if (terrain === TerrainType.HILLS) {
         // Hills: Meat, Wool, Spices (Placeholder)
         if (rand > 0.85) {
             // 50/50 chance for Meat vs Wool on hills
             if (Math.random() > 0.5) res = ResourceType.MEAT;
             else res = ResourceType.WOOL;
         }
         // Spices placeholder - do nothing for now
     } else if (terrain === TerrainType.PLAINS) {
         // Plains: Wheat, Cotton, Fruit
         if (rand > 0.92) res = ResourceType.WHEAT;
         else if (rand > 0.86) res = ResourceType.COTTON;
         else if (rand > 0.80) res = ResourceType.FRUIT;
     } else if (terrain === TerrainType.FOREST) {
         // All forests produce Wood
         res = ResourceType.WOOD;
     } else if (terrain === TerrainType.DESERT && rand > 0.95) {
         res = ResourceType.OIL;
         hidden = true;
     }

     this.resource[idx] = res;
     this.isHidden[idx] = hidden ? 1 : 0;
     this.isProspected[idx] = 0;
  }
}
