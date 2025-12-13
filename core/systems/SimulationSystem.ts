
import { Game } from '../Game';
import { Unit } from '../../Entities/Unit';
import { Pathfinder } from '../../Grid/Pathfinding';
import { TransportNetwork } from '../../Logistics/TransportNetwork';
import { ActionSystem } from './ActionSystem';

export class SimulationSystem {
    
    /**
     * Creates a deep copy of the Game instance for simulation purposes.
     * This bypasses the constructor to avoid canvas/DOM dependencies.
     */
    public static createDeepClone(original: Game): Game {
        // Create a shallow Game instance (without canvas/loop)
        const clone = Object.create(Game.prototype);
        
        // 1. Deep Clone Map
        clone.map = original.map.cloneDeep();
        
        // 2. Re-create Dependencies with new Map
        clone.pathfinder = new Pathfinder(clone.map);
        clone.transportNetwork = new TransportNetwork(clone.map);
        
        // 3. Deep Clone Managers
        clone.cityManager = original.cityManager.cloneDeep(clone.map, clone.transportNetwork);
        clone.unitManager = original.unitManager.cloneDeep(clone.map, clone.pathfinder);
        
        // 4. Re-create Action System with new context
        clone.actions = new ActionSystem(clone);

        // 5. Copy Primitives & Simple Objects
        clone.turn = original.turn;
        clone.year = original.year;
        clone.technologies = new Set(original.technologies);
        clone.windStrength = original.windStrength;
        clone.time = original.time;
        
        // No rendering or input needed for simulation
        clone.isReady = true; 
        
        return clone;
    }

    /**
     * Simulates a turn given a list of actions, returning the resulting game state analysis.
     * This runs on a deep clone and does not affect the actual game.
     */
    public static simulateTurn(sourceGame: Game, unitActions: {unitId: string, action: string}[]): any {
        const clone = this.createDeepClone(sourceGame);
        
        // 1. Execute Actions
        for (const cmd of unitActions) {
            const unit = clone.unitManager.units.find((u: Unit) => u.id === cmd.unitId);
            if (unit) {
                clone.selectUnit(unit);
                clone.doUnitAction(cmd.action);
            }
        }

        // 2. Resolve Turn (Logic Only)
        // Assuming zero shipments for base simulation unless provided
        clone.resolveTurn(new Map());

        // 3. Analyze Result
        return clone.getGameStateAnalysis();
    }
}
