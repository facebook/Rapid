import * as PIXI from 'pixi.js';

import { PixiFeature } from './PixiFeature';
import { getIconSprite, getViewfieldContainer } from './helpers';


/**
 * PixiFeaturePoint
 *
 * Properties you can access:
 *   `coord`          Single wgs84 coordinate [lon, lat]
 *   `markerStyle`    Object containing styling data
 *   `displayObject`  PIXI.Sprite() for the marker
 *   `icon`           PIXI.Sprite() for the icon (if any)
 *   `vfContainer`    PIXI.Container() for the viewfields (if any)
 *
 * Inherited from PixiFeature:
 *   `dirty`
 *   `k`
 *   `extent`
 *   `localBounds`
 *   `sceneBounds`
 *
 * @class
 */
export class PixiFeaturePoint extends PixiFeature {

  /**
   * @constructor
   */
  constructor(context, id, coord, vfDirections, markerStyle) {
    const marker = new PIXI.Sprite();
    super(marker);

    this.context = context;
    this.type = 'point';
    this.coord = coord;      // [lon, lat] coordinate pair

    // markerStyle can contatin:
    // `markerTexture`
    // `markerName`
    // `markerTint`
    // `viewfieldName`
    // `viewfieldTint`
    // `iconName`
    // `iconTint`
    markerStyle.markerName = markerStyle.markerName || 'smallCircle';
    markerStyle.markerTint = markerStyle.markerTint || 0xffffff;
    markerStyle.viewfieldName = markerStyle.viewfieldName || 'viewfield';
    markerStyle.viewfieldTint = markerStyle.viewfieldTint || 0xffffff;
    markerStyle.iconName = markerStyle.iconName || '';
    markerStyle.iconAlpha = markerStyle.iconAlpha || 1;
    this.markerStyle = markerStyle;

    const textures = this.context.pixi.rapidTextures;

    marker.name = id;
    marker.buttonMode = true;
    marker.interactive = true;
    marker.interactiveChildren = true;
    marker.sortableChildren = false;
    marker.texture = markerStyle.markerTexture || textures.get(markerStyle.markerName) || PIXI.Texture.WHITE;
    marker.tint = markerStyle.markerTint;
    marker.zIndex = -coord[1];  // sort by latitude ascending

    // Add viewfields, if any
    if (vfDirections && vfDirections.length > 0) {
      const vfTexture = textures.get(markerStyle.viewfieldName) || PIXI.Texture.WHITE;
      const vfColor =  markerStyle.viewfieldTint;
      const vfContainer = getViewfieldContainer(vfTexture, vfDirections, vfColor);
      marker.addChild(vfContainer);
      this.vfContainer = vfContainer;
    }

    // Add icon, if any
    if (markerStyle.iconName) {
      const icon = getIconSprite(context, markerStyle.iconName);
      const ICONSIZE = 11;
      icon.width = ICONSIZE;
      icon.height = ICONSIZE;
      icon.alpha = markerStyle.iconAlpha;
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

    const textures = this.context.pixi.rapidTextures;
    const markerStyle = this.markerStyle;
    const isPin = (markerStyle.markerName === 'pin' || markerStyle.markerName === 'boldPin');
    const marker = this.displayObject;
    const vfContainer = this.vfContainer;
    const icon = this.icon;

    //
    // Reproject
    //
    const [x, y] = projection.project(this._coord);
    marker.position.set(x, y);


    //
    // Apply effectiveZoom style adjustments
    //
    if (zoom < 16) {  // Hide marker and everything under it
      marker.renderable = false;

    } else if (zoom < 17) {
      // Markers drawn but smaller
      marker.renderable = true;
      marker.scale.set(0.8, 0.8);

      // Replace pins with circles at lower zoom
      const textureName = isPin ? 'largeCircle' : markerStyle.markerName;
      marker.texture = markerStyle.markerTexture || textures.get(textureName) || PIXI.Texture.WHITE;
      marker.anchor.set(0.5, 0.5);  // middle, middle
      if (icon) {
        icon.position.set(0, 0);
      }
      // Hide viewfields
      if (vfContainer) {
        vfContainer.renderable = false;
      }

    } else {  // z >= 17
      // Show the requested marker (circles OR pins)
      marker.renderable = true;
      marker.scale.set(1, 1);
      marker.texture = markerStyle.markerTexture || textures.get(markerStyle.markerName) || PIXI.Texture.WHITE;
      if (isPin) {
        marker.anchor.set(0.5, 1);  // middle, bottom
      } else {
        marker.anchor.set(0.5, 0.5);  // middle, middle
      }

      // Show requested icon
      if (icon) {
        if (isPin) {
          icon.position.set(0, -14);  // mathematically 0,-15 is center of pin, but looks nicer moved down slightly
        } else {
          icon.position.set(0, 0);  // middle, middle
        }
      }
      // Show viewfields
      if (vfContainer) {
        vfContainer.renderable = true;
      }
    }

    //
    // Recalculate local and scene bounds
    //
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
    this.extent.min = val;
    this.extent.max = val;

    this._coord = val;
    this.dirty = true;
  }

}
