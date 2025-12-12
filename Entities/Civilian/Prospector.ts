

import { UnitType, Unit } from '../Unit';
import { CivilianUnit } from './BaseCivilian';
import { Hex, areHexesEqual, hexToString, getHexDistance } from '../../Grid/HexMath';
import { GameMap, TerrainType, ResourceType } from '../../Grid/GameMap';
import { City } from '../City';
import { Pathfinder } from '../../Grid/Pathfinding';
import { TransportNetwork } from '../../Logistics/TransportNetwork';
import { AIHelpers } from '../AI/AIHelpers';

export type ProspectFilter = 'ALL' | 'HILLS' | 'MOUNTAIN' | 'DESERT';

export class Prospector extends CivilianUnit {
    public prospectFilter: ProspectFilter = 'ALL';

    constructor(id: string, location: Hex, ownerId: number = 1) {
        super(id, UnitType.PROSPECTOR, location, ownerId);
    }

    public setFilter(filter: ProspectFilter) {
        this.prospectFilter = filter;
        this.targetHex = null;
    }

    public prospect(map: GameMap): string {
        if (this.movesLeft <= 0) return "Нет очков движения.";

        const tile = map.getTile(this.location.q, this.location.r);
        if (!tile) return "Неверная локация.";
        
        const validTerrains = [TerrainType.HILLS, TerrainType.MOUNTAIN, TerrainType.DESERT, TerrainType.TUNDRA];

        if (!validTerrains.includes(tile.terrain)) return "Здесь нечего искать.";

        this.movesLeft = 0; 
        map.setTile(this.location.q, this.location.r, { isProspected: true });
        this.targetHex = null;

        if (tile.isHidden) {
            map.setTile(this.location.q, this.location.r, { isHidden: false });
            return `Успех! Обнаружены залежи: ${ResourceType[tile.resource]}!`;
        } else if (tile.resource !== ResourceType.NONE) {
            return "Ресурсы здесь уже известны.";
        }

        return "Ничего не найдено.";
    }

    public override doAutoTurn(
        map: GameMap, 
        pathfinder: Pathfinder, 
        capital: City | null, 
        techs: Set<string>, 
        allUnits: Unit[],
        transportNetwork?: TransportNetwork
    ): string | null {
        const validTerrains = [TerrainType.HILLS, TerrainType.MOUNTAIN, TerrainType.DESERT, TerrainType.TUNDRA];
        const currentTile = map.getTile(this.location.q, this.location.r);

        this.debugStatus = "Сканирование...";

        // 1. Check current tile
        if (currentTile && !currentTile.isProspected && validTerrains.includes(currentTile.terrain)) {
            let passesFilter = this.checkFilter(currentTile.terrain);
            if (passesFilter) {
                this.debugStatus = "Веду разведку...";
                return this.prospect(map);
            }
        }

        // 2. Find Target using AIHelpers
        if (!this.targetHex) {
            // Get reserved hexes strings for quick lookup
            const reservedHexes = new Set(
                AIHelpers.getColleagueTargets(allUnits, this).map(h => hexToString(h))
            );

            this.targetHex = AIHelpers.findBestTarget(this, map, (hex, tile) => {
                // Filter Logic
                if (reservedHexes.has(hexToString(hex))) return -Infinity;
                if (tile.isProspected) return -Infinity;
                if (!validTerrains.includes(tile.terrain)) return -Infinity;
                if (!this.checkFilter(tile.terrain)) return -Infinity;

                // Scoring Logic (Simple: Closest is best)
                return -getHexDistance(this.location, hex);
            });
        }

        if (!this.targetHex) {
            this.debugStatus = "Нет зон для поиска";
            this.isAutomated = false;
            return "Нет целей.";
        }

        this.debugStatus = `Иду искать (${this.targetHex.q}, ${this.targetHex.r})`;

        const path = pathfinder.findPath(this, this.targetHex);
        if (path.length > 0) {
            const step = path[0];
            const cost = pathfinder.getTileMoveCost(step, this);
            if (this.movesLeft >= cost) {
                const savedTarget = this.targetHex;
                
                this.move([step], cost); // Fix: Array of 1 step
                
                this.isAutomated = true;
                this.targetHex = savedTarget;
                
                if (savedTarget && areHexesEqual(this.location, savedTarget)) {
                    return this.prospect(map);
                }
                return "В пути...";
            }
        }

        return "Нет пути.";
    }

    private checkFilter(terrain: TerrainType): boolean {
        if (this.prospectFilter === 'ALL') return true;
        if (this.prospectFilter === 'HILLS' && terrain === TerrainType.HILLS) return true;
        if (this.prospectFilter === 'MOUNTAIN' && terrain === TerrainType.MOUNTAIN) return true;
        if (this.prospectFilter === 'DESERT' && terrain === TerrainType.DESERT) return true;
        return false;
    }
}