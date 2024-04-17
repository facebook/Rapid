import * as PIXI from 'pixi.js';
import { DashLine } from '@rapideditor/pixi-dashed-line';
import { GlowFilter } from 'pixi-filters';

import { AbstractFeature } from './AbstractFeature.js';
import { getLineCapEnum, getLineJoinEnum, getLineSegments, lineToPoly } from './helpers.js';

const ONEWAY_SPACING = 35;
const SIDED_SPACING = 30;


/**
 * PixiFeatureLine
 *
 * Properties you can access:
 *   `geometry`   PixiGeometry() class containing all the information about the geometry
 *   `points`     Array of projected points in scene coordinates
 *   `style`      Object containing styling data
 *   `container`  PIXI.Container containing the display objects used to draw the line
 *   `casing`     PIXI.Graphic for the casing (below)
 *   `stroke`     PIXI.Graphic for the stroke (above)
 *
 *   (also all properties inherited from `AbstractFeature`)
 */
export class PixiFeatureLine extends AbstractFeature {

  /**
   * @constructor
   * @param  layer       The Layer that owns this Feature
   * @param  featureID   Unique string to use for the name of this Feature
   */
  constructor(layer, featureID) {
    super(layer, featureID);

    this.type = 'line';
    this._bufferdata = null;

    const casing = new PIXI.Graphics();
    casing.name = 'casing';
    casing.eventMode = 'none';
    casing.sortableChildren = false;
    this.casing = casing;

    const stroke = new PIXI.Graphics();
    stroke.name = 'stroke';
    stroke.eventMode = 'none';
    stroke.sortableChildren = false;
    this.stroke = stroke;

    this.container.addChild(casing, stroke);
  }


  /**
   * destroy
   * Every Feature should have a destroy function that frees all the resources
   * Do not use the Feature after calling `destroy()`.
   */
  destroy() {
    super.destroy();
    this.casing = null;
    this.stroke = null;

    if (this._bufferdata) {
      delete this._bufferdata.inner;
      delete this._bufferdata.outer;
      delete this._bufferdata.perimeter;
      this._bufferdata = null;
    }
  }


  /**
   * update
   * @param  viewport  Pixi viewport to use for rendering
   * @param  zoom      Effective zoom to use for rendering
   */
  update(viewport, zoom) {
    if (!this.dirty) return;  // nothing to do

    const wireframeMode = this.context.systems.map.wireframeMode;
    const textureManager = this.renderer.textures;
    const container = this.container;
    const style = this._style;
    //
    // GEOMETRY
    //
    if (this.geometry.dirty) {
      this.geometry.update(viewport, zoom);

      // Calculate bounds
      const [minX, minY] = this.geometry.extent.min;
      const [maxX, maxY] = this.geometry.extent.max;
      const [w, h] = [maxX - minX, maxY - minY];
      this.sceneBounds.x = minX;
      this.sceneBounds.y = minY;
      this.sceneBounds.width = w;
      this.sceneBounds.height = h;

      this.updateHitArea();
    }

    //
    // STYLE
    //
    if (this._styleDirty) {
      const {width, height} = this.sceneBounds;

      // Apply effectiveZoom style adjustments
      let showMarkers = true;

      // Cull really tiny shapes
      if (width < 4 && height < 4) {  // so tiny
        this.lod = 0;  // off
        this.visible = false;
        this.stroke.renderable = false;
        this.casing.renderable = false;
        showMarkers = false;

      } else {
        this.visible = true;
        this.stroke.renderable = true;

        if (zoom < 16) {
          this.lod = 1;  // simplified
          this.casing.renderable = false;
          showMarkers = false;

        } else {
          this.lod = 2;  // full
          this.casing.renderable = true;
          showMarkers = true;
        }
      }

      //
      // Update line markers, if any..
      // Todo: left/right markers (like for coastlines, retaining walls, etc)
      //
      let lineMarkers = container.getChildByName('lineMarkers');

      if (showMarkers && ((style.lineMarkerTexture || style.lineMarkerName) || (style.sidedMarkerTexture || style.sidedMarkerName))) {
        // Create line marker container, if necessary
        if (!lineMarkers) {
          lineMarkers = new PIXI.Container();
          lineMarkers.name = 'lineMarkers';
          lineMarkers.eventMode = 'none';
          lineMarkers.sortableChildren = false;
          lineMarkers.roundPixels = false;
          container.addChild(lineMarkers);
        }

        const lineMarkerTexture = style.lineMarkerTexture || textureManager.get(style.lineMarkerName) || PIXI.Texture.WHITE;
        const sidedMarkerTexture = style.sidedMarkerTexture || textureManager.get(style.sidedMarkerName) || PIXI.Texture.WHITE;
        const sided = style.sidedMarkerName === 'sided';
        const oneway = style.lineMarkerName === 'oneway';
        lineMarkers.removeChildren();

        if (oneway) {
          const segments = getLineSegments(this.geometry.coords, ONEWAY_SPACING, false, true);  /* sided = false, limited = true */

          segments.forEach(segment => {
            segment.coords.forEach(([x, y]) => {
              const arrow = new PIXI.Sprite(lineMarkerTexture);
              arrow.eventMode = 'none';
              arrow.sortableChildren = false;
              arrow.anchor.set(0.5, 0.5); // middle, middle
              arrow.position.set(x, y);
              //segments with directional 'sides' get rotated 90 degrees
              arrow.rotation = segment.angle;
              // arrow.rotation = segment.angle;
              arrow.tint = style.lineMarkerTint;
              lineMarkers.addChild(arrow);
            });
          });
        }

        if (sided) {
          const segments = getLineSegments(this.geometry.coords, SIDED_SPACING, true, true);  /* sided = true, limited = true */

          segments.forEach(segment => {
            segment.coords.forEach(([x, y]) => {
              const arrow = new PIXI.Sprite(sidedMarkerTexture);
              arrow.eventMode = 'none';
              arrow.sortableChildren = false;
              arrow.anchor.set(0.5, 0.5); // middle, middle
              arrow.position.set(x, y);
              arrow.rotation = segment.angle;
              arrow.tint = style.stroke.color;
              lineMarkers.addChild(arrow);
            });
          });
        }

      } else if (lineMarkers) {  // No line markers, remove if it exists
        container.removeChild(lineMarkers);
        lineMarkers.destroy({ children: true });
      }

      this._styleDirty = false;
    }


    if (this.casing.renderable) {
      updateGraphic('casing', this.casing, this.geometry.coords, style, wireframeMode);
    }
    if (this.stroke.renderable) {
      updateGraphic('stroke', this.stroke, this.geometry.coords, style, wireframeMode);
    }

    this.updateHalo();


    function updateGraphic(which, graphic, points, style, wireframeMode) {
      const minwidth = which === 'casing' ? 3 : 2;
      let width = style[which].width;

      // Apply effectiveZoom style adjustments
      if (zoom < 16) {
        width -= 4;
      } else if (zoom < 17) {
        width -= 2;
      }
      if (width < minwidth) {
        width = minwidth;
      }

      if (wireframeMode) {
        width = 1;
      }

      let g = graphic.clear();
      if (style[which].alpha === 0) return;

      if (style[which].dash) {
        g = new DashLine(g, {
          dash: style[which].dash,
          color: style[which].color,
          width: width,
          alpha: style[which].alpha || 1.0,
          join: getLineJoinEnum(style[which].join),
          cap:  getLineCapEnum(style[which].cap),
        });
      } else {
        g = g.lineStyle({
          color: style[which].color,
          width: width,
          alpha: style[which].alpha || 1.0,
          join: getLineJoinEnum(style[which].join),
          cap:  getLineCapEnum(style[which].cap),
        });
      }

      points.forEach(([x, y], i) => {
        if (i === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      });
    }

  }


// experiment
  updateHitArea() {
    if (!this.geometry.flatOuter) {
      this.container.hitArea = null;
      return;   // no points?
    }

//    //Fix for bug #648: If we're drawing, we don't need to hit ourselves.
    // bhousel 3/23 sometimes we do!
//    if (this._drawing) {
//      this.container.hitArea = null;
//      return;
//    }

    const hitWidth = Math.max(3, this._style.casing.width || 0);
    const hitStyle = {
      alignment: 0.5,  // middle of line
      color: 0x0,
      width: hitWidth + 10,
      alpha: 1.0,
      join: PIXI.LINE_JOIN.BEVEL,
      cap: PIXI.LINE_CAP.BUTT
    };

    this._bufferdata = lineToPoly(this.geometry.flatOuter, hitStyle);
    this.container.hitArea = new PIXI.Polygon(this._bufferdata.perimeter);
  }


  /**
   * updateHalo
   * Show/Hide halo (expects `this._bufferdata` to be already set up by `updateHitArea` as a PIXI.Polygon)
   */
  updateHalo() {
    const showHover = (this.visible && this.hovered);
    const showSelect = (this.visible && this.selected);
    const showHighlight = (this.visible && this.highlighted);
    // Hover
    if (showHover) {
      if (!this.container.filters) {
        const glow = new GlowFilter({ distance: 15, outerStrength: 3, color: 0xffff00 });
        glow.resolution = 2;
        this.container.filters = [glow];
      }
    } else if (showHighlight) {
      if (!this.container.filters) {
        const glow = new GlowFilter({ distance: 15, outerStrength: 3, color: 0x7092ff });
        glow.resolution = 2;
        this.container.filters = [glow];
      }
    } else {
      if (this.container.filters) {
        this.container.filters = null;
      }
    }

    // Select
    if (showSelect) {
      if (!this.halo) {
        this.halo = new PIXI.Graphics();
        this.halo.name = `${this.id}-halo`;
        const mapUIContainer = this.scene.layers.get('map-ui').container;
        mapUIContainer.addChild(this.halo);
      }

      const HALO_STYLE = {
        alpha: 0.9,
        dash: [6, 3],
        width: 2,   // px
        color: 0xffff00
      };

      this.halo.clear();
      const dl = new DashLine(this.halo, HALO_STYLE);
      if (this._bufferdata) {
        if (this._bufferdata.outer && this._bufferdata.inner) {
          dl.drawPolygon(this._bufferdata.outer);
          dl.drawPolygon(this._bufferdata.inner);
        } else {
          dl.drawPolygon(this._bufferdata.perimeter);
        }
      }
    } else {
      if (this.halo) {
        this.halo.destroy({ children: true });
        this.halo = null;
      }
    }
  }


  /**
   * style
   * @param  obj  Style `Object` (contents depends on the Feature type)
   *
   * 'point' - see `PixiFeaturePoint.js`
   * 'line'/'polygon' - see `StyleSystem.js`
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
  lineMarkerName: '',
  lineMarkerTint: 0x000000,
  labelTint: 0xeeeeee,

  fill:   { width: 2, color: 0xaaaaaa, alpha: 0.3 },
  casing: { width: 5, color: 0x444444, alpha: 1, cap: 'round', join: 'round' },
  stroke: { width: 3, color: 0xcccccc, alpha: 1, cap: 'round', join: 'round' }
};

