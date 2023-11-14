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
        this.colorSchemes = null;
        this.currentColorScheme = null;

        this.getColorScheme = this.getColorScheme.bind(this);
        this.getAllColorSchemes = this.getAllColorSchemes.bind(this);
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
            .then((data) => {
                this.colorSchemes = data;
                // set current scheme to default
                this.colorData = data.default;
                this.currentColorScheme = 'default';
                this.emit('colorsloaded');  // emit copies
            });

        return Promise.resolve();
    }

    resetAsync() {
        return Promise.resolve();
    }

    getColorScheme() {
        // returns the default color scheme object
        return this.colorData;
    }

    getAllColorSchemes() {
        // returns an object containing all color scheme objects
        return this.colorSchemes;
    }

    setColorScheme(scheme) {
        let currentScheme = this.colorSchemes[scheme];
        if (this.colorData !== currentScheme) { // if the selected scheme is not the current scheme, assign the colorData var to the new scheme
            this.currentColorScheme = scheme;
            this.colorData = currentScheme;
        }
    }
}