
import { City } from "../Entities/City";
import { ResourceType } from "../Grid/GameMap";
import { GameConfig, CostConfig } from "./GameConfig";

export class Economy {
    
    public static processTurn(
        city: City, 
        shippedGoods: Map<ResourceType, number>
    ): void {
        console.group("🏭 Economy Phase: " + city.name);

        // 1. Update Inventory from Transport (Handle Gold/Gems -> Cash conversion)
        shippedGoods.forEach((amount, type) => {
            const conversionValue = GameConfig.ECONOMY.CASH_CONVERSION[type];
            if (conversionValue) {
                const totalCash = amount * conversionValue;
                city.cash += totalCash;
                console.log(`Converted ${amount} ${ResourceType[type]} to $${totalCash}`);
            } else {
                city.addResource(type, amount);
            }
        });

        // 2. Population Consumption (The Diet System)
        const totalPop = city.population;
        let healthyPop = 0;
        let sickPop = 0;
        let starvingPop = 0;

        // Inventory Refs
        let grain = city.inventory.get(ResourceType.WHEAT) || 0;
        let fruit = city.inventory.get(ResourceType.FRUIT) || 0;
        let meat = city.inventory.get(ResourceType.MEAT) || 0;
        let fish = city.inventory.get(ResourceType.FISH) || 0;
        let canned = city.inventory.get(ResourceType.CANNED_FOOD) || 0;

        // Calculate Needs
        // 50% Grain, 25% Fruit, 25% Meat/Fish
        const needsGrain = Math.ceil(totalPop * 0.5);
        const needsFruit = Math.ceil(totalPop * 0.25);
        const needsProtein = totalPop - needsGrain - needsFruit;

        // --- Process Grain Eaters ---
        for (let i=0; i<needsGrain; i++) {
            if (grain > 0) {
                grain--; healthyPop++;
            } else if (canned > 0) {
                canned--; healthyPop++;
            } else if (fruit > 0) {
                fruit--; sickPop++;
            } else if (meat > 0) {
                meat--; sickPop++;
            } else if (fish > 0) {
                fish--; sickPop++;
            } else {
                starvingPop++;
            }
        }

        // --- Process Fruit Eaters ---
        for (let i=0; i<needsFruit; i++) {
             if (fruit > 0) {
                fruit--; healthyPop++;
            } else if (canned > 0) {
                canned--; healthyPop++;
            } else if (grain > 0) {
                grain--; sickPop++;
            } else if (meat > 0) {
                meat--; sickPop++;
            } else if (fish > 0) {
                fish--; sickPop++;
            } else {
                starvingPop++;
            }
        }

        // --- Process Protein Eaters ---
        for (let i=0; i<needsProtein; i++) {
            if (meat > 0) {
                meat--; healthyPop++;
            } else if (fish > 0) {
                fish--; healthyPop++;
            } else if (canned > 0) {
                canned--; healthyPop++;
            } else if (grain > 0) {
                grain--; sickPop++;
            } else if (fruit > 0) {
                fruit--; sickPop++;
            } else {
                starvingPop++;
            }
        }

        // Apply Consumption Back to Inventory
        city.inventory.set(ResourceType.WHEAT, grain);
        city.inventory.set(ResourceType.FRUIT, fruit);
        city.inventory.set(ResourceType.MEAT, meat);
        city.inventory.set(ResourceType.FISH, fish);
        city.inventory.set(ResourceType.CANNED_FOOD, canned);

        // Apply Starvation
        if (starvingPop > 0) {
            console.warn(`WARNING: ${starvingPop} people died of starvation.`);
            let toKill = starvingPop;
            while (toKill > 0) {
                if (city.workforce.untrained > 0) city.workforce.untrained--;
                else if (city.workforce.trained > 0) city.workforce.trained--;
                else if (city.workforce.expert > 0) city.workforce.expert--;
                
                if (city.population > 0) city.population--;
                toKill--;
            }
        }

        // Calculate Available Labor Points
        const healthRatio = (city.population > 0) ? (healthyPop / city.population) : 0;
        
        let availableLabor = (
            (city.workforce.untrained * 1) + 
            (city.workforce.trained * 2) + 
            (city.workforce.expert * 4)
        ) * healthRatio;

        availableLabor = Math.floor(availableLabor);
        console.log(`Pop: ${city.population} | Healthy: ${healthyPop}, Sick: ${sickPop}, Starved: ${starvingPop}`);
        console.log(`Labor Points: ${availableLabor} (Health Ratio: ${Math.round(healthRatio*100)}%)`);

        // 3. Production Cycle
        const buildingUsage = new Map<string, number>();

        for (const recipe of GameConfig.ECONOMY.RECIPES) {
            // Check Target by RECIPE NAME (Allows multiple recipes for same output, e.g., Canned Food)
            const desiredRuns = city.productionTargets.get(recipe.name) || 0;
            
            if (desiredRuns <= 0) continue;

            const buildingCap = city.buildingLevels.get(recipe.building) || 0;
            const currentUsage = buildingUsage.get(recipe.building) || 0;
            const remainingCap = buildingCap - currentUsage;

            if (remainingCap <= 0) continue;

            // Cap target by remaining building capacity
            const cappedRuns = Math.min(desiredRuns, remainingCap);

            // Check Inputs
            let maxInputRuns = cappedRuns;
            
            for (const input of recipe.inputs) {
                let stock = city.inventory.get(input.type) || 0;
                
                // Handle Alternative (e.g., Wool OR Cotton)
                if (input.alternative) {
                    const altStock = city.inventory.get(input.alternative) || 0;
                    stock += altStock; 
                }

                const possible = Math.floor(stock / input.amount);
                maxInputRuns = Math.min(maxInputRuns, possible);
            }

            // Check Labor
            const maxLaborRuns = Math.floor(availableLabor / recipe.laborCost);
            
            // Final Runs
            const actualRuns = Math.min(cappedRuns, maxInputRuns, maxLaborRuns);

            if (actualRuns > 0) {
                // Consume Inputs
                for (const input of recipe.inputs) {
                    let needed = actualRuns * input.amount;
                    
                    // Consume primary first
                    let primaryStock = city.inventory.get(input.type) || 0;
                    if (primaryStock >= needed) {
                        city.inventory.set(input.type, primaryStock - needed);
                    } else {
                        // Consume all primary
                        city.inventory.set(input.type, 0);
                        needed -= primaryStock;
                        
                        // Consume alternative if exists
                        if (input.alternative) {
                            let altStock = city.inventory.get(input.alternative) || 0;
                            city.inventory.set(input.alternative, altStock - needed);
                        }
                    }
                }

                // Produce Output
                const producedAmount = actualRuns * recipe.outputAmount;
                city.addResource(recipe.output, producedAmount);

                // Deduct Costs
                availableLabor -= (actualRuns * recipe.laborCost);
                buildingUsage.set(recipe.building, currentUsage + actualRuns);
                
                console.log(`Produced ${producedAmount} ${ResourceType[recipe.output]} via ${recipe.name}`);
            }
        }

        console.groupEnd();
    }

    // --- Actions ---

    // Helper to check and consume generic costs
    private static tryPayCost(city: City, cost: CostConfig): string | null {
        if (cost.money && city.cash < cost.money) {
            return `Недостаточно средств ($${cost.money})`;
        }
        if (cost.expertLabor && city.workforce.expert < cost.expertLabor) {
             return "Недостаточно экспертов (Expert Labor)";
        }

        if (cost.resources) {
            for (const res of cost.resources) {
                const stock = city.inventory.get(res.type) || 0;
                if (stock < res.amount) return `Недостаточно ресурсов (Тип ${res.type}: ${res.amount})`;
            }
        }
        
        // Pay
        if (cost.money) city.cash -= cost.money;
        if (cost.expertLabor) city.workforce.expert -= cost.expertLabor;
        if (cost.resources) {
            for (const res of cost.resources) {
                city.consumeResource(res.type, res.amount);
            }
        }
        return null;
    }

    public static expandBuilding(city: City, buildingName: string): string {
        const cost = GameConfig.ECONOMY.EXPANSION.COST;
        const error = this.tryPayCost(city, cost);
        if (error) return error;

        const current = city.buildingLevels.get(buildingName) || 0;
        city.buildingLevels.set(buildingName, current + 1);

        return `Улучшено: ${buildingName} (Ур. ${current + 1})`;
    }

    public static recruitWorker(city: City): string {
        const cost = GameConfig.ECONOMY.WORKER.RECRUIT_COST;
        const error = this.tryPayCost(city, cost);
        if (error) return error;

        city.workforce.untrained++;
        city.population++;

        return "Нанят рабочий (Необученный)";
    }

    public static trainWorker(city: City, targetLevel: 'trained' | 'expert'): string {
        const cost = targetLevel === 'trained' 
            ? GameConfig.ECONOMY.WORKER.TRAIN_TRAINED_COST 
            : GameConfig.ECONOMY.WORKER.TRAIN_EXPERT_COST;

        if (targetLevel === 'trained') {
            if (city.workforce.untrained <= 0) return "Нет необученных рабочих";
            const error = this.tryPayCost(city, cost);
            if (error) return error;

            city.workforce.untrained--;
            city.workforce.trained++;
            return "Обучен рабочий (Специалист)";
        } else {
            if (city.workforce.trained <= 0) return "Нет специалистов для обучения";
            const error = this.tryPayCost(city, cost);
            if (error) return error;

            city.workforce.trained--;
            city.workforce.expert++;
            return "Обучен рабочий (Эксперт)";
        }
    }

    public static buildTransportCapacity(city: City): string {
        const cost = GameConfig.ECONOMY.TRANSPORT.BUILD_COST;
        // Also needs Labor! But we don't track transient labor usage for actions yet, only loop.
        // We will assume 1 Expert labor point usage? Or just money/resources for now as per MVP.
        const error = this.tryPayCost(city, cost);
        if (error) return error;
        
        city.transportCapacity += GameConfig.ECONOMY.TRANSPORT.CAPACITY_INCREASE;
        
        return "Построены вагоны (+5 Транспорт)";
    }
}
// For compatibility with imports
export const RECIPES = GameConfig.ECONOMY.RECIPES;
