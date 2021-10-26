interface Entities extends Record<string, any> {}

interface CoreGraph {
    entities: Entities;
    _parentWays: object;
    _parentRels: object;

    hasEntity(id: string): string;

    entity(id: string): any;

    geometry(id: string): string;

    transient(entity, key, fn): any;

    parentWays(entity): any;

    isPoi(entity): boolean;

    isShared(entity): boolean;

    parentRelations(entity): any;

    parentMultipolygons(entity): boolean;

    childNodes(entity): any;

    base(): any;

    rebase(entities, stack, force): void;

    replace(entity): this;

    remove(entity): this;

    revert(id): this;

    update(): this;

    load(): this;
}
