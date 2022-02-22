import { dispatch as d3_dispatch } from 'd3-dispatch';
import * as PIXI from 'pixi.js';
import { Projection, vecAdd } from '@id-sdk/math';

import {
  PixiLabels,
  PixiLayers,
  PixiOsmAreas,
  PixiOsmLines,
  PixiOsmMidpoints,
  PixiOsmPoints,
  PixiOsmVertices,
  PixiRapidFeatures
} from './index.js';

import { modeBrowse, modeSelect } from '../modes';

const AUTOTICK = false;     // set to true to turn the ticker back on


/**
 * PixiRenderer
 * @class
 */
export class PixiRenderer {

  /**
   * constructor
   * Create a Pixi application and add it to the given container.
   * We also add it as `context.pixi` so that other parts of RapiD can use it.
   */
  constructor(context, container) {
    this._context = context;
    this._redrawPending = false;
    this._pixiProjection = new Projection();
    this._featureCache = new Map();            // map of OSM ID -> Pixi data
    this._container = container;
    this._hoverTarget = null;

    this._pixi = new PIXI.Application({
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0.0,
      resizeTo: container,
      resolution: window.devicePixelRatio
    });

    context.pixi = this._pixi;
    container.appendChild(this._pixi.view);

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

    this._pixi.rapidTextureKeys = [
      'bushes', 'cemetery', 'cemetery_buddhist', 'cemetery_christian', 'cemetery_jewish', 'cemetery_muslim',
      'construction', 'dots', 'farmland', 'farmyard', 'forest', 'forest_broadleaved', 'forest_leafless',
      'forest_needleleaved', 'grass', 'landfill', 'lines', 'orchard', 'pond', 'quarry', 'vineyard',
      'waves', 'wetland', 'wetland_bog', 'wetland_marsh', 'wetland_reedbed', 'wetland_swamp'
    ];

    this._pixi.rapidTextures = new Map();
    this._pixi.rapidTextureKeys.forEach(key => {
      this._pixi.rapidTextures.set(key, new PIXI.Texture.from(`dist/img/pattern/${key}.png`));
    });


    // Setup the Ticker
    const ticker = this._pixi.ticker;
    if (AUTOTICK) {       // redraw automatically every frame
      ticker.maxFPS = 30;
      ticker.autoStart = true;
    } else {              // redraw only on zoom/pan
      ticker.autoStart = false;
      ticker.stop();
    }

    // Setup the Interaction Manager
    // const interactionManager = this._pixi.renderer.plugins.interaction;
    // interactionManager.interactionFrequency = 100;    // default 10ms, slow it down?  doesn't do what I thought

    // Setup Scene
    //
    // A few definitions:
    //
    // - `buttonMode = true`    this displayObject will turn the cursor to a pointer when hovering over
    // - `buttonMode = false`   this displayObject will NOT turn the cursor to a pointer when hovering over (default)
    //
    // - `interactive = true`   this displayObject can emit events
    // - `interactive = false`  this displayObject can NOT emit events (default)
    //
    // - `interactiveChildren = true`   this container and its children will be checked for hits (default)
    // - `interactiveChildren = false`  this container and its children will NOT be checked for hits
    //
    // - `sortableChildren = true`   we will set a zIndex property on children and they will be sorted according to it
    // - `sortableChildren = false`  children will be drawn in the ordrer they are added to `children` array (default)
    //
    const stage = this._pixi.stage;
    stage.name = 'stage';
    stage.interactive = true;
    // Add a big hit area to `stage` so that clicks on nothing will register
    stage.hitArea = new PIXI.Rectangle(-100000, -100000, 200000, 200000);

    const areas = new PIXI.Container();
    areas.name = 'areas';
    areas.interactive = false;
    areas.sortableChildren = true;

    const lines = new PIXI.Container();
    lines.name = 'lines';
    lines.interactive = false;
    lines.sortableChildren = true;

    const vertices = new PIXI.Container();
    vertices.name = 'vertices';
    vertices.interactive = false;
    vertices.sortableChildren = true;

    const points = new PIXI.Container();
    points.name = 'points';
    points.interactive = false;
    points.sortableChildren = true;

    const labels = new PIXI.Container();
    labels.name = 'labels';
    labels.interactive = false;
    labels.interactiveChildren = false;
    labels.sortableChildren = false;

    // const midpoints = new PIXI.Container();
    // midpoints.name = 'midpoints';
    // midpoints.interactive = false;
    // midpoints.sortableChildren = true;

    stage.addChild(areas, lines, vertices, points, labels);

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


    this._drawPoints = PixiOsmPoints(context, this._featureCache);
    this._drawVertices = PixiOsmVertices(context, this._featureCache);
    this._drawLines = PixiOsmLines(context, this._featureCache);
    this._drawAreas = PixiOsmAreas(context, this._featureCache);
    this._drawMidpoints = PixiOsmMidpoints(context, this._featureCache);
    this._drawLabels = PixiLabels(context, this._featureCache);

    this._layers = new PixiLayers(context, this._featureCache);
  }


  layers() {
    return this._layers;
  }



  /**
   * render
   */
  render() {
    if (this._redrawPending) return;

    const pixi = this._pixi;
    const stage = pixi.stage;
    const context = this._context;
    const map = context.map();

    // UPDATE TRANSFORM
    // Reproject the pixi geometries only whenever zoom changes
    const currTransform = context.projection.transform();
    const pixiTransform = this._pixiProjection.transform();

    let offset;
    if (pixiTransform.k !== currTransform.k) {    // zoom changed, reset
      offset = [0, 0];
      this._pixiProjection.transform(currTransform);
    } else {
      offset = [ pixiTransform.x - currTransform.x, pixiTransform.y - currTransform.y ];
    }

    stage.position.set(-offset[0], -offset[1]);


    // GATHER phase
    const data = context.history().intersects(map.extent());


    // CULL phase (osm only?)
    const effectiveZoom = map.effectiveZoom();
    let visibleOSM = {};
    data.forEach(entity => visibleOSM[entity.id] = true);
    [...this._featureCache.entries()].forEach(function cull([id, feature]) {
      let isVisible = !!visibleOSM[id] ||
        !context.graph().hasEntity(id);  // for now non-OSM features will have to cull themselves

      if (feature.type === 'vertex' && effectiveZoom < 16) {
        isVisible = false;
      }

      feature.displayObject.visible = isVisible;
      if (feature.label) {
        feature.label.displayObject.visible = isVisible;
      }
    });

// CULL phase (everything)
//    const viewMin = offset;  //[0,0];
//    const viewMax = vecAdd(offset, _dimensions);
//
//    this._featureCache.forEach(feature => {
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


    // DRAW phase

    // OSM
    const areasLayer = stage.getChildByName('areas');
    const linesLayer = stage.getChildByName('lines');
    const verticesLayer = stage.getChildByName('vertices');
    const pointsLayer = stage.getChildByName('points');
    const labelsLayer = stage.getChildByName('labels');
    const midpointsLayer = stage.getChildByName('midpoints');

    this._drawAreas(areasLayer, this._pixiProjection, data);
    this._drawLines(linesLayer, this._pixiProjection, data);
    this._drawVertices(verticesLayer, this._pixiProjection, data);
    this._drawPoints(pointsLayer, this._pixiProjection, data);
    // this._drawMidpoints(midpointsLayer, this._pixiProjection, data);
    this._drawLabels(labelsLayer, this._pixiProjection, data);

    // Everything Else
    this._layers.render(this._pixiProjection);


    if (!AUTOTICK) {    // tick manually
      this._redrawPending = true;
      window.requestAnimationFrame(timestamp => {
        pixi.ticker.update(timestamp);

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
