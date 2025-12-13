

import { UnitType, Unit } from '../Unit';
import { CivilianUnit } from './BaseCivilian';
import { Hex, areHexesEqual, hexToString, getHexDistance, getHexNeighbors } from '../../Grid/HexMath';
import { GameMap, ImprovementType, ResourceType, TerrainType } from '../../Grid/GameMap';
import { City } from '../City';
import { Pathfinder } from '../../Grid/Pathfinding';
import { TransportNetwork } from '../../Logistics/TransportNetwork';
import { AIHelpers } from '../AI/AIHelpers';

export class ResourceImprover extends CivilianUnit {
    public autoTargetResource: ResourceType | 'ALL' = 'ALL';

    constructor(id: string, type: UnitType, location: Hex, ownerId: number = 1) {
        super(id, type, location, ownerId);
    }

    public setFilter(filter: ResourceType | 'ALL') {
        this.autoTargetResource = filter;
        this.targetHex = null;
        this.clearUnreachable();
    }

    private canImproveResource(res: ResourceType, techs: Set<string>): boolean {
        switch(this.type) {
            case UnitType.FARMER: return [ResourceType.WHEAT, ResourceType.COTTON, ResourceType.FRUIT, ResourceType.SPICE].includes(res);
            case UnitType.MINER: return [ResourceType.IRON, ResourceType.COAL, ResourceType.GOLD, ResourceType.GEMS].includes(res);
            case UnitType.FORESTER: return res === ResourceType.WOOD && techs.has('Iron Railroad Bridges');
            case UnitType.RANCHER: return [ResourceType.WOOL, ResourceType.MEAT].includes(res) && techs.has('Feed Grasses');
            case UnitType.DRILLER: return res === ResourceType.OIL && techs.has('Oil Drilling');
            default: return false;
        }
    }

    private isCompatibleImprovement(imp: ImprovementType): boolean {
        switch(this.type) {
            case UnitType.FARMER: return imp === ImprovementType.FARM || imp === ImprovementType.PLANTATION;
            case UnitType.MINER: return imp === ImprovementType.MINE;
            case UnitType.FORESTER: return imp === ImprovementType.LUMBER_MILL;
            case UnitType.RANCHER: return imp === ImprovementType.RANCH;
            case UnitType.DRILLER: return imp === ImprovementType.OIL_WELL;
            default: return false;
        }
    }

    public override doAutoTurn(
        map: GameMap, 
        pathfinder: Pathfinder, 
        capital: City | null, 
        techs: Set<string>, 
        allUnits: Unit[],
        transportNetwork?: TransportNetwork
    ): string | null {
        this.debugStatus = "Поиск работы...";
        
        // 1. Work Current Tile
        const tile = map.getTile(this.location.q, this.location.r);
        if (tile && !tile.isHidden && this.canImproveResource(tile.resource, techs)) {
             if (this.autoTargetResource === 'ALL' || tile.resource === this.autoTargetResource) {
                 const isCompatible = this.isCompatibleImprovement(tile.improvement); 
                 
                 // Logic: If NO improvement, we can build. If Infrastructure (Road), we can build. If Compatible (Mine lvl 1), we can upgrade.
                 // EXCEPTION: In Mountains, we explicitly require Infrastructure to already exist (Road or previous Mine).
                 
                 const canBuildHere = tile.improvement === ImprovementType.NONE || 
                                      tile.improvement === ImprovementType.ROAD || 
                                      tile.improvement === ImprovementType.RAILROAD ||
                                      (isCompatible && tile.improvementLevel < 3);

                 if (canBuildHere) {
                     // Constraint: Mountains need roads first. 
                     // If improvement is NONE, it means no road.
                     if (tile.terrain === TerrainType.MOUNTAIN && tile.improvement === ImprovementType.NONE) {
                         return "Жду дорогу...";
                     }

                     if (this.movesLeft > 0) {
                         this.targetHex = null;
                         this.clearUnreachable();
                         this.debugStatus = "Улучшаю ресурс...";
                         return this.improve(map, techs);
                     } else {
                         this.debugStatus = "Жду хода...";
                         return "Ожидание.";
                     }
                 }
             }
        }

        // 2. Find Target using AIHelpers
        if (!this.targetHex) {
            // Get reserved hexes directly. Radius 0 means "don't touch my tile".
            const reservedHexes = AIHelpers.getReservedHexes(allUnits, this, 0);

            this.targetHex = AIHelpers.findBestTarget(this, map, (hex, t) => {
                // Exclusions
                if (reservedHexes.has(hexToString(hex))) return -Infinity;
                if (t.isHidden) return -Infinity;
                if (!this.canImproveResource(t.resource, techs)) return -Infinity;
                if (this.autoTargetResource !== 'ALL' && t.resource !== this.autoTargetResource) return -Infinity;

                // Constraint: Mountains MUST have Infrastructure (Road/Rail/Mine)
                if (t.terrain === TerrainType.MOUNTAIN) {
                    if (t.improvement === ImprovementType.NONE) {
                        return -Infinity; // Wait for Engineer
                    }
                }

                const isCompatible = this.isCompatibleImprovement(t.improvement);
                const isRoad = t.improvement === ImprovementType.ROAD || t.improvement === ImprovementType.RAILROAD;
                const isTarget = t.improvement === ImprovementType.NONE || isRoad || (isCompatible && t.improvementLevel < 3);

                if (!isTarget) return -Infinity;

                // --- SCORING ---
                let score = 5000;

                // 1. Distance Penalty
                const dist = getHexDistance(this.location, hex);
                score -= (dist * 20);

                // 2. Transport Network Bonus (STRATEGIC IMPORTANCE)
                if (transportNetwork) {
                    // Direct connection (Road/Rail exists) -> Massive Bonus (Instant Yield)
                    if (transportNetwork.isConnectedToCapital(hex)) {
                        score += 1500;
                    } 
                    else {
                        // Neighbor connection -> Big Bonus (Cheap to connect, only 1 road needed)
                        const neighbors = getHexNeighbors(hex);
                        const isNearNet = neighbors.some(n => transportNetwork.isConnectedToCapital(n));
                        if (isNearNet) {
                            score += 800;
                        }
                    }
                }

                // 3. Resource Value Modifiers
                if (t.resource === ResourceType.GOLD || t.resource === ResourceType.GEMS || t.resource === ResourceType.OIL) {
                    score += 500;
                }

                return score;

            }, this.unreachableTargets); // Pass exclusion list
        }

        if (!this.targetHex) {
            this.debugStatus = "Нет ресурсов для улучшения";
            return "Нет целей.";
        }

        this.debugStatus = "Иду на работу...";
        const path = pathfinder.findPath(this, this.targetHex);
        
        if (path.length > 0) {
            const step = path[0];
            const cost = pathfinder.getTileMoveCost(step, this);
            if (this.movesLeft >= cost) {
                const savedTarget = this.targetHex;
                
                this.move([step], cost); // Fix: Array of 1 step
                this.clearUnreachable(); // We moved successfully, maybe paths opened up
                
                this.isAutomated = true;
                this.targetHex = savedTarget;
                
                if (savedTarget && areHexesEqual(this.location, savedTarget)) {
                     // We arrived! Recurse to work immediately if possible
                     return this.doAutoTurn(map, pathfinder, capital, techs, allUnits, transportNetwork);
                }
                
                // RECURSIVE MOVE: If we still have moves left, keep going!
                if (this.movesLeft > 0) {
                    return this.doAutoTurn(map, pathfinder, capital, techs, allUnits, transportNetwork);
                }

                return "В пути...";
            }
            return "Жду хода...";
        } else {
            // Pathfinding failed! The target is likely unreachable.
            if (this.targetHex) {
                this.unreachableTargets.add(hexToString(this.targetHex));
                this.targetHex = null;
                // Recursive call to find the NEXT best target
                return this.doAutoTurn(map, pathfinder, capital, techs, allUnits, transportNetwork);
            }
        }

        return "Нет пути.";
    }

    public improve(map: GameMap, techs: Set<string>): string {
        const tile = map.getTile(this.location.q, this.location.r);
        if (!tile) return "Ошибка карты.";
        
        if (tile.terrain === TerrainType.MOUNTAIN && tile.improvement === ImprovementType.NONE) {
            return "В горах нужна дорога!";
        }

        let targetImp = ImprovementType.NONE;
        
        switch(this.type) {
            case UnitType.FARMER:
                if (tile.resource === ResourceType.WHEAT) targetImp = ImprovementType.FARM;
                else if ([ResourceType.COTTON, ResourceType.FRUIT, ResourceType.SPICE].includes(tile.resource)) targetImp = ImprovementType.PLANTATION;
                break;
            case UnitType.MINER:
                if ([ResourceType.IRON, ResourceType.COAL, ResourceType.GOLD, ResourceType.GEMS].includes(tile.resource)) targetImp = ImprovementType.MINE;
                break;
            case UnitType.FORESTER: targetImp = ImprovementType.LUMBER_MILL; break;
            case UnitType.RANCHER: targetImp = ImprovementType.RANCH; break;
            case UnitType.DRILLER: targetImp = ImprovementType.OIL_WELL; break;
        }

        if (targetImp === ImprovementType.NONE) return "Неподходящий ресурс.";
        
        const isInfrastructure = tile.improvement === ImprovementType.ROAD || 
                                 tile.improvement === ImprovementType.RAILROAD || 
                                 tile.improvement === ImprovementType.NONE;

        if (isInfrastructure) {
            // Build Level 1
            map.setTile(this.location.q, this.location.r, { improvement: targetImp, improvementLevel: 1 });
            this.movesLeft = 0;
            return `Построено: ${ImprovementType[targetImp]}`;
        } else if (tile.improvement === targetImp) {
            // Upgrade
            if (tile.improvementLevel >= 3) return "Макс. уровень.";
            map.setTile(this.location.q, this.location.r, { improvementLevel: tile.improvementLevel + 1 });
            this.movesLeft = 0;
            return "Улучшено!";
        }
        return "Занято.";
    }
}
