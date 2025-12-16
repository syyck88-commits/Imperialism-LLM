
export type GraphicsQualityLevel = "auto" | "very_low" | "low" | "medium" | "high";

export interface GraphicsQualitySettings {
    renderScale: number;
    vramBudgetMB: number;
    visibleChunkPadding: number;
    baseBakeZoomOutScale: number;
    enableAnisotropy: boolean;
    maxAnisotropy: number;
    animalsUpdateHz: number;
    enableWindAnimation: boolean;
    // New optimization flags
    shadowsEnabled: boolean;
    maxClumpCount: number; // 0 = unlimited (use sprite config), 1 = force single
}

export const QUALITY_PRESETS: Record<Exclude<GraphicsQualityLevel, "auto">, GraphicsQualitySettings> = {
    very_low: {
        renderScale: 0.5,
        vramBudgetMB: 128,
        visibleChunkPadding: 0,
        baseBakeZoomOutScale: 0.25,
        enableAnisotropy: false,
        maxAnisotropy: 0,
        animalsUpdateHz: 0, // Static animals
        enableWindAnimation: false,
        shadowsEnabled: false,
        maxClumpCount: 1,
    },
    low: {
        renderScale: 0.75,
        vramBudgetMB: 256,
        visibleChunkPadding: 1,
        baseBakeZoomOutScale: 0.5,
        enableAnisotropy: false,
        maxAnisotropy: 0,
        animalsUpdateHz: 15,
        enableWindAnimation: false,
        shadowsEnabled: true,
        maxClumpCount: 0,
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
        shadowsEnabled: true,
        maxClumpCount: 0,
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
        shadowsEnabled: true,
        maxClumpCount: 0,
    }
};
