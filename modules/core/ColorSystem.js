import { AbstractSystem } from './AbstractSystem';

export class ColorSystem extends AbstractSystem {
    constructor(context) {
        super(context);
        this.id = 'colors';
        this.context = context;
        this.dependencies = new Set(['dataloader']);
        this.autoStart = true;
        this._started = false;
        this.colorData = null;

        this.getColorScheme = this.getColorScheme.bind(this);
    }

    initAsync(){
        for (const id of this.dependencies) {
            if (!this.context.systems[id]) {
                return Promise.reject(`Cannot init: ${this.id} requires ${id}`);
            }
        }
        return Promise.resolve();
    }

    startAsync() {
        this._started = true;
        const context = this.context;
        const dataloader = context.systems.dataloader;

        dataloader.getDataAsync('colors')
            .then((data) => { this.colorData = data.default[0]; } );

        return Promise.resolve();
    }

    resetAsync() {
        return Promise.resolve();
    }

    getColorScheme() {
        return this.colorData;
    }
}