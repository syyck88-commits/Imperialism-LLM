
export type GraphicsQualityLevel = "auto" | "low" | "medium" | "high";

export interface GraphicsQualitySettings {
    renderScale: number;
    vramBudgetMB: number;
    visibleChunkPadding: number;
    baseBakeZoomOutScale: number;
    enableAnisotropy: boolean;
    maxAnisotropy: number;
    animalsUpdateHz: number;
    enableWindAnimation: boolean;
}

export const QUALITY_PRESETS: Record<Exclude<GraphicsQualityLevel, "auto">, GraphicsQualitySettings> = {
    low: {
        renderScale: 0.75,
        vramBudgetMB: 256,
        visibleChunkPadding: 1,
        baseBakeZoomOutScale: 0.5,
        enableAnisotropy: false,
        maxAnisotropy: 0,
        animalsUpdateHz: 15,
        enableWindAnimation: false,
    },
    medium: {
        renderScale: 1.0,
        vramBudgetMB: 512,
        visibleChunkPadding: 2,
        baseBakeZoomOutScale: 0.5,
        enableAnisotropy: true,
        maxAnisotropy: 2,
        animalsUpdateHz: 30,
        enableWindAnimation: true,
    },
    high: {
        renderScale: 1.0,
        vramBudgetMB: 1024,
        visibleChunkPadding: 4,
        baseBakeZoomOutScale: 1.0,
        enableAnisotropy: true,
        maxAnisotropy: 8,
        animalsUpdateHz: 60,
        enableWindAnimation: true,
    }
};
