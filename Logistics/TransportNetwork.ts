

import { GameMap, TerrainType, ImprovementType } from '../Grid/GameMap';
import { Hex, getHexNeighbors, areHexesEqual, offsetToAxial, axialToOffset } from '../Grid/HexMath';

interface PathNode {
  hex: Hex;
  cost: number;
}

/**
 * A Min-Priority Queue implementation for the Dijkstra algorithm.
 */
class PriorityQueue<T> {
  private elements: { item: T; priority: number }[] = [];

  enqueue(item: T, priority: number) {
    this.elements.push({ item, priority });
    this.sort();
  }

  dequeue(): T | undefined {
    return this.elements.shift()?.item;
  }

  isEmpty(): boolean {
    return this.elements.length === 0;
  }

  private sort() {
    this.elements.sort((a, b) => a.priority - b.priority);
  }
}

/**
 * TransportNetwork
 * Manages the connectivity graph of the game world.
 * Calculates which resources are connected to the Capital/Depots.
 */
export class TransportNetwork {
  private map: GameMap;
  private isDirty: boolean = true;
  
  // Stores movement cost FROM Capital TO index. 
  // Infinity = not connected.
  private connectionField: Float32Array; 

  private capitalHex: Hex | null = null;

  constructor(map: GameMap) {
    this.map = map;
    this.connectionField = new Float32Array(map.size).fill(Infinity);
  }

  /**
   * Mark the network as needing a recalculation.
   */
  public markDirty() {
    this.isDirty = true;
  }

  /**
   * Main update loop. Only recalculates if dirty.
   */
  public update() {
    if (this.isDirty) {
      this.recalculate();
      this.isDirty = false;
    }
  }

  /**
   * Checks if a specific tile is connected to the Capital.
   */
  public isConnectedToCapital(hex: Hex): boolean {
    const idx = this.map.getIndex(hex.q, hex.r);
    if (idx === -1) return false;
    return this.connectionField[idx] !== Infinity;
  }

  public getTransportCost(hex: Hex): number {
      const idx = this.map.getIndex(hex.q, hex.r);
      if (idx === -1) return Infinity;
      return this.connectionField[idx];
  }

  public setCapital(hex: Hex) {
    this.capitalHex = hex;
    this.markDirty();
  }

  public findAndSetCapital() {
    for (let r = 0; r < this.map.height; r++) {
        for (let c = 0; c < this.map.width; c++) {
            const q = c - (r - (r & 1)) / 2;
            const t = this.map.getTile(q, r);
            if (t && t.improvement === ImprovementType.CITY) {
                this.setCapital({q, r});
                return;
            }
        }
    }
  }

  /**
   * Core Dijkstra Algorithm
   * Floods the map from the Capital outwards based on Move Cost.
   * Implements "Global Port Connectivity": Reaching one port connects all others.
   */
  private recalculate() {
    if (!this.capitalHex) {
        this.findAndSetCapital();
        if (!this.capitalHex) return; 
    }

    this.connectionField.fill(Infinity);
    
    if (!this.capitalHex) return;

    const startIdx = this.map.getIndex(this.capitalHex.q, this.capitalHex.r);
    if (startIdx === -1) return;

    this.connectionField[startIdx] = 0;

    const frontier = new PriorityQueue<Hex>();
    frontier.enqueue(this.capitalHex, 0);

    // 1. Find all Ports on map for "Wormhole" logic
    const allPorts: Hex[] = [];
    for(let r=0; r<this.map.height; r++) {
        for(let c=0; c<this.map.width; c++) {
            const q = c - (r - (r&1)) / 2;
            const tile = this.map.getTile(q, r);
            if (tile && tile.improvement === ImprovementType.PORT) {
                allPorts.push({q, r});
            }
        }
    }
    
    // Tracks if we have already activated the "Port Wormhole"
    let seaNetworkActive = false;
    
    let iterations = 0;
    const maxIterations = this.map.size * 2; 

    while (!frontier.isEmpty() && iterations < maxIterations) {
      iterations++;
      const current = frontier.dequeue();
      if (!current) break;

      const currentIdx = this.map.getIndex(current.q, current.r);
      const currentCost = this.connectionField[currentIdx];

      // --- Port / Sea Logic ---
      const tile = this.map.getTile(current.q, current.r);
      
      // If we are at a PORT and haven't unlocked sea travel yet,
      // instantly connect to all other ports.
      if (tile && tile.improvement === ImprovementType.PORT && !seaNetworkActive) {
          seaNetworkActive = true;
          // Connect all other ports
          for (const port of allPorts) {
              const pIdx = this.map.getIndex(port.q, port.r);
              if (pIdx !== -1) {
                  // Sea travel cost is roughly negligible once at a port, 
                  // but we add +1 to represent the hop.
                  const seaCost = currentCost + 1; 
                  if (seaCost < this.connectionField[pIdx]) {
                      this.connectionField[pIdx] = seaCost;
                      frontier.enqueue(port, seaCost);
                  }
              }
          }
      }

      // --- Standard Neighbors ---
      const neighbors = getHexNeighbors(current);
      
      for (const next of neighbors) {
        const nextIdx = this.map.getIndex(next.q, next.r);
        if (nextIdx === -1) continue;

        const moveCost = this.calculateMoveCost(next);
        if (moveCost === Infinity) continue;

        const newCost = currentCost + moveCost;

        if (newCost < this.connectionField[nextIdx]) {
          this.connectionField[nextIdx] = newCost;
          frontier.enqueue(next, newCost);
        }
      }
    }
  }

  /**
   * Determines the cost to ENTER a tile.
   * STRICT MODE: Only Infrastructure allows resource transport.
   * NOTE: Productive improvements (Mines, Farms) are considered "Infrastructure" 
   * for transport purposes to allow chains to pass through them.
   */
  private calculateMoveCost(hex: Hex): number {
    const tile = this.map.getTile(hex.q, hex.r);
    if (!tile) return Infinity;

    // Infrastructure allowed for transport
    if (tile.improvement === ImprovementType.ROAD || 
        tile.improvement === ImprovementType.RAILROAD || 
        tile.improvement === ImprovementType.CITY ||
        tile.improvement === ImprovementType.DEPOT ||
        tile.improvement === ImprovementType.PORT ||
        // Productive Improvements imply a local road network
        tile.improvement === ImprovementType.MINE ||
        tile.improvement === ImprovementType.FARM ||
        tile.improvement === ImprovementType.LUMBER_MILL ||
        tile.improvement === ImprovementType.RANCH ||
        tile.improvement === ImprovementType.PLANTATION ||
        tile.improvement === ImprovementType.OIL_WELL
        ) {
      return 1;
    }

    return Infinity;
  }
}