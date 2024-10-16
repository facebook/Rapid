import * as PIXI from 'pixi.js';
import { GlowFilter } from 'pixi-filters';

import { AbstractFeature } from './AbstractFeature.js';
import { DashLine } from './lib/DashLine.js';
import { getLineSegments, lineToPoly } from './helpers.js';

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
   * @param  {Layer}   layer     - The Layer that owns this Feature
   * @param  {string}  featureID - Unique string to use for the name of this Feature
   */
  constructor(layer, featureID) {
    super(layer, featureID);

    this.type = 'line';
    this._bufferdata = null;

    const casing = new PIXI.Graphics();
    casing.label = 'casing';
    casing.eventMode = 'none';
    casing.sortableChildren = false;
    this.casing = casing;

    const stroke = new PIXI.Graphics();
    stroke.label = 'stroke';
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
    if (this.casing) {
      this.casing.destroy();
      this.casing = null;
    }
    if (this.stroke) {
      this.stroke.destroy();
      this.stroke = null;
    }

    this._bufferdata = null;

    super.destroy();
  }


  /**
   * update
   * @param  {Viewport}  viewport - Pixi viewport to use for rendering
   * @param  {number}    zoom     - Effective zoom to use for rendering
   */
  update(viewport, zoom) {
    if (!this.dirty) return;  // nothing to do

    const wireframeMode = this.context.systems.map.wireframeMode;
    const textureManager = this.gfx.textures;
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
      let lineMarkers = container.getChildByLabel('lineMarkers');

      if (showMarkers && ((style.lineMarkerTexture || style.lineMarkerName) || (style.sidedMarkerTexture || style.sidedMarkerName))) {
        // Create line marker container, if necessary
        if (!lineMarkers) {
          lineMarkers = new PIXI.Container();
          lineMarkers.label = 'lineMarkers';
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

      // Buffer around line, used for hit area and halo..
      if (this.visible) {
        // what line width to use?? copied the 'casing' calculation from below, improve this later
        const minwidth = 3;
        let width = style.casing.width;

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

        const bufferStyle = {
          alpha: 1,
          alignment: 0.5,  // middle of line
          color: 0x000000,
          width: width + 10,
          cap: 'butt',
          join: 'bevel'
        };
        this._bufferdata = lineToPoly(this.geometry.flatCoords, bufferStyle);
        this.container.hitArea = new PIXI.Polygon(this._bufferdata.perimeter);
      } else {
        this._bufferdata = null;
        this.container.hitArea = null;
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

      const strokeStyle = {
        color: style[which].color,
        width: width,
        alpha: style[which].alpha || 1.0,
        join: style[which].join,
        cap:  style[which].cap,
      };

      if (style[which].dash) {
        strokeStyle.dash = style[which].dash;
        g = new DashLine(g, strokeStyle);
        drawLineFromPoints(points, g);
      } else {
        drawLineFromPoints(points, g);
        g = g.stroke(strokeStyle);
      }

      function drawLineFromPoints(points, graphics) {
        points.forEach(([x, y], i) => {
          if (i === 0) {
            graphics.moveTo(x, y);
          } else {
            graphics.lineTo(x, y);
          }
        });
      }
    }

  }


  /**
   * updateHalo
   * Show/Hide halo (expects `this._bufferdata` to be already set up by `update()`)
   */
  updateHalo() {
    const showHover = (this.visible && this._classes.has('hover'));
    const showSelect = (this.visible && this._classes.has('select'));
    const showHighlight = (this.visible && this._classes.has('highlight'));

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
    let halo = this.halo;
    if (showSelect) {
      if (!halo) {
        const mapUIContainer = this.scene.layers.get('map-ui').container;

// // AS MESH
// const halo = new PIXI.Container();
// halo.label = `${this.id}-halo`;
// mapUIContainer.addChild(halo);
// this.halo = halo;

        halo = new PIXI.Graphics();
        halo.label = `${this.id}-halo`;
        mapUIContainer.addChild(halo);
        this.halo = halo;
      }

//      // new dashline experiment
//      const textureManager = this.gfx.textures;
//      const dtexture = textureManager.getDashTexture({
//        dashes: [6, 3],
//        styles: [{ alpha: 1, color: 0xffffff, width: 2 }, { alpha: 0, color: 0xff0000, width: 2 }]
//      });

//  //      const textureMatrix = new PIXI.Matrix();
//
//  // let dashTexture = PIXI.Texture.WHITE;
 // let tex = textureManager.getPatternTexture('quarry');
//  // let dashTexture = textureManager.getTexture('symbol', 'white');
//  // dashTexture.source.addressMode = 'repeat';
//
// let tex = dtexture;
//  let atlas = tex.source;
//  let tm = tex.textureMatrix;
//  // tm.update = PIXI.NOOP;
//  // if (tm._updateID === 1) {  // first time only
//
//    let orig = tex.__bin;  // original frame for an atlas texture can always be found in `__bin`
//    let [aw, ah] = [atlas.pixelWidth, atlas.pixelHeight];      // atlas dimensions
//    let [ax, ay] = [aw / 2, ah / 2];                           // center of atlas
//    let [tw, th] = [orig.width, orig.height];               // texture dimensions
//    let [tx, ty] = [orig.x + (tw / 2), orig.y + (th / 2)];  // center of texture
//    let [sx, sy] = [aw / tw, ah / th];   // scale up to fill atlas
//    let [dx, dy] = [tx - ax, ty - ay];   // move texture to center of atlas
//
//    tex.frame = new PIXI.Rectangle(0, 0, aw, ah);  // pretend this texture fills the atlas
//    tex.updateUvs();
//
//  //  let mat = tm.mapCoord;
//  //  mat.identity();
//  //  mat.scale(0.1,0.1);
//    // tm.update();
//    // mat.identity().scale(tw/aw, th/ah);
//    // mat.identity().scale(sx,sy).translate(dx,dy);  // zoom in on just this part of the atlas
//    // tm.update();
//  // mat.identity();  //.translate(dx, dy);  //.scale(sx, sy);
//  // }

// // AS PATTERN
//     halo.clear();
// // AS MESH
// this.halo.removeChildren();

//      if (this._bufferdata) {
//        if (this._bufferdata.outer && this._bufferdata.inner) {   // closed line

// // AS MESH
//
// // unflatten :(
// const outersize = this._bufferdata.outer.length / 2;
// const outerpoints = new Array(outersize);
// for (let i = 0; i < outersize; i++) {
//   const j = i * 2;
//   outerpoints[i] = new PIXI.Point(this._bufferdata.outer[j], this._bufferdata.outer[j+1]);
// }
//
// const outer = new PIXI.MeshRope({ texture: tex, points: outerpoints, textureScale: 4 });
// outer.label = `${this.id}-halo-outer`;
// outer.eventMode = 'none';
// outer.autoUpdate = false;
// outer.tint = 0xffff00;
//
// // unflatten :(
// const innersize = this._bufferdata.inner.length / 2;
// const innerpoints = new Array(innersize);
// for (let i = 0; i < innersize; i++) {
//   const j = i * 2;
//   innerpoints[i] = new PIXI.Point(this._bufferdata.inner[j], this._bufferdata.inner[j+1]);
// }
//
// const inner = new PIXI.MeshRope({ texture: tex, points: innerpoints, textureScale: 4 });
// inner.label = `${this.id}-halo-inner`;
// inner.eventMode = 'none';
// inner.autoUpdate = false;
// inner.tint = 0xffff00;
//
// this.halo.addChild(outer, inner);

// // AS PATTERN
// halo
//   .poly(this._bufferdata.outer)
//   .stroke({
//     alpha: 0.9,
//     color: 0xffff00,
//     width: 2,
//     texture: tex
//   });
//
// halo
//   .poly(this._bufferdata.inner)
//   .stroke({
//     alpha: 0.9,
//     color: 0xffff00,
//     width: 10,
//     texture: tex
//   });

//        } else {   // unclosed line


// // AS MESH
// // unflatten :(
// const perimsize = this._bufferdata.perimeter.length / 2;
// const perimpoints = new Array(perimsize);
// for (let i = 0; i < perimsize; i++) {
//  const j = i * 2;
//  perimpoints[i] = new PIXI.Point(this._bufferdata.perimeter[j], this._bufferdata.perimeter[j+1]);
// }
// const perim = new PIXI.MeshRope({ texture: tex, points: perimpoints, textureScale: 4 });
// perim.label = `${this.id}-halo-perim`;
// perim.eventMode = 'none';
// perim.autoUpdate = false;
// perim.tint = 0xffff00;
// this.halo.addChild(perim);

// // AS PATTERN
// halo
//   .poly(this._bufferdata.perimeter)
//   .stroke({
//     alpha: 0.9,
//     color: 0xffff00,
//     width: 2,
//     texture: tex
//   });

//        }
//      }

      const HALO_STYLE = {
        alpha: 0.9,
        dash: [6, 3],
        width: 2,   // px
        color: 0xffff00
      };

      this.halo.clear();
      const dl = new DashLine(this.halo, HALO_STYLE);
      if (this._bufferdata) {
        if (this._bufferdata.outer && this._bufferdata.inner) {   // closed line
          dl.polygon(this._bufferdata.outer);
          dl.polygon(this._bufferdata.inner);
        } else {   // unclosed line
          dl.polygon(this._bufferdata.perimeter);
        }
      }
      dl.setStrokeStyle(HALO_STYLE);

    } else {
      if (this.halo) {
        this.halo.destroy();
        this.halo = null;
      }
    }
  }


  /**
   * style
   * @param {Object} obj - Style `Object` (contents depends on the Feature type)
   *
   * 'point' - @see `PixiFeaturePoint.js`
   * 'line'/'polygon' - @see `StyleSystem.js`
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

