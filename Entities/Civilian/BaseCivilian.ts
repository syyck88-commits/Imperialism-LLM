
import { Unit, UnitType } from '../Unit';
import { GameMap } from '../../Grid/GameMap';
import { Pathfinder } from '../../Grid/Pathfinding';
import { City } from '../City';
import { TransportNetwork } from '../../Logistics/TransportNetwork';
import { Hex } from '../../Grid/HexMath';

/**
 * Base class for all civilian units.
 */
export class CivilianUnit extends Unit {
    
    // Tracks targets that pathfinding failed to reach, to avoid re-selecting them repeatedly.
    // Cleared if the unit moves successfully or automation toggles.
    public unreachableTargets: Set<string> = new Set();

    constructor(id: string, type: UnitType, location: Hex, ownerId: number = 1) {
        super(id, type, location, ownerId);
    }
    
    public doAutoTurn(
        map: GameMap, 
        pathfinder: Pathfinder, 
        capital: City | null, 
        techs: Set<string>, 
        allUnits: Unit[],
        transportNetwork?: TransportNetwork
    ): string | null {
        return null;
    }

    public clearUnreachable() {
        this.unreachableTargets.clear();
    }
}
