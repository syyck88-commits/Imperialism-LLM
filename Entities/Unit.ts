

import { Hex } from '../Grid/HexMath';

export enum UnitType {
  SOLDIER = 'Soldier',
  ENGINEER = 'Engineer',
  PROSPECTOR = 'Prospector',
  FARMER = 'Farmer',
  MINER = 'Miner',
  RANCHER = 'Rancher',
  FORESTER = 'Forester',
  DRILLER = 'Driller',
  DEVELOPER = 'Developer'
}

export class Unit {
  public id: string;
  public type: UnitType;
  public ownerId: number;
  public location: Hex;
  
  // Visual state for animation
  public visualPos: { q: number, r: number };
  public movementQueue: Hex[] = []; // Queue for smooth path animation
  
  public movesLeft: number;
  public maxMoves: number;
  
  // Working state
  public isWorking: boolean = false;
  public workTurnsRemaining: number = 0;

  // New States
  public isSleeping: boolean = false;
  public isAutomated: boolean = false;
  
  // Automation State
  public targetHex: Hex | null = null;
  
  // Debug / Status info for UI
  public debugStatus: string = "";

  constructor(id: string, type: UnitType, location: Hex, ownerId: number = 1) {
    this.id = id;
    this.type = type;
    this.location = location;
    // Start visual position exactly at logical location
    this.visualPos = { q: location.q, r: location.r };
    
    this.ownerId = ownerId;
    
    // Stats based on type
    switch (type) {
      case UnitType.SOLDIER:
        this.maxMoves = 3;
        break;
      // Civilians move further
      default:
        this.maxMoves = 4;
        break;
    }
    
    this.movesLeft = this.maxMoves;
  }

  /**
   * Creates a deep copy of the Unit, preserving its class type (prototype).
   */
  public cloneDeep(): Unit {
      // 1. Create a new object with the same prototype as the current instance
      // This ensures if 'this' is an Engineer, the clone is also an Engineer.
      const clone = Object.create(Object.getPrototypeOf(this));

      // 2. Copy all enumerable properties (shallow copy)
      Object.assign(clone, this);

      // 3. Deep copy reference types
      clone.location = { ...this.location };
      clone.visualPos = { ...this.visualPos };
      clone.movementQueue = this.movementQueue.map(h => ({ ...h }));
      if (this.targetHex) {
          clone.targetHex = { ...this.targetHex };
      }

      return clone;
  }

  public getEmoji(): string {
      switch (this.type) {
          case UnitType.SOLDIER: return '🛡️';
          case UnitType.ENGINEER: return '👷';
          case UnitType.PROSPECTOR: return '🔭';
          case UnitType.FARMER: return '🌾';
          case UnitType.MINER: return '⛏️';
          case UnitType.RANCHER: return '🤠';
          case UnitType.FORESTER: return '🪓';
          case UnitType.DRILLER: return '⛽';
          case UnitType.DEVELOPER: return '🕴️';
          default: return '♟️';
      }
  }

  public move(path: Hex[], cost: number) {
      if (this.isWorking) return; // Cannot move while working
      if (!path || path.length === 0) return;

      const toHex = path[path.length - 1];
      this.location = toHex;
      this.movesLeft = Math.max(0, this.movesLeft - cost);
      
      // Update visual movement queue - Append new steps instead of overwriting
      // This ensures that if move is called multiple times in one frame (recursion),
      // the unit animates through all steps sequentially.
      this.movementQueue.push(...path);
      
      // Manual movement wakes up unit and disables automation
      // Note: Auto-turn logic re-enables automation flag after move
      this.isSleeping = false;
      this.isAutomated = false;
      this.targetHex = null;
      this.debugStatus = "";
  }

  public resetTurn() {
      this.movesLeft = this.maxMoves;
      if (this.isWorking) {
          this.workTurnsRemaining--;
          if (this.workTurnsRemaining <= 0) {
              this.isWorking = false;
              this.workTurnsRemaining = 0;
          } else {
              this.movesLeft = 0; // Skip turn if still working
          }
      }
  }

  public update(deltaTime: number) {
      // Constant speed for smooth movement (tiles per second)
      const moveSpeed = 8 * (deltaTime / 1000); 

      if (this.movementQueue.length > 0) {
          const target = this.movementQueue[0];
          
          const dq = target.q - this.visualPos.q;
          const dr = target.r - this.visualPos.r;
          const dist = Math.sqrt(dq*dq + dr*dr);
          
          if (dist <= moveSpeed) {
              // Snap to target and proceed to next waypoint
              this.visualPos.q = target.q;
              this.visualPos.r = target.r;
              this.movementQueue.shift();
          } else {
              // Move towards target
              this.visualPos.q += (dq / dist) * moveSpeed;
              this.visualPos.r += (dr / dist) * moveSpeed;
          }
      } else {
          // Sync with logical location if drifted or on initialization
          // This handles the case where animation finished or was skipped
          const dq = this.location.q - this.visualPos.q;
          const dr = this.location.r - this.visualPos.r;
          const dist = Math.sqrt(dq*dq + dr*dr);
          
          if (dist > 0.001) {
              if (dist <= moveSpeed) {
                  this.visualPos.q = this.location.q;
                  this.visualPos.r = this.location.r;
              } else {
                  this.visualPos.q += (dq / dist) * moveSpeed;
                  this.visualPos.r += (dr / dist) * moveSpeed;
              }
          } else {
               this.visualPos.q = this.location.q;
               this.visualPos.r = this.location.r;
          }
      }
  }
}
