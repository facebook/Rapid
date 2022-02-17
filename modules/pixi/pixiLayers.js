import * as PIXI from 'pixi.js';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { utilRebind } from '../util';

import {
  pixiImproveOSM,
  pixiKartaImages,
  pixiKeepRight,
  pixiMapillaryImages,
  pixiMapillaryMapFeatures,
  pixiMapillarySigns,
  pixiNotes,
  pixiOsm,
  pixiOsmose,
  pixiRapidFeatures,
  pixiStreetsideImages
} from './index';


/**
 * pixiLayers
 * @class
 */
export class pixiLayers {

  constructor(context, projection, featureCache) {
    this._context = context;
    const stage = this._context.pixi.stage;

    const dispatch = d3_dispatch('change');
    utilRebind(this, dispatch, 'on');

    this._layers = [
      { id: 'osm',             renderer: pixiOsm(projection, context, dispatch) },
      { id: 'rapid',           renderer: pixiRapidFeatures(context, featureCache, dispatch)},
      { id: 'notes',           renderer: pixiNotes(context, featureCache, dispatch)},
      { id: 'mapillary',       renderer: pixiMapillaryImages(context, featureCache, dispatch)},
      { id: 'streetside',      renderer: pixiStreetsideImages(context, featureCache, dispatch)},
      { id: 'openstreetcam',   renderer: pixiKartaImages(context, featureCache, dispatch) },
      { id: 'mapillary-map-features',  renderer: pixiMapillaryMapFeatures(context, featureCache, dispatch) },
      { id: 'mapillary-signs', renderer: pixiMapillarySigns(context, featureCache, dispatch) },
      { id: 'keepRight',       renderer: pixiKeepRight(context, featureCache, dispatch) },
      { id: 'improveOSM',      renderer: pixiImproveOSM(context, featureCache, dispatch)  },
      { id: 'osmose',          renderer: pixiOsmose(context, featureCache, dispatch)  },
    ];

    // make a container for each layer
    this._layers.forEach(layer => {
      const container = new PIXI.Container();
      container.name = layer.id;
      container.visible = true;
      context.pixi.stage.addChild(container);
    });
  }


  render(projection) {
    const stage = this._context.pixi.stage;
    this._layers.forEach(layer => {
      const container = stage.getChildByName(layer.id);
      if (!container.visible) return;
      layer.renderer(container, projection);
    });
  }


  all() {
    return this._layers;
  }


  getLayer(id) {
    return this._layers.find(o => o.id === id);
  }


  enable(ids) {
    const stage = this._context.pixi.stage;
    const toEnable = [].concat(ids);  // coax ids into an array
    toEnable.forEach(id => {
      const container = stage.getChildByName(id);
      if (container) container.visible = true;
    });
    // dispatch.call('change');
    return this;
  }


  disable(ids) {
    const stage = this._context.pixi.stage;
    const toDisable = [].concat(ids);  // coax ids into an array
    toDisable.forEach(id => {
      const container = stage.getChildByName(id);
      if (container) container.visible = false;
    });
    // dispatch.call('change');
    return this;
  }


  only(ids) {
    const stage = this._context.pixi.stage;
    const toEnable = new Set([].concat(ids));  // coax ids into an Set
    this._layers.forEach(layer => {
      const container = stage.getChildByName(layer.id);
      if (container) container.visible = toEnable.has(layer.id);
    });
    // dispatch.call('change');
    return this;
  }


  dimensions() {
    return this;  /* noop */
  }

}
