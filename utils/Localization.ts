
import { TerrainType, ResourceType, ImprovementType } from '../Grid/GameMap';
import { UnitType } from '../Entities/Unit';
import { CostConfig } from '../core/GameConfig';

export const getTerrainName = (t: TerrainType) => {
    switch(t) {
        case TerrainType.WATER: return 'Вода';
        case TerrainType.PLAINS: return 'Равнины';
        case TerrainType.FOREST: return 'Лес';
        case TerrainType.HILLS: return 'Холмы';
        case TerrainType.MOUNTAIN: return 'Горы';
        case TerrainType.DESERT: return 'Пустыня';
        case TerrainType.SWAMP: return 'Болото';
        case TerrainType.TUNDRA: return 'Тундра';
        default: return 'Неизвестно';
    }
};

export const getResourceName = (r: ResourceType) => {
    switch(r) {
        case ResourceType.NONE: return 'Нет';
        case ResourceType.WHEAT: return 'Пшеница';
        case ResourceType.WOOD: return 'Дерево';
        case ResourceType.COAL: return 'Уголь';
        case ResourceType.IRON: return 'Железо';
        case ResourceType.GOLD: return 'Золото';
        case ResourceType.GEMS: return 'Самоцветы';
        case ResourceType.LUMBER: return 'Пиломатериалы';
        case ResourceType.STEEL: return 'Сталь';
        case ResourceType.FURNITURE: return 'Мебель';
        case ResourceType.CLOTHING: return 'Одежда';
        case ResourceType.PAPER: return 'Бумага';
        case ResourceType.OIL: return 'Нефть';
        case ResourceType.MEAT: return 'Мясо/Скот';
        case ResourceType.FISH: return 'Рыба';
        case ResourceType.CANNED_FOOD: return 'Консервы';
        case ResourceType.WOOL: return 'Шерсть';
        case ResourceType.COTTON: return 'Хлопок';
        case ResourceType.FRUIT: return 'Фрукты';
        case ResourceType.SPICE: return 'Пряности';
        case ResourceType.FABRIC: return 'Ткань';
        case ResourceType.ARMAMENTS: return 'Оружие';
        default: return '';
    }
};

export const getImprovementName = (i: ImprovementType) => {
    switch(i) {
        case ImprovementType.NONE: return 'Нет';
        case ImprovementType.FARM: return 'Ферма';
        case ImprovementType.MINE: return 'Шахта';
        case ImprovementType.ROAD: return 'Дорога';
        case ImprovementType.RAILROAD: return 'Ж/Д';
        case ImprovementType.CITY: return 'Город';
        case ImprovementType.LUMBER_MILL: return 'Лесопилка';
        case ImprovementType.DEPOT: return 'Депо';
        case ImprovementType.PORT: return 'Порт';
        case ImprovementType.OIL_WELL: return 'Вышка';
        case ImprovementType.RANCH: return 'Ранчо';
        case ImprovementType.PLANTATION: return 'Плантация';
        default: return '';
    }
};

export const getUnitName = (type: string) => {
    switch(type) {
        case UnitType.ENGINEER: return 'Инженер';
        case UnitType.SOLDIER: return 'Солдат';
        case UnitType.PROSPECTOR: return 'Геолог';
        case UnitType.FARMER: return 'Фермер';
        case UnitType.MINER: return 'Шахтер';
        case UnitType.FORESTER: return 'Лесник';
        case UnitType.RANCHER: return 'Пастух';
        case UnitType.DRILLER: return 'Буровик';
        case UnitType.DEVELOPER: return 'Риелтор';
        default: return type;
    }
};

export const formatCost = (cost: CostConfig): string => {
    const parts: string[] = [];
    if (cost.money && cost.money > 0) parts.push(`$${cost.money}`);
    
    if (cost.resources) {
        cost.resources.forEach(r => {
            parts.push(`${r.amount} ${getResourceName(r.type)}`);
        });
    }
    
    if (cost.expertLabor) {
        parts.push(`${cost.expertLabor} Эксперт(а)`);
    }
    
    return parts.length > 0 ? parts.join(', ') : "Бесплатно";
};
