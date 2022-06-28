import * as PIXI from 'pixi.js';
import { DashLine } from 'pixi-dashed-line';

import { AbstractFeature } from './AbstractFeature';
import { getIconTexture } from './helpers';


/**
 * PixiFeaturePoint
 *
 * Properties you can access:
 *   `geometry`   Single wgs84 coordinate [lon, lat]
 *   `style`      Object containing styling data
 *   `container`  PIXI.Sprite() for the marker
 *
 *   (also all properties inherited from `AbstractFeature`)
 */
export class PixiFeaturePoint extends AbstractFeature {

  /**
   * @constructor
   * @param  context   Global shared iD application context
   * @param  id        Unique string to use for the name of this feature
   * @param  parent    Parent container for this feature.  The feature will be added to it.
   * @param  data      Data to associate with this feature (like `__data__` from the D3.js days)
   * @param  geometry  `Array` containing geometry data
   * @param  style     `Object` containing style data
   */
  constructor(context, id, parent, data, geometry, style) {
    super(context, id, parent, data);

    this.type = 'point';
    this.geometry = geometry;
    this.style = style || {};
    this._oldvfLength = 0;  // to watch for change in # of viewfield sprites

    const viewfields = new PIXI.Container();
    viewfields.name = 'viewfields';
    viewfields.interactive = false;
    viewfields.interactiveChildren = false;
    viewfields.sortableChildren = false;
    viewfields.visible = false;
    this.viewfields = viewfields;

    const marker = new PIXI.Sprite();
    marker.name = 'marker';
    marker.interactive = false;
    marker.interactiveChildren = false;
    marker.sortableChildren = false;
    marker.visible = true;
    this.marker = marker;

    const icon = new PIXI.Sprite();
    icon.name = 'icon';
    icon.interactive = false;
    icon.interactiveChildren = false;
    icon.sortableChildren = false;
    icon.visible = false;
    this.icon = icon;

    this.container.addChild(viewfields, marker, icon);

// experiment
    this.halo = null;
  }


  /**
   * destroy
   * Every feature should have a destroy function that frees all the resources
   * Do not use the feature after calling `destroy()`.
   */
  destroy() {
    super.destroy();
  }


  /**
   * update
   * @param  projection  Pixi projection to use for rendering
   * @param  zoom        Effective zoom to use for rendering
   */
  update(projection, zoom) {
    if (!this.dirty) return;  // no change

    this.updateGeometry(projection);
    this.updateStyle(zoom);

    // Recalculate local and scene bounds
    // (note that the local bounds automatically includes children like viewfields too)
    const position = this.container.position;
    this.container.getLocalBounds(this.localBounds);     // where 0,0 is the origin of the object
    this.sceneBounds = this.localBounds.clone();    // where 0,0 is the origin of the scene
    this.sceneBounds.x += position.x;
    this.sceneBounds.y += position.y;

    // Recalculate hitArea, grow it if too small
    const MINSIZE = 20;
    const rect = this.container.getLocalBounds().clone();
    if (rect.width < MINSIZE) {
      rect.pad((MINSIZE - rect.width) / 2, 0);
    }
    if (rect.height < MINSIZE) {
      rect.pad(0, (MINSIZE - rect.height) / 2);
    }
    rect.pad(4); // then pad a bit more

    const poly = new PIXI.Polygon([
      rect.left, rect.top,
      rect.right, rect.top,
      rect.right, rect.bottom,
      rect.left, rect.bottom,
      rect.left, rect.top
    ]);

    this.container.hitArea = poly;

    this.updateHalo();
  }


  /**
   * updateGeometry
   * @param  projection   Pixi projection to use for rendering
   */
  updateGeometry(projection) {
    if (!this._geometryDirty) return;

    // Reproject
    const [x, y] = projection.project(this._geometry);
    this.container.position.set(x, y);

    // sort markers by latitude ascending
    // sort markers with viewfields above markers without viewfields
    const z = -this._geometry[1];
    this.container.zIndex = (this._oldvfLength > 0) ? (z + 1000) : z;

    this._geometryDirty = false;
  }


  /**
   * updateStyle
   * @param  zoom  Effective zoom to use for rendering
   */
  updateStyle(zoom) {
    if (!this._styleDirty) return;

    const context = this.context;
    const textures = context.pixi.rapidTextures;
    const style = this._style;
    const isPin = (style.markerName === 'pin' || style.markerName === 'boldPin');

    const viewfields = this.viewfields;
    const marker = this.marker;
    const icon = this.icon;

    //
    // Update marker style
    //
    marker.texture = style.markerTexture || textures.get(style.markerName) || PIXI.Texture.WHITE;
    marker.tint = style.markerTint;

    //
    // Update viewfields, if any..
    //
    const vfAngles = style.viewfieldAngles || [];
    if (vfAngles.length) {
      const vfTexture = style.viewfieldTexture || textures.get(style.viewfieldName) || PIXI.Texture.WHITE;

      // sort markers with viewfields above markers without viewfields
      this.container.zIndex = -this._geometry[1] + 1000;

      // If # of viewfields has changed from before, replace them.
      if (vfAngles.length !== this._oldvfLength) {
        viewfields.removeChildren();
        vfAngles.forEach(() => {
          const vfSprite = new PIXI.Sprite(vfTexture);
          vfSprite.interactive = false;
          vfSprite.interactiveChildren = false;
          vfSprite.anchor.set(0.5, 1);  // middle, top
          viewfields.addChild(vfSprite);
        });
        this._oldvfLength = vfAngles.length;
      }

      // Update viewfield angles and style
      vfAngles.forEach((vfAngle, index) => {
        const vfSprite = viewfields.getChildAt(index);
        vfSprite.tint = style.viewfieldTint || 0x333333;
        vfSprite.angle = vfAngle;
      });

      viewfields.visible = true;

    } else {  // No viewfields
      this.container.zIndex = -this._geometry[1];   // restore default marker sorting
      viewfields.removeChildren();
      viewfields.visible = false;
    }

    //
    // Update icon, if any..
    //
    if (style.iconTexture || style.iconName) {
      // Update texture and style, if necessary
      icon.texture = style.iconTexture || getIconTexture(context, style.iconName) || PIXI.Texture.WHITE;
      const ICONSIZE = 11;
      icon.anchor.set(0.5, 0.5);   // middle, middle
      icon.width = ICONSIZE;
      icon.height = ICONSIZE;
      icon.alpha = style.iconAlpha;
      icon.visible = true;

    } else {  // No icon
      icon.visible = false;
    }


    //
    // Apply effectiveZoom style adjustments
    //
    if (zoom < 16) {  // Hide marker and everything under it
      this.lod = 0;   // off
      this.visible = false;

    } else if (zoom < 17) {  // Markers drawn but smaller
      this.lod = 1;  // simplified
      this.visible = true;
      viewfields.renderable = false;
      marker.renderable = true;
      marker.scale.set(0.8, 0.8);

      // Replace pins with circles at lower zoom
      const textureName = isPin ? 'largeCircle' : style.markerName;
      marker.texture = style.markerTexture || textures.get(textureName) || PIXI.Texture.WHITE;
      marker.anchor.set(0.5, 0.5);  // middle, middle
      icon.position.set(0, 0);      // middle, middle

    } else {  // z >= 17 - Show the requested marker (circles OR pins)
      this.lod = 2;  // full
      this.visible = true;
      viewfields.renderable = true;
      marker.renderable = true;
      marker.scale.set(1, 1);

      marker.texture = style.markerTexture || textures.get(style.markerName) || PIXI.Texture.WHITE;
      if (isPin) {
        marker.anchor.set(0.5, 1);  // middle, bottom
        icon.position.set(0, -14);  // mathematically 0,-15 is center of pin, but looks nicer moved down slightly
      } else {
        marker.anchor.set(0.5, 0.5);  // middle, middle
        icon.position.set(0, 0);      // middle, middle
      }
    }

    this._styleDirty = false;
  }


// experiment
// Show/Hide halo (requires `this.container.hitArea` to be already set up as a PIXI.Polygon)
  updateHalo() {
    if (this.hovered || this.selected) {
      const HALO_COLOR = 0xffff00;
      const HALO_DASH = [6, 3];
      const HALO_WIDTH = 2;  // px

      if (!this.halo) {
        this.halo = new PIXI.Graphics();
        this.halo.name = `${this.id}-halo`;

        const mapUIContainer = this.context.layers().getLayer('map-ui').container;
        mapUIContainer.addChild(this.halo);
      }

      const haloProps = { dash: HALO_DASH, width: HALO_WIDTH, color: HALO_COLOR };
      this.halo.clear();
      new DashLine(this.halo, haloProps).drawPolygon(this.container.hitArea.points);
      this.halo.position = this.container.position;

    } else {
      if (this.halo) {
        this.halo.destroy({ children: true });
        this.halo = null;
      }
    }
  }


  /**
   * geometry
   * @param  arr  Geometry `Array` (contents depends on the feature type)
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
   * @param  obj  Style `Object` (contents depends on the feature type)
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
