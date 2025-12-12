

import React from 'react';
import { Hammer, MapPin, Briefcase, Anchor, TrainFront, Moon, Bot, Filter, BrainCircuit, Brain } from 'lucide-react';
import { Unit, UnitType } from '../../Entities/Unit';
import { Prospector, ProspectFilter, ResourceImprover, Engineer, EngineerPriority, EngineerTerrainFilter } from '../../Entities/CivilianUnit';
import { getUnitName, getResourceName } from '../../utils/Localization';
import { ResourceType, TerrainType } from '../../Grid/GameMap';

interface UnitActionBarProps {
    selectedUnit: Unit;
    predictedYield: string | null;
    onAction: (action: string) => void;
    onDisband: () => void;
    onHoverAction?: (action: string | null) => void;
}

const UnitActionBar: React.FC<UnitActionBarProps> = ({ selectedUnit, predictedYield, onAction, onDisband, onHoverAction }) => {
    
    const handleMouseEnter = (action: string) => {
        if (onHoverAction) onHoverAction(action);
    };

    const handleMouseLeave = () => {
        if (onHoverAction) onHoverAction(null);
    };

    const renderEngineerControls = () => {
        if (selectedUnit.type !== UnitType.ENGINEER) return null;
        
        const engineer = selectedUnit as Engineer;
        const currentPriority = engineer.autoPriority || 'GENERAL';
        const currentTerrain = engineer.terrainFilter || 'ALL';
        const heedAdvice = engineer.heedAdvice;

        // --- Terrain List ---
        const terrainList: {key: EngineerTerrainFilter, label: string}[] = [
            { key: 'ALL', label: 'Любая местность' },
            { key: TerrainType.PLAINS, label: 'Равнины' },
            { key: TerrainType.FOREST, label: 'Лес' },
            { key: TerrainType.HILLS, label: 'Холмы' },
            { key: TerrainType.MOUNTAIN, label: 'Горы' },
            { key: TerrainType.DESERT, label: 'Пустыня' },
        ];

        // --- Resource List (Filtered by Terrain) ---
        const getResourcesForTerrain = (terrain: EngineerTerrainFilter): ResourceType[] => {
            switch (terrain) {
                case 'ALL': return [
                    ResourceType.WOOD, ResourceType.COAL, ResourceType.IRON, 
                    ResourceType.OIL, ResourceType.GOLD, ResourceType.WHEAT,
                    ResourceType.GEMS
                ];
                case TerrainType.PLAINS: return [ResourceType.WHEAT, ResourceType.FRUIT, ResourceType.COTTON, ResourceType.MEAT];
                case TerrainType.FOREST: return [ResourceType.WOOD];
                case TerrainType.HILLS: return [ResourceType.COAL, ResourceType.MEAT, ResourceType.IRON]; // Iron can spawn in hills too
                case TerrainType.MOUNTAIN: return [ResourceType.IRON, ResourceType.GOLD, ResourceType.GEMS, ResourceType.COAL];
                case TerrainType.DESERT: return [ResourceType.OIL];
                default: return [];
            }
        };

        const availableResources = getResourcesForTerrain(currentTerrain);
        
        const resourceList: {key: EngineerPriority, label: string}[] = [
            { key: 'GENERAL', label: 'Все ресурсы' },
            ...availableResources.map(r => ({ key: r, label: getResourceName(r) }))
        ];

        const cycleResource = () => {
            // Find current index in the NEW filtered list
            let idx = resourceList.findIndex(p => p.key === currentPriority);
            // If current priority is not in the list (e.g. switched from Plains/Wheat to Mountain), reset to 0
            if (idx === -1) idx = 0;

            const nextIdx = (idx + 1) % resourceList.length;
            const nextKey = resourceList[nextIdx].key;
            onAction(`set_eng_priority_${nextKey}`);
            if (!selectedUnit.isAutomated) onAction('auto');
        };

        const cycleTerrain = () => {
            const idx = terrainList.findIndex(p => p.key === currentTerrain);
            const nextIdx = (idx + 1) % terrainList.length;
            const nextKey = terrainList[nextIdx].key;
            onAction(`set_eng_terrain_${nextKey}`);
            // Always reset resource to GENERAL when changing terrain to prevent invalid states
            onAction(`set_eng_priority_GENERAL`);
            if (!selectedUnit.isAutomated) onAction('auto');
        };

        const currentResLabel = resourceList.find(p => p.key === currentPriority)?.label || 'Спец.';
        const currentTerrainLabel = terrainList.find(p => p.key === currentTerrain)?.label || 'Все';

        return (
            <div className="flex flex-col gap-2 border-l border-slate-600 pl-2 ml-1">
                <div className="flex gap-2 justify-center">
                    <button 
                        onClick={() => onAction('road')}
                        onMouseEnter={() => handleMouseEnter('road')}
                        onMouseLeave={handleMouseLeave}
                        disabled={selectedUnit.movesLeft <= 0}
                        className="action-btn"
                        title="Построить дорогу ($100, 1 Дерево)"
                    >
                        <Hammer size={18} />
                        <span>Дорога</span>
                    </button>
                    <button 
                        onClick={() => onAction('depot')}
                        onMouseEnter={() => handleMouseEnter('depot')}
                        onMouseLeave={handleMouseLeave}
                        disabled={selectedUnit.movesLeft <= 0}
                        className="action-btn"
                        title="Построить Депо ($500, 1 Пилмат, 1 Сталь)"
                    >
                        <TrainFront size={18} />
                        <span>Депо</span>
                    </button>
                    <button 
                        onClick={() => onAction('port')}
                        onMouseEnter={() => handleMouseEnter('port')}
                        onMouseLeave={handleMouseLeave}
                        disabled={selectedUnit.movesLeft <= 0}
                        className="action-btn"
                        title="Построить Порт ($1000, 2 Пилмат, 1 Сталь)"
                    >
                        <Anchor size={18} />
                        <span>Порт</span>
                    </button>
                </div>
                
                <div className="flex gap-2 w-full">
                    {/* Automation Toggle */}
                    <button 
                        onClick={() => onAction('auto')}
                        className={`action-btn flex-1 ${selectedUnit.isAutomated ? 'bg-emerald-600/50 border-emerald-500' : ''}`}
                        title="Авто-строительство сети"
                    >
                        <Bot size={18} className={selectedUnit.isAutomated ? "text-white" : "text-slate-400"} />
                        <span>{selectedUnit.isAutomated ? 'АВТО: ВКЛ' : 'АВТО: ВЫКЛ'}</span>
                    </button>
                    
                    {/* Heed Advice Toggle */}
                    <button 
                        onClick={() => onAction('toggle_advice')}
                        className={`action-btn w-12 ${heedAdvice ? 'bg-emerald-600/50 border-emerald-500' : 'opacity-70'}`}
                        title={heedAdvice ? "Советы: Учитывать (Кризис-менеджмент ВКЛ)" : "Советы: Игнорировать (Строго следовать фильтрам)"}
                    >
                         <Brain size={18} className={heedAdvice ? "text-white" : "text-slate-500"} />
                         <span>{heedAdvice ? "СОВЕТЫ" : "РУЧНОЙ"}</span>
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2 w-full">
                    {/* Terrain Filter */}
                    <button
                        onClick={cycleTerrain}
                        className="action-btn border-indigo-500/30 w-full"
                        title="Фильтр местности"
                    >
                        <div className="flex items-center gap-1">
                             <span className="text-[9px] text-indigo-300 font-bold">МЕСТНОСТЬ:</span>
                        </div>
                        <span className="text-[10px] text-white truncate w-full">{currentTerrainLabel}</span>
                    </button>

                    {/* Resource Filter */}
                    <button
                        onClick={cycleResource}
                        className="action-btn border-amber-500/30 w-full"
                        title="Целевой ресурс"
                    >
                        <div className="flex items-center gap-1">
                             <span className="text-[9px] text-amber-300 font-bold">РЕСУРС:</span>
                        </div>
                        <span className="text-[10px] text-white truncate w-full">{currentResLabel}</span>
                    </button>
                </div>
            </div>
        );
    };

    const renderProspectorControls = () => {
        if (selectedUnit.type !== UnitType.PROSPECTOR) return null;
        
        const prospector = selectedUnit as Prospector;
        const currentFilter = prospector.prospectFilter || 'ALL';

        const filters: {key: ProspectFilter, label: string}[] = [
            { key: 'ALL', label: 'Все' },
            { key: 'HILLS', label: 'Холмы' },
            { key: 'MOUNTAIN', label: 'Горы' },
            { key: 'DESERT', label: 'Пустыня' },
        ];

        const cycleFilter = () => {
            const currentIndex = filters.findIndex(f => f.key === currentFilter);
            const nextIndex = (currentIndex + 1) % filters.length;
            onAction(`set_filter_${filters[nextIndex].key}`);
        };

        return (
            <>
                <button 
                    onClick={() => onAction('prospect')}
                    disabled={selectedUnit.movesLeft <= 0}
                    className="action-btn text-purple-300"
                    title="Искать ресурсы"
                >
                    <MapPin size={18} />
                    <span>Искать</span>
                </button>
                
                <button 
                    onClick={() => onAction('auto')}
                    className={`action-btn ${selectedUnit.isAutomated ? 'bg-emerald-600/50 border-emerald-500' : ''}`}
                    title="Авто-поиск ресурсов"
                >
                    <Bot size={18} className={selectedUnit.isAutomated ? "text-white" : "text-slate-400"} />
                    <span>Авто</span>
                </button>

                <button 
                    onClick={cycleFilter}
                    className="action-btn"
                    title={`Фильтр авто-поиска: ${filters.find(f => f.key === currentFilter)?.label}`}
                >
                    <Filter size={18} className="text-amber-300" />
                    <span className="max-w-[50px] overflow-hidden text-ellipsis whitespace-nowrap">
                        {filters.find(f => f.key === currentFilter)?.label}
                    </span>
                </button>
            </>
        );
    };

    const renderImproverControls = () => {
        if (!(selectedUnit instanceof ResourceImprover)) return null;
        
        const improver = selectedUnit as ResourceImprover;
        const currentFilter = improver.autoTargetResource; 

        const getAvailableResources = (type: UnitType): ResourceType[] => {
            switch(type) {
                case UnitType.MINER: return [ResourceType.COAL, ResourceType.IRON, ResourceType.GOLD, ResourceType.GEMS];
                case UnitType.FARMER: return [ResourceType.WHEAT, ResourceType.FRUIT, ResourceType.COTTON, ResourceType.SPICE];
                case UnitType.RANCHER: return [ResourceType.MEAT, ResourceType.WOOL];
                case UnitType.FORESTER: return [ResourceType.WOOD];
                case UnitType.DRILLER: return [ResourceType.OIL];
                default: return [];
            }
        };

        const resources = getAvailableResources(selectedUnit.type);
        const options: Array<{key: 'ALL' | ResourceType, label: string}> = [
            { key: 'ALL', label: 'Все' },
            ...resources.map(r => ({ key: r, label: getResourceName(r) }))
        ];

        const cycleFilter = () => {
            const currentIndex = options.findIndex(o => o.key === currentFilter);
            const nextIndex = (currentIndex + 1) % options.length;
            const nextKey = options[nextIndex].key;
            onAction(`set_res_filter_${nextKey}`);
        };

        const currentLabel = options.find(o => o.key === currentFilter)?.label || 'Все';

        return (
            <>
                {(selectedUnit.type === UnitType.FARMER || 
                selectedUnit.type === UnitType.MINER || 
                selectedUnit.type === UnitType.FORESTER ||
                selectedUnit.type === UnitType.RANCHER ||
                selectedUnit.type === UnitType.DRILLER) && (
                    <button 
                    onClick={() => onAction('improve')}
                    onMouseEnter={() => handleMouseEnter('improve')}
                    onMouseLeave={handleMouseLeave}
                    disabled={selectedUnit.movesLeft <= 0}
                    className="action-btn text-amber-300"
                    title="Построить улучшение (вручную)"
                    >
                    <Hammer size={18} />
                    <span>Строить</span>
                    </button>
                )}

                <button 
                    onClick={() => onAction('auto')}
                    className={`action-btn ${selectedUnit.isAutomated ? 'bg-emerald-600/50 border-emerald-500' : ''}`}
                    title="Авто-строительство"
                >
                    <Bot size={18} className={selectedUnit.isAutomated ? "text-white" : "text-slate-400"} />
                    <span>Авто</span>
                </button>

                <button 
                    onClick={cycleFilter}
                    className="action-btn"
                    title={`Цель авто-режима: ${currentLabel}`}
                >
                    <Filter size={18} className="text-amber-300" />
                    <span className="max-w-[50px] overflow-hidden text-ellipsis whitespace-nowrap text-[9px]">
                        {currentLabel}
                    </span>
                </button>
            </>
        );
    };

    return (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-800/90 backdrop-blur border border-slate-600 rounded-lg p-3 shadow-xl flex flex-col items-center animate-in slide-in-from-bottom-4 fade-in min-w-[300px] z-20">
            
            {predictedYield && (
                <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 pointer-events-none z-50">
                    <div className="text-xs font-mono font-bold text-amber-300 bg-slate-900/95 backdrop-blur-md px-4 py-2 rounded-lg border border-amber-500/50 shadow-[0_4px_20px_rgba(0,0,0,0.5)] whitespace-nowrap animate-in fade-in zoom-in-95 duration-200 flex flex-col items-center gap-1">
                        {predictedYield}
                        <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-amber-500/50 absolute -bottom-1.5"></div>
                    </div>
                </div>
            )}

            <div className="flex w-full justify-between items-center border-b border-slate-600 pb-2 mb-2">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-400 font-bold uppercase">{getUnitName(selectedUnit.type)}</span>
                        {selectedUnit.isSleeping && <span className="text-[10px] bg-indigo-900 text-indigo-200 px-1 rounded">ZZZ</span>}
                        {selectedUnit.isAutomated && <span className="text-[10px] bg-emerald-900 text-emerald-200 px-1 rounded">AUTO</span>}
                    </div>
                    <span className="text-[10px] text-slate-400">ID: {selectedUnit.id}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                     {selectedUnit.debugStatus && (
                         <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-950/40 border border-amber-500/30 rounded text-amber-400 animate-pulse">
                             <BrainCircuit size={10} />
                             <span className="text-[9px] font-mono italic">
                                 {selectedUnit.debugStatus}
                             </span>
                         </div>
                     )}
                    <div className="flex gap-2">
                        <button onClick={onDisband} className="text-[10px] text-red-400 hover:text-red-300 border border-red-900 bg-red-950/50 px-2 py-1 rounded">Распустить</button>
                        <span className="text-xs text-slate-300 font-mono bg-slate-700 px-2 py-1 rounded">
                        Ходы: {selectedUnit.movesLeft}
                        </span>
                    </div>
                </div>
            </div>
            
            <div className="flex gap-2 w-full justify-center">
                {selectedUnit.type === UnitType.ENGINEER ? (
                    renderEngineerControls()
                ) : (
                    <>
                    {selectedUnit.type === UnitType.PROSPECTOR && renderProspectorControls()}

                    {selectedUnit instanceof ResourceImprover && renderImproverControls()}

                    {selectedUnit.type === UnitType.DEVELOPER && (
                        <button 
                        onClick={() => onAction('buyland')}
                        disabled={selectedUnit.movesLeft <= 0}
                        className="action-btn text-green-300"
                        title="Купить землю ($500)"
                        >
                        <Briefcase size={18} />
                        <span>Купить</span>
                        </button>
                    )}
                    </>
                )}

                <div className="w-px h-8 bg-slate-600 mx-1"></div>
                
                <button 
                    onClick={() => onAction('sleep')}
                    className={`action-btn ${selectedUnit.isSleeping ? 'bg-indigo-600/50 border-indigo-500' : ''}`}
                    title={selectedUnit.isSleeping ? "Разбудить" : "Режим сна (пропускать ход)"}
                >
                    <Moon size={18} className={selectedUnit.isSleeping ? "text-white" : "text-indigo-300"} />
                    <span>{selectedUnit.isSleeping ? "Проснуться" : "Спать"}</span>
                </button>
            </div>

            <style>{`
                .action-btn {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    padding: 6px 10px;
                    border-radius: 6px;
                    background-color: rgba(30, 41, 59, 0.5);
                    border: 1px solid rgba(71, 85, 105, 0.5);
                    transition: all 0.2s;
                    min-width: 50px;
                }
                .action-btn:hover:not(:disabled) {
                    background-color: rgba(51, 65, 85, 0.8);
                    transform: translateY(-2px);
                }
                .action-btn:active:not(:disabled) {
                    transform: translateY(0);
                }
                .action-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    filter: grayscale(1);
                }
                .action-btn span {
                    font-size: 10px;
                    font-weight: 600;
                    text-align: center;
                }
            `}</style>
        </div>
    );
};

export default UnitActionBar;