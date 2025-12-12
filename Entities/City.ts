
import { Hex } from '../Grid/HexMath';
import { ResourceType } from '../Grid/GameMap';
import { GameConfig } from '../core/GameConfig';

export interface Workforce {
    untrained: number;
    trained: number;
    expert: number;
}

export class City {
  public id: string;
  public name: string;
  public ownerId: number;
  public location: Hex;
  
  public population: number; // Total population count
  public workforce: Workforce; // Available labor pool
  
  public cash: number; // Treasury
  
  public inventory: Map<ResourceType, number>;
  public productionQueue: string[]; 
  
  // Production Targets: Key = Recipe Name, Value = Target Amount
  public productionTargets: Map<string, number>;

  // Building Levels (Capacity): Key = Building Name
  public buildingLevels: Map<string, number>;

  public transportCapacity: number = 20;
  
  // Stores the last transport distribution chosen by the player
  public lastTransportSettings: Map<ResourceType, number>;

  constructor(id: string, name: string, location: Hex, ownerId: number = 1) {
    this.id = id;
    this.name = name;
    this.location = location;
    this.ownerId = ownerId;
    
    // Initial Population & Workforce
    this.workforce = { ...GameConfig.CITY.INITIAL_POPULATION };
    this.population = this.workforce.untrained + this.workforce.trained + this.workforce.expert;

    this.cash = GameConfig.CITY.INITIAL_CASH; 
    
    this.inventory = new Map<ResourceType, number>();
    this.productionQueue = [];
    this.productionTargets = new Map<string, number>();
    this.buildingLevels = new Map<string, number>();
    
    // Initialize persistent settings map
    this.lastTransportSettings = new Map<ResourceType, number>();

    this.initInventory();
    this.initBuildings();
  }

  private initInventory() {
    GameConfig.CITY.INITIAL_INVENTORY.forEach(item => {
        this.inventory.set(item.type, item.amount);
    });
  }

  private initBuildings() {
    GameConfig.CITY.INITIAL_BUILDINGS.forEach(b => {
        this.buildingLevels.set(b.name, b.level);
    });
  }

  // Helper for compatibility with old code
  get expertLabor(): number {
      return this.workforce.expert;
  }

  set expertLabor(val: number) {
      this.workforce.expert = val;
  }

  // Helper for compatibility
  get labor(): number {
      return this.workforce.untrained * 1 + this.workforce.trained * 2 + this.workforce.expert * 4;
  }
  
  set labor(val: number) {
      // No-op setter for compatibility, labor is derived
  }

  // Compatibility wrapper
  get factoryCapacity(): number {
      // Return max single factory cap? Or average?
      // Used for display in old modal, not critical logic
      return 10;
  }

  public addResource(type: ResourceType, amount: number) {
    const current = this.inventory.get(type) || 0;
    this.inventory.set(type, current + amount);
  }

  public consumeResource(type: ResourceType, amount: number): boolean {
    const current = this.inventory.get(type) || 0;
    if (current >= amount) {
      this.inventory.set(type, current - amount);
      return true;
    }
    return false;
  }
}
