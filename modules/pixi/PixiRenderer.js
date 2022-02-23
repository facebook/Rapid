import * as PIXI from 'pixi.js';
import { Projection } from '@id-sdk/math';

import { PixiLayers } from './PixiLayers';
import { modeBrowse, modeSelect } from '../modes';

const AUTOTICK = false;     // set to true to turn the ticker back on


/**
 * PixiRenderer
 * @class
 */
export class PixiRenderer {

  /**
   * @constructor
   * Create a Pixi application and add it to the given parentElement.
   * We also add it as `context.pixi` so that other parts of RapiD can use it.
   *
   * @param context
   * @param parentElement
   */
  constructor(context, parentElement) {
    this.context = context;
    this.parentElement = parentElement;
    this.featureCache = new Map();            // map of OSM ID -> Pixi data
    this.pixiProjection = new Projection();

    this._redrawPending = false;
    this._hoverTarget = null;

    this.pixi = new PIXI.Application({
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0.0,
      resizeTo: parentElement,
      resolution: window.devicePixelRatio
    });

    context.pixi = this.pixi;
    parentElement.appendChild(this.pixi.view);

    // Register Pixi with the pixi-inspector extension if it is installed
    // https://github.com/bfanger/pixi-inspector
    if (window.__PIXI_INSPECTOR_GLOBAL_HOOK__) {
      window.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });
    }

    // prepare sprites
    const loader = PIXI.Loader.shared;
    loader.add('dist/img/icons/maki-spritesheet.json');
    loader.add('dist/img/icons/temaki-spritesheet.json');
    loader.add('dist/img/icons/fontawesome-spritesheet.json');
    loader.add('dist/img/icons/mapillary-features-spritesheet.json');
    loader.add('dist/img/icons/mapillary-signs-spritesheet.json');
    loader.load(loader => {
      context._makiSheet = loader.resources['dist/img/icons/maki-spritesheet.json'];
      context._temakiSheet = loader.resources['dist/img/icons/temaki-spritesheet.json'];
      context._fontAwesomeSheet = loader.resources['dist/img/icons/fontawesome-spritesheet.json'];
      context._mapillarySheet = loader.resources['dist/img/icons/mapillary-features-spritesheet.json'];
      context._mapillarySignSheet = loader.resources['dist/img/icons/mapillary-signs-spritesheet.json'];
    });

    this.pixi.rapidTextureKeys = [
      'bushes', 'cemetery', 'cemetery_buddhist', 'cemetery_christian', 'cemetery_jewish', 'cemetery_muslim',
      'construction', 'dots', 'farmland', 'farmyard', 'forest', 'forest_broadleaved', 'forest_leafless',
      'forest_needleleaved', 'grass', 'landfill', 'lines', 'orchard', 'pond', 'quarry', 'vineyard',
      'waves', 'wetland', 'wetland_bog', 'wetland_marsh', 'wetland_reedbed', 'wetland_swamp'
    ];

    this.pixi.rapidTextures = new Map();
    this.pixi.rapidTextureKeys.forEach(key => {
      this.pixi.rapidTextures.set(key, new PIXI.Texture.from(`dist/img/pattern/${key}.png`));
    });


    // Setup the Ticker
    const ticker = this.pixi.ticker;
    if (AUTOTICK) {       // redraw automatically every frame
      ticker.maxFPS = 30;
      ticker.autoStart = true;
    } else {              // redraw only on zoom/pan
      ticker.autoStart = false;
      ticker.stop();
    }

    // Setup the Interaction Manager
    // const interactionManager = this.pixi.renderer.plugins.interaction;
    // interactionManager.interactionFrequency = 100;    // default 10ms, slow it down?  doesn't do what I thought

    const stage = this.pixi.stage;
    stage.name = 'stage';
    stage.sortableChildren = true;
    stage.interactive = true;
    // Add a big hit area to `stage` so that clicks on nothing will register
    stage.hitArea = new PIXI.Rectangle(-100000, -100000, 200000, 200000);

    stage
      .on('click', e => {
        if (!e.target) return;
        const name = e.target.name || 'nothing';
        console.log(`clicked on ${name}`);
        const entity = e.target.__data__;
        if (entity) {
          context.enter(modeSelect(context, [entity.id]));
        } else {
          context.enter(modeBrowse(context));
        }
      })
      .on('pointermove', e => {
        if (!e.target) return;

        // hover target has changed
        if (e.target !== this._hoverTarget) {
          const name = e.target.name || 'nothing';
          console.log(`pointer over ${name}`);

//          // remove hover
//          if (this._hoverTarget) {
//            const hover = this._hoverTarget.getChildByName('hover');
//            if (hover) hover.destroy();
//          }

          this._hoverTarget = e.target;

//          // add new hover
//          if (e.target !== stage) {
//            const hover = new PIXI.Sprite(PIXI.Texture.WHITE);
//            hover.name = 'hover';
//            hover.width= 50;
//            hover.height= 50;
//            hover.interactive = false;
//            hover.interactiveChildren = false;
//            e.target.addChild(hover);
//          }

//          this.render();
        }
      });


    this.layers = new PixiLayers(context, this.featureCache);
  }


  /**
   * render
   */
  render() {
    if (this._redrawPending) return;

    // UPDATE TRANSFORM
    // Reproject the pixi geometries only whenever zoom changes
    const currTransform = this.context.projection.transform();
    const pixiTransform = this.pixiProjection.transform();

    let offset;
    if (pixiTransform.k !== currTransform.k) {    // zoom changed, reset
      offset = [0, 0];
      this.pixiProjection.transform(currTransform);
    } else {
      offset = [ pixiTransform.x - currTransform.x, pixiTransform.y - currTransform.y ];
    }

    const stage = this.pixi.stage;
    stage.position.set(-offset[0], -offset[1]);

// CULL phase (everything)
//    const viewMin = offset;  //[0,0];
//    const viewMax = vecAdd(offset, _dimensions);
//
//    this.featureCache.forEach(feature => {
//      const bounds = feature.bounds;
//      const displayObject = feature.displayObject;
//      if (!bounds || !displayObject) return;
//
//      const featMin = [bounds.x, bounds.y];
//      const featMax = [bounds.x + bounds.width, bounds.y + bounds.height];
//
//      const isVisible = (
//        featMin[0] <= viewMax[0] &&
//        featMin[1] <= viewMax[1] &&
//        featMax[0] >= viewMin[0] &&
//        featMax[1] >= viewMin[1]
//      );
//
//      displayObject.visible = isVisible;
//      if (feature.label) {
//        feature.label.displayObject.visible = isVisible;
//      }
//    });

    // Draw everything
    this.layers.render(this.pixiProjection);


    if (!AUTOTICK) {    // tick manually
      this._redrawPending = true;
      window.requestAnimationFrame(timestamp => {
        this.pixi.ticker.update(timestamp);

        // ...or this?
        // const m = new PIXI.Matrix(1, 0, 0, 1, -offset[0], -offset[1]);
        // const options = {
        //   transform: m
        //   // skipUpdateTransform: true
        // };
        // pixi.renderer.render(pixi.stage, options);
          this._redrawPending = false;
      });
    }

  }

}
