
import { CivilianUnit } from './BaseCivilian';
import { Hex, areHexesEqual, getHexDistance, hexToString } from '../../Grid/HexMath';
import { GameMap, ImprovementType, ResourceType, TerrainType } from '../../Grid/GameMap';
import { City } from '../City';
import { GameConfig } from '../../core/GameConfig';
import { Pathfinder } from '../../Grid/Pathfinding';
import { TransportNetwork } from '../../Logistics/TransportNetwork';
import { AIHelpers } from '../AI/AIHelpers';
import { getEmpireNeeds } from '../../core/AIAnalysis';

export type EngineerPriority = 'GENERAL' | ResourceType;
export type EngineerTerrainFilter = 'ALL' | TerrainType;

export class Engineer extends CivilianUnit {
    public autoPriority: EngineerPriority = 'GENERAL';
    public terrainFilter: EngineerTerrainFilter = 'ALL';
    public heedAdvice: boolean = true; // New: Listen to strategic advice
    
    // State to track if we are specifically travelling to build a depot
    private intentToBuildDepot: boolean = false;

    constructor(id: string, location: Hex, ownerId: number = 1) {
        // 'Engineer' cast to any to bypass missing UnitType enum dependency
        super(id, 'Engineer' as any, location, ownerId);
    }

    public setPriority(priority: EngineerPriority) {
        this.autoPriority = priority;
        this.targetHex = null; 
        this.intentToBuildDepot = false;
    }

    public setTerrainFilter(terrain: EngineerTerrainFilter) {
        this.terrainFilter = terrain;
        this.targetHex = null;
        this.intentToBuildDepot = false;
    }

    public toggleHeedAdvice() {
        this.heedAdvice = !this.heedAdvice;
        // If we switch it on, we might need to rethink current target
        if (this.heedAdvice) this.targetHex = null;
    }

    // --- BUILDING ACTIONS ---

    public buildRoad(map: GameMap, city: City): string {
        return this.tryBuild(map, city, ImprovementType.ROAD, GameConfig.INFRASTRUCTURE[ImprovementType.ROAD]);
    }

    public buildRailroad(map: GameMap, city: City): string {
        return this.tryBuild(map, city, ImprovementType.RAILROAD, GameConfig.INFRASTRUCTURE[ImprovementType.RAILROAD]);
    }
    
    public buildDepot(map: GameMap, city: City): string {
        const tile = map.getTile(this.location.q, this.location.r);
        if (!tile) return "Ошибка карты";

        // СТРОГОЕ ПРАВИЛО: Депо нельзя строить на стратегических ресурсах.
        const canBuild = tile.resource === ResourceType.NONE || tile.resource === ResourceType.WOOD || tile.isHidden;
        
        if (!canBuild) {
            return `Нельзя строить Депо на ресурсе ${ResourceType[tile.resource]} (нужна Шахта/Ферма).`;
        }

        // В ГОРАХ Депо нельзя строить, если нет дороги или ЖД
        if (tile.terrain === TerrainType.MOUNTAIN && tile.improvement === ImprovementType.NONE) {
            return "В горах сначала нужна дорога!";
        }
        
        if (AIHelpers.isImprovementNearby(map, this.location, 2, [ImprovementType.DEPOT, ImprovementType.CITY, ImprovementType.PORT])) {
            return "Слишком близко к другой станции!";
        }

        return this.tryBuild(map, city, ImprovementType.DEPOT, GameConfig.INFRASTRUCTURE[ImprovementType.DEPOT]);
    }

    public buildPort(map: GameMap, city: City): string {
         return this.tryBuild(map, city, ImprovementType.PORT, GameConfig.INFRASTRUCTURE[ImprovementType.PORT]);
    }

    private tryBuild(map: GameMap, city: City, imp: ImprovementType, cost: any): string {
        if (this.movesLeft <= 0) return "Нет очков движения.";
        
        const tile = map.getTile(this.location.q, this.location.r);
        if (!tile) return "Ошибка карты";
        
        if (tile.improvement === ImprovementType.RAILROAD && imp === ImprovementType.ROAD) {
            return "Уже есть Ж/Д.";
        }

        // Защита от сноса шахт/ферм
        const isProductive = [
            ImprovementType.MINE, ImprovementType.FARM, ImprovementType.LUMBER_MILL, 
            ImprovementType.RANCH, ImprovementType.PLANTATION, ImprovementType.OIL_WELL
        ].includes(tile.improvement);
                             
        if (isProductive && imp !== ImprovementType.RAILROAD) {
             return "Здесь производство (нельзя снести).";
        }
        
        if (!this.canAfford(city, cost)) {
            // Generate Machine-Readable Status for LLM
            // Format: WAIT_RES:WOOD,STEEL|LOC:10,5
            const missing = this.getMissingResString(city, cost);
            this.debugStatus = `WAIT_RES:${missing}|LOC:${this.location.q},${this.location.r}`;
            
            if (cost.money && city.cash < cost.money) return `Недостаточно средств ($${cost.money}).`;
            return "Недостаточно ресурсов.";
        }
        
        if (cost.money) city.cash -= cost.money;
        if (cost.resources) {
            for (const res of cost.resources) city.consumeResource(res.type, res.amount);
        }

        map.setTile(this.location.q, this.location.r, { improvement: imp, improvementLevel: 1 });
        this.movesLeft = 0;
        this.intentToBuildDepot = false; // Action completed
        return `Построено: ${ImprovementType[imp]}`;
    }

    private canAfford(city: City, cost: any): boolean {
        if (cost.money && city.cash < cost.money) return false;
        if (cost.resources) {
            for (const res of cost.resources) {
                const stock = city.inventory.get(res.type) || 0;
                if (stock < res.amount) return false;
            }
        }
        return true;
    }

    private getMissingResString(city: City, cost: any): string {
        const missing: string[] = [];
        if (cost.money && city.cash < cost.money) missing.push("CASH");
        if (cost.resources) {
            for (const r of cost.resources) {
                const stock = city.inventory.get(r.type) || 0;
                if (stock < r.amount) missing.push(ResourceType[r.type]);
            }
        }
        return missing.join(',');
    }

    // --- AUTOMATION AI ---

    public override doAutoTurn(
        map: GameMap,
        pathfinder: Pathfinder,
        capital: City | null,
        techs: Set<string>,
        allUnits: any[], // Type relaxed from Unit[] to any[]
        transportNetwork?: TransportNetwork
    ): string | null {
        
        const report = (msg: string) => { this.debugStatus = msg; return msg; };
        if (!transportNetwork || !capital) return report("Ошибка сети");

        const currentTile = map.getTile(this.location.q, this.location.r);
        if (!currentTile) return null;

        // --- 1. BUILD DEPOT CHECK ---
        const isDepotTarget = this.targetHex && areHexesEqual(this.location, this.targetHex) && this.intentToBuildDepot;
        
        // If we want to build a depot, or logic suggests we should...
        if (isDepotTarget || this.shouldBuildDepotHere(map, capital, transportNetwork)) {
            
            // MOUNTAIN EXCEPTION: If we are in mountains and there is no road, we MUST build a road first.
            if (currentTile.terrain === TerrainType.MOUNTAIN && currentTile.improvement === ImprovementType.NONE) {
                 const cost = techs.has('Railroad Transport') 
                    ? GameConfig.INFRASTRUCTURE[ImprovementType.RAILROAD] 
                    : GameConfig.INFRASTRUCTURE[ImprovementType.ROAD];
                 
                 if (this.canAfford(capital, cost)) {
                     techs.has('Railroad Transport') ? this.buildRailroad(map, capital) : this.buildRoad(map, capital);
                     transportNetwork.markDirty();
                     return report("Авто: Дорога (для Депо)");
                 } else {
                     const missing = this.getMissingResString(capital, cost);
                     return report(`WAIT_RES:${missing}|LOC:${this.location.q},${this.location.r}`);
                 }
            }

            // Normal Depot Build
            const depotCost = GameConfig.INFRASTRUCTURE[ImprovementType.DEPOT];
            if (this.canAfford(capital, depotCost)) {
                const result = this.buildDepot(map, capital);
                // Если постройка не удалась (например, из-за внезапного обнаружения ресурса), сбрасываем цель
                if (!result.startsWith("Построено")) {
                    this.targetHex = null;
                    return report("Ошибка Депо: " + result);
                }
                transportNetwork.markDirty();
                return report("Авто: Строю Депо");
            } else {
                const missing = this.getMissingResString(capital, depotCost);
                return report(`WAIT_RES:${missing}|LOC:${this.location.q},${this.location.r}`);
            }
        }

        // --- 2. ROAD MAINTENANCE ---
        const isStation = [ImprovementType.CITY, ImprovementType.DEPOT, ImprovementType.PORT].includes(currentTile.improvement);
        const isProductive = [
            ImprovementType.MINE, ImprovementType.FARM, ImprovementType.LUMBER_MILL, 
            ImprovementType.RANCH, ImprovementType.PLANTATION, ImprovementType.OIL_WELL
        ].includes(currentTile.improvement);

        // Upgrade Road -> Rail
        if (currentTile.improvement === ImprovementType.ROAD && techs.has('Railroad Transport')) {
            if (this.canAfford(capital, GameConfig.INFRASTRUCTURE[ImprovementType.RAILROAD])) {
                this.buildRailroad(map, capital);
                transportNetwork.markDirty();
                return report("Авто: Апгрейд Ж/Д");
            }
        }

        // Build Road Under Feet
        const needsRoad = currentTile.improvement === ImprovementType.NONE;
        
        if (needsRoad && this.movesLeft > 0 && !isProductive && !isStation) {
             const cost = techs.has('Railroad Transport') 
                ? GameConfig.INFRASTRUCTURE[ImprovementType.RAILROAD] 
                : GameConfig.INFRASTRUCTURE[ImprovementType.ROAD];

             if (this.canAfford(capital, cost)) {
                 techs.has('Railroad Transport') ? this.buildRailroad(map, capital) : this.buildRoad(map, capital);
                 transportNetwork.markDirty();
             }
        }

        // --- 3. SELECT NEW TARGET ---
        if (this.targetHex && areHexesEqual(this.location, this.targetHex)) {
             this.targetHex = null;
             this.intentToBuildDepot = false;
        }

        if (!this.targetHex) {
            transportNetwork.update(); 
            
            // Analyze Needs for Override
            const needs = getEmpireNeeds(capital);
            let crisisOverride = false;
            
            if (this.heedAdvice) {
                if (needs.foodWarning || needs.basicMaterials || needs.moneyCritical) {
                    crisisOverride = true;
                }
            }

            // Smart Depot Scan (General Mode)
            let foundSmartDepot = false;
            
            // Only use generic scanning if NOT in crisis mode or specific mode
            if (!crisisOverride && this.autoPriority === 'GENERAL' && this.terrainFilter === 'ALL') {
                const depotSpot = AIHelpers.findBestDepotLocation(this, map, transportNetwork, 5, allUnits);
                if (depotSpot) {
                    this.targetHex = depotSpot;
                    this.intentToBuildDepot = true;
                    this.debugStatus = `Новое Депо: ${depotSpot.q},${depotSpot.r}`;
                    foundSmartDepot = true;
                }
            }

            if (!foundSmartDepot) {
                this.intentToBuildDepot = false;
                this.targetHex = this.selectNewTarget(map, capital, transportNetwork, allUnits, needs);
                
                // CRITICAL MONEY LOGIC: If we are broke and didn't find Gold/Gems, STOP.
                if (this.heedAdvice && needs.moneyCritical && !this.targetHex) {
                    return report("Экономия: Жду Золота");
                }
            }
        }

        if (!this.targetHex) {
            this.isAutomated = false;
            return report("Нет целей");
        }

        // --- 4. MOVE ---
        return this.moveToTarget(map, pathfinder, capital, techs, allUnits, transportNetwork);
    }

    private shouldBuildDepotHere(map: GameMap, capital: City, net: TransportNetwork): boolean {
        const tile = map.getTile(this.location.q, this.location.r);
        if (!tile) return false;
        
        if (net.isConnectedToCapital(this.location)) return false;

        // Strict Check: Cannot build on productive resources (except Wood/None)
        const canBuild = tile.resource === ResourceType.NONE || tile.resource === ResourceType.WOOD || tile.isHidden;
        if (!canBuild) return false; 

        // Strict Terrain Check if Filter Enabled, UNLESS ignoring advice override
        const needs = getEmpireNeeds(capital);
        const ignoringFilter = this.heedAdvice && (needs.foodWarning || needs.basicMaterials || needs.moneyCritical);
        
        if (!ignoringFilter && this.terrainFilter !== 'ALL' && tile.terrain !== this.terrainFilter) {
             return false;
        }

        if (tile.improvement !== ImprovementType.NONE && tile.improvement !== ImprovementType.ROAD && tile.improvement !== ImprovementType.RAILROAD) return false;
        
        const isCrowded = AIHelpers.isImprovementNearby(map, this.location, 2, [ImprovementType.DEPOT, ImprovementType.CITY, ImprovementType.PORT]);
        if (isCrowded) return false;

        // Check neighbors
        let value = 0;
        
        // Inline logic replacing getHexRange(this.location, 1)
        const neighbors: Hex[] = [];
        for (let q = -1; q <= 1; q++) {
            for (let r = -1; r <= 1; r++) {
                if (Math.abs(q + r) > 1) continue;
                neighbors.push({ q: this.location.q + q, r: this.location.r + r });
            }
        }

        for (const n of neighbors) {
            const t = map.getTile(n.q, n.r);
            if (t && t.resource !== ResourceType.NONE && !t.isHidden && !net.isConnectedToCapital(n)) {
                
                if (!ignoringFilter && this.autoPriority !== 'GENERAL' && t.resource === this.autoPriority) {
                    return true;
                }
                
                if (this.heedAdvice) {
                    if (needs.moneyCritical && [ResourceType.GOLD, ResourceType.GEMS].includes(t.resource)) return true;
                    if (needs.foodWarning && [ResourceType.WHEAT, ResourceType.FRUIT, ResourceType.MEAT, ResourceType.FISH].includes(t.resource)) return true;
                    if (needs.basicMaterials && [ResourceType.WOOD, ResourceType.COAL, ResourceType.IRON].includes(t.resource)) return true;
                }

                if ([ResourceType.COAL, ResourceType.IRON, ResourceType.GOLD, ResourceType.OIL, ResourceType.GEMS].includes(t.resource)) {
                    value += 3;
                } else {
                    value += 1;
                }
            }
        }
        return value >= 2; 
    }

    private selectNewTarget(
        map: GameMap, 
        capital: City, 
        net: TransportNetwork, 
        allUnits: any[],
        needs: any
    ): Hex | null {
        // Updated: Use 0 radius for general moves, as engineers can share paths, 
        // but findBestDepotLocation handles the radius 2 exclusion for Depots.
        // Here we just want to avoid going to the exact same tile someone else is working on.
        const reservedSet = AIHelpers.getReservedHexes(allUnits, this, 0);

        const scoreFunction = (hex: Hex, tile: any): number => {
            if (reservedSet.has(hexToString(hex))) return -Infinity;
            if (net.isConnectedToCapital(hex)) return -Infinity;

            let overrideActive = false;
            
            // --- ADVICE LOGIC ---
            if (this.heedAdvice) {
                if (needs.moneyCritical) {
                    overrideActive = true;
                    if (tile.resource !== ResourceType.GOLD && tile.resource !== ResourceType.GEMS) return -Infinity;
                    const dist = getHexDistance(capital.location, hex);
                    return 100000 - (dist * 10);
                }
                else if (needs.foodWarning) {
                    overrideActive = true;
                    if (tile.resource !== ResourceType.WHEAT && 
                        tile.resource !== ResourceType.FRUIT && 
                        tile.resource !== ResourceType.MEAT && 
                        tile.resource !== ResourceType.FISH && 
                        tile.resource !== ResourceType.NONE) { 
                        if (!tile.isHidden && tile.resource !== ResourceType.NONE) {
                             if (![ResourceType.WHEAT, ResourceType.FRUIT, ResourceType.MEAT, ResourceType.FISH].includes(tile.resource)) return -Infinity;
                        }
                    }
                } else if (needs.basicMaterials) {
                    overrideActive = true;
                    if (tile.resource !== ResourceType.WOOD && 
                        tile.resource !== ResourceType.COAL && 
                        tile.resource !== ResourceType.IRON &&
                        tile.resource !== ResourceType.NONE) {
                         if (!tile.isHidden && tile.resource !== ResourceType.NONE) return -Infinity;
                    }
                }
            }

            if (!overrideActive && this.terrainFilter !== 'ALL') {
                if (tile.terrain !== this.terrainFilter) return -Infinity;
            }

            const hasResource = tile.resource !== ResourceType.NONE && !tile.isHidden;
            if (!hasResource && tile.improvement === ImprovementType.NONE) return -Infinity;

            let score = 0;
            const distToCap = getHexDistance(capital.location, hex);

            if (this.heedAdvice && needs.foodWarning && [ResourceType.WHEAT, ResourceType.FRUIT, ResourceType.MEAT].includes(tile.resource)) {
                 score = 50000 - (distToCap * 10);
            } else if (this.heedAdvice && needs.basicMaterials && [ResourceType.WOOD, ResourceType.COAL, ResourceType.IRON].includes(tile.resource)) {
                 score = 40000 - (distToCap * 10);
            }
            else if (!overrideActive && this.autoPriority !== 'GENERAL') {
                if (tile.resource === this.autoPriority && !tile.isHidden) {
                    const distToUnit = getHexDistance(this.location, hex);
                    score = 20000 - (distToUnit * 10);
                } else {
                    return -Infinity;
                }
            } else {
                if (hasResource || tile.improvement !== ImprovementType.NONE) {
                    score = 5000 - (distToCap * 20); 
                    
                    if ([ResourceType.COAL, ResourceType.IRON, ResourceType.GOLD, ResourceType.OIL].includes(tile.resource)) {
                        score += 2000;
                    }
                } else {
                    return -Infinity;
                }
            }
            
            if (tile.terrain === TerrainType.MOUNTAIN && hasResource) {
                score += 1000;
            }
            
            return score;
        };

        const target = AIHelpers.findBestTarget(this, map, scoreFunction);

        if (target) {
            const tile = map.getTile(target.q, target.r);
            if (tile) {
                const canBuildDepotOnTarget = tile.resource === ResourceType.NONE || tile.resource === ResourceType.WOOD || tile.isHidden;
                
                if (!canBuildDepotOnTarget) {
                    const smartSpot = AIHelpers.findOptimalDepotSpot(map, target, net);
                    if (smartSpot) {
                        this.intentToBuildDepot = true;
                        return smartSpot; 
                    }
                } else {
                    this.intentToBuildDepot = true;
                }
            }
        }

        return target;
    }

    private moveToTarget(
        map: GameMap, 
        pathfinder: Pathfinder,
        capital: City,
        techs: Set<string>,
        allUnits: any[],
        transportNetwork: TransportNetwork
    ): string {
        const path = pathfinder.getPathTo(this, this.targetHex!, pathfinder.getMovementRange(this));

        if (path.length > 0) {
            const nextStep = path[0]; 
            const cost = pathfinder.getTileMoveCost(nextStep, this);
            
            if (this.movesLeft >= cost) {
                const savedTarget = this.targetHex; 
                const savedIntent = this.intentToBuildDepot;

                this.move([nextStep], cost); 
                this.isAutomated = true;
                this.targetHex = savedTarget;
                this.intentToBuildDepot = savedIntent;

                if (this.movesLeft > 0) {
                     return this.doAutoTurn(map, pathfinder, capital, techs, allUnits, transportNetwork) || "В пути...";
                }
                return "Авто: В пути...";
            }
        } else {
            const longPath = pathfinder.findPath(this, this.targetHex!);
            if (longPath.length > 0) {
                const nextStep = longPath[0];
                const cost = pathfinder.getTileMoveCost(nextStep, this);
                if (this.movesLeft >= cost) {
                    const savedTarget = this.targetHex;
                    const savedIntent = this.intentToBuildDepot;
                    
                    this.move([nextStep], cost); 
                    this.isAutomated = true;
                    this.targetHex = savedTarget;
                    this.intentToBuildDepot = savedIntent;
                    
                    if (this.movesLeft > 0) {
                         return this.doAutoTurn(map, pathfinder, capital, techs, allUnits, transportNetwork) || "Авто: Марш...";
                    }
                    return "Авто: Марш...";
                }
            }
        }
        return "Авто: Нет пути";
    }
}
