
import { GameMap, TerrainType } from '../Grid/GameMap';
import { Hex, getHexNeighbors, hexToString } from '../Grid/HexMath';

export class TerrainClustering {
    
    /**
     * Analyzes the map to calculate the "Depth" of a specific terrain type.
     * Depth 1 = Edge (adjacent to different terrain).
     * Depth 2 = One tile in.
     * Depth N = Deep terrain.
     */
    public static analyze(map: GameMap, type: TerrainType): Map<string, number> {
        const depths = new Map<string, number>();
        const queue: { hex: Hex, dist: number }[] = [];
        const visited = new Set<string>();

        // 1. Identify "Boundary" Tiles
        // A boundary tile is a tile of type T that has at least one neighbor NOT of type T.
        for (let r = 0; r < map.height; r++) {
            for (let c = 0; c < map.width; c++) {
                const q = c - (r - (r & 1)) / 2;
                const tile = map.getTile(q, r);
                
                if (tile && tile.terrain === type) {
                    const hex = {q, r};
                    const neighbors = getHexNeighbors(hex);
                    
                    let isEdge = false;

                    // If on edge of map, it's a boundary
                    if (neighbors.length < 6) {
                        isEdge = true;
                    } else {
                        // Check neighbors types
                        for (const n of neighbors) {
                            if (!map.isValid(n.q, n.r)) {
                                isEdge = true; 
                                break;
                            }
                            const nTile = map.getTile(n.q, n.r);
                            if (!nTile || nTile.terrain !== type) {
                                isEdge = true;
                                break;
                            }
                        }
                    }

                    if (isEdge) {
                        const key = hexToString(hex);
                        depths.set(key, 1); // Depth 1 = Edge
                        visited.add(key);
                        queue.push({ hex, dist: 1 });
                    }
                }
            }
        }

        // 2. Propagate Depth Inwards (BFS)
        while (queue.length > 0) {
            const { hex, dist } = queue.shift()!;
            
            const neighbors = getHexNeighbors(hex);
            for (const n of neighbors) {
                if (!map.isValid(n.q, n.r)) continue;
                
                const nKey = hexToString(n);
                const nTile = map.getTile(n.q, n.r);
                
                if (nTile && nTile.terrain === type && !visited.has(nKey)) {
                    const newDist = dist + 1;
                    depths.set(nKey, newDist);
                    visited.add(nKey);
                    queue.push({ hex: n, dist: newDist });
                }
            }
        }

        return depths;
    }
}
