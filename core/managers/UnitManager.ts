

import { Unit, UnitType } from '../../Entities/Unit';
import { Engineer, Prospector, ResourceImprover, Developer, CivilianUnit, ProspectFilter, EngineerPriority, EngineerTerrainFilter } from '../../Entities/CivilianUnit';
import { University } from '../University';
import { GameMap, TerrainType, ImprovementType, ResourceType } from '../../Grid/GameMap';
import { Pathfinder } from '../../Grid/Pathfinding';
import { Hex, getHexNeighbors, areHexesEqual } from '../../Grid/HexMath';
import { City } from '../../Entities/City';
import { TransportNetwork } from '../../Logistics/TransportNetwork';

export class UnitManager {
    public units: Unit[] = [];
    public selectedUnit: Unit | null = null;
    public selectedHex: Hex | null = null; // For selecting empty tiles or enemy units later
    
    // Pathfinding Caches
    public validMovesCache: Hex[] = [];
    public currentPathCache: Hex[] = [];

    private map: GameMap;
    private pathfinder: Pathfinder;

    constructor(map: GameMap, pathfinder: Pathfinder) {
        this.map = map;
        this.pathfinder = pathfinder;
    }

    public cloneDeep(newMap: GameMap, newPathfinder: Pathfinder): UnitManager {
        const clone = new UnitManager(newMap, newPathfinder);
        clone.units = this.units.map(u => u.cloneDeep());
        // Selection state is not strictly needed for simulation, but we can copy it or leave null
        return clone;
    }

    public spawnInitialUnits(capitalHex: Hex) {
         // Get neighbors to spawn units without stacking
         const neighbors = getHexNeighbors(capitalHex).filter(n => this.map.isValid(n.q, n.r) && this.map.getTile(n.q, n.r)?.terrain !== TerrainType.WATER && this.map.getTile(n.q, n.r)?.terrain !== TerrainType.MOUNTAIN);
          
         if (neighbors.length > 0) {
           this.units.push(new Engineer('unit-eng-1', neighbors[0]));
         }
         if (neighbors.length > 1) {
            this.units.push(new Prospector('unit-geo-1', neighbors[1]));
         }
         if (neighbors.length > 2) {
            this.units.push(new ResourceImprover('unit-miner-1', UnitType.MINER, neighbors[2]));
         }
    }

    public recruitUnit(type: UnitType, city: City, turn: number, technologies: Set<string>): string {
        const result = University.createUnit(
            type, 
            city, 
            city.location, 
            technologies, 
            `unit-${turn}-${this.units.length}`
        );
  
        if (result.success && result.unit) {
            this.units.push(result.unit);
            return result.message;
        }
        return result.message;
    }

    public disbandSelectedUnit(city: City | null) {
        if (!this.selectedUnit || !city) return;
        
        University.disbandUnit(this.selectedUnit, city);
        
        this.units = this.units.filter(u => u.id !== this.selectedUnit?.id);
        this.selectedUnit = null;
        this.validMovesCache = [];
    }

    public selectUnit(unit: Unit) {
        this.selectedUnit = unit;
        this.selectedHex = null;
        this.validMovesCache = this.pathfinder.getMovementRange(this.selectedUnit);
    }

    public selectUnitAt(hex: Hex) {
        const unit = this.units.find(u => areHexesEqual(u.location, hex));
        
        if (unit) {
            this.selectUnit(unit);
        } else {
            this.selectedUnit = null;
            this.selectedHex = hex;
            this.validMovesCache = [];
            this.currentPathCache = [];
        }
    }

    public moveSelectedUnit(targetHex: Hex) {
        if (!this.selectedUnit) return;
        
        const isValid = this.validMovesCache.some(vm => areHexesEqual(vm, targetHex));
        if (!isValid) return;
    
        const path = this.pathfinder.getPathTo(this.selectedUnit, targetHex, this.validMovesCache);
        let totalCost = 0;
        for (const step of path) {
            totalCost += this.pathfinder.getTileMoveCost(step, this.selectedUnit);
        }
    
        if (totalCost > this.selectedUnit.movesLeft) return;
    
        // Move along path
        this.selectedUnit.move(path, totalCost);
        
        this.validMovesCache = this.pathfinder.getMovementRange(this.selectedUnit);
        this.currentPathCache = []; 
    }

    public toggleSleep() {
        if (!this.selectedUnit) return;
        this.selectedUnit.isSleeping = !this.selectedUnit.isSleeping;
        this.selectedUnit.isAutomated = false;
        
        if (this.selectedUnit.isSleeping) {
            // Deselect if put to sleep
            this.selectedUnit = null;
            this.validMovesCache = [];
        }
    }

    public toggleAuto(capital: City | null, techs: Set<string>) {
        if (!this.selectedUnit) return;
        // Allow automation for Engineer, Prospector and ResourceImprover
        const isCivilian = this.selectedUnit instanceof CivilianUnit;
        if (!isCivilian) return;
  
        this.selectedUnit.isAutomated = !this.selectedUnit.isAutomated;
        this.selectedUnit.isSleeping = false;
    }

    public setProspectorFilter(filter: ProspectFilter) {
        if (this.selectedUnit && this.selectedUnit instanceof Prospector) {
            this.selectedUnit.setFilter(filter);
        }
    }

    public setImproverFilter(filter: ResourceType | 'ALL') {
        if (this.selectedUnit && this.selectedUnit instanceof ResourceImprover) {
            this.selectedUnit.setFilter(filter);
        }
    }

    public setEngineerPriority(priorityVal: string) {
        if (this.selectedUnit && this.selectedUnit instanceof Engineer) {
            let parsed: EngineerPriority;
            if (priorityVal === 'GENERAL') {
                parsed = 'GENERAL';
            } else {
                parsed = parseInt(priorityVal) as ResourceType;
            }
            this.selectedUnit.setPriority(parsed);
        }
    }

    public setEngineerTerrain(terrainVal: string) {
        if (this.selectedUnit && this.selectedUnit instanceof Engineer) {
            let parsed: EngineerTerrainFilter;
            if (terrainVal === 'ALL') {
                parsed = 'ALL';
            } else {
                parsed = parseInt(terrainVal) as TerrainType;
            }
            this.selectedUnit.setTerrainFilter(parsed);
        }
    }
    
    public findNextActiveUnit(): Unit | null {
        return this.units.find(u => 
            u.movesLeft > 0 && 
            !u.isSleeping && 
            !u.isAutomated && 
            !u.isWorking
        ) || null;
    }

    public update(deltaTime: number) {
        this.units.forEach(u => u.update(deltaTime));
    }

    public updatePathPreview(hoveredHex: Hex | null) {
        if (this.selectedUnit && hoveredHex && this.validMovesCache.some(vm => areHexesEqual(vm, hoveredHex))) {
            this.currentPathCache = this.pathfinder.getPathTo(this.selectedUnit, hoveredHex, this.validMovesCache);
        } else {
            this.currentPathCache = [];
        }
    }

    public processTurn(capital: City | null, techs: Set<string>, transportNetwork: TransportNetwork) {
         // Process Automation & Reset Units
        this.units.forEach(u => {
            // Automation Logic
            if (u.isAutomated && u instanceof CivilianUnit) {
                u.resetTurn(); // Give moves first
                // Pass full unit list for reservation checking and transport network
                u.doAutoTurn(this.map, this.pathfinder, capital, techs, this.units, transportNetwork);
            } else {
                u.resetTurn();
            }
        });
        
        // Refresh selection if maintained
        if (this.selectedUnit) {
            this.validMovesCache = this.pathfinder.getMovementRange(this.selectedUnit);
        }
    }

    // --- Actions ---

    public doProspect(): string | undefined {
        if (!this.selectedUnit || !(this.selectedUnit instanceof Prospector)) return;
        return this.selectedUnit.prospect(this.map);
    }
  
    public doBuildRoad(city: City): string | undefined {
        if (!this.selectedUnit || !(this.selectedUnit instanceof Engineer)) return;
        return this.selectedUnit.buildRoad(this.map, city);
    }
  
    public doBuildDepot(city: City): string | undefined {
        if (!this.selectedUnit || !(this.selectedUnit instanceof Engineer)) return;
        return this.selectedUnit.buildDepot(this.map, city);
    }
  
    public doBuildPort(city: City): string | undefined {
        if (!this.selectedUnit || !(this.selectedUnit instanceof Engineer)) return;
        return this.selectedUnit.buildPort(this.map, city);
    }
  
    public doImproveResource(technologies: Set<string>): string | undefined {
        if (!this.selectedUnit || !(this.selectedUnit instanceof ResourceImprover)) return;
        return this.selectedUnit.improve(this.map, technologies);
    }
    
    public doBuyLand(city: City): string | undefined {
        if (!this.selectedUnit || !(this.selectedUnit instanceof Developer)) return;
        return this.selectedUnit.buyLand(this.map, city);
    }

    public buildImprovement(type: ImprovementType, city: City) {
        if (this.selectedUnit && this.selectedUnit instanceof Engineer) {
            if (type === ImprovementType.ROAD) this.selectedUnit.buildRoad(this.map, city);
            else if (type === ImprovementType.DEPOT) this.selectedUnit.buildDepot(this.map, city);
            else if (type === ImprovementType.PORT) this.selectedUnit.buildPort(this.map, city);
            
            // Note: Caller needs to mark transport dirty
            this.validMovesCache = []; 
        }
    }
}
