import * as PIXI from 'pixi.js';
import { Extent, geomGetSmallestSurroundingRectangle, vecLength } from '@id-sdk/math';

import { PixiFeature } from './PixiFeature';
import { prefs } from '../core/preferences';

const PARTIALFILLWIDTH = 32;


/**
 * PixiFeatureMultipolygon
 *
 * Properties you can access:
 *   `geometry`       Treat like multipolygon (Array of polygons wgs84 [lon, lat])
 *   `style`          Object containing styling data
 *   `displayObject`  PIXI.Container() holds the polygon parts
 *   `lowRes`         PIXI.Sprite() for a replacement graphic to display at low resolution
 *   `fill`           PIXI.Graphic() for the fill (below)
 *   `stroke`         PIXI.Graphic() for the stroke (above)
 *   `mask`           PIXI.Mesh() for the mask (applied to fill)
 *   `ssrdata`        Object containing SSR data (computed one time for simple polygons)
 *
 * Inherited from PixiFeature:
 *   `dirty`
 *   `extent`
 *   `label`
 *   `localBounds`
 *   `sceneBounds`
 */
export class PixiFeatureMultipolygon extends PixiFeature {

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
    const container = new PIXI.Container();
    super(context, container, id, parent, data);

    this.type = 'multipolygon';
    this.geometry = geometry || [];    // Array of wgs84 coordinates [lon, lat]
    this.style = style || {};
    this.ssrdata = null;

    const textures = context.pixi.rapidTextures;
    const square = textures.get('lowres-square') || PIXI.Texture.WHITE;
    const lowRes = new PIXI.Sprite(square);
    // const lowRes = new PIXI.Sprite(textures.ell);
    lowRes.name = 'lowRes';
    lowRes.anchor.set(0.5, 0.5);  // middle, middle
    lowRes.visible = false;
    lowRes.interactive = true;
    this.lowRes = lowRes;

    const fill = new PIXI.Graphics();
    fill.name = 'fill';
    fill.interactive = true;
    fill.sortableChildren = false;
    this.fill = fill;

    const stroke = new PIXI.Graphics();
    stroke.name = 'stroke';
    stroke.interactive = false;
    stroke.interactiveChildren = false;
    stroke.sortableChildren = false;
    this.stroke = stroke;

    // When partially filling areas: we really want to define the mask as a line
    // drawn within the inside of the area shape.  Graphics defined as a line
    // _can_ be used as a mask, but they do not participate in his testing!
    // So we'll create the mask graphic and then copy its attributes into a mesh
    // which _does_ hit test properly.
    // (Ignore the default MeshMaterial - it won't be drawn anyway, it's a mask.)
    const mask = new PIXI.Mesh(null, new PIXI.MeshMaterial(PIXI.Texture.WHITE));
    mask.name = 'mask';
    mask.buttonMode = true;
    mask.interactive = true;
    mask.interactiveChildren = true;
    mask.visible = false;
    this.mask = mask;

    container.addChild(lowRes, fill, stroke, mask);
  }


  /**
   * destroy
   * Every feature should have a destroy function that frees all the resources
   * and removes the display object from the scene.
   * Do not use the feature after calling `destroy()`.
   */
  destroy() {
    this.ssrdata = null;
    super.destroy();
  }


  /**
   * update
   * @param projection   pixi projection to use for rendering
   * @param zoom         effective zoom to use for rendering
   */
  update(projection) {
    if (!this.dirty) return;  // no change

    // For now, if either geometry or style is dirty, we just update the whole multipolygon

    //
    // GEOMETRY
    //

    // Reproject and recalculate the bounding box
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    let shapes = [];

    // Convert the GeoJSON style multipolygons to array of Pixi polygons with inner/outer
    this._geometry.forEach(rings => {
      if (!rings.length) return;  // no rings?

      let shape = { outer: undefined, holes: [] };
      shapes.push(shape);

      rings.forEach((ring, index) => {
        const isOuter = (index === 0);
        let points = [];
        let outerPoints = [];

        ring.forEach(coord => {
          const [x, y] = projection.project(coord);
          points.push(x, y);

          if (isOuter) {   // outer rings define the bounding box
            outerPoints.push([x, y]);
            [minX, minY] = [Math.min(x, minX), Math.min(y, minY)];
            [maxX, maxY] = [Math.max(x, maxX), Math.max(y, maxY)];
          }
        });

        // Calculate Smallest Surrounding Rectangle (SSR):
        // If this is a simple polygon (no multiple outers), perform a one-time
        // calculation SSR to use as a replacement geometry at low zooms.
        if (isOuter && !this.ssrdata && this._geometry.length === 1) {
          let ssr = geomGetSmallestSurroundingRectangle(outerPoints);   // compute SSR in projected coordinates
          if (ssr && ssr.poly) {
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

            const p1 = [(ssr.poly[0][0] + ssr.poly[1][0]) / 2, (ssr.poly[0][1] + ssr.poly[1][1]) / 2 ];
            const q1 = [(ssr.poly[2][0] + ssr.poly[3][0]) / 2, (ssr.poly[2][1] + ssr.poly[3][1]) / 2 ];
            const p2 = [(ssr.poly[3][0] + ssr.poly[0][0]) / 2, (ssr.poly[3][1] + ssr.poly[0][1]) / 2 ];
            const q2 = [(ssr.poly[1][0] + ssr.poly[2][0]) / 2, (ssr.poly[1][1] + ssr.poly[2][1]) / 2 ];
            const axis1 = [p1, q1];
            const axis2 = [p2, q2];
            const centroid = [ (p1[0] + q1[0]) / 2, (p1[1] + q1[1]) / 2 ];
            this.ssrdata = {
              poly: ssr.poly.map(coord => projection.invert(coord)),   // but store in raw wgsr84 coordinates
              axis1: axis1.map(coord => projection.invert(coord)),
              axis2: axis2.map(coord => projection.invert(coord)),
              centroid: projection.invert(centroid),
              angle: ssr.angle
            };
          }
        }

        const poly = new PIXI.Polygon(points);
        if (isOuter) {
          shape.outer = poly;
        } else {
          shape.holes.push(poly);
        }
      });
    });

    const [w, h] = [maxX - minX, maxY - minY];
    this.localBounds.x = minX;
    this.localBounds.y = minY;
    this.localBounds.width = w;
    this.localBounds.height = h;
    this.sceneBounds = this.localBounds.clone();  // for polygons, they are the same

    this._geometryDirty = false;


    //
    // STYLE
    //

    const style = this._style;
    const textures = this.context.pixi.rapidTextures;
    const color = style.fill.color || 0xaaaaaa;
    const alpha = style.fill.alpha || 0.3;
    const pattern = style.fill.pattern;
    let texture = pattern && textures.get(pattern) || PIXI.Texture.WHITE;    // WHITE turns off the texture

    const fillstyle = prefs('area-fill') || 'partial';
    let doPartialFill = (fillstyle === 'partial');

    // If this shape is so small that partial filling makes no sense, fill fully (faster?)
    const cutoff = (2 * PARTIALFILLWIDTH) + 5;
    if (w < cutoff || h < cutoff) {
      doPartialFill = false;
    }
    // If this shape is so small that texture filling makes no sense, skip it (faster?)
    if (w < PARTIALFILLWIDTH || h < PARTIALFILLWIDTH) {
      texture = PIXI.Texture.WHITE;
    }

    // If this shape is very small, swap with lowRes sprite
    if (this.ssrdata && (w < 20 && h < 20)) {
      const ssrdata = this.ssrdata;
      this.fill.visible = false;
      this.stroke.visible = false;
      this.mask.visible = false;
      this.lowRes.visible = true;

      const [x, y] = projection.project(ssrdata.centroid);
      // const poly = ssrdata.poly.map(coord => projection.project(coord));
      const axis1 = ssrdata.axis1.map(coord => projection.project(coord));
      const axis2 = ssrdata.axis2.map(coord => projection.project(coord));
      const w = vecLength(axis1[0], axis1[1]);
      const h = vecLength(axis2[0], axis2[1]);

      this.lowRes.position.set(x, y);
      this.lowRes.scale.set(w / 10, h / 10);   // our sprite is 10x10
      this.lowRes.rotation = ssrdata.angle;
      this.lowRes.tint = color;

    } else {
      this.fill.visible = true;
      this.stroke.visible = true;
      this.lowRes.visible = false;
    }

    //
    // redraw the shapes
    //

    // STROKE
    if (this.stroke.visible) {
      this.stroke
        .clear()
        .lineStyle({
          alpha: 1,
          width: style.fill.width || 2,
          color: color
        });

      shapes.forEach(shape => {
        this.stroke.drawShape(shape.outer);
        shape.holes.forEach(hole => {
          this.stroke.drawShape(hole);
        });
      });
    }

    // FILL
    if (this.fill.visible) {
      this.fill.clear();
      shapes.forEach(shape => {
        this.fill
          .beginTextureFill({
            alpha: alpha,
            color: color,
            texture: texture
          })
          .drawShape(shape.outer);

        if (shape.holes.length) {
          this.fill.beginHole();
          shape.holes.forEach(hole => this.fill.drawShape(hole));
          this.fill.endHole();
        }
        this.fill.endFill();
      });

      if (doPartialFill) {   // mask around the edges of the fill
        const maskSource = new PIXI.Graphics()
          .clear()
          .lineTextureStyle({
            alpha: 1,
            alignment: 0,  // inside (will do the right thing even for holes, as they are wound correctly)
            width: PARTIALFILLWIDTH,
            color: 0x000000,
            texture: PIXI.Texture.WHITE
          });

        shapes.forEach(shape => {
          maskSource.drawShape(shape.outer);
          shape.holes.forEach(hole => maskSource.drawShape(hole));
        });

        // Compute the mask's geometry, then copy its attributes into the mesh's geometry
        // This lets us use the Mesh as the mask and properly hit test against it.
        maskSource.geometry.updateBatches(true);
        this.mask.geometry = new PIXI.Geometry()
          .addAttribute('aVertexPosition', maskSource.geometry.points, 2)
          .addAttribute('aTextureCoord', maskSource.geometry.uvs, 2)
          .addIndex(maskSource.geometry.indices);

        this.mask.visible = true;
        this.fill.mask = this.mask;

      } else {  // full fill - no mask
        this.mask.visible = false;
        this.fill.mask = null;
      }
    }

    this._styleDirty = false;
  }



  /**
   * geometry
   * @param arr geometry `Array` (contents depends on the feature type)
   *
   * 'multipolygon' - Array of Arrays of Arrays
   *   [
   *     [                                  // polygon 1
   *       [ [lon, lat], [lon, lat], … ],   // outer ring
   *       [ [lon, lat], [lon, lat], … ],   // inner rings
   *       …
   *     ],
   *     [                                  // polygon 2
   *       [ [lon, lat], [lon, lat], … ],   // outer ring
   *       [ [lon, lat], [lon, lat], … ],   // inner rings
   *       …
   *     ],
   *     …
   *   ]
   */
  get geometry() {
    return this._geometry;
  }
  set geometry(arr) {
    this.extent = new Extent();
    arr.forEach(rings => {
      if (!rings.length) return;    // no rings?
      rings[0].forEach(coord => {   // ring[0] is an outer ring
        // update extent in place
        this.extent.min = [ Math.min(this.extent.min[0], coord[0]), Math.min(this.extent.min[1], coord[1]) ];
        this.extent.max = [ Math.max(this.extent.max[0], coord[0]), Math.max(this.extent.max[1], coord[1]) ];
      });
    });

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

  rebind(data, geometry) {
    super.rebind(data);
    this.geometry = geometry;
  }
}


const STYLE_DEFAULTS = {
  reversePoints: false,
  lineMarkerName: '',
  lineMarkerTint: 0x000000,
  labelTint: 0xffffff,

  fill:   { width: 2, color: 0xaaaaaa, alpha: 0.3 },
  casing: { width: 5, color: 0x444444, alpha: 1, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND },
  stroke: { width: 3, color: 0xcccccc, alpha: 1, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND }
};
