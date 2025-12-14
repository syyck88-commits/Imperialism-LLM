
import { GPUTextureHandle } from "./ITexture";

/**
 * A singleton class to track all allocated WebGL resources for debugging purposes.
 */
export class GPUResourceRegistry {
    private static instance: GPUResourceRegistry;

    private textures: Map<number, { handle: GPUTextureHandle, owner: string }> = new Map();
    private totalTextures: number = 0;
    private estimatedBytes: number = 0;
    private byOwner: Map<string, { count: number, bytes: number }> = new Map();

    private constructor() { }

    public static getInstance(): GPUResourceRegistry {
        if (!GPUResourceRegistry.instance) {
            GPUResourceRegistry.instance = new GPUResourceRegistry();
        }
        return GPUResourceRegistry.instance;
    }

    public registerTexture(handle: GPUTextureHandle, ownerTag: string): void {
        if (this.textures.has(handle.id)) {
            console.warn(`GPUResourceRegistry: Texture with ID ${handle.id} is already registered.`, handle);
            return;
        }

        const bytes = handle.width * handle.height * 4; // Assuming RGBA8

        this.totalTextures++;
        this.estimatedBytes += bytes;
        
        const ownerStats = this.byOwner.get(ownerTag) || { count: 0, bytes: 0 };
        ownerStats.count++;
        ownerStats.bytes += bytes;
        this.byOwner.set(ownerTag, ownerStats);

        this.textures.set(handle.id, { handle, owner: ownerTag });
    }

    public unregisterTexture(handle: GPUTextureHandle | null | undefined): void {
        if (!handle || !this.textures.has(handle.id)) {
            // It might have been unregistered already or was never registered.
            return;
        }

        const registration = this.textures.get(handle.id)!;
        const bytes = registration.handle.width * registration.handle.height * 4;

        this.totalTextures--;
        this.estimatedBytes -= bytes;

        const ownerStats = this.byOwner.get(registration.owner);
        if (ownerStats) {
            ownerStats.count--;
            ownerStats.bytes -= bytes;
            if (ownerStats.count <= 0) {
                this.byOwner.delete(registration.owner);
            }
        }

        this.textures.delete(handle.id);
    }

    public toDebugString(): string {
        const mb = (this.estimatedBytes / 1024 / 1024).toFixed(2);
        let output = `Textures: <span class='text-white'>${this.totalTextures}</span> | VRAM: <span class='text-white'>~${mb} MB</span>`;
        
        /* Detailed breakdown is too verbose for UI, but useful for console.
        const owners: string[] = [];
        this.byOwner.forEach((stats, owner) => {
            owners.push(`${owner}: ${stats.count} (~${(stats.bytes / 1024 / 1024).toFixed(2)} MB)`);
        });
        if (owners.length > 0) {
            output += '\n' + owners.join(' | ');
        }
        */
        return output;
    }

    public onContextLost(): void {
        console.warn("GPUResourceRegistry: Context lost, resetting all stats.");
        this.textures.clear();
        this.byOwner.clear();
        this.totalTextures = 0;
        this.estimatedBytes = 0;
    }
}
