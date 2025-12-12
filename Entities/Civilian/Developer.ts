
import { UnitType } from '../Unit';
import { CivilianUnit } from './BaseCivilian';
import { Hex } from '../../Grid/HexMath';
import { GameMap } from '../../Grid/GameMap';
import { City } from '../City';
import { GameConfig } from '../../core/GameConfig';

export class Developer extends CivilianUnit {
    constructor(id: string, location: Hex, ownerId: number = 1) {
        super(id, UnitType.DEVELOPER, location, ownerId);
    }

    public buyLand(map: GameMap, city: City): string {
        if (this.movesLeft <= 0) return "Нет очков движения.";
        
        const costConfig = GameConfig.ACTIONS.BUY_LAND;
        const cost = costConfig.money || 0;

        if (city.cash < cost) return `Недостаточно средств ($${cost}).`;

        const tile = map.getTile(this.location.q, this.location.r);
        if (tile?.owner === this.ownerId) return "Земля уже принадлежит нам.";

        city.cash -= cost;
        map.setTile(this.location.q, this.location.r, { owner: this.ownerId });
        this.movesLeft = 0;

        return "Земля куплена!";
    }
}
