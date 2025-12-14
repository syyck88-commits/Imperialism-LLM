
import { Unit, UnitType } from '../Entities/Unit';
import { Engineer, Prospector, ResourceImprover, Developer } from '../Entities/CivilianUnit';
import { City } from '../Entities/City';
import { Hex } from '../Grid/HexMath';
import { GameConfig } from './GameConfig';

interface CreationResult {
    success: boolean;
    unit?: Unit;
    message: string;
}

export class University {
    
    public static getUnitCost(): string {
        const c = GameConfig.UNITS.CONSTRUCTION.COST;
        const parts = [];
        if (c.money) parts.push(`$${c.money}`);
        if (c.resources) {
            c.resources.forEach(r => parts.push(`${r.amount} Paper`)); // simplified text for now
        }
        if (c.expertLabor) parts.push(`${c.expertLabor} Expert`);
        return parts.join(', ');
    }

    public static createUnit(
        type: UnitType, 
        city: City, 
        spawnHex: Hex, 
        techs: Set<string>, 
        nextId: string
    ): CreationResult {
        
        const cost = GameConfig.UNITS.CONSTRUCTION.COST;

        // 1. Basic Costs
        if (cost.money && city.cash < cost.money) return { success: false, message: `Недостаточно денег ($${cost.money}).` };
        
        if (cost.resources) {
            for (const r of cost.resources) {
                const stock = city.inventory.get(r.type) || 0;
                if (stock < r.amount) return { success: false, message: `Нет ресурса (ID ${r.type}) для обучения.` };
            }
        }

        if (cost.expertLabor && city.workforce.expert < cost.expertLabor) return { success: false, message: "Нет свободных Экспертов (Expert Labor)." };

        // 2. Tech Checks (Temporarily disabled per request)
        /*
        if (type === UnitType.RANCHER && !techs.has('Feed Grasses')) {
             return { success: false, message: "Требуется технология 'Feed Grasses'." };
        }
        if (type === UnitType.FORESTER && !techs.has('Iron Railroad Bridges')) {
             return { success: false, message: "Требуется технология 'Iron Railroad Bridges'." };
        }
        if (type === UnitType.DRILLER && !techs.has('Oil Drilling')) {
             return { success: false, message: "Требуется технология 'Oil Drilling'." };
        }
        */
        
        // 3. Deduction
        if (cost.money) city.cash -= cost.money;
        if (cost.resources) {
            for (const r of cost.resources) {
                city.consumeResource(r.type, r.amount);
            }
        }
        if (cost.expertLabor) city.workforce.expert -= cost.expertLabor;

        // 4. Instantiation
        let unit: Unit;
        
        switch(type) {
            case UnitType.ENGINEER:
                unit = new Engineer(nextId, spawnHex, city.ownerId);
                break;
            case UnitType.PROSPECTOR:
                unit = new Prospector(nextId, spawnHex, city.ownerId);
                break;
            case UnitType.DEVELOPER:
                unit = new Developer(nextId, spawnHex, city.ownerId);
                break;
            case UnitType.FARMER:
            case UnitType.MINER:
            case UnitType.RANCHER:
            case UnitType.FORESTER:
            case UnitType.DRILLER:
                unit = new ResourceImprover(nextId, type, spawnHex, city.ownerId);
                break;
            case UnitType.SOLDIER:
                unit = new Unit(nextId, UnitType.SOLDIER, spawnHex, city.ownerId);
                break;
            default:
                // Fallback for soldiers or generics
                unit = new Unit(nextId, type, spawnHex, city.ownerId);
        }

        return { success: true, unit, message: "Юнит обучен!" };
    }

    public static disbandUnit(unit: Unit, city: City): void {
        const cost = GameConfig.UNITS.CONSTRUCTION.COST;
        // Return Expert to the pool
        if (unit.type !== UnitType.SOLDIER && cost.expertLabor) {
             city.workforce.expert += cost.expertLabor;
        }
    }
}
