import * as PIXI from 'pixi.js';

import { PixiFeature } from './PixiFeature';
import { getIconTexture } from './helpers';


/**
 * PixiFeaturePoint
 *
 * Properties you can access:
 *   `geometry`       Single wgs84 coordinate [lon, lat]
 *   `style`          Object containing styling data
 *   `displayObject`  PIXI.Sprite() for the marker
 *
 * Inherited from PixiFeature:
 *   `dirty`
 *   `extent`
 *   `label`
 *   `localBounds`
 *   `sceneBounds`
 */
export class PixiFeaturePoint extends PixiFeature {

  /**
   * @constructor
   * @param  `context`        Global shared context for iD
   * @param  `id`             Unique string to use for the name of this feature
   * @param  `parent`         Parent container for this feature.  The display object will be added to it.
   * @param  `data`           Data to associate with this feature (like `__data__` from the D3.js days)
   * @param  `geometry`       `Array` containing geometry data
   * @param  `style`          `Object` containing style data
   */
  constructor(context, id, parent, data, geometry, style) {
    const marker = new PIXI.Sprite();
    super(context, marker, id, parent, data);

    this.type = 'point';
    this.geometry = geometry;
    this.style = style || {};

    this._oldvfLength = 0;  // to watch for change in # of viewfield sprites
  }


  /**
   * destroy
   * Every feature should have a destroy function that frees all the resources
   * and removes the display object from the scene.
   * Do not use the feature after calling `destroy()`.
   */
  destroy() {
    super.destroy();
  }


  /**
   * update
   * @param projection   pixi projection to use for rendering
   * @param zoom         effective zoom to use for rendering
   */
  update(projection, zoom) {
    if (!this.dirty) return;  // no change

    this.updateGeometry(projection);
    this.updateStyle(zoom);

    // Recalculate local and scene bounds
    const marker = this.displayObject;
    const position = marker.position;
    marker.getLocalBounds(this.localBounds);        // where 0,0 is the origin of the object
    this.sceneBounds = this.localBounds.clone();    // where 0,0 is the origin of the scene
    this.sceneBounds.x += position.x;
    this.sceneBounds.y += position.y;
  }


  /**
   * updateGeometry
   * @param projection   pixi projection to use for rendering
   */
  updateGeometry(projection) {
    if (!this._geometryDirty) return;

    const marker = this.displayObject;

    // Reproject
    const [x, y] = projection.project(this._geometry);
    marker.position.set(x, y);

    // sort markers by latitude ascending
    // sort markers with viewfields above markers without viewfields
    const z = -this._geometry[1];
    marker.zIndex = (this._oldvfLength > 0) ? (z + 1000) : z;

    this._geometryDirty = false;
  }


  /**
   * updateStyle
   * @param zoom  effective zoom to use for rendering
   */
  updateStyle(zoom) {
    if (!this._styleDirty) return;

    const context = this.context;
    const textures = context.pixi.rapidTextures;
    const marker = this.displayObject;

    const style = this._style;
    const isPin = (style.markerName === 'pin' || style.markerName === 'boldPin');

    //
    // Update marker style
    //
    marker.texture = style.markerTexture || textures.get(style.markerName) || PIXI.Texture.WHITE;
    marker.tint = style.markerTint;

    //
    // Update viewfields, if any..
    //
    const vfAngles = style.viewfieldAngles || [];
    let vfContainer = marker.getChildByName('viewfields');

    if (vfAngles.length) {
      const vfTexture = style.viewfieldTexture || textures.get(style.viewfieldName) || PIXI.Texture.WHITE;

      // Create viewfield container, if necessary
      if (!vfContainer) {
        vfContainer = new PIXI.Container();
        vfContainer.name = 'viewfields';
        vfContainer.interactive = false;
        vfContainer.interactiveChildren = false;
        // sort markers with viewfields above markers without viewfields
        marker.zIndex = -this._geometry[1] + 1000;
        marker.addChild(vfContainer);
      }

      // If # of viewfields has changed from before, replace them.
      if (vfAngles.length !== this._oldvfLength) {
        vfContainer.removeChildren();
        vfAngles.forEach(() => {
          const sprite = new PIXI.Sprite(vfTexture);
          sprite.interactive = false;
          sprite.interactiveChildren = false;
          sprite.anchor.set(0.5, 1);  // middle, top
          vfContainer.addChild(sprite);
        });
        this._oldvfLength = vfAngles.length;
      }

      // Update viewfield angles and style
      vfAngles.forEach((vfAngle, index) => {
        const sprite = vfContainer.getChildAt(index);
        sprite.tint = style.viewfieldTint || 0x333333;
        sprite.angle = vfAngle;
      });

    } else if (vfContainer) {  // No viewfields, destroy the container if it exists
      // sort markers with viewfields above markers without viewfields
      marker.zIndex = -this._geometry[1];
      marker.removeChild(vfContainer);
      vfContainer.destroy({ children: true });
    }

    //
    // Update icon, if any..
    //
    let iconSprite = marker.getChildByName('icon');

    if (style.iconTexture || style.iconName) {

      // Create icon sprite, if necessary
      if (!iconSprite) {
        iconSprite = new PIXI.Sprite();
        iconSprite.name = 'icon';
        iconSprite.interactive = false;
        iconSprite.interactiveChildren = false;
        iconSprite.anchor.set(0.5, 0.5);   // middle, middle
        marker.addChild(iconSprite);
      }

      // Update texture and style, if necessary
      iconSprite.texture = style.iconTexture || getIconTexture(context, style.iconName) || PIXI.Texture.WHITE;
      const ICONSIZE = 11;
      iconSprite.width = ICONSIZE;
      iconSprite.height = ICONSIZE;
      iconSprite.alpha = style.iconAlpha;

    } else if (iconSprite) {  // No icon, remove if it exists
      marker.removeChild(iconSprite);
      iconSprite.destroy({ children: true });
    }


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
      const textureName = isPin ? 'largeCircle' : style.markerName;
      marker.texture = style.markerTexture || textures.get(textureName) || PIXI.Texture.WHITE;
      marker.anchor.set(0.5, 0.5);  // middle, middle
      if (iconSprite) {
        iconSprite.position.set(0, 0);
      }
      // Hide viewfields
      if (vfContainer) {
        vfContainer.renderable = false;
      }

    } else {  // z >= 17
      // Show the requested marker (circles OR pins)
      marker.renderable = true;
      marker.scale.set(1, 1);
      marker.texture = style.markerTexture || textures.get(style.markerName) || PIXI.Texture.WHITE;
      if (isPin) {
        marker.anchor.set(0.5, 1);  // middle, bottom
      } else {
        marker.anchor.set(0.5, 0.5);  // middle, middle
      }

      // Show requested icon
      if (iconSprite) {
        if (isPin) {
          iconSprite.position.set(0, -14);  // mathematically 0,-15 is center of pin, but looks nicer moved down slightly
        } else {
          iconSprite.position.set(0, 0);  // middle, middle
        }
      }
      // Show viewfields
      if (vfContainer) {
        vfContainer.renderable = true;
      }
    }

    this._styleDirty = false;
  }


  /**
   * geometry
   * @param arr geometry `Array` (contents depends on the feature type)
   *
   * 'point' - Single wgs84 coordinate
   *    [lon, lat]
   */
  get geometry() {
    return this._geometry;
  }
  set geometry(arr) {
    this.extent.min = arr;
    this.extent.max = arr;

    this._geometry = arr;
    this._geometryDirty = true;
  }


  /**
   * style
   * @param obj style `Object` (contents depends on the feature type)
   *
   * 'point' - see PixiFeaturePoint.js
   * 'line'/'multipolygon' - see styles.js
   */
  get style() {
    return this._style;
  }
  set style(obj) {
    this._style = Object.assign({}, STYLE_DEFAULTS, obj);
    this._styleDirty = true;
  }

  rebind(data) {
    super.rebind(data);
    this.geometry = data.loc;
  }
}

const STYLE_DEFAULTS = {
  markerName: 'smallCircle',
  markerTint: 0xffffff,
  viewfieldAngles: [],
  viewfieldName: 'viewfield',
  viewfieldTint: 0xffffff,
  iconName: '',
  iconAlpha: 1,
  labelTint: 0xffffff
};
