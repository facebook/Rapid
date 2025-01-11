import * as PIXI from 'pixi.js';
import { vecLength } from '@rapid-sdk/math';


///** Define the dash: [dash length, gap size, dash size, gap size, ...] */
//export type Dashes = number[];
//
//export interface DashLineOptions {
//  dash?: Dashes;
//  width?: number;
//  color?: number;
//  alpha?: number;
//  scale?: number;
//  useTexture?: boolean;
//  useDots?: boolean;
//  cap?: PIXI.LineCap;
//  join?: PIXI.LineJoin;
//  alignment?: number;
//}

const dashLineOptionsDefault = {
  dash: [10, 5],
  width: 1,
  color: 0xffffff,
  alpha: 1,
  scale: 1,
  useTexture: true,
  alignment: 0.5
};




export class DashLine {

  /**
   * Create a DashLine
   * @param  {GraphicsSystem}  gfx       - Reference back to the GraphicsSystem, so we can find the texture cache
   * @param  {PIXI.Graphics}   graphics  - The Pixi graphics object to draw with a dashed-line style
   * @param [options]
   * @param [options.useTexture=false] - use the texture based render (useful for very large or very small dashed lines)
   * @param [options.dash=[10,5] - an array holding the dash and gap (eg, [10, 5, 20, 5, ...])
   * @param [options.width=1] - width of the dashed line
   * @param [options.alpha=1] - alpha of the dashed line
   * @param [options.color=0xffffff] - color of the dashed line
   * @param [options.cap] - add a LINE_CAP style to dashed lines (only works for useTexture: false)
   * @param [options.join] - add a LINE_JOIN style to the dashed lines (only works for useTexture: false)
   * @param [options.alignment] - The alignment of any lines drawn (0.5 = middle, 1 = outer, 0 = inner)
   */
  constructor(gfx, graphics, options = {}) {
    this.gfx = gfx;

    options = { ...dashLineOptionsDefault, ...options };
    this.options = options;

    this.lineLength = null;           // current length of the line
    this.cursor = new PIXI.Point();   // cursor location
    this.start = null;

    this.graphics = graphics;
    this.dash = options.dash;
    this.dashSize = this.dash.reduce((a, b) => a + b);
    this.scale = options.scale;
    this.useTexture = options.useTexture;

    if (this.useTexture) {
      this.activeTexture = this._getTexture(options, this.dashSize);
      this.strokeStyle = {
        alignment: options.alignment,
        alpha: options.alpha,
        color: options.color,
        matrix: new PIXI.Matrix(),
        texture: this.activeTexture,
        width: options.width * options.scale
      };
    } else {
      this.activeTexture = null;
      this.strokeStyle = {
        alignment: options.alignment,
        alpha: options.alpha,
        cap: options.cap,
        color: options.color,
        join: options.join,
        width: options.width * options.scale
      };
    }
  }


  /**
   * moveTo
   * Move to a position to prepare to draw a line.
   * This is essentially our 'reset' function.
   */
  moveTo(x, y) {
    this.lineLength = 0;
    this.cursor.set(x, y);
    this.start = new PIXI.Point(x, y);
    this.graphics.moveTo(this.cursor.x, this.cursor.y);
    return this;
  }


  /**
   * lineTo
   * Extend the line to given x,y coordinate
   */
  lineTo(x, y, doClosePath) {
    if (this.lineLength === null) {  // lineTo() called before moveTo()?
      this.moveTo(0, 0);
    }
    let [x0, y0] = [this.cursor.x, this.cursor.y];   // the start position of the cursor
    const length = vecLength([x0, y0], [x, y]);
    if (length < 1) {
      this.lineLength += length;  // advance length, but don't draw anything (these tiny lengths add up)
      return this;
    }

    const angle = Math.atan2(y - y0, x - x0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const final = doClosePath && x === this.start.x && y === this.start.y;

    if (this.useTexture) {
      if (final && this.dash.length % 2 === 0) {
        const gap = Math.min(this.dash[this.dash.length - 1], length);
        this.graphics.lineTo(x - cos * gap, y - sin * gap);
        this.graphics.closePath();
      } else {
        this.graphics.lineTo(x, y);
      }

      // set texture matrix
      let m = this.strokeStyle.matrix;
      m.identity();
      if (angle) {
        m.rotate(angle);
      }
      if (this.scale !== 1) {
        m.scale(this.scale, this.scale);
      }
      const textureStart = -this.lineLength;
      m.translate(
        this.cursor.x + textureStart * cos,
        this.cursor.y + textureStart * sin
      );

      this.lineLength += length;
      this.cursor.set(x, y);

    } else {
      // Determine where in the dash pattern the cursor is starting from.
      const origin = this.lineLength % (this.dashSize * this.scale);
      let dashIndex = 0;  // which dash in the pattern
      let dashStart = 0;  // how far in the dash
      let dashX = 0;
      for (let i = 0; i < this.dash.length; i++) {
        const dashSize = this.dash[i] * this.scale;
        if (origin < dashX + dashSize) {
          dashIndex = i;
          dashStart = origin - dashX;
          break;
        } else {
          dashX += dashSize;
        }
      }

      // Advance the line
      let remaining = length;
      while (remaining > 1) {   // stop if we are within 1 pixel
        const dashSize = (this.dash[dashIndex] * this.scale) - dashStart;
        let dist = (remaining > dashSize) ? dashSize : remaining;

        if (final) {
          const remainingDistance = vecLength([x0 + cos * dist, y0 + sin * dist], [this.start.x, this.start.y]);
          if (remainingDistance <= dist) {
            if (dashIndex % 2 === 0) {
              const lastDash = vecLength([x0, y0], [this.start.x, this.start.y]) - this.dash[this.dash.length - 1] * this.scale;
              x0 += cos * lastDash;
              y0 += sin * lastDash;
              this.graphics.lineTo(x0, y0);
              this.lineLength += lastDash;
              this.cursor.set(x0, y0);
            }
            break;
          }
        }

        x0 += cos * dist;
        y0 += sin * dist;
        if (dashIndex % 2) {  // odd dashIndex = 'on', even dashIndex = 'off'
          this.graphics.moveTo(x0, y0);
        } else {
          this.graphics.lineTo(x0, y0);
        }
        this.lineLength += dist;
        this.cursor.set(x0, y0);
        remaining -= dist;

        // Prepare for next dash (only really matters if there is remaining length)
        dashIndex++;
        dashIndex = dashIndex === this.dash.length ? 0 : dashIndex;
        dashStart = 0;
      }
    }

    // Pixi v8: call `stroke()` after issuing draw instructions
    this.graphics.stroke(this.strokeStyle);

    return this;
  }


  closePath() {
    this.lineTo(this.start.x, this.start.y, true);
  }


  /**
   *  circle
   *  @param  {number}  x
   *  @param  {number}  y
   *  @param  {number}  radius
   *  @param  {number}  points
   *  @param  {PIXI.Matrix} matrix?
   *  @return {DashLine}  this
   */
  circle(x, y, radius, points = 80, matrix = null) {
    const interval = (Math.PI * 2) / points;
    let angle = 0;
    let first = new PIXI.Point(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    if (matrix) {
      matrix.apply(first, first);
      this.moveTo(first[0], first[1]);
    } else {
      this.moveTo(first.x, first.y);
    }
    angle += interval;
    for (let i = 1; i < points + 1; i++) {
      const next = (i === points) ? [first.x, first.y] : [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
      this.lineTo(next[0], next[1]);
      angle += interval;
    }

    return this;
  }


  /**
   *  ellipse
   *  @param  {number}  x
   *  @param  {number}  y
   *  @param  {number}  radiusX
   *  @param  {number}  radiusY
   *  @param  {number}  points
   *  @param  {PIXI.Matrix} matrix?
   *  @return {DashLine}  this
   */
  ellipse(x, y, radiusX, radiusY, points = 80, matrix = null) {
    const interval = (Math.PI * 2) / points;
    let first;

    const point = new PIXI.Point();
    for (let i = 0; i < Math.PI * 2; i += interval) {
      let x0 = x - radiusX * Math.sin(i);
      let y0 = y - radiusY * Math.cos(i);
      if (matrix) {
        point.set(x0, y0);
        matrix.apply(point, point);
        x0 = point.x;
        y0 = point.y;
      }
      if (i === 0) {
        this.moveTo(x0, y0);
        first = { x: x0, y: y0 };
      } else {
        this.lineTo(x0, y0);
      }
    }

    this.lineTo(first.x, first.y, true);

    return this;
  }


  /**
   *  poly
   *  @param  {PIXI.Point[] | number[]} points
   *  @param  {PIXI.Matrix} matrix?
   *  @return {DashLine}  this
   */
  poly(points, matrix = null) {
    const p = new PIXI.Point();

    if (typeof points[0] === 'number') {   // flat array of numbers
      if (matrix) {
        p.set(points[0], points[1]);
        matrix.apply(p, p);
        this.moveTo(p.x, p.y);
        for (let i = 2; i < points.length; i += 2) {
          p.set(points[i], points[i + 1]);
          matrix.apply(p, p);
          this.lineTo(p.x, p.y, i === points.length - 2);
        }
      } else {
        this.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) {
          this.lineTo(points[i], points[i + 1], i === points.length - 2);
        }
      }

    } else {   // Array of PIXI.Point
      if (matrix) {
        const point = points[0];
        p.copyFrom(point);
        matrix.apply(p, p);
        this.moveTo(p.x, p.y);
        for (let i = 1; i < points.length; i++) {
          const point = points[i];
          p.copyFrom(point);
          matrix.apply(p, p);
          this.lineTo(p.x, p.y, i === points.length - 1);
        }
      } else {
        const point = points[0];
        this.moveTo(point.x, point.y);
        for (let i = 1; i < points.length; i++) {
          const point = points[i];
          this.lineTo(point.x, point.y, i === points.length - 1);
        }
      }
    }

    return this;
  }


  /**
   *  rect
   *  @param  {number}  x
   *  @param  {number}  y
   *  @param  {number}  width
   *  @param  {number}  height
   *  @param  {PIXI.Matrix} matrix?
   *  @return {DashLine}  this
   */
  rect(x, y, width, height, matrix = null) {
    if (matrix) {
      const p = new PIXI.Point();

      // moveTo(x, y)
      p.set(x, y);
      matrix.apply(p, p);
      this.moveTo(p.x, p.y);

      // lineTo(x + width, y)
      p.set(x + width, y);
      matrix.apply(p, p);
      this.lineTo(p.x, p.y);

      // lineTo(x + width, y + height)
      p.set(x + width, y + height);
      matrix.apply(p, p);
      this.lineTo(p.x, p.y);

      // lineto(x, y + height)
      p.set(x, y + height);
      matrix.apply(p, p);
      this.lineTo(p.x, p.y);

      // lineTo(x, y, true)
      p.set(x, y);
      matrix.apply(p, p);
      this.lineTo(p.x, p.y, true);

    } else {
      this.moveTo(x, y)
        .lineTo(x + width, y)
        .lineTo(x + width, y + height)
        .lineTo(x, y + height)
        .lineTo(x, y, true);
    }

    return this;
  }


  /**
   *  creates or uses cached texture
   *  @param  {Object}      options
   *  @param  {number}      dashSize
   *  @return {PIXI.Texture}
   */
  _getTexture(options, dashSize) {
    const dashTextureCache = this.gfx.textures?._dashTextureCache;
    if (!dashTextureCache) {    // called too early?
      console.error('No DashTextureCache found');   // eslint-disable-line no-console
      return null;
    }

    const key = options.dash.toString();
    if (dashTextureCache[key]) {
      return dashTextureCache[key];
    }

    // For WebGL1 support, this canvas should have power of 2 dimensions.
    const canvas = document.createElement('canvas');
    const drawWidth = dashSize;
    const drawHeight = Math.ceil(options.width);
    canvas.width = PIXI.nextPow2(drawWidth);
    canvas.height = PIXI.nextPow2(drawHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Did not get context from canvas');   // eslint-disable-line no-console
      return null;
    }

    // scale up to fill canvas
    const scaleX = canvas.width / drawWidth;
    const scaleY = canvas.height / drawHeight;
    ctx.scale(scaleX, scaleY);

    ctx.strokeStyle = 'white';
    ctx.globalAlpha = options.alpha;
    ctx.lineWidth = options.width;

    let x = 0;
    const y = options.width / 2;
    ctx.moveTo(x, y);

    for (let i = 0; i < options.dash.length; i += 2) {
      x += options.dash[i];
      ctx.lineTo(x, y);
      if (options.dash.length !== i + 1) {
        x += options.dash[i + 1];
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();

    const texture = (dashTextureCache[key] = PIXI.Texture.from(canvas));
    texture.source.scaleMode = 'nearest';

    return texture;
  }
}
