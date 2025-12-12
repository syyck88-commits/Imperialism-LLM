import { ResourceType, ImprovementType } from '../Grid/GameMap';

export interface Recipe {
    name: string;
    building: string;
    inputs: { type: ResourceType; amount: number; alternative?: ResourceType }[];
    output: ResourceType;
    outputAmount: number;
    laborCost: number;
}

export interface CostConfig {
    money?: number;
    resources?: { type: ResourceType; amount: number }[];
    expertLabor?: number;
}

export const GameConfig = {
    CITY: {
        INITIAL_CASH: 10000,
        INITIAL_POPULATION: {
            untrained: 6,
            trained: 4,
            expert: 2
        },
        INITIAL_INVENTORY: [
            // Recommended Slice
            { type: ResourceType.WHEAT, amount: 0 }, // Not specified in slice, assuming 0 or low
            { type: ResourceType.FRUIT, amount: 0 },
            { type: ResourceType.MEAT, amount: 0 },
            { type: ResourceType.FISH, amount: 0 },
            
            { type: ResourceType.LUMBER, amount: 40 },
            { type: ResourceType.STEEL, amount: 30 },
            { type: ResourceType.CANNED_FOOD, amount: 80 },
            { type: ResourceType.PAPER, amount: 10 },
            { type: ResourceType.FABRIC, amount: 10 },
            
            { type: ResourceType.WOOD, amount: 20 },
            { type: ResourceType.COAL, amount: 0 },
            { type: ResourceType.IRON, amount: 0 },
            
            // Others
            { type: ResourceType.GOLD, amount: 0 },
            { type: ResourceType.FURNITURE, amount: 0 },
            { type: ResourceType.CLOTHING, amount: 0 },
            { type: ResourceType.ARMAMENTS, amount: 0 },
            { type: ResourceType.WOOL, amount: 0 },
            { type: ResourceType.COTTON, amount: 0 },
            { type: ResourceType.SPICE, amount: 0 },
            { type: ResourceType.OIL, amount: 0 },
            { type: ResourceType.GEMS, amount: 0 },
        ],
        INITIAL_BUILDINGS: [
             { name: "Lumber Mill", level: 6 }, // Handles Lumber + Paper
             { name: "Textile Mill", level: 4 },
             { name: "Steel Mill", level: 2 },
             { name: "Furniture Factory", level: 2 },
             { name: "Clothing Factory", level: 2 },
             { name: "Metal Works", level: 2 },
             { name: "Food Processing Plant", level: 4 },
        ]
    },
    ECONOMY: {
        CASH_CONVERSION: {
            [ResourceType.GOLD]: 200,
            [ResourceType.GEMS]: 500
        } as Record<number, number>,
        RECIPES: [
            {
                name: "Пиломатериалы (Lumber)",
                building: "Lumber Mill",
                inputs: [{ type: ResourceType.WOOD, amount: 2 }],
                output: ResourceType.LUMBER,
                outputAmount: 1,
                laborCost: 1
            },
            {
                name: "Бумага (Paper)",
                building: "Lumber Mill",
                inputs: [{ type: ResourceType.WOOD, amount: 2 }],
                output: ResourceType.PAPER,
                outputAmount: 1,
                laborCost: 1
            },
            {
                name: "Ткань (Fabric)",
                building: "Textile Mill",
                inputs: [{ type: ResourceType.WOOL, amount: 2, alternative: ResourceType.COTTON }], 
                output: ResourceType.FABRIC,
                outputAmount: 1,
                laborCost: 1
            },
            {
                name: "Одежда (Clothing)",
                building: "Clothing Factory",
                inputs: [{ type: ResourceType.FABRIC, amount: 2 }], 
                output: ResourceType.CLOTHING,
                outputAmount: 1,
                laborCost: 1
            },
            {
                name: "Мебель (Furniture)",
                building: "Furniture Factory",
                inputs: [{ type: ResourceType.LUMBER, amount: 2 }],
                output: ResourceType.FURNITURE,
                outputAmount: 1,
                laborCost: 1
            },
            {
                name: "Сталь (Steel)",
                building: "Steel Mill",
                inputs: [
                    { type: ResourceType.IRON, amount: 1 },
                    { type: ResourceType.COAL, amount: 1 }
                ],
                output: ResourceType.STEEL,
                outputAmount: 1,
                laborCost: 1
            },
            {
                name: "Вооружение (Armaments)",
                building: "Metal Works",
                inputs: [{ type: ResourceType.STEEL, amount: 2 }],
                output: ResourceType.ARMAMENTS,
                outputAmount: 1,
                laborCost: 1
            },
            // Canned Food - Plant-based
            {
                name: "Консервы (Раст.)",
                building: "Food Processing Plant",
                inputs: [
                    { type: ResourceType.WHEAT, amount: 2, alternative: ResourceType.FRUIT },
                ],
                output: ResourceType.CANNED_FOOD,
                outputAmount: 2,
                laborCost: 1
            },
            // Canned Food - Meat-based
            {
                name: "Консервы (Мясн.)",
                building: "Food Processing Plant",
                inputs: [
                    { type: ResourceType.MEAT, amount: 2, alternative: ResourceType.FISH },
                ],
                output: ResourceType.CANNED_FOOD,
                outputAmount: 2,
                laborCost: 1
            }
        ] as Recipe[],
        EXPANSION: {
            COST: {
                 resources: [
                     { type: ResourceType.LUMBER, amount: 1 },
                     { type: ResourceType.STEEL, amount: 1 }
                 ],
                 money: 0
            } as CostConfig
        },
        WORKER: {
            RECRUIT_COST: {
                resources: [
                    { type: ResourceType.CANNED_FOOD, amount: 1 },
                    { type: ResourceType.CLOTHING, amount: 1 },
                    { type: ResourceType.FURNITURE, amount: 1 }
                ]
            } as CostConfig,
            TRAIN_TRAINED_COST: {
                money: 100,
                resources: [{ type: ResourceType.PAPER, amount: 1 }]
            } as CostConfig,
            TRAIN_EXPERT_COST: {
                money: 200,
                resources: [{ type: ResourceType.PAPER, amount: 1 }]
            } as CostConfig
        },
        TRANSPORT: {
            BUILD_COST: {
                money: 0,
                resources: [
                    { type: ResourceType.LUMBER, amount: 1 },
                    { type: ResourceType.STEEL, amount: 1 }
                ]
            } as CostConfig,
            CAPACITY_INCREASE: 5
        }
    },
    UNITS: {
        CONSTRUCTION: {
            COST: {
                money: 1000,
                resources: [{ type: ResourceType.PAPER, amount: 1 }],
                expertLabor: 1
            } as CostConfig
        }
    },
    INFRASTRUCTURE: {
        [ImprovementType.ROAD]: {
            money: 100,
            resources: [{ type: ResourceType.WOOD, amount: 1 }]
        } as CostConfig,
        [ImprovementType.RAILROAD]: {
            money: 200,
            resources: [{ type: ResourceType.LUMBER, amount: 1 }, { type: ResourceType.STEEL, amount: 1 }]
        } as CostConfig,
        [ImprovementType.DEPOT]: {
            money: 500,
            resources: [{ type: ResourceType.LUMBER, amount: 1 }, { type: ResourceType.STEEL, amount: 1 }]
        } as CostConfig,
        [ImprovementType.PORT]: {
            money: 1000,
            resources: [{ type: ResourceType.LUMBER, amount: 2 }, { type: ResourceType.STEEL, amount: 1 }]
        } as CostConfig
    },
    ACTIONS: {
        BUY_LAND: { money: 500 } as CostConfig
    }
};