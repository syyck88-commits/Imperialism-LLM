
import React from 'react';
import { X, School, Coins, Scroll, UserCheck } from 'lucide-react';
import { City } from '../../Entities/City';
import { UnitType } from '../../Entities/Unit';
import { ResourceType } from '../../Grid/GameMap';
import { University } from '../../core/University';
import { GameConfig } from '../../core/GameConfig';
import { formatCost } from '../../utils/Localization';

interface UniversityModalProps {
    capital: City | null;
    onClose: () => void;
    onRecruit: (type: UnitType) => void;
}

const UniversityModal: React.FC<UniversityModalProps> = ({ capital, onClose, onRecruit }) => {
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-[800px] h-[600px] bg-[#f0e6d2] text-slate-800 rounded-lg shadow-2xl border-4 border-[#8b5a2b] flex flex-col font-serif relative">
                <button onClick={onClose} className="absolute top-2 right-2 p-2 hover:bg-red-500/10 rounded-full">
                    <X className="text-[#8b5a2b]" />
                </button>
                
                <div className="p-8 border-b border-[#cbbca0] bg-[#e6d8b8]">
                    <div className="flex items-center gap-4">
                        <School size={40} className="text-[#8b5a2b]" />
                        <div>
                            <h2 className="text-3xl font-bold text-[#5c3a1e] tracking-tight">Королевский Университет</h2>
                            <p className="text-[#8b5a2b] italic">Обучение специалистов для Империи</p>
                        </div>
                    </div>
                    <div className="mt-4 flex gap-6 text-sm">
                        <span className="flex items-center gap-2 bg-white/50 px-3 py-1 rounded-full border border-[#cbbca0]">
                            <Coins size={14}/> Бюджет: ${capital?.cash}
                        </span>
                        <span className="flex items-center gap-2 bg-white/50 px-3 py-1 rounded-full border border-[#cbbca0]">
                            <Scroll size={14}/> Бумага: {capital?.inventory.get(ResourceType.PAPER) || 0}
                        </span>
                        <span className="flex items-center gap-2 bg-white/50 px-3 py-1 rounded-full border border-[#cbbca0]">
                            <UserCheck size={14}/> Доступно экспертов: {capital?.expertLabor}
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 grid grid-cols-2 gap-4">
                    {/* Unit Cards */}
                    {[
                        { type: UnitType.ENGINEER, name: 'Инженер', desc: 'Строит дороги, ж/д и порты.', req: 'Базовое' },
                        { type: UnitType.PROSPECTOR, name: 'Геолог', desc: 'Ищет скрытые ресурсы в горах.', req: 'Базовое' },
                        { type: UnitType.FARMER, name: 'Фермер', desc: 'Строит фермы и плантации.', req: 'Базовое' },
                        { type: UnitType.MINER, name: 'Шахтер', desc: 'Строит шахты для угля и железа.', req: 'Базовое' },
                        { type: UnitType.FORESTER, name: 'Лесник', desc: 'Строит лесопилки.', req: 'Ж/Д Мосты' },
                        { type: UnitType.RANCHER, name: 'Пастух', desc: 'Разводит овец и скот.', req: 'Кормовые травы' },
                        { type: UnitType.DRILLER, name: 'Буровик', desc: 'Добывает нефть.', req: 'Бурение' },
                        { type: UnitType.DEVELOPER, name: 'Риелтор', desc: 'Покупает землю у малых наций.', req: 'Дипломатия' },
                    ].map(u => (
                        <div key={u.type} className="bg-white p-4 rounded border border-[#cbbca0] shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-lg text-[#5c3a1e]">{u.name}</h3>
                                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">{u.req}</span>
                                </div>
                                <p className="text-sm text-slate-600 mb-4">{u.desc}</p>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-100 pt-3">
                                <div className="text-xs text-slate-500 flex flex-col font-mono">
                                    {University.getUnitCost()}
                                </div>
                                <button 
                                onClick={() => onRecruit(u.type)}
                                disabled={(capital?.expertLabor || 0) < 1}
                                title={`Стоимость: ${formatCost(GameConfig.UNITS.CONSTRUCTION.COST)}`}
                                className="bg-[#8b5a2b] text-white px-4 py-2 rounded hover:bg-[#6b4521] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-bold"
                                >
                                    ОБУЧИТЬ
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default UniversityModal;
