
import { City } from '../../Entities/City';
import { GameMap, ImprovementType, ResourceType } from '../../Grid/GameMap';
import { Hex, getHexNeighbors, hexToString, getHexRange } from '../../Grid/HexMath';
import { TransportNetwork } from '../../Logistics/TransportNetwork';
import { Economy } from '../Economy';

export class CityManager {
    public cities: City[] = [];
    private map: GameMap;
    private transportNetwork: TransportNetwork;

    constructor(map: GameMap, transportNetwork: TransportNetwork) {
        this.map = map;
        this.transportNetwork = transportNetwork;
    }

    public get capital(): City | null {
        return this.cities.length > 0 ? this.cities[0] : null;
    }

    public spawnCapital(hex: Hex) {
        if (this.cities.length === 0) {
            const capital = new City('city-1', 'Новая Вена', hex);
            this.cities.push(capital);
        }
    }

    public setProduction(resource: ResourceType, isActive: boolean) {
        // Legacy: This method is deprecated as production is now managed via sliders (float targets) 
        // in City.productionTargets rather than boolean flags.
        // No-op to maintain type compatibility if called by old code.
    }

    public processTurn(shippedGoods: Map<ResourceType, number>) {
        if (this.capital) {
            // Save settings for next turn
            this.capital.lastTransportSettings = new Map(shippedGoods);
            Economy.processTurn(this.capital, shippedGoods);
        }
    }

    public getTransportOptions(): Map<ResourceType, number> {
        return this.calculateConnectedResources();
    }
    
    public getCapitalTransportSettings(): Map<ResourceType, number> {
        return this.capital ? new Map(this.capital.lastTransportSettings) : new Map();
    }

    private calculateConnectedResources(): Map<ResourceType, number> {
        const available = new Map<ResourceType, number>();
  
        if (this.cities.length === 0) return available;
        this.transportNetwork.update();
  
        const gatheredHexes = new Set<string>();
  
        // Rule: Resources are collected by Stations (City, Depot, Port)
        // Zone: Station Tile + Range (City=2, Others=1)
        
        // Iterate over map to find Stations
        for(let r=0; r<this.map.height; r++) {
            for(let c=0; c<this.map.width; c++) {
                const q = c - (r - (r&1)) / 2;
                const tile = this.map.getTile(q, r);
                if (!tile) continue;
  
                const isStation = tile.improvement === ImprovementType.CITY || 
                                  tile.improvement === ImprovementType.DEPOT || 
                                  tile.improvement === ImprovementType.PORT;
  
                if (isStation) {
                    // Station must be connected to Capital Network to function
                    // (Depots via Rail/Road, Ports via Water if Capital has access)
                    if (this.transportNetwork.isConnectedToCapital({q, r})) {
                        
                        // Collection Zone: Radius 2 for City, 1 for others
                        const radius = tile.improvement === ImprovementType.CITY ? 2 : 1;
                        const collectionZone = getHexRange({q, r}, radius);
                        
                        for (const target of collectionZone) {
                            if (!this.map.isValid(target.q, target.r)) continue;
                            
                            const key = hexToString(target);
                            if (gatheredHexes.has(key)) continue; // Prevent double counting
                            
                            const yields = this.getTileYield(target);
                            if (yields.size > 0) {
                                gatheredHexes.add(key);
                                yields.forEach((amount, type) => {
                                    const current = available.get(type) || 0;
                                    available.set(type, current + amount);
                                });
                            }
                        }
                    }
                }
            }
        }
  
        return available;
    }

    public getGatheredResources(hex: Hex, type: ImprovementType): Map<ResourceType, number> {
        // Used by UI to preview potential yields when building something
        const gathered = new Map<ResourceType, number>();
        
        // If building a Station (or inspecting one), preview the Radius yield
        if (type === ImprovementType.CITY || type === ImprovementType.DEPOT || type === ImprovementType.PORT) {
            const radius = type === ImprovementType.CITY ? 2 : 1;
            const neighbors = getHexRange(hex, radius);
            for (const tHex of neighbors) {
                const y = this.getTileYield(tHex);
                y.forEach((amt, t) => {
                    const curr = gathered.get(t) || 0;
                    gathered.set(t, curr + amt);
                });
            }
        } else {
            // If building an improvement (e.g. Lumber Mill), show its direct yield
            const original = this.map.getTile(hex.q, hex.r)?.improvement;
            const originalLvl = this.map.getTile(hex.q, hex.r)?.improvementLevel;

            if (this.map.getTile(hex.q, hex.r)) {
               // Temporarily set improvement to preview yield (Assume Level 1 for preview)
               this.map.setTile(hex.q, hex.r, { improvement: type, improvementLevel: 1 });
               const y = this.getTileYield(hex);
               y.forEach((amt, t) => gathered.set(t, amt));
               // Revert
               this.map.setTile(hex.q, hex.r, { improvement: original, improvementLevel: originalLvl });
            }
        }
        
        return gathered;
    }

    public getTileYield(hex: Hex): Map<ResourceType, number> {
        const y = new Map<ResourceType, number>();
        const tile = this.map.getTile(hex.q, hex.r);
        if (!tile) return y;
  
        const lvl = tile.improvementLevel || 0; // 0=None, 1=Basic, 2=Advanced, 3=Expert
        const res = tile.resource;
        const imp = tile.improvement;

        // --- Surface Resources ---
        // Base Yield: 1
        // Level 1: +1 (2)
        // Level 2: +2 (3)
        // Level 3: +3 (4)
        const surfaceResources = [
            ResourceType.WHEAT, ResourceType.FRUIT, ResourceType.COTTON, 
            ResourceType.WOOL, ResourceType.MEAT, ResourceType.WOOD, ResourceType.SPICE
        ];
  
        if (surfaceResources.includes(res)) {
            let amount = 1; // Base Unimproved Yield
            
            if (this.isCompatibleImprovement(res, imp)) {
                // lvl 1 => amount += 1 (total 2)
                // lvl 2 => amount += 2 (total 3)
                // lvl 3 => amount += 3 (total 4)
                if (lvl > 0) amount += lvl;
            }
            y.set(res, amount);
        }
        
        // --- Fish ---
        // Always 1, not improvable in current spec
        if (res === ResourceType.FISH) {
             y.set(ResourceType.FISH, 1);
        }
  
        // --- Subsurface Resources ---
        // Base Yield: 0
        // Level 1: 2
        // Level 2: 4
        // Level 3: 6
        const heavyMining = [ResourceType.COAL, ResourceType.IRON, ResourceType.OIL];
        if (heavyMining.includes(res)) {
            if (this.isCompatibleImprovement(res, imp) && lvl > 0) {
                y.set(res, lvl * 2);
            }
        }

        // --- Valuable Mining ---
        // Base Yield: 0
        // Level 1: 1
        // Level 2: 2
        // Level 3: 3
        const lightMining = [ResourceType.GOLD, ResourceType.GEMS];
        if (lightMining.includes(res)) {
            if (this.isCompatibleImprovement(res, imp) && lvl > 0) {
                y.set(res, lvl);
            }
        }
  
        return y;
    }

    private isCompatibleImprovement(res: ResourceType, imp: ImprovementType): boolean {
        if (imp === ImprovementType.NONE) return false;
        
        switch (res) {
            case ResourceType.WOOD: return imp === ImprovementType.LUMBER_MILL;
            case ResourceType.WHEAT: return imp === ImprovementType.FARM;
            case ResourceType.FRUIT: return imp === ImprovementType.PLANTATION || imp === ImprovementType.FARM;
            case ResourceType.COTTON: return imp === ImprovementType.PLANTATION;
            case ResourceType.SPICE: return imp === ImprovementType.PLANTATION;
            case ResourceType.WOOL: return imp === ImprovementType.RANCH;
            case ResourceType.MEAT: return imp === ImprovementType.RANCH;
            
            case ResourceType.COAL: 
            case ResourceType.IRON: 
            case ResourceType.GOLD: 
            case ResourceType.GEMS: return imp === ImprovementType.MINE;
            
            case ResourceType.OIL: return imp === ImprovementType.OIL_WELL;
            default: return false;
        }
    }
}
