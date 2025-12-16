
import React, { useState } from 'react';
import { Monitor, TrendingDown, Zap, BarChart, Sun, BatteryLow } from 'lucide-react';
import { QualityManager } from '../../../core/quality/QualityManager';
import { GraphicsQualityLevel } from '../../../core/quality/types';

const levels: { key: GraphicsQualityLevel; label: string; icon: React.ReactNode }[] = [
    { key: 'auto', label: 'Авто', icon: <Zap size={14} /> },
    { key: 'very_low', label: 'Мин.', icon: <BatteryLow size={14} /> },
    { key: 'low', label: 'Низк.', icon: <TrendingDown size={14} /> },
    { key: 'medium', label: 'Сред.', icon: <BarChart size={14} /> },
    { key: 'high', label: 'Выс.', icon: <Sun size={14} /> },
];

export const QualityTab: React.FC = () => {
    const qualityManager = QualityManager.getInstance();
    const [level, setLevel] = useState<GraphicsQualityLevel>(qualityManager.getLevel());

    const handleLevelChange = (newLevel: GraphicsQualityLevel) => {
        qualityManager.setLevel(newLevel);
        setLevel(newLevel);
    };

    const settings = qualityManager.getSettings();

    return (
        <div className="space-y-4 text-sm text-slate-300">
            <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase">
                <Monitor size={14} /> Качество графики
            </div>
            <p className="text-xs text-slate-500">
                "Мин" отключает тени и уменьшает кол-во объектов до 1. Идеально для старых ноутбуков.
            </p>

            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1 flex-wrap">
                {levels.map(l => (
                    <button
                        key={l.key}
                        onClick={() => handleLevelChange(l.key)}
                        className={`flex-1 py-2 px-1 rounded-md flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                            level === l.key ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                        {l.icon} {l.label}
                    </button>
                ))}
            </div>

            <div className="bg-slate-800 p-3 rounded-lg border border-slate-700 space-y-2 text-xs">
                <div className="flex justify-between">
                    <span className="text-slate-400">Масштаб рендера:</span>
                    <span className="font-mono text-white">{Math.round(settings.renderScale * 100)}%</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-400">Тени:</span>
                    <span className={`font-mono ${settings.shadowsEnabled ? 'text-emerald-400' : 'text-red-400'}`}>
                        {settings.shadowsEnabled ? 'Вкл' : 'Выкл'}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-400">Детализация (Clump):</span>
                    <span className="font-mono text-white">
                        {settings.maxClumpCount === 1 ? '1 объект' : 'Максимум'}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-400">Бюджет VRAM:</span>
                    <span className="font-mono text-white">{settings.vramBudgetMB} MB</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-400">Анимации:</span>
                    <span className="font-mono text-white">{settings.animalsUpdateHz} Гц</span>
                </div>
                 <div className="flex justify-between">
                    <span className="text-slate-400">Ветер:</span>
                    <span className="font-mono text-white">{settings.enableWindAnimation ? 'Вкл' : 'Выкл'}</span>
                </div>
            </div>
        </div>
    );
};
