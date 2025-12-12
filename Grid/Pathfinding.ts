
import { GameMap, TerrainType, ImprovementType } from './GameMap';
import { Hex, getHexNeighbors, areHexesEqual, hexToString, getHexDistance } from './HexMath';
import { Unit, UnitType } from '../Entities/Unit';

export class Pathfinder {
    private map: GameMap;

    constructor(map: GameMap) {
        this.map = map;
    }

    public getMovementRange(unit: Unit): Hex[] {
        if (unit.movesLeft <= 0) return [];

        const start = unit.location;
        const frontier: {hex: Hex, cost: number}[] = [{hex: start, cost: 0}];
        const costSoFar: Map<string, number> = new Map();
        costSoFar.set(hexToString(start), 0);
        
        const reachable: Hex[] = [];

        while (frontier.length > 0) {
            frontier.sort((a, b) => a.cost - b.cost);
            const current = frontier.shift();
            if (!current) break;

            if (current.cost > unit.movesLeft) continue;
            
            if (!areHexesEqual(current.hex, start)) {
                reachable.push(current.hex);
            }

            const neighbors = getHexNeighbors(current.hex);
            for (const next of neighbors) {
                if (!this.map.isValid(next.q, next.r)) continue;
                
                const moveCost = this.getTileMoveCost(next, unit);
                if (moveCost === Infinity) continue; // Impassable

                const newCost = current.cost + moveCost;
                
                if (newCost <= unit.movesLeft) {
                    const nextKey = hexToString(next);
                    if (!costSoFar.has(nextKey) || newCost < costSoFar.get(nextKey)!) {
                        costSoFar.set(nextKey, newCost);
                        frontier.push({hex: next, cost: newCost});
                    }
                }
            }
        }

        return reachable;
    }

    /**
     * Standard pathfinding within a known range (UI usage for current turn).
     */
    public getPathTo(unit: Unit, target: Hex, knownValidMoves: Hex[]): Hex[] {
        if (!unit) return [];
        if (!knownValidMoves.some(v => areHexesEqual(v, target))) return [];

        const start = unit.location;
        const frontier: {hex: Hex, cost: number}[] = [{hex: start, cost: 0}];
        const cameFrom: Map<string, Hex | null> = new Map();
        const costSoFar: Map<string, number> = new Map();
        
        cameFrom.set(hexToString(start), null);
        costSoFar.set(hexToString(start), 0);

        let found = false;

        while (frontier.length > 0) {
            frontier.sort((a, b) => a.cost - b.cost);
            const current = frontier.shift()!;

            if (areHexesEqual(current.hex, target)) {
                found = true;
                break;
            }

            const neighbors = getHexNeighbors(current.hex);
            for (const next of neighbors) {
               if (!this.map.isValid(next.q, next.r)) continue;
               const moveCost = this.getTileMoveCost(next, unit);
               if (moveCost === Infinity) continue;

               const newCost = current.cost + moveCost;
               // Ensure we stay within budget
               if (newCost > unit.movesLeft) continue;

               const nextKey = hexToString(next);
               if (!costSoFar.has(nextKey) || newCost < costSoFar.get(nextKey)!) {
                   costSoFar.set(nextKey, newCost);
                   frontier.push({hex: next, cost: newCost});
                   cameFrom.set(nextKey, current.hex);
               }
            }
        }

        if (!found) return [];

        // Reconstruct path
        const path: Hex[] = [];
        let curr: Hex | null = target;
        while (curr && !areHexesEqual(curr, start)) {
            path.push(curr);
            curr = cameFrom.get(hexToString(curr)) || null;
        }
        return path.reverse();
    }

    /**
     * A* Algorithm for long-distance pathfinding.
     * Finds the best path to a target regardless of current movement points.
     */
    public findPath(unit: Unit, target: Hex): Hex[] {
        if (!this.map.isValid(target.q, target.r)) return [];
        
        const start = unit.location;
        if (areHexesEqual(start, target)) return [];

        const priorityQueue: { hex: Hex, priority: number }[] = [];
        const cameFrom: Map<string, Hex | null> = new Map();
        const costSoFar: Map<string, number> = new Map();

        const startKey = hexToString(start);
        cameFrom.set(startKey, null);
        costSoFar.set(startKey, 0);
        
        priorityQueue.push({ hex: start, priority: 0 });

        let found = false;
        let iterations = 0;
        const MAX_ITERATIONS = 5000; // Increased to ensure finding distant targets

        while (priorityQueue.length > 0) {
            iterations++;
            if (iterations > MAX_ITERATIONS) break;

            // Simple sort for priority queue behavior
            priorityQueue.sort((a, b) => a.priority - b.priority);
            const current = priorityQueue.shift()!;

            if (areHexesEqual(current.hex, target)) {
                found = true;
                break;
            }

            const neighbors = getHexNeighbors(current.hex);
            for (const next of neighbors) {
                if (!this.map.isValid(next.q, next.r)) continue;

                // For generic travel, we treat costs as normal, ignoring current movesLeft
                const moveCost = this.getTileMoveCost(next, unit);
                if (moveCost === Infinity) continue;

                const nextKey = hexToString(next);
                const newCost = (costSoFar.get(hexToString(current.hex)) || 0) + moveCost;

                if (!costSoFar.has(nextKey) || newCost < costSoFar.get(nextKey)!) {
                    costSoFar.set(nextKey, newCost);
                    
                    // Heuristic: Manhattan distance
                    const priority = newCost + getHexDistance(next, target);
                    priorityQueue.push({ hex: next, priority });
                    cameFrom.set(nextKey, current.hex);
                }
            }
        }

        if (!found) return [];

        // Reconstruct
        const path: Hex[] = [];
        let curr: Hex | null = target;
        
        // Safety break
        let pathLen = 0;
        while (curr && !areHexesEqual(curr, start) && pathLen < 1000) {
            path.push(curr);
            curr = cameFrom.get(hexToString(curr)) || null;
            pathLen++;
        }
        
        return path.reverse();
    }

    public getTileMoveCost(hex: Hex, unit?: Unit): number {
        const tile = this.map.getTile(hex.q, hex.r);
        if (!tile) return Infinity;
        
        if (tile.terrain === TerrainType.WATER) return Infinity;

        // Infrastructure makes movement CHEAP and POSSIBLE
        const hasRoad = tile.improvement === ImprovementType.ROAD || 
                        tile.improvement === ImprovementType.RAILROAD || 
                        tile.improvement === ImprovementType.CITY ||
                        tile.improvement === ImprovementType.DEPOT ||
                        tile.improvement === ImprovementType.PORT;

        if (hasRoad) {
            // Highly prefer moving along existing roads to avoid building parallel ones
            // 0.25 means 4 moves on road = 1 move on plain.
            return 0.25; 
        }

        // Productive Tiles (Farms/Mines) usually imply a dirt path exists locally.
        // CHECK THIS BEFORE MOUNTAINS so Miners can enter existing mines in mountains.
        if (tile.improvement === ImprovementType.FARM || 
            tile.improvement === ImprovementType.MINE || 
            tile.improvement === ImprovementType.LUMBER_MILL ||
            tile.improvement === ImprovementType.RANCH ||
            tile.improvement === ImprovementType.PLANTATION ||
            tile.improvement === ImprovementType.OIL_WELL) return 1;

        // --- Difficult Terrain Logic ---
        if (tile.terrain === TerrainType.MOUNTAIN) {
            // Only specialized units can traverse wild mountains
            if (unit && (unit.type === UnitType.ENGINEER || unit.type === UnitType.PROSPECTOR)) {
                return unit.maxMoves; // Takes full turn to climb wild mountain
            }
            return Infinity; // Miners, Farmers, Soldiers cannot enter wild mountains
        }

        // Terrain Costs
        if (tile.terrain === TerrainType.HILLS) return 2;
        if (tile.terrain === TerrainType.FOREST) return 2;
        if (tile.terrain === TerrainType.SWAMP) return 3;
        if (tile.terrain === TerrainType.TUNDRA) return 2;
        
        return 1;
    }
}
