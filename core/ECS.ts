/**
 * Unique identifier for entities.
 */
export type EntityId = number;

/**
 * Base abstract class for Components.
 * Components should be pure data containers.
 */
export abstract class Component {
  public abstract name: string;
}

/**
 * Entity
 * A mere container for an ID and a collection of components.
 */
export class Entity {
  public id: EntityId;
  public components: Map<string, Component> = new Map();

  constructor(id: EntityId) {
    this.id = id;
  }

  public addComponent(component: Component): void {
    this.components.set(component.name, component);
  }

  public getComponent<T extends Component>(name: string): T | undefined {
    return this.components.get(name) as T;
  }

  public hasComponent(name: string): boolean {
    return this.components.has(name);
  }
}

/**
 * System
 * Contains logic to manipulate entities possessing specific components.
 */
export abstract class System {
  public abstract update(entities: Entity[], deltaTime: number): void;
  public abstract render(entities: Entity[], ctx: CanvasRenderingContext2D): void;
}

/**
 * World / EntityManager
 * Manages the lifecycle of entities.
 */
export class World {
  private entities: Entity[] = [];
  private nextEntityId: number = 0;

  public createEntity(): Entity {
    const entity = new Entity(this.nextEntityId++);
    this.entities.push(entity);
    return entity;
  }

  public getEntities(): Entity[] {
    return this.entities;
  }

  // Simple query helper
  public getEntitiesWith(componentNames: string[]): Entity[] {
    return this.entities.filter(entity => 
      componentNames.every(name => entity.hasComponent(name))
    );
  }
}