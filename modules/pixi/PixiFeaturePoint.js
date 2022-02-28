import * as PIXI from 'pixi.js';

import { PixiFeature } from './PixiFeature';
import { getIconSprite } from './helpers';


/**
 * PixiFeaturePoint makes a point
 *
 * properties you can access:
 *
 *  coord
 *  dirty
 *  displayObject
 *  icon
 *  k
 *  localBounds
 *  sceneBounds
 *
 * @class
 */
export class PixiFeaturePoint extends PixiFeature {

  /**
   * @constructor
   */
  constructor(context, id, coord, iconName) {
    const marker = new PIXI.Sprite();
    super(marker);

    this.context = context;
    this.type = 'point';
    this._coord = coord;      // [lon, lat] coordinate pair

    const textures = this.context.pixi.rapidTextures;

    marker.name = id;
    marker.buttonMode = true;
    marker.interactive = true;
    marker.interactiveChildren = true;
    marker.sortableChildren = false;
    marker.texture = textures.get('marker') || PIXI.Texture.WHITE;
    marker.anchor.set(0.5, 1);  // middle, bottom
    marker.zIndex = -coord[1];  // sort by latitude ascending

    if (iconName) {
      const icon = getIconSprite(context, iconName);
      const ICONSIZE = 11;
      // mathematically 0,-15 is center of marker, move down slightly
      icon.position.set(0, -14);
      icon.width = ICONSIZE;
      icon.height = ICONSIZE;
      // icon.alpha = hasWd ? 0.6 : 1;
      marker.addChild(icon);
      this.icon = icon;
    }

  }


  /**
   * update
   *
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  update(projection, zoom) {
    const k = projection.scale();
    if (!this.dirty && this.k === k) return;  // no change

    let marker = this.displayObject;
    const textures = this.context.pixi.rapidTextures;

    // Reproject
    const [x, y] = projection.project(this._coord);
    this.displayObject.position.set(x, y);

    // effectiveZoom adjustments
    if (zoom < 16) {                          // show nothing
      marker.renderable = false;

    } else if (zoom < 17) {                   // show circles
      marker.texture = textures.get('iconPlain') || PIXI.Texture.WHITE;
      marker.anchor.set(0.5, 0.5);  // middle, middle
      if (this.icon) {
        this.icon.position.set(0, 0);
      }
      marker.renderable = true;
      marker.scale.set(0.8, 0.8);

    } else {
      // const t = hasWd ? 'wikidataMarker' : 'marker';   // show pins
      marker.texture = textures.get('marker') || PIXI.Texture.WHITE;
      marker.anchor.set(0.5, 1);  // middle, bottom
      if (this.icon) {
        // mathematically 0,-15 is center of marker, move down slightly
        this.icon.position.set(0, -14);
      }
      marker.renderable = true;
      marker.scale.set(1, 1);
    }

    // Recalculate local and scene bounds
    marker.getLocalBounds(this.localBounds);        // where 0,0 is the origin of the object
    this.sceneBounds = this.localBounds.clone();    // where 0,0 is the origin of the scene
    this.sceneBounds.x += x;
    this.sceneBounds.y += y;

    this.scale = k;
    this.dirty = false;
  }


  /**
   * coord
   */
  get coord() {
    return this._coord;
  }
  set coord(val) {
    this._coord = val;
    this.dirty = true;
  }


}
