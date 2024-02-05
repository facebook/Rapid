import { AbstractSystem } from './AbstractSystem.js';


export class ColorSystem extends AbstractSystem {
  constructor(context) {
    super(context);
    this.id = 'colors';
    this.context = context;
    this.dependencies = new Set(['dataloader']);

    this.colorData = null;
    this.colorSchemes = null;
    this.currentColorScheme = null;

    // matrix values from https://github.com/maputnik/editor
    this.protanopiaMatrix = [
      0.567,  0.433,  0,     0,  0,
      0.558,  0.442,  0,     0,  0,
      0,      0.242,  0.758, 0,  0,
      0,      0,      0,     1,  0
    ];

    this.deuteranopiaMatrix = [
      0.625,  0.375,  0,     0,  0,
      0.7,    0.3,    0,     0,  0,
      0,      0.3,    0.7,   0,  0,
      0,      0,      0,     1,  0
    ];

    this.tritanopiaMatrix = [
      0.95,   0.05,   0,     0,  0,
      0,      0.433,  0.567, 0,  0,
      0,      0.475,  0.525, 0,  0,
      0,      0,      0,     1,  0
    ];

    // Make sure the event handlers have `this` bound correctly
    this.getColorScheme = this.getColorScheme.bind(this);
    this.getAllColorSchemes = this.getAllColorSchemes.bind(this);
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync(){
    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
        return Promise.reject(`Cannot init: ${this.id} requires ${id}`);
      }
    }
    return Promise.resolve();
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    this._started = true;
    const context = this.context;
    const dataloader = context.systems.dataloader;

    return dataloader.getDataAsync('colors')
      .then(data => {
        this.colorSchemes = data;
        this.colorData = data.default;    // set current scheme to default
        this.currentColorScheme = 'default';
        this.emit('colorsloaded');
      });
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    return Promise.resolve();
  }


  // returns the default color scheme object
  getColorScheme() {
    return this.colorData;
  }

  // returns an object containing all color scheme objects
  getAllColorSchemes() {
    return this.colorSchemes;
  }

  setColorScheme(scheme) {
    const currentScheme = this.colorSchemes[scheme];
    if (this.colorData !== currentScheme) {
      this.currentColorScheme = scheme;
      this.colorData = currentScheme;
    }
  }

}
