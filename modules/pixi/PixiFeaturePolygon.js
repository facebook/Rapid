import * as PIXI from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { vecEqual, vecLength } from '@rapid-sdk/math';

import { AbstractFeature } from './AbstractFeature.js';
import { DashLine } from './lib/DashLine.js';
import { lineToPoly } from './helpers.js';

const PARTIALFILLWIDTH = 32;


/**
 * PixiFeaturePolygon
 *
 * Properties you can access:
 *   `geometry`   PixiGeometry() class containing all the information about the geometry
 *   `style`      Object containing styling data
 *   `container`  PIXI.Container containing the display objects used to draw the polygon
 *   `lowRes`     PIXI.Sprite for a replacement graphic to display at low resolution
 *   `fill`       PIXI.Graphic for the fill (below)
 *   `stroke`     PIXI.Graphic for the stroke (above)
 *   `mask`       PIXI.Mesh for the mask (applied to fill)
 *
 *   (also all properties inherited from `AbstractFeature`)
 */
export class PixiFeaturePolygon extends AbstractFeature {

  /**
   * @constructor
   * @param  {Layer}   layer     - The Layer that owns this Feature
   * @param  {string}  featureID - Unique string to use for the name of this Feature
   */
  constructor(layer, featureID) {
    super(layer, featureID);

    this.type = 'polygon';
    this._ssrdata = null;
    this._bufferdata = null;

    const lowRes = new PIXI.Sprite();
    lowRes.label = 'lowRes';
    lowRes.anchor.set(0.5, 0.5);  // middle, middle
    lowRes.interactive = false;
    lowRes.eventMode = 'static';
    lowRes.visible = false;
    this.lowRes = lowRes;

    const fill = new PIXI.Graphics();
    fill.label = 'fill';
    fill.eventMode = 'static';
    fill.sortableChildren = false;
    fill.visible = false;
    this.fill = fill;

    // When partially filling areas: we really want to define the mask as a stroke
    // drawn within the inside of the area shape.  Graphics defined as a stroke
    // _can_ be used as a mask, but they do not participate in hit testing!
    // (note: in pixi v8 they now do, but they don't yet respect the `alignment` property)
    // So we'll create the mask graphic and then copy its attributes into a mesh
    // which _does_ hit test properly.
    const mask = new PIXI.Mesh({ geometry: new PIXI.MeshGeometry() });
    mask.label = 'mask';
    mask.eventMode = 'static';
    mask.visible = false;
    this.mask = mask;
    this.maskSource = new PIXI.Graphics();  // not added to scene

    const strokes = new PIXI.Container();
    strokes.label = 'strokes';
    strokes.eventMode = 'static';
    strokes.sortableChildren = false;
    strokes.visible = false;
    this.strokes = strokes;

    this.container.addChild(lowRes, fill, mask, strokes);

    // Debug SSR
    // const debugSSR = new PIXI.Graphics();
    // debugSSR.label = 'ssr';
    // debugSSR.eventMode = 'none';
    // debugSSR.sortableChildren = false;
    // this.debugSSR = debugSSR;
    // this.container.addChild(debugSSR);
  }


  /**
   * destroy
   * Every Feature should have a destroy function that frees all the resources
   * Do not use the Feature after calling `destroy()`.
   */
  destroy() {
    if (this.lowRes) {
      this.lowRes.destroy();
      this.lowRes = null;
    }
    if (this.fill) {
      this.fill.destroy();
      this.fill = null;
    }
    if (this.mask) {
      this.mask.destroy();
      this.mask = null;
    }
    if (this.maskSource) {
      this.maskSource.destroy();
      this.maskSource = null;
    }
    if (this.strokes) {
      this.strokes.destroy({ children: true });
      this.strokes = null;
    }
    if (this.debugSSR) {
      this.debugSSR.destroy();
      this.debugSSR = null;
    }

    this._ssrdata = null;
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

    const context = this.context;
    const storage = context.systems.storage;
    const isWireframeMode = context.systems.map.wireframeMode;
    const bearing = context.viewport.transform.rotation;

    //
    // GEOMETRY
    //
    if (this.geometry.dirty) {
      this.geometry.update(viewport, zoom);

      // Redo ssr (move more of this into PixiGeometry later)
      this._ssrdata = null;

      // We use the SSR to approximate a low resolution polygon at low zooms
      if (this.geometry.ssr?.poly) {
        // Calculate axes of symmetry to determine width, height
        // The shape's surrounding rectangle has 2 axes of symmetry.
        //
        //       1
        //   p1 /\              p1 = midpoint of poly[0]-poly[1]
        //     /\ \ q2          q1 = midpoint of poly[2]-poly[3]
        //   0 \ \/\
        //      \/\ \ 2         p2 = midpoint of poly[3]-poly[0]
        //    p2 \ \/           q2 = midpoint of poly[1]-poly[2]
        //        \/ q1
        //        3

        const poly = this.geometry.ssr.poly;
        const p1 = [(poly[0][0] + poly[1][0]) / 2, (poly[0][1] + poly[1][1]) / 2 ];
        const q1 = [(poly[2][0] + poly[3][0]) / 2, (poly[2][1] + poly[3][1]) / 2 ];
        const p2 = [(poly[3][0] + poly[0][0]) / 2, (poly[3][1] + poly[0][1]) / 2 ];
        const q2 = [(poly[1][0] + poly[2][0]) / 2, (poly[1][1] + poly[2][1]) / 2 ];
        const axis1 = [p1, q1];
        const axis2 = [p2, q2];
        const center = [ (p1[0] + q1[0]) / 2, (p1[1] + q1[1]) / 2 ];

        // Pick an appropriate lowRes sprite for this shape
        // Are the SSR corners part of the shape?
        const EPSILON = 0.1;
        let c0in, c1in, c2in, c3in;
        this.geometry.outer.forEach(point => {
          if (!c0in) c0in = vecEqual(point, poly[0], EPSILON);
          if (!c1in) c1in = vecEqual(point, poly[1], EPSILON);
          if (!c2in) c2in = vecEqual(point, poly[2], EPSILON);
          if (!c3in) c3in = vecEqual(point, poly[3], EPSILON);
        });
        const cornersInSSR = c0in || c1in || c2in || c3in;

        this._ssrdata = {
          ssr: this.geometry.ssr,
          origSsr: this.geometry.origSsr,
          origAxis1: axis1.map(coord => viewport.unproject(coord)),
          origAxis2: axis2.map(coord => viewport.unproject(coord)),
          origCenter: viewport.unproject(center),
          shapeType: (cornersInSSR ? 'square' : 'circle')
        };
      }
    }

    // Calculate bounds
    const [minX, minY] = this.geometry.extent.min;
    const [maxX, maxY] = this.geometry.extent.max;
    const [w, h] = [maxX - minX, maxY - minY];
    this.sceneBounds.x = minX;
    this.sceneBounds.y = minY;
    this.sceneBounds.width = w;
    this.sceneBounds.height = h;


    //
    // STYLE
    //
    const style = this._style;
    const textureManager = this.gfx.textures;
    const color = style.fill.color ?? 0xaaaaaa;
    const alpha = style.fill.alpha ?? 0.3;
    const pattern = style.fill.pattern;
    const dash = style.stroke.dash || null;

    const lowRes = this.lowRes;
    const fill = this.fill;
    const mask = this.mask;
    const maskSource = this.maskSource;
    const strokes = this.strokes;

    let texture = pattern && textureManager.getPatternTexture(pattern) || PIXI.Texture.WHITE;    // WHITE turns off the texture
    const textureMatrix = new PIXI.Matrix().rotate(-bearing);  // keep patterns face up
// bhousel update 5/27/22:
// I've noticed that we can't use textures from a spritesheet for patterns,
// and it would be nice to figure out why

    const fillstyle = storage.getItem('area-fill') ?? 'partial';
    let doFullFill = style.requireFill || (fillstyle === 'full');

    // If this shape is so small that partial filling makes no sense, fill fully (faster?)
    const cutoff = (2 * PARTIALFILLWIDTH) + 5;
    if (w < cutoff || h < cutoff) {
      doFullFill = true;
    }
    // If this shape is so small that texture filling makes no sense, skip it (faster?)
// bhousel update 5/27/22:
// I actually now think this doesn't matter and, if anything, using different
// textures may break up the batches.  Eventually we'll introduce some containers
// so that the scene is sorted by style, and we'll try to just keep similarly
// textured things together to improve batching performance.
    if (w < PARTIALFILLWIDTH || h < PARTIALFILLWIDTH) {
      texture = PIXI.Texture.WHITE;
    }

    // Cull really tiny shapes
    if (w < 4 && h < 4) {  // so tiny
      this.lod = 0;  // off
      this.visible = false;
      lowRes.visible = false;
      fill.visible = false;
      mask.visible = false;
      strokes.visible = false;

    // Very small, swap with lowRes sprite
    } else if (this._ssrdata && (w < 20 && h < 20)) {
      this.lod = 1;  // simplified
      this.visible = true;
      lowRes.visible = true;
      fill.visible = false;
      mask.visible = false;
      strokes.visible = false;

      const ssrdata = this._ssrdata;
      const filling = isWireframeMode ? '-unfilled' : '';
      const textureName = `lowres${filling}-${ssrdata.shapeType}`;
      const [x, y] = viewport.project(ssrdata.origCenter);
      const rotation = ssrdata.ssr.angle;
      const axis1 = ssrdata.origAxis1.map(coord => viewport.project(coord));
      const axis2 = ssrdata.origAxis2.map(coord => viewport.project(coord));
      const w = vecLength(axis1[0], axis1[1]);
      const h = vecLength(axis2[0], axis2[1]);

      lowRes.texture = textureManager.get(textureName) || PIXI.Texture.WHITE;
      lowRes.position.set(x, y);
      lowRes.scale.set(w / 10, h / 10);   // our sprite is 10x10
      lowRes.rotation = rotation;
      lowRes.tint = color;

    } else {
      this.lod = 2;  // full
      this.visible = true;
      lowRes.visible = false;
      fill.visible = !isWireframeMode;
      mask.visible = !isWireframeMode;
      strokes.visible = true;
    }

    //
    // redraw the shapes
    //
    const rings = this.geometry.flatCoords || [];  // outer, followed by holes if any
    this._bufferdata = null;

    // STROKES
    strokes.removeChildren();
    if (strokes.visible && rings.length) {
      const lineWidth = isWireframeMode ? 1 : style.fill.width || 2;
      const strokeStyle = {
        alpha: 1,
        alignment: 0.5,  // middle of line
        color: color,
        width: lineWidth,
        cap: 'butt',
        join: 'miter'
      };
      const bufferStyle = {
        alpha: 1,
        alignment: 0.5,  // middle of line
        color: 0x000000,
        width: lineWidth + 10,
        cap: 'butt',
        join: 'bevel'
      };

      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        const stroke = new PIXI.Graphics();

        if (dash) {
          strokeStyle.dash = dash;
          const dl = new DashLine(stroke, strokeStyle);
          dl
            .poly(ring);

        } else {
          stroke
            .poly(ring)
            .stroke(strokeStyle);
        }

        const buffer = lineToPoly(ring, bufferStyle);
        if (i === 0) {
          this._bufferdata = buffer;  // save outer buffer for later, for the hover halo..
        }

        stroke.hitArea = new PIXI.Polygon(buffer.perimeter);
        stroke.label = `stroke${i}`;
        stroke.eventMode = 'static';
        stroke.sortableChildren = false;
        strokes.addChild(stroke);
      }
    }


    // FILL
    if (fill.visible && rings.length) {
      const fillStyle = {
        color: color,
        alpha: alpha,
        texture: texture, // Optional: include only if texture is used
        matrix: textureMatrix // Optional: include only if texture is used
      };

      fill.clear();
      for (let i = 0; i < rings.length; i++) {
        fill.poly(rings[i]);
        if (i === 0) {
          fill.fill(fillStyle);
        } else {
          fill.cut();
        }
      }

      if (doFullFill) {
        mask.visible = false;
        fill.mask = null;

      } else {  // partial fill
        const maskStyle = {
          alpha: 1,
          color: 0xff0000,
          width: PARTIALFILLWIDTH,
          cap: 'butt',
          join: 'bevel'
        };

        // Generate mask around the edges of the shape
        maskSource.clear();
        for (let i = 0; i < rings.length; i++) {
          maskSource.poly(rings[i]);
          if (i === 0) {               // outer
            maskStyle.alignment = 1;   // left
            maskSource.stroke(maskStyle);
          } else {                     // holes
            maskStyle.alignment = 0;   // right
            maskSource.stroke(maskStyle);
          }
        }

        // Compute the mask's geometry, then copy its attributes into the mesh's geometry
        // This lets us use the Mesh as the mask and properly hit test against it.
        const graphicsContext = maskSource.context;
        const gpuContext = new PIXI.GpuGraphicsContext();
        gpuContext.context = graphicsContext;   // _initContext
        gpuContext.isBatchable = false;

        PIXI.buildContextBatches(graphicsContext, gpuContext);

        mask.geometry = new PIXI.MeshGeometry({
          indices:  new Uint32Array(gpuContext.geometryData.indices),
          positions: new Float32Array(gpuContext.geometryData.vertices),
          uvs: new Float32Array(gpuContext.geometryData.uvs)
        });

        mask.visible = true;
        fill.mask = mask;
      }
    }

    // Debug SSR
    // const p = this._ssrdata.ssr.poly;
    // const ssrflat = [
    //  p[0][0], p[0][1],
    //  p[1][0], p[1][1],
    //  p[2][0], p[2][1],
    //  p[3][0], p[3][1],
    //  p[0][0], p[0][1]
    // ];
    //
    // this.debugSSR
    //   .clear()
    //   .poly(new PIXI.Polygon(ssrflat))
    //   .stroke({ width: 2, color: 0x00ff00 });

    this._styleDirty = false;

    this.updateHalo();
  }


  /**
   * updateHalo
   * Show/Hide halo (expects `this._bufferdata` to be already set up by `update()`)
   */
  updateHalo() {
    const wireframeMode = this.context.systems.map.wireframeMode;
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
    if (showSelect) {
      if (!this.halo) {
        this.halo = new PIXI.Graphics();
        this.halo.label = `${this.id}-halo`;
        const haloContainer = this.scene.layers.get('map-ui').halo;
        haloContainer.addChild(this.halo);
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
        dl.poly(this._bufferdata.outer);
        if (wireframeMode) {
          dl.poly(this._bufferdata.inner);
        }
      }

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
  requireFill: false,      // allow partial fill or wireframe styles
  lineMarkerName: '',
  lineMarkerTint: 0x000000,
  labelTint: 0xeeeeee,

  fill:   { width: 2, color: 0xaaaaaa, alpha: 0.3 },
  casing: { width: 5, color: 0x444444, alpha: 1, cap: 'round', join: 'round' },
  stroke: { width: 3, color: 0xcccccc, alpha: 1, cap: 'round', join: 'round' }
};
