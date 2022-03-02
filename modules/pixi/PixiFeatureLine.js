import * as PIXI from 'pixi.js';
import { DashLine } from 'pixi-dashed-line';

import { PixiFeature } from './PixiFeature';
import { getLineSegments, lineToPolygon } from './helpers';

const ONEWAY_SPACING = 35;


/**
 * PixiFeatureLine
 *
 * Properties you can access:
 *   `coords`         Array of wgs84 coordinates [lon, lat]
 *   `points`         Array of projected points in scene coordinates
 *   `style`          Object containing styling data
 *   `displayObject`  PIXI.Container() holds the line parts
 *   `casing`         PIXI.Graphic() for the casing (below)
 *   `stroke`         PIXI.Graphic() for the stroke (above)
 *   `markers`        PIXI.ParticleContainer() holds oneway arrows
 *
 * Inherited from PixiFeature:
 *   `dirty`
 *   `k`
 *   `localBounds`
 *   `sceneBounds`
 *
 * @class
 */
export class PixiFeatureLine extends PixiFeature {

  /**
   * @constructor
   */
  constructor(context, id, coords, style, showOneWay, reversePoints) {
    const container = new PIXI.Container();
    super(container);

    this.context = context;
    this.type = 'line';
    this._coords = coords;      // Array of [lon, lat] coordinate pairs

    this.style = style;
    this.showOneWay = showOneWay;
    this.reversePoints = reversePoints;
    this.points = [];

    container.name = id;
    container.buttonMode = true;
    container.interactive = true;
    container.interactiveChildren = true;
    container.sortableChildren = false;

    const casing = new PIXI.Graphics();
    casing.name = `${id}-casing`;
    casing.interactive = false;
    casing.interactiveChildren = false;
    casing.sortableChildren = false;
    this.casing = casing;

    const stroke = new PIXI.Graphics();
    stroke.name = `${id}-stroke`;
    stroke.interactive = false;
    stroke.interactiveChildren = false;
    stroke.sortableChildren = false;
    this.stroke = stroke;

    const markers = new PIXI.ParticleContainer(10000);
    markers.name = `${id}-markers`;
    markers.interactiveChildren = false;
    markers.sortableChildren = false;
    markers.roundPixels = false;
    this.markers = markers;

    container.addChild(casing, stroke, markers);
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

    //
    // Reproject and recalculate the bounding box
    //
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    this.points = [];
    this._coords.forEach(coord => {
      const [x, y] = projection.project(coord);
      this.points.push([x, y]);

      [minX, minY] = [Math.min(x, minX), Math.min(y, minY)];
      [maxX, maxY] = [Math.max(x, maxX), Math.max(y, maxY)];
    });

    if (this.reversePoints) {
      this.points.reverse();
    }

    // Calculate hit area
    let hitPath = [];
    const hitWidth = this.style.casing.width;
    this.points.forEach(([x, y]) => hitPath.push(x, y));  // flatten point array
    this.displayObject.hitArea = lineToPolygon(hitWidth, hitPath);

    // Calculate bounds
    const [w, h] = [maxX - minX, maxY - minY];
    this.localBounds.x = minX;
    this.localBounds.y = minY;
    this.localBounds.width = w;
    this.localBounds.height = h;
    this.sceneBounds = this.localBounds.clone();  // for lines, they are the same


    //
    // Apply effectiveZoom style adjustments
    //
    if (zoom < 16) {
      this.casing.renderable = false;
      this.markers.renderable = false;
      this.markers.removeChildren();

    } else {
      this.casing.renderable = true;
      this.markers.renderable = this.showOneWay;
    }

    if (this.casing.renderable) {
      updateGraphic('casing', this.casing, this.style, this.points);
    }
    if (this.stroke.renderable) {
      updateGraphic('stroke', this.stroke, this.style, this.points);
    }

    if (this.markers.renderable && this.showOneWay) {
      const textures = this.context.pixi.rapidTextures;
      const oneway = textures.get('oneway') || PIXI.Texture.WHITE;

      const segments = getLineSegments(this.points, ONEWAY_SPACING);
      this.markers.removeChildren();

      segments.forEach(segment => {
        segment.coords.forEach(([x, y]) => {
          const arrow = new PIXI.Sprite(oneway);
          arrow.interactive = false;
          arrow.interactiveChildren = false;
          arrow.sortableChildren = false;
          arrow.anchor.set(0.5, 0.5);  // middle, middle
          arrow.position.set(x, y);
          arrow.rotation = segment.angle;
          this.markers.addChild(arrow);
        });
      });
    }

    this.scale = k;
    this.dirty = false;


    function updateGraphic(which, graphic, style, points) {
      const minwidth = (which === 'casing' ? 3 : 2);
      let width = style[which].width;

      //
      // Apply effectiveZoom style adjustments
      //
      if (zoom < 16) {
        width -= 4;
      } else if (zoom < 17) {
        width -= 2;
      }
      if (width < minwidth) {
        width = minwidth;
      }

      let g = graphic.clear();
      if (style[which].alpha === 0) return;

      if (style[which].dash) {
        g = new DashLine(g, {
          dash: style[which].dash,
          color: style[which].color,
          width: width,
          alpha: style[which].alpha || 1.0,
          join: style[which].join || PIXI.LINE_JOIN.ROUND,
          cap: style[which].cap || PIXI.LINE_CAP.ROUND
        });
      } else {
        g = g.lineStyle({
          color: style[which].color,
          width: width,
          alpha: style[which].alpha || 1.0,
          join: style[which].join || PIXI.LINE_JOIN.ROUND,
          cap: style[which].cap || PIXI.LINE_CAP.ROUND
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


  /**
   * coord
   */
  get coords() {
    return this._coords;
  }
  set coords(val) {
    this._coords = val;
    this.dirty = true;
  }

}
