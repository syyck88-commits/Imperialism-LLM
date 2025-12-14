
import { Game } from '../Game';
import { UnitType } from '../../Entities/Unit';
import { ImprovementType, ResourceType } from '../../Grid/GameMap';

export class ActionSystem {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public recruitUnit(type: UnitType): string {
        if (this.game.cityManager.cities.length === 0) return "Нет столицы.";
        const msg = this.game.unitManager.recruitUnit(type, this.game.cityManager.cities[0], this.game.turn, this.game.technologies);
        this.game.triggerCapitalUpdate();
        return msg;
    }

    public disbandSelectedUnit() {
        this.game.unitManager.disbandSelectedUnit(this.game.cityManager.capital);
        this.game.triggerSelectionUpdate();
        this.game.triggerCapitalUpdate();
    }

    public setCityProduction(resource: ResourceType, isActive: boolean) {
        this.game.cityManager.setProduction(resource, isActive);
        this.game.triggerCapitalUpdate();
    }

    public doUnitAction(action: string): string | undefined {
        const u = this.game.selectedUnit;
        if (!u) return;

        // Command Switch
        if (action === 'prospect') return this.doProspect();
        if (action === 'road') return this.doBuildRoad();
        if (action === 'depot') return this.doBuildDepot();
        if (action === 'port') return this.doBuildPort();
        if (action === 'improve') return this.doImproveResource();
        if (action === 'buyland') return this.doBuyLand();
        
        // State Toggles
        if (action === 'sleep') {
            this.game.toggleSleep();
            return;
        }
        if (action === 'auto') {
            this.game.toggleAuto();
            return;
        }
        
        // Filter Actions
        if (action.startsWith('set_filter_')) {
            const filter = action.replace('set_filter_', '') as any;
            this.game.setProspectorFilter(filter);
            return;
        }

        if (action.startsWith('set_res_filter_')) {
            const val = action.replace('set_res_filter_', '');
            const filter = val === 'ALL' ? 'ALL' : parseInt(val) as ResourceType;
            this.game.setImproverFilter(filter);
            return;
        }

        if (action.startsWith('set_eng_priority_')) {
            const val = action.replace('set_eng_priority_', '');
            this.game.setEngineerPriority(val);
            return;
        }

        if (action.startsWith('set_eng_terrain_')) {
            const val = action.replace('set_eng_terrain_', '');
            this.game.setEngineerTerrain(val);
            return;
        }

        if (action === 'toggle_advice') {
            if (u && u.type === UnitType.ENGINEER) {
                // @ts-ignore
                if (u.toggleHeedAdvice) u.toggleHeedAdvice();
                this.game.triggerSelectionUpdate();
            }
            return;
        }
    }

    public doProspect(): string | undefined {
        const msg = this.game.unitManager.doProspect();
        this.game.triggerSelectionUpdate();
        return msg;
    }
  
    public doBuildRoad(): string | undefined {
        if (this.game.cities.length === 0) return;
        const msg = this.game.unitManager.doBuildRoad(this.game.cities[0]);
        this.game.transportNetwork.markDirty();
        this.game.triggerSelectionUpdate();
        this.game.triggerCapitalUpdate(); 
        return msg;
    }
  
    public doBuildDepot(): string | undefined {
        if (this.game.cities.length === 0) return;
        const msg = this.game.unitManager.doBuildDepot(this.game.cities[0]);
        this.game.transportNetwork.markDirty();
        this.game.triggerSelectionUpdate();
        this.game.triggerCapitalUpdate();
        return msg;
    }
  
    public doBuildPort(): string | undefined {
        if (this.game.cities.length === 0) return;
        const msg = this.game.unitManager.doBuildPort(this.game.cities[0]);
        this.game.transportNetwork.markDirty();
        this.game.triggerSelectionUpdate();
        this.game.triggerCapitalUpdate();
        return msg;
    }
  
    public doImproveResource(): string | undefined {
        const msg = this.game.unitManager.doImproveResource(this.game.technologies);
        this.game.triggerSelectionUpdate();
        return msg;
    }
    
    public doBuyLand(): string | undefined {
        if (this.game.cities.length === 0) return;
        const msg = this.game.unitManager.doBuyLand(this.game.cities[0]);
        this.game.triggerSelectionUpdate();
        this.game.triggerCapitalUpdate();
        return msg;
    }

    public buildImprovement(type: ImprovementType) {
        if (this.game.cities.length > 0) {
            this.game.unitManager.buildImprovement(type, this.game.cities[0]);
            this.game.transportNetwork.markDirty();
            this.game.triggerSelectionUpdate();
        }
    }
}
