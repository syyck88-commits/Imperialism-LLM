
import React, { useState, useEffect } from 'react';
import { 
    X, Factory, ArrowRight, Package, Plus, User, Hammer, TrainFront, 
    ArrowUpCircle, Wheat, Beef, Fish, Trees, Box, Pickaxe, Coins, 
    Gem, Droplet, Cloud, Flower, Scroll, Anchor, Shirt, Armchair, 
    Utensils, Sword, Settings, Zap, AlertTriangle, CheckCircle,
    Grip
} from 'lucide-react';
import { City } from '../../Entities/City';
import { ResourceType } from '../../Grid/GameMap';
import { Economy } from '../../core/Economy';
import { GameConfig } from '../../core/GameConfig';
import { getResourceName } from '../../utils/Localization';

interface IndustryModalProps {
    capital: City | null;
    onClose: () => void;
    onAction: (actionFn: (city: City) => string | undefined) => string | undefined;
}

const IndustryModal: React.FC<IndustryModalProps> = ({ capital, onClose, onAction }) => {
    const [feedback, setFeedback] = useState<{msg: string, isError: boolean} | null>(null);

    // Auto-clear feedback
    useEffect(() => {
        if (feedback) {
            const timer = setTimeout(() => setFeedback(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [feedback]);

    if (!capital) return null;

    // Inline implementation of formatCost since it was removed from imports
    const formatCost = (cost: any): string => {
        const parts: string[] = [];
        if (cost.money && cost.money > 0) parts.push(`$${cost.money}`);
        if (cost.resources) {
            cost.resources.forEach((r: any) => {
                parts.push(`${r.amount} ${getResourceName(r.type)}`);
            });
        }
        if (cost.expertLabor) {
            parts.push(`${cost.expertLabor} Эксперт(а)`);
        }
        return parts.length > 0 ? parts.join(', ') : "Бесплатно";
    };

    const handleResult = (msg: string | undefined) => {
        if (msg) {
            const isError = msg.startsWith("Недостаточно") || 
                            msg.startsWith("Нет") || 
                            msg.startsWith("Ошибка") ||
                            msg.startsWith("Требуется");
            setFeedback({ msg, isError });
        }
    };

    const handleExpand = (building: string) => {
        const msg = onAction((c) => Economy.expandBuilding(c, building));
        handleResult(msg);
    };

    const handleRecruit = () => {
        const msg = onAction((c) => Economy.recruitWorker(c));
        handleResult(msg);
    };

    const handleTrain = (level: 'trained' | 'expert') => {
        const msg = onAction((c) => Economy.trainWorker(c, level));
        handleResult(msg);
    };

    const handleTransportBuild = () => {
        const msg = onAction((c) => Economy.buildTransportCapacity(c));
        handleResult(msg);
    };

    const handleTargetChange = (recipeName: string, val: number, buildingName: string) => {
        onAction((c) => {
            // Strictly enforce capacity constraints to prevent slider jitter/bugs
            const buildingRecipes = GameConfig.ECONOMY.RECIPES.filter(r => r.building === buildingName);
            let othersAssigned = 0;
            
            buildingRecipes.forEach(r => {
                if (r.name !== recipeName) {
                    othersAssigned += (c.productionTargets.get(r.name) || 0);
                }
            });

            const capacity = c.buildingLevels.get(buildingName) || 1;
            const available = Math.max(0, capacity - othersAssigned);
            
            // Clamp value to what is physically available
            const clampedVal = Math.min(Math.max(0, val), available);
            
            c.productionTargets.set(recipeName, clampedVal);
            return undefined;
        });
    };

    const recipes = GameConfig.ECONOMY.RECIPES;
    const buildingGroups = new Map<string, typeof recipes>();
    recipes.forEach(r => {
        const list = buildingGroups.get(r.building) || [];
        list.push(r);
        buildingGroups.set(r.building, list);
    });

    const totalLaborPoints = (capital.workforce.untrained * 1) + (capital.workforce.trained * 2) + (capital.workforce.expert * 4);
    
    // Calculate labor currently used
    let laborUsed = 0;
    recipes.forEach(r => {
        const allocated = capital.productionTargets.get(r.name) || 0;
        laborUsed += allocated * r.laborCost;
    });
    
    const laborAvailable = totalLaborPoints - laborUsed;

    const allResources = [
        ResourceType.WHEAT, ResourceType.FRUIT, ResourceType.MEAT, ResourceType.FISH, ResourceType.CANNED_FOOD,
        ResourceType.WOOD, ResourceType.LUMBER, ResourceType.PAPER, ResourceType.FURNITURE,
        ResourceType.COAL, ResourceType.IRON, ResourceType.STEEL, ResourceType.ARMAMENTS,
        ResourceType.COTTON, ResourceType.WOOL, ResourceType.FABRIC, ResourceType.CLOTHING,
        ResourceType.OIL, ResourceType.GOLD, ResourceType.GEMS, ResourceType.SPICE
    ];

    // --- Icon Helpers ---
    const getResourceIcon = (type: ResourceType, size: number = 16, className: string = "") => {
        const props = { size, className };
        switch(type) {
            case ResourceType.WHEAT: return <Wheat {...props} className="text-yellow-400" />;
            case ResourceType.FRUIT: return <Wheat {...props} className="text-orange-400" />; 
            case ResourceType.MEAT: return <Beef {...props} className="text-red-400" />;
            case ResourceType.FISH: return <Fish {...props} className="text-blue-400" />;
            case ResourceType.WOOD: return <Trees {...props} className="text-green-600" />;
            case ResourceType.COAL: return <Box {...props} className="text-slate-500" />;
            case ResourceType.IRON: return <Pickaxe {...props} className="text-slate-300" />;
            case ResourceType.OIL: return <Droplet {...props} className="text-black" />;
            case ResourceType.COTTON: return <Flower {...props} className="text-white" />;
            case ResourceType.WOOL: return <Cloud {...props} className="text-slate-200" />;
            case ResourceType.SPICE: return <Zap {...props} className="text-amber-600" />;
            case ResourceType.GOLD: return <Coins {...props} className="text-yellow-300" />;
            case ResourceType.GEMS: return <Gem {...props} className="text-cyan-400" />;
            
            case ResourceType.LUMBER: return <Trees {...props} className="text-amber-700" />;
            case ResourceType.STEEL: return <Settings {...props} className="text-slate-400" />;
            case ResourceType.PAPER: return <Scroll {...props} className="text-amber-100" />;
            case ResourceType.FABRIC: return <Scroll {...props} className="text-purple-300" />;
            case ResourceType.CLOTHING: return <Shirt {...props} className="text-indigo-400" />;
            case ResourceType.FURNITURE: return <Armchair {...props} className="text-amber-800" />;
            case ResourceType.CANNED_FOOD: return <Utensils {...props} className="text-red-300" />;
            case ResourceType.ARMAMENTS: return <Sword {...props} className="text-slate-200" />;
            default: return <Package {...props} />;
        }
    };

    const renderResourceItem = (type: ResourceType) => {
        const amount = capital.inventory.get(type) || 0;
        const isLow = amount === 0;
        return (
            <div key={type} className={`flex flex-col items-center justify-center p-2 rounded border min-h-[5.5rem] transition-colors ${isLow ? 'border-slate-800 bg-slate-900/50 text-slate-600' : 'border-slate-700 bg-slate-800/80'}`}>
                {getResourceIcon(type, 18)}
                <span className={`font-mono font-bold text-sm mt-1 leading-none ${isLow ? 'text-slate-700' : 'text-emerald-400'}`}>
                    {amount}
                </span>
                <span className={`text-[10px] leading-tight mt-1 w-full text-center break-words whitespace-normal ${isLow ? 'text-slate-800' : 'text-slate-500'}`}>
                    {getResourceName(type)}
                </span>
            </div>
        );
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-[98%] max-w-[1400px] h-[92vh] bg-slate-950 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-200 relative">
                
                {/* Notification Toast */}
                {feedback && (
                    <div className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-xl border flex items-center gap-3 animate-in slide-in-from-bottom-5 z-50 transition-all duration-300 ${feedback.isError ? 'bg-red-900/95 border-red-500 text-red-100' : 'bg-emerald-900/95 border-emerald-500 text-emerald-100'}`}>
                        {feedback.isError ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
                        <span className="font-bold text-sm">{feedback.msg}</span>
                    </div>
                )}

                {/* Header */}
                <div className="bg-slate-900 px-6 py-3 border-b border-slate-800 flex justify-between items-center shrink-0 h-16">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-600/20 rounded-lg border border-amber-600/40">
                                <Factory className="text-amber-500" size={20} />
                            </div>
                            <div>
                                <h2 className="text-amber-100 font-bold text-lg uppercase tracking-widest leading-none">Промышленность</h2>
                            </div>
                        </div>

                        {/* Top Stats */}
                        <div className="h-8 w-px bg-slate-700 mx-2"></div>
                        
                        <div className="flex items-center gap-6 text-sm">
                            <div className="flex items-center gap-2" title="Рабочая сила (Свободно / Всего)">
                                <Hammer size={16} className="text-slate-400"/>
                                <span className={`text-xl font-mono font-bold ${laborAvailable < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {laborAvailable} <span className="text-slate-600 text-sm">/ {totalLaborPoints}</span>
                                </span>
                            </div>

                            <div className="flex items-center gap-2" title="Транспортные вагоны">
                                <TrainFront size={16} className="text-slate-400"/>
                                <span className="text-xl font-mono font-bold text-amber-400">{capital.transportCapacity}</span>
                            </div>

                            <div className="flex gap-2">
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-400">
                                    Необ: <b className="text-white">{capital.workforce.untrained}</b>
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300">
                                    Спец: <b className="text-white">{capital.workforce.trained}</b>
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs text-amber-200">
                                    Эксп: <b className="text-white">{capital.workforce.expert}</b>
                                </span>
                            </div>
                        </div>
                    </div>

                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-2 hover:bg-slate-800 rounded-full">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    
                    {/* Left Panel: Actions & Warehouse */}
                    <div className="w-[340px] bg-slate-900/50 border-r border-slate-800 flex flex-col shrink-0">
                        
                        {/* Quick Actions */}
                        <div className="p-4 grid grid-cols-2 gap-2 border-b border-slate-800">
                             <button 
                                onClick={handleRecruit}
                                title={`Нанять рабочего (${formatCost(GameConfig.ECONOMY.WORKER.RECRUIT_COST)})`}
                                className="flex items-center justify-center gap-2 bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-200 py-2 rounded border border-indigo-500/30 text-xs font-bold transition-all"
                             >
                                <User size={14} /> Нанять
                             </button>
                             <button 
                                onClick={handleTransportBuild}
                                title={`Построить вагоны (${formatCost(GameConfig.ECONOMY.TRANSPORT.BUILD_COST)})`}
                                className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded border border-slate-600 text-xs font-bold transition-all"
                             >
                                <TrainFront size={14} /> +5 Вагонов
                             </button>
                             <button 
                                onClick={() => handleTrain('trained')}
                                title={`Обучить специалиста (${formatCost(GameConfig.ECONOMY.WORKER.TRAIN_TRAINED_COST)})`}
                                className="flex items-center justify-center gap-2 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-200 py-2 rounded border border-emerald-500/30 text-xs font-bold transition-all"
                             >
                                <ArrowUpCircle size={14} /> Спец.
                             </button>
                             <button 
                                onClick={() => handleTrain('expert')}
                                title={`Обучить эксперта (${formatCost(GameConfig.ECONOMY.WORKER.TRAIN_EXPERT_COST)})`}
                                className="flex items-center justify-center gap-2 bg-amber-900/40 hover:bg-amber-800/60 text-amber-200 py-2 rounded border border-amber-500/30 text-xs font-bold transition-all"
                             >
                                <ArrowUpCircle size={14} /> Эксперт
                             </button>
                        </div>

                        {/* Resource Grid */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-2 px-1 flex items-center gap-2">
                                <Grip size={12} /> Склад Ресурсов
                            </h3>
                            {/* Switched to 3 columns to allow more space for Russian labels */}
                            <div className="grid grid-cols-3 gap-2">
                                {allResources.map(renderResourceItem)}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Factories */}
                    <div className="flex-1 bg-black/20 p-6 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            
                            {Array.from(buildingGroups.entries()).map(([buildingName, recipes]) => {
                                const capacity = capital.buildingLevels.get(buildingName) || 1;
                                let totalAssigned = 0;
                                recipes.forEach(r => {
                                    totalAssigned += (capital.productionTargets.get(r.name) || 0);
                                });

                                // Get Unique Outputs for Icon Display
                                const uniqueOutputs = Array.from(new Set(recipes.map(r => r.output)));

                                return (
                                    <div key={buildingName} className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden shadow-sm flex flex-col">
                                        {/* Card Header */}
                                        <div className="bg-slate-800/80 px-3 py-2 flex justify-between items-center border-b border-slate-700">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <div className="flex gap-1 shrink-0">
                                                    {uniqueOutputs.map(o => (
                                                        <div key={o} className="bg-black/30 p-1 rounded-full border border-slate-600/50">
                                                            {getResourceIcon(o, 14)}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="font-bold text-sm text-slate-200 truncate" title={buildingName}>
                                                    {buildingName}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className={`text-xs font-mono font-bold ${totalAssigned > capacity ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    {totalAssigned}/{capacity}
                                                </div>
                                                <button 
                                                    onClick={() => handleExpand(buildingName)}
                                                    className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-white transition-colors"
                                                    title={`Расширить (${formatCost(GameConfig.ECONOMY.EXPANSION.COST)})`}
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Recipes List */}
                                        <div className="p-2 space-y-2 flex-1">
                                            {recipes.map(recipe => {
                                                const currentTarget = capital.productionTargets.get(recipe.name) || 0;
                                                
                                                // Dynamic Max Logic
                                                // We can use any remaining capacity in the building.
                                                // The current recipe's allocation is also "available" to be re-allocated to itself.
                                                const remainingBuildingCap = capacity - (totalAssigned - currentTarget);
                                                const dynamicMax = Math.max(currentTarget, remainingBuildingCap);

                                                return (
                                                    <div key={recipe.name} className="bg-slate-950/40 p-2 rounded border border-slate-800/50">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <div className="text-xs text-amber-100 font-medium truncate">{recipe.name}</div>
                                                        </div>

                                                        {/* Requirements Row */}
                                                        <div className="flex items-center gap-2 mb-2 overflow-hidden">
                                                            {recipe.inputs.map((input, idx) => {
                                                                const stock = capital.inventory.get(input.type) || 0;
                                                                const altStock = input.alternative ? (capital.inventory.get(input.alternative) || 0) : 0;
                                                                const totalStock = stock + altStock;
                                                                // Check if we have enough for the *current* target setting
                                                                const hasEnough = totalStock >= (input.amount * Math.max(1, currentTarget));
                                                                return (
                                                                    <div key={idx} className="flex items-center gap-0.5" title={`Req: ${input.amount} ${getResourceName(input.type)}`}>
                                                                        {getResourceIcon(input.type, 12)}
                                                                        <span className={`text-[10px] font-mono ${hasEnough ? 'text-slate-400' : 'text-red-400'}`}>{input.amount}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                            <ArrowRight size={10} className="text-slate-600" />
                                                            <div className="flex items-center gap-0.5" title="Labor Cost">
                                                                <User size={12} className="text-blue-400" />
                                                                <span className="text-[10px] text-slate-400">-{recipe.laborCost}</span>
                                                            </div>
                                                        </div>

                                                        {/* Slider */}
                                                        <div className="flex items-center gap-2 h-5">
                                                            <input 
                                                                type="range"
                                                                min="0"
                                                                max={dynamicMax}
                                                                value={currentTarget}
                                                                onChange={(e) => handleTargetChange(recipe.name, parseInt(e.target.value), buildingName)}
                                                                className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 hover:accent-amber-400"
                                                                disabled={dynamicMax === 0 && currentTarget === 0}
                                                            />
                                                            <div className="w-6 text-center font-mono font-bold text-xs text-white">
                                                                {currentTarget}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 5px;
                    height: 5px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #0f172a; 
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #334155; 
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #475569; 
                }
            `}</style>
        </div>
    );
};

export default IndustryModal;
