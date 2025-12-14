
import { GameMap, ResourceType, ImprovementType } from '../Grid/GameMap';
import { City } from '../Entities/City';
import { Unit } from '../Entities/Unit';
import { getHexDistance } from '../Grid/HexMath';
import { TransportNetwork } from '../Logistics/TransportNetwork';
import { getResourceName } from '../utils/Localization';
import { GameConfig } from './GameConfig';

export const analyzeGameState = (
    map: GameMap, 
    cities: City[], 
    units: Unit[], 
    year: number
): any => {
    const capital = cities[0];
    const opportunities: string[] = [];
    
    const getResNameRu = (r: ResourceType) => {
        switch(r) {
            case ResourceType.WHEAT: return "Пшеница";
            case ResourceType.WOOD: return "Дерево";
            case ResourceType.COAL: return "Уголь";
            case ResourceType.IRON: return "Железо";
            case ResourceType.GOLD: return "Золото";
            default: return "Ресурс";
        }
    };

    // Scan radius 4 around capital for unexploited resources
    if (capital) {
        const radius = 4;
        for(let q = -radius; q <= radius; q++) {
            for(let r = -radius; r <= radius; r++) {
                if (Math.abs(q+r) > radius) continue; 
                
                const hex = { q: capital.location.q + q, r: capital.location.r + r };
                if (!map.isValid(hex.q, hex.r)) continue;

                const tile = map.getTile(hex.q, hex.r);
                if (tile && tile.resource !== ResourceType.NONE && tile.improvement === ImprovementType.NONE) {
                    if (tile.isHidden) continue;
                    const dist = Math.floor(getHexDistance(capital.location, hex));
                    const resName = getResNameRu(tile.resource);
                    opportunities.push(`${resName} на расстоянии ${dist} клеток`);
                }
            }
        }
    }

    const inventory: Record<string, number> = {};
    if (capital) {
        capital.inventory.forEach((val, key) => {
            inventory[getResNameRu(key)] = val;
        });
    }

    const unitStatus = units.map(u => ({
        type: u.type,
        status: u.movesLeft > 0 ? "Готов к действию" : "Ход завершен"
    }));

    return {
        year: year,
        capitalFounded: !!capital,
        inventory,
        cash: capital?.cash || 0,
        expertLabor: capital?.expertLabor || 0,
        units: unitStatus,
        nearbyResources: opportunities.slice(0, 6)
    };
};

// --- STRATEGIC ADVICE SYSTEM ---

enum Priority {
    CRITICAL = 0,
    HIGH = 1,
    MEDIUM = 2,
    LOW = 3
}

interface Advice {
    message: string;
    priority: Priority;
}

// Structured needs for AI Units to consume
export interface EmpireNeeds {
    foodCritical: boolean; // < 3 turns of food
    foodWarning: boolean;  // < 10 turns of food
    basicMaterials: boolean; // Lack of Wood/Iron/Coal
    needsIndustry: boolean;
    moneyCritical: boolean; // < $5000
}

export const getEmpireNeeds = (city: City | null): EmpireNeeds => {
    const result = {
        foodCritical: false,
        foodWarning: false,
        basicMaterials: false,
        needsIndustry: false,
        moneyCritical: false
    };

    if (!city) return result;

    const pop = city.population;
    // Basic assumption: 1 pop eats roughly 1 unit of food per turn (simplified diet logic)
    // Actually in Economy.ts it's exactly 1 unit per person (Grain/Fruit/Protein mix)
    const consumptionPerTurn = Math.max(1, pop); 

    const grain = city.inventory.get(ResourceType.WHEAT) || 0;
    const fruit = city.inventory.get(ResourceType.FRUIT) || 0;
    const meat = city.inventory.get(ResourceType.MEAT) || 0;
    const fish = city.inventory.get(ResourceType.FISH) || 0;
    const canned = city.inventory.get(ResourceType.CANNED_FOOD) || 0;

    const totalFood = grain + fruit + meat + fish + canned;
    const turnsOfFood = totalFood / consumptionPerTurn;

    if (turnsOfFood < 3) {
        result.foodCritical = true;
        result.foodWarning = true;
    } else if (turnsOfFood < 10) {
        result.foodWarning = true;
    }

    const wood = city.inventory.get(ResourceType.WOOD) || 0;
    const coal = city.inventory.get(ResourceType.COAL) || 0;
    const iron = city.inventory.get(ResourceType.IRON) || 0;
    const lumber = city.inventory.get(ResourceType.LUMBER) || 0;

    // Check basic construction mats. 
    // If we have no wood and no lumber, it's critical. 
    // Or if we have low coal/iron for rail expansion.
    if ((wood < 5 && lumber < 5) || coal < 5 || iron < 5) {
        result.basicMaterials = true;
    }
    
    // Check cash for critical Engineer behavior (saving mode)
    if (city.cash < 5000) {
        result.moneyCritical = true;
    }

    return result;
};

export const getStrategicAdvice = (
    map: GameMap,
    cities: City[],
    network: TransportNetwork
): string[] => {
    const adviceList: Advice[] = [];
    const capital = cities[0];

    if (!capital) return ["🔴 КРИТИЧНО: Столица не основана!"];

    const needs = getEmpireNeeds(capital);
    const pop = capital.population;
    const totalFood = (capital.inventory.get(ResourceType.WHEAT)||0) + (capital.inventory.get(ResourceType.FRUIT)||0) + (capital.inventory.get(ResourceType.MEAT)||0) + (capital.inventory.get(ResourceType.FISH)||0) + (capital.inventory.get(ResourceType.CANNED_FOOD)||0);
    const turnsOfFood = Math.floor(totalFood / Math.max(1, pop));

    // --- 1. АНАЛИЗ ГОЛОДА (Maslow Level 1) ---
    if (needs.foodCritical) {
        adviceList.push({
            message: `🔴 ГОЛОД НЕИЗБЕЖЕН: Еды осталось на ${turnsOfFood} ход(а)! Население начнет умирать. Срочно стройте Депо у Пшеницы/Рыбы/Скота!`,
            priority: Priority.CRITICAL
        });
    } else if (needs.foodWarning) {
        adviceList.push({
            message: `🟠 Угроза голода: Запасов еды хватит лишь на ${turnsOfFood} ходов. Расширяйте аграрную сеть.`,
            priority: Priority.HIGH
        });
    } else {
        // Detailed diet check if bulk food is okay
        const canned = capital.inventory.get(ResourceType.CANNED_FOOD) || 0;
        const grain = capital.inventory.get(ResourceType.WHEAT) || 0;
        const protein = (capital.inventory.get(ResourceType.MEAT) || 0) + (capital.inventory.get(ResourceType.FISH) || 0);

        if (canned === 0) {
            if (grain < pop * 2) { // < 2 turns buffer of specific food
                adviceList.push({
                    message: `🟡 Рацион: Мало Пшеницы. Возможны болезни.`,
                    priority: Priority.MEDIUM
                });
            }
            if (protein < pop) {
                adviceList.push({
                    message: `🟡 Рацион: Дефицит белка (Мясо/Рыба).`,
                    priority: Priority.MEDIUM
                });
            }
        }
    }

    // --- 2. БАЗОВЫЕ РЕСУРСЫ (Maslow Level 2) ---
    const wood = capital.inventory.get(ResourceType.WOOD) || 0;
    const lumber = capital.inventory.get(ResourceType.LUMBER) || 0;
    const paper = capital.inventory.get(ResourceType.PAPER) || 0;
    const steel = capital.inventory.get(ResourceType.STEEL) || 0;

    if (needs.basicMaterials) {
        if (wood < 5 && lumber < 5) {
            adviceList.push({
                message: `🔴 СТОП: Нет Дерева. Стройка встала. Срочно подключите Лес!`,
                priority: Priority.HIGH
            });
        } else {
             adviceList.push({
                message: `🟡 Дефицит сырья: Мало Угля или Железа для промышленности.`,
                priority: Priority.MEDIUM
            });
        }
    }

    if (paper < 5 && wood > 0) {
        adviceList.push({
            message: `🟡 Развитие: Произведите Бумагу (в Лесопилке), чтобы нанимать специалистов.`,
            priority: Priority.MEDIUM
        });
    }

    // Проблема транспорта
    if (capital.transportCapacity < 30 && (lumber === 0 || steel === 0)) {
         adviceList.push({
            message: `🟡 Логистика: Для расширения транспорта нужны Пиломатериалы и Сталь.`,
            priority: Priority.MEDIUM
        });
    }

    // --- 3. ПРОМЫШЛЕННОСТЬ И ПРОИЗВОДСТВО (Maslow Level 3) ---
    const recipes = GameConfig.ECONOMY.RECIPES;

    recipes.forEach(recipe => {
        // Check targets by Recipe Name to avoid conflicts
        const target = capital.productionTargets.get(recipe.name) || 0;
        
        const inputStatus = recipe.inputs.map(input => {
            const stock = capital.inventory.get(input.type) || 0;
            const altStock = input.alternative ? (capital.inventory.get(input.alternative) || 0) : 0;
            return { type: input.type, has: stock + altStock, needed: input.amount };
        });

        const hasInputs = inputStatus.every(i => i.has >= i.needed * 5); // Есть запас
        const isStarved = inputStatus.some(i => i.has < i.needed); // Прямо сейчас не хватит на 1 цикл
        const outName = getResourceName(recipe.output);
        const buildName = recipe.building;

        if (target > 0 && isStarved) {
            adviceList.push({
                message: `⚠️ Простой завода: ${buildName} простаивает без сырья.`,
                priority: Priority.MEDIUM
            });
        } 
        else if (target === 0 && hasInputs) {
            adviceList.push({
                message: `🟢 Возможность: Много сырья. Запустите производство: ${outName}.`,
                priority: Priority.LOW
            });
        }
    });

    // --- 4. ЛОГИСТИКА И СВЯЗЬ ---
    let disconnectedCount = 0;
    for(let r=0; r<map.height; r++) {
        for(let c=0; c<map.width; c++) {
             const q = c - (r - (r & 1)) / 2;
             const tile = map.getTile(q, r);
             if (tile && (tile.improvement === ImprovementType.DEPOT || tile.improvement === ImprovementType.PORT)) {
                 if (!network.isConnectedToCapital({q, r})) {
                     disconnectedCount++;
                 }
             }
        }
    }

    if (disconnectedCount > 0) {
        adviceList.push({
            message: `🟠 Разрыв сети: ${disconnectedCount} станций не подключены к столице.`,
            priority: Priority.HIGH
        });
    }
    
    if (capital.cash < 200) {
         adviceList.push({
            message: `🔴 Банкротство: Казна пуста! Продавайте ресурсы или остановите стройку.`,
            priority: Priority.CRITICAL
        });
    } else if (needs.moneyCritical) {
         adviceList.push({
            message: `🟠 Бюджет: Казна ниже $5000. Инженеры переходят в режим экономии (ищут только Золото).`,
            priority: Priority.HIGH
        });
    }

    // Сортировка по приоритету
    adviceList.sort((a, b) => a.priority - b.priority);

    return adviceList.map(a => a.message);
};

// Compatibility export
export const getGameWarnings = (map: GameMap, cities: City[], network: TransportNetwork): string[] => {
    return getStrategicAdvice(map, cities, network);
};
