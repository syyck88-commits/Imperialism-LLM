
import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GameRef } from '../components/GameContainer';
import { AdvisorType, ChatMessage } from '../components/UI/AdvisorWidget';

interface UseAdvisorProps {
    gameRef: React.RefObject<GameRef>;
    year: number;
}

export const useAdvisor = ({ gameRef, year }: UseAdvisorProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [advisorType, setAdvisorType] = useState<AdvisorType>('flash');
    const [chatHistories, setChatHistories] = useState<Record<AdvisorType, ChatMessage[]>>({
        flash: [],
        pro: []
    });
    const [isLoading, setIsLoading] = useState(false);

    const handleOpen = () => {
        setIsOpen(true);
        // Auto-greet only if specific history is empty
        if (chatHistories[advisorType].length === 0) {
            if (advisorType === 'flash') {
                sendMessage("Поручик! Оставьте дам в покое и доложите обстановку!");
            } else {
                sendMessage("Гумозникус! Хватит спать, что с казной?");
            }
        }
    };

    const sendMessage = async (userText: string) => {
        if (!gameRef.current || !userText.trim()) return;

        // 1. Update history with User Message immediately
        setChatHistories(prev => ({
            ...prev,
            [advisorType]: [...prev[advisorType], { sender: 'user', text: userText }]
        }));

        setIsLoading(true);

        try {
            const state = gameRef.current.getGameStateAnalysis();
            const warnings = gameRef.current.getGameWarnings();
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

            let systemInstruction = "";
            let modelName = "";

            if (advisorType === 'flash') {
                // Flashus: Lieutenant Rzhevsky (Vulgar Hussar)
                modelName = "gemini-2.5-flash";
                systemInstruction = `
            ТЫ — ПОРУЧИК ФЛАШУС (РЖЕВСКИЙ). Гусар, бабник, кутила и пошляк.
            
            ТВОЯ ЛИЧНОСТЬ:
            - Твои мысли заняты только женщинами (дамами), шампанским и картами.
            - Ты даешь советы по управлению Империей, НО всегда через призму пошлых метафор и гусарского юмора.
            - Стиль: Наглый, "гусары денег не берут", "всем шампанского".
            
            КАК ТЫ ОТВЕЧАЕШЬ:
            - Если не хватает ресурсов: "Сир, у нас пусто, как в декольте у старой графини!"
            - Если нужно строить шахту: "Надо углубиться, мон шер! Глубже, как в первую брачную ночь!"
            - Если народ голодает: "Пусть едят пирожные! Или балерин, они все равно ничего не весят!"
            - Если денег нет: "Проигрался в пух и прах! Может, заложим Вашу корону? Или продадим Аляску цыганам?"
            - Постоянно упоминай Наташу Ростову, мадам, будуары, корсеты, ножки.
            
            ТВОЕ ОТНОШЕНИЕ:
            - Ты обращаешься к игроку: "Мон шер", "Вашество", "Друг мой ситный".
            - Ты презираешь Гумозникуса (второго советника), называя его импотентом и сухарем.
            
            ВАЖНО:
            - Будь смешным, пошловатым (на грани 16+), но давай хоть немного полезной инфы по игре.
            - Ответ должен быть коротким! 2-3 предложения максимум!
            
            КОНТЕКСТ ИГРЫ: Год ${year}.
            Проблемы: ${warnings.join(', ')}.
            Данные: ${JSON.stringify(state)}.
          `;
            } else {
                // Gumoznikus: Toxic Sarcastic Bureaucrat
                modelName = "gemini-3-pro-preview";
                systemInstruction = `
            ТЫ — ГУМОЗНИКУС ТРЕТИЙ. Древний, желчный, токсичный чиновник.
            
            ТВОЯ ЛИЧНОСТЬ:
            - Ты искренне считаешь Императора (игрока) клиническим идиотом, но вынужден соблюдать этикет (едва-едва).
            - Ты ненавидишь инициативу, реформы и Флашуса (этого пьяного солдафона).
            - Твой стиль: Ядовитый сарказм, пассивная агрессия, сомнения в умственных способностях игрока.
            
            КАК ТЫ ОТВЕЧАЕШЬ:
            - Прямо намекай на тупость игрока: "С Вашим-то блистательным... кхм... интеллектом, Сир..."
            - "Ох, опять Вы за своё? Я же писал в докладе 40 лет назад..."
            - "Вы хотите построить дорогу? Удивительно, что Вы вообще знаете это слово."
            - "Денег нет. Ну разумеется. Вы же считаете так же хорошо, как и правите — отвратительно."
            - Используй сложные канцелярские обороты, чтобы запутать "этого дурачка".
            
            ВАЖНО:
            - Ты должен быть ВРЕДНЫМ. Ты должен подкалывать игрока.
            - Но при этом дай точный стратегический совет, вздыхая, что "всё равно Вы не послушаете".
            - Ответ 3-4 предложения.
            
            КОНТЕКСТ ИГРЫ: Год ${year}.
            Проблемы: ${warnings.join(', ')}.
            Данные: ${JSON.stringify(state)}.
          `;
            }

            const chatContext = chatHistories[advisorType].map(m => `${m.sender === 'user' ? 'Император' : 'Советник'}: ${m.text}`).join('\n');
            const finalPrompt = `
        ИСТОРИЯ ДИАЛОГА:
        ${chatContext}
        
        НОВОЕ СООБЩЕНИЕ ИМПЕРАТОРА:
        ${userText}
        
        ОТВЕТ СОВЕТНИКА (В ОБРАЗЕ!):
      `;

            const response = await ai.models.generateContent({
                model: modelName,
                contents: finalPrompt,
                config: {
                    systemInstruction: systemInstruction,
                }
            });

            const aiText = response.text || "Э... (звуки несварения или похмелья)... Повторите, Сир.";

            // 2. Update history with AI Message
            setChatHistories(prev => ({
                ...prev,
                [advisorType]: [...prev[advisorType], { sender: 'advisor', text: aiText }]
            }));

        } catch (e) {
            console.error(e);
            setChatHistories(prev => ({
                ...prev,
                [advisorType]: [...prev[advisorType], { sender: 'advisor', text: "Гонец спился по дороге (Ошибка API)." }]
            }));
        } finally {
            setIsLoading(false);
        }
    };

    const clearChat = () => {
        setChatHistories(prev => ({
            ...prev,
            [advisorType]: []
        }));
    };

    return {
        isOpen,
        open: handleOpen,
        close: () => setIsOpen(false),
        advisorType,
        setAdvisorType,
        chatHistories,
        isLoading,
        sendMessage,
        clearChat
    };
};
