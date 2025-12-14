
import { GameMap, ResourceType, ImprovementType, TerrainType } from '../../Grid/GameMap';
import { Hex, getHexDistance, areHexesEqual, hexToString, getHexRange } from '../../Grid/HexMath';
import { Unit } from '../Unit';
import { TransportNetwork } from '../../Logistics/TransportNetwork';

export interface ResourceWeight {
    [key: number]: number; // ResourceType -> Score
}

export class AIHelpers {

    /**
     * Scans a radius around a center hex and calculates a score based on resources found.
     */
    public static calculateLocalResourceScore(
        map: GameMap, 
        center: Hex, 
        radius: number, 
        weights: ResourceWeight = {}
    ): number {
        let score = 0;
        const neighbors = getHexRange(center, radius);
        for (const hex of neighbors) {
            if (!map.isValid(hex.q, hex.r)) continue;
            
            const tile = map.getTile(hex.q, hex.r);
            if (tile && !tile.isHidden && tile.resource !== ResourceType.NONE) {
                const weight = weights[tile.resource] || 1; 
                score += weight;
            }
        }
        return score;
    }

    /**
     * Checks if any of the specified improvement types exist within the given radius.
     */
    public static isImprovementNearby(
        map: GameMap, 
        center: Hex, 
        radius: number, 
        types: ImprovementType[]
    ): boolean {
        const neighbors = getHexRange(center, radius);
        for (const hex of neighbors) {
            const tile = map.getTile(hex.q, hex.r);
            if (tile && types.includes(tile.improvement)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Finds the optimal location to place a Depot.
     */
    public static findBestDepotLocation(
        unit: Unit,
        map: GameMap,
        net: TransportNetwork,
        scanRadius: number,
        allUnits: Unit[]
    ): Hex | null {
        const candidates = getHexRange(unit.location, scanRadius);
        let bestHex: Hex | null = null;
        let bestScore = 0;

        // Use new Reservation Logic with radius 2 to prevent Depot clustering
        const reservedSet = this.getReservedHexes(allUnits, unit, 2);

        for (const hex of candidates) {
            if (!map.isValid(hex.q, hex.r)) continue;
            if (reservedSet.has(hexToString(hex))) continue;

            const tile = map.getTile(hex.q, hex.r);
            if (!tile) continue;

            // Validity Check
            const canBuild = tile.resource === ResourceType.NONE || tile.resource === ResourceType.WOOD || tile.isHidden;
            const isStation = tile.improvement === ImprovementType.CITY || tile.improvement === ImprovementType.DEPOT || tile.improvement === ImprovementType.PORT;
            const isBlocked = tile.improvement !== ImprovementType.NONE && tile.improvement !== ImprovementType.ROAD && tile.improvement !== ImprovementType.RAILROAD;
            
            if (!canBuild || isStation || isBlocked) continue;
            if (tile.terrain === TerrainType.WATER) continue;
            
            // Allow Mountains ONLY if they are empty
            if (tile.terrain === TerrainType.MOUNTAIN && tile.resource !== ResourceType.NONE) continue;

            // Spacing Check (Existing buildings)
            if (this.isImprovementNearby(map, hex, 2, [ImprovementType.DEPOT, ImprovementType.CITY, ImprovementType.PORT])) continue;

            // Score Calculation
            let resourceScore = 0;
            const coverage = getHexRange(hex, 1);
            
            for (const c of coverage) {
                if (!map.isValid(c.q, c.r)) continue;
                if (net.isConnectedToCapital(c)) continue;

                const cTile = map.getTile(c.q, c.r);
                if (cTile && cTile.resource !== ResourceType.NONE && !cTile.isHidden) {
                    // WEIGHTS TUNING
                    if (cTile.resource === ResourceType.COAL || cTile.resource === ResourceType.IRON) resourceScore += 6;
                    else if (cTile.resource === ResourceType.GOLD || cTile.resource === ResourceType.OIL || cTile.resource === ResourceType.GEMS) resourceScore += 8;
                    else resourceScore += 1; // Wood, Wheat, etc.
                }
            }

            // Heuristic: Maximize Resources, Minimize Distance
            const dist = getHexDistance(unit.location, hex);
            const score = resourceScore * 10 - dist;

            if (resourceScore >= 2 && score > bestScore) {
                bestScore = score;
                bestHex = hex;
            }
        }

        return bestHex;
    }

    /**
     * Given a valuable resource hex that we want to connect, find the best neighbor to put a Depot.
     * Used when the resource itself is blocked (e.g. Iron in Mountains).
     */
    public static findOptimalDepotSpot(
        map: GameMap,
        resourceHex: Hex,
        net: TransportNetwork
    ): Hex | null {
        const candidates = getHexRange(resourceHex, 1);
        let bestHex: Hex | null = null;
        let bestScore = -1;

        for (const hex of candidates) {
            if (!map.isValid(hex.q, hex.r)) continue;
            
            // Cannot build on the resource itself
            if (areHexesEqual(hex, resourceHex)) continue;

            const tile = map.getTile(hex.q, hex.r);
            if (!tile) continue;

            // Strict Build Checks
            const canBuild = tile.resource === ResourceType.NONE || tile.resource === ResourceType.WOOD || tile.isHidden;
            const isStation = tile.improvement === ImprovementType.CITY || tile.improvement === ImprovementType.DEPOT || tile.improvement === ImprovementType.PORT;
            const isBlocked = tile.improvement !== ImprovementType.NONE && tile.improvement !== ImprovementType.ROAD && tile.improvement !== ImprovementType.RAILROAD;

            if (!canBuild || isStation || isBlocked) continue;
            if (tile.terrain === TerrainType.WATER) continue;
            if (tile.terrain === TerrainType.MOUNTAIN && tile.resource !== ResourceType.NONE) continue;
            
            // Spacing
            if (this.isImprovementNearby(map, hex, 2, [ImprovementType.DEPOT, ImprovementType.CITY, ImprovementType.PORT])) continue;

            // Score: How many OTHER resources does this spot capture?
            // Base score 1 (captures the main target)
            let score = 1;
            const coverage = getHexRange(hex, 1);
            
            for (const c of coverage) {
                if (!map.isValid(c.q, c.r)) continue;
                if (areHexesEqual(c, resourceHex)) continue; // Already counted as main target

                const cTile = map.getTile(c.q, c.r);
                if (cTile && cTile.resource !== ResourceType.NONE && !cTile.isHidden) {
                    if ([ResourceType.COAL, ResourceType.IRON, ResourceType.GOLD, ResourceType.OIL].includes(cTile.resource)) {
                        score += 3;
                    } else {
                        score += 1;
                    }
                }
            }

            // Prefer spots closer to current network if possible
            if (score > bestScore) {
                bestScore = score;
                bestHex = hex;
            }
        }

        return bestHex;
    }

    /**
     * A generic target finder.
     */
    public static findBestTarget(
        unit: Unit,
        map: GameMap,
        scoreFn: (hex: Hex, tile: any) => number,
        exclude: Set<string> = new Set()
    ): Hex | null {
        let bestScore = -Infinity;
        let bestHex: Hex | null = null;

        for(let r = 0; r < map.height; r++) {
            for(let c = 0; c < map.width; c++) {
                const q = c - (r - (r & 1)) / 2;
                const hex = { q, r };

                if (areHexesEqual(unit.location, hex)) continue;
                if (exclude.has(hexToString(hex))) continue;

                const tile = map.getTile(q, r);
                if (!tile || tile.terrain === TerrainType.WATER) continue;

                const score = scoreFn(hex, tile);

                if (score > bestScore) {
                    bestScore = score;
                    bestHex = hex;
                }
            }
        }

        return bestHex;
    }

    /**
     * Retrieves a set of reserved hex strings from all colleagues.
     * @param radius - If > 0, reserves neighbors of the target as well (Spatial Reservation).
     */
    public static getReservedHexes(
        allUnits: Unit[], 
        myUnit: Unit, 
        radius: number = 0
    ): Set<string> {
        const reserved = new Set<string>();
        for (const u of allUnits) {
            // Filter: Must be a different unit, same type, automated, and have a target
            if (u.id !== myUnit.id && u.type === myUnit.type && u.isAutomated && u.targetHex) {
                // Add the specific target
                reserved.add(hexToString(u.targetHex));
                
                // Add spatial buffer if requested
                if (radius > 0) {
                    const neighbors = getHexRange(u.targetHex, radius);
                    for (const n of neighbors) {
                        reserved.add(hexToString(n));
                    }
                }
            }
        }
        return reserved;
    }

    /**
     * Legacy wrapper for backward compatibility.
     */
    public static getColleagueTargets(allUnits: Unit[], myUnit: Unit): Hex[] {
        const targets: Hex[] = [];
        for (const u of allUnits) {
            if (u.id !== myUnit.id && u.type === myUnit.type && u.isAutomated && u.targetHex) {
                targets.push(u.targetHex);
            }
        }
        return targets;
    }
}
