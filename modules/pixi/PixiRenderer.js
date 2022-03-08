import { dispatch as d3_dispatch } from 'd3-dispatch';
import * as PIXI from 'pixi.js';
import { Projection, Extent, vecAdd } from '@id-sdk/math';

import { PixiEventsHandler } from './PixiEventsHandler';
import { PixiLayers } from './PixiLayers';
import { PixiScene } from './PixiScene';
import { prepareTextures } from './textures';

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
    this.selectedEntities = [];

    this._redrawPending = false;
    this._hoverTarget = null;
    this.dispatch = d3_dispatch('change', 'dragstart', 'dragend');

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

    // Prepare textures
    prepareTextures(context, this.pixi.renderer);

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

    this.pixiProjection = new Projection();
    this.scene = new PixiScene(context);
    this.layers = new PixiLayers(context, this.scene, this.dispatch);
    this.eventsHandler = new PixiEventsHandler(context, this.dispatch, this.pixiProjection, this.scene);

    stage
      .on('click', e => this.eventsHandler.onClickHandler(e))
      // .on('pointermove', e => this.eventsHandler.onPointerMoveHandler(e))
      .on('pointerdown', e => this.eventsHandler.onTouchStartHandler(e))
      .on('pointermove', e => this.eventsHandler.onTouchMoveHandler(e))
      .on('pointerup', e => this.eventsHandler.onTouchEndHandler(e));
  }


  /**
   * render
   */
  render() {
    if (this._redrawPending) return;

    // UPDATE TRANSFORM
    // Reproject the pixi geometries only whenever zoom changes
    const context = this.context;
    const pixiProjection = this.pixiProjection;
    const currTransform = context.projection.transform();
    const pixiTransform = pixiProjection.transform();

    let offset;
    if (pixiTransform.k !== currTransform.k) {    // zoom changed, reset
      offset = [0, 0];
      pixiProjection.transform(currTransform);
    } else {
      offset = [ pixiTransform.x - currTransform.x, pixiTransform.y - currTransform.y ];
    }

    const stage = this.pixi.stage;
    stage.position.set(-offset[0], -offset[1]);

    //
    // DRAW phase (updates bounding boxes)
    //
    this.layers.render(pixiProjection);

//    //
//    // CULL phase (feature positions in the rbush must be up to date for this to work)
//    //
//    // const viewMin = vecAdd(offset, [screen.x, screen.y]);   // x,y should be 0,0
//    // const viewMax = vecAdd(offset, [screen.width, screen.height]);
//    // const screen = this.pixi.screen;
//    const mapExtent = context.map().extent();
//    const visible = this.scene._rbush.search(mapExtent.bbox());
//
//    let isVisible = {};
//    visible.forEach(box => isVisible[box.id] = true);
//
//    [...this.scene._features.entries()].forEach(function cull([featureID, feature]) {
//      feature.visible = !!isVisible[featureID];
//    });


    // this.scene._features.forEach(feature => {
    //   const displayObject = feature.displayObject;
    //   const bounds = feature.sceneBounds;
    //   if (!bounds || !displayObject) return;

    //   const featMin = [bounds.x, bounds.y];
    //   const featMax = [bounds.x + bounds.width, bounds.y + bounds.height];

    //   const isVisible = (
    //     featMin[0] <= viewMax[0] &&
    //     featMin[1] <= viewMax[1] &&
    //     featMax[0] >= viewMin[0] &&
    //     featMax[1] >= viewMin[1]
    //   );

    //   displayObject.visible = isVisible;
    // });


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
