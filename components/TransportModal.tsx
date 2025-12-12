
import React, { useState, useEffect } from 'react';
import { ResourceType } from '../Grid/GameMap';
import { Box, Check, TrainFront } from 'lucide-react';
import { getResourceName } from '../utils/Localization';

interface TransportModalProps {
  availableResources: Map<ResourceType, number>;
  previousAllocations: Map<ResourceType, number>;
  capacity: number;
  onConfirm: (allocations: Map<ResourceType, number>) => void;
}

export const TransportModal: React.FC<TransportModalProps> = ({ availableResources, previousAllocations, capacity, onConfirm }) => {
  const [allocations, setAllocations] = useState<Map<ResourceType, number>>(new Map());

  // Initialize allocations (prioritizing previous settings, falling back to max possible)
  useEffect(() => {
    const initial = new Map<ResourceType, number>();
    let used = 0;
    
    // First pass: Restore previous settings if valid
    if (previousAllocations.size > 0) {
        availableResources.forEach((availableAmount, type) => {
            const previousAmount = previousAllocations.get(type) || 0;
            // Can't take more than available, can't exceed remaining capacity
            const desired = Math.min(previousAmount, availableAmount);
            const canTake = Math.min(desired, capacity - used);
            
            if (canTake > 0) {
                initial.set(type, canTake);
                used += canTake;
            }
        });
    }

    // Second pass: If there is still capacity and no previous settings (or if we want to be greedy by default on new items)
    // For now, let's just fill remaining capacity greedily if previous was empty, otherwise trust the restoration.
    if (previousAllocations.size === 0) {
         availableResources.forEach((amount, type) => {
            const canTake = Math.min(amount, capacity - used);
            if (canTake > 0) {
                initial.set(type, canTake);
                used += canTake;
            }
        });
    }

    setAllocations(initial);
  }, [availableResources, previousAllocations, capacity]);

  let totalAllocated = 0;
  allocations.forEach((val) => totalAllocated += val);

  const handleSliderChange = (type: ResourceType, newValue: number) => {
      const currentVal = allocations.get(type) || 0;
      const otherTotal = totalAllocated - currentVal;
      const remainingCap = capacity - otherTotal;
      
      // Clamp value
      const allowedValue = Math.min(newValue, remainingCap);
      
      const newMap = new Map(allocations);
      newMap.set(type, allowedValue);
      setAllocations(newMap);
  };
  
  // Handle Spacebar to confirm
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
            e.preventDefault();
            e.stopPropagation(); // Stop propagation to avoid double triggering if App also listens
            onConfirm(allocations);
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [allocations, onConfirm]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[500px] bg-slate-800 border-2 border-amber-600/50 rounded-lg shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 border-b border-slate-700 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-600/20 rounded-lg border border-amber-600/50">
                    <TrainFront className="text-amber-500" size={24} />
                </div>
                <div>
                    <h2 className="text-amber-100 font-bold text-lg uppercase tracking-wide">Управление Транспортом</h2>
                    <p className="text-slate-400 text-xs">Распределите вагоны для доставки сырья</p>
                </div>
            </div>
            <div className="text-right">
                <div className={`text-2xl font-mono font-bold ${totalAllocated > capacity ? 'text-red-400' : 'text-emerald-400'}`}>
                    {totalAllocated} <span className="text-slate-500 text-base">/ {capacity}</span>
                </div>
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Занято вагонов</div>
            </div>
        </div>

        {/* List */}
        <div className="p-6 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
            {Array.from(availableResources.entries()).map(([type, available]) => {
                const allocated = allocations.get(type) || 0;
                
                return (
                    <div key={type} className="bg-slate-900/50 p-3 rounded border border-slate-700 hover:border-slate-600 transition-colors">
                        <div className="flex justify-between items-end mb-2">
                            <span className="font-bold text-slate-200 flex items-center gap-2">
                                <Box size={14} className="text-slate-500" />
                                {getResourceName(type)}
                            </span>
                            <span className="text-xs font-mono text-slate-400">
                                На карте: <span className="text-white">{available}</span>
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-4">
                            <input 
                                type="range" 
                                min="0" 
                                max={available} 
                                value={allocated}
                                onChange={(e) => handleSliderChange(type, parseInt(e.target.value))}
                                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500 hover:accent-amber-400"
                            />
                            <div className="w-12 text-center font-mono font-bold text-amber-300 bg-slate-800 rounded py-1 border border-slate-700">
                                {allocated}
                            </div>
                        </div>
                    </div>
                );
            })}
            
            {availableResources.size === 0 && (
                <div className="text-center py-8 text-slate-500 italic">
                    Нет доступных ресурсов, соединенных с транспортной сетью.
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-700 flex justify-end">
            <button 
                onClick={() => onConfirm(allocations)}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded shadow-lg transition-all border border-emerald-500/50"
            >
                <Check size={18} />
                ПОДТВЕРДИТЬ (ПРОБЕЛ)
            </button>
        </div>
      </div>
    </div>
  );
};
