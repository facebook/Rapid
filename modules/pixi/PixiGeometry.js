import { Extent, geomGetSmallestSurroundingRectangle, vecInterp } from '@id-sdk/math';
import { polygonHull as d3_polygonHull, polygonCentroid as d3_polygonCentroid } from 'd3-polygon';
import polylabel from '@mapbox/polylabel';


/**
 * PixiGeometry
 * Wrapper for geometry data, used by the various PixiFeatureXXX classes
 * Because recalculating and reprojecting geometry is expensive, this class tries to do it only if necessary.
 *
 * The geometry data should be passed to `setCoords()`
 *
 * Properties you can access:
 *   `type`          String describing what kind of geometry this is ('point', 'line', 'polygon')
 *   `origCoords`    Original coordinate data (in WGS84 long/lat)
 *   `origExtent`    Original extent (the bounds of the geometry)
 *   `origHull`      Original convex hull
 *   `origCentroid`  Original centroid (center of mass / rotation), [ lon, lat ]
 *   `origPoi`       Original pole of inaccessability, [ lon, lat ]
 *   `origSsr`       Original smallest surrounding rectangle
 *   `coords`        Projected coordinate data
 *   `extent`        Projected extent
 *   `outer`         Projected outer ring, Array of coordinate pairs [ [x,y], [x,y], … ]
 *   `flatOuter`     Projected outer ring, flat Array how Pixi wants it [ x,y, x,y, … ]
 *   `holes`         Projected hole rings, Array of Array of coordinate pairs [ [ [x,y], [x,y], … ] ]
 *   `flatHoles`     Projected hole rings, Array of flat Array how Pixi wants it [ [ x,y, x,y, … ] ]
 *   `hull`          Projected convex hull, Array of coordinate pairs [ [x,y], [x,y], … ]
 *   `centroid`      Projected centroid, [x, y]
 *   `poi`           Projected pole of inaccessability, [x, y]
 *   `ssr`           Projected smallest surrounding rectangle data (angle, poly)
 *   `width`         Width of projected shape, in pixels
 *   `height`        Height of projected shape, in pixels
 *   `lod`           Level of detail for the geometry (0 = off, 1 = simplified, 2 = full)
 */
export class PixiGeometry {

  /**
   * @constructor
   */
  constructor() {
    this.type = null;      // 'point', 'line', or 'polygon'
    this.dirty = true;
    this.reset();
  }


  /**
   * destroy
   * Release memory.
   * Do not use the geometry after calling `destroy()`.
   */
  destroy() {
    this.reset();
  }


  /**
   * reset
   * Remove all stored data
   */
  reset() {
    // Original data - These are in WGS84 coordinates
    // ([0,0] is Null Island)
    this.origCoords = null;     // coordinate data
    this.origExtent = null;     // extent (bounding box)
    this.origHull = null;       // convex hull
    this.origCentroid = null;   // centroid (center of mass / rotation)
    this.origPoi = null;        // pole of inaccessability
    this.origSsr = null;        // smallest surrounding rectangle

    // The rest of the data is projected data in screen coordinates
    // ([0,0] is the origin of the Pixi scene)
    this.coords = null;
    this.extent = null;
    this.hull = null;
    this.centroid = null;
    this.poi = null;
    this.ssr = null;

    this.outer = null;
    this.flatOuter = null;
    this.holes = null;
    this.flatHoles = null;

    this.width = 0;
    this.height = 0;
    this.lod = 0;
  }


  /**
   * update
   * @param  projection  Pixi projection to use for rendering
   * @param  zoom        Effective zoom to use for rendering
   */
  update(projection) {
    if (!this.dirty || !this.origCoords || !this.origExtent) return;  // nothing to do
    this.dirty = false;

    // reset all projected properties
    this.coords = null;
    this.extent = null;
    this.outer = null;
    this.flatOuter = null;
    this.holes = null;
    this.flatHoles = null;
    this.hull = null;
    this.centroid = null;
    this.poi = null;
    this.ssr = null;

    // Points are simple, just project once.
    if (this.type === 'point') {
      this.coords = projection.project(this.origCoords);
      this.extent = new Extent(this.coords);
      this.centroid = this.coords;
      this.width = 0;
      this.height = 0;
      this.lod = 2;  // full detail
      return;
    }

    // A line or a polygon.

    // First, project extent..
    this.extent = new Extent();
    // Watch out, we can't project min/max directly (because Y is flipped).
    // Construct topLeft, bottomRight corners and project those.
    this.extent.min = projection.project([this.origExtent.min[0], this.origExtent.max[1]]);  // top-left
    this.extent.max = projection.project([this.origExtent.max[0], this.origExtent.min[1]]);  // bottom-right

    const [minX, minY] = this.extent.min;
    const [maxX, maxY] = this.extent.max;
    this.width = maxX - minX;
    this.height = maxY - minY;

    // So small, don't waste time on it.
    if (this.width < 4 && this.height < 4) {
      this.lod = 0;
      return;
    }


    // Reproject the coordinate data..
    // Generate both normal coordinate rings and flattened rings at the same time to avoid extra iterations.
    // Preallocate Arrays to avoid garbage collection formerly caused by excessive Array.push()
    const origRings = (this.type === 'line') ? [this.origCoords] : this.origCoords;
    const projRings = new Array(origRings.length);
    const projFlatRings = new Array(origRings.length);

    for (let i = 0; i < origRings.length; ++i) {
      const origRing = origRings[i];
      projRings[i] = new Array(origRing.length);
      projFlatRings[i] = new Array(origRing.length * 2);

      for (let j = 0; j < origRing.length; ++j) {
        const xy = projection.project(origRing[j]);
        projRings[i][j] = xy;
        projFlatRings[i][j * 2] = xy[0];
        projFlatRings[i][j * 2 + 1] = xy[1];
      }
    }

    // Assign outer and holes
    if (this.type === 'line') {
      this.coords = projRings[0];
      this.outer = projRings[0];
      this.flatOuter = projFlatRings[0];
      this.holes = null;
      this.flatHoles = null;
    } else {
      this.coords = projRings;
      this.outer = projRings[0];
      this.flatOuter = projFlatRings[0];
      this.holes = projRings.slice(1);
      this.flatHoles = projFlatRings.slice(1);
    }

    // Calculate hull, centroid, poi, ssr if possible
    if (this.outer.length === 0) {          // no coordinates? - shouldn't happen
      // no-op

    } else if (this.outer.length === 1) {   // single coordinate? - wrong but can happen
      this.centroid = this.outer[0];
      this.origCentroid = projection.invert(this.centroid);
      this.poi = this.centroid;
      this.origPoi = this.origCentroid;

    } else if (this.outer.length === 2) {   // 2 coordinate line
      this.centroid = vecInterp(this.outer[0], this.outer[1], 0.5);  // average the 2 points
      this.origCentroid = projection.invert(this.centroid);
      this.poi = this.centroid;
      this.origPoi = this.origCentroid;

    } else {     // > 2 coordinates...

      // Convex Hull
      if (this.origHull) {   // calculated already, reproject
        this.hull = new Array(this.origHull.length);
        for (let i = 0; i < this.origHull.length; ++i) {
          this.hull[i] = projection.project(this.origHull[i]);
        }
      } else {               // recalculate and store as WGS84
        this.hull = d3_polygonHull(this.outer);
        if (this.hull) {
          this.origHull = new Array(this.hull.length);
          for (let i = 0; i < this.origHull.length; ++i) {
            this.origHull[i] = projection.invert(this.hull[i]);
          }
        }
      }

      // Centroid
      if (this.origCentroid) {   // calculated already, reproject
        this.centroid = projection.project(this.origCentroid);
      } else if (this.hull) {    // recalculate and store as WGS84
        if (this.hull.length === 2) {
          this.centroid = vecInterp(this.hull[0], this.hull[1], 0.5);  // average the 2 points
        } else {
          this.centroid = d3_polygonCentroid(this.hull);
        }
        this.origCentroid = projection.invert(this.centroid);
      }

      // Pole of Inaccessability
      if (this.origPoi) {    // calculated already, reproject
        this.poi = projection.project(this.origPoi);
      } else {               // recalculate and store as WGS84
        this.poi = polylabel(this.coords);   // it expects outer + rings
        this.origPoi = projection.invert(this.poi);
      }

      // Smallest Surrounding Rectangle
      if (this.origSsr) {        // calculated already, reproject
        this.ssr = { angle: this.origSsr.angle, poly: new Array(this.origSsr.poly.length) };
        for (let i = 0; i < this.origSsr.poly.length; ++i) {
          this.ssr.poly[i] = projection.project(this.origSsr.poly[i]);
        }
      } else if (this.hull) {    // recalculate and store as WGS84
        this.ssr = geomGetSmallestSurroundingRectangle(this.hull);
        if (this.ssr) {
          this.origSsr = { angle: this.ssr.angle, poly: new Array(this.ssr.poly.length) };
          for (let i = 0; i < this.ssr.poly.length; ++i) {
            this.origSsr.poly[i] = projection.invert(this.ssr.poly[i]);
          }
        }
      }
    }

    this.lod = 2;   // full detail (for now)
  }


  /**
   * setCoords
   * @param  data  Geometry `Array` (contents depends on the Feature type)
   *
   * 'point' - Single wgs84 coordinate
   *    [lon, lat]
   *
   * 'line' - Array of coordinates
   *    [ [lon, lat], [lon, lat],  … ]
   *
   * 'polygon' - Array of Arrays
   *    [
   *      [ [lon, lat], [lon, lat], … ],   // outer ring
   *      [ [lon, lat], [lon, lat], … ],   // inner rings
   *      …
   *    ]
   */
  setCoords(data) {
    const type = this._inferType(data);
    if (!type) return;  // do nothing if data is missing

    this.reset();
    this.type = type;
    this.origCoords = data;
    this.origExtent = new Extent();

    // Determine extent (bounds)
    const bounds = this.origExtent;

    if (type === 'point') {
      bounds.min = data;
      bounds.max = data;
      this.origCentroid = data;

    } else {
      const origRings = (this.type === 'line') ? [this.origCoords] : this.origCoords;
      for (let i = 0; i < origRings.length; ++i) {
        const origRing = origRings[i];
        for (let j = 0; j < origRing.length; ++j) {
          const [lon, lat] = origRing[j];
          bounds.min = [ Math.min(bounds.min[0], lon), Math.min(bounds.min[1], lat) ];
          bounds.max = [ Math.max(bounds.max[0], lon), Math.max(bounds.max[1], lat) ];
        }
      }
    }

    this.dirty = true;
  }


  /**
   * _inferType
   * Determines what kind of geometry we were passed.
   * @param  arr  Geometry `Array` (contents depends on the Feature type)
   * @return  'point', 'line', 'polygon' or null
   */
  _inferType(data) {
    const a = Array.isArray(data) && data[0];
    if (typeof a === 'number') return 'point';

    const b = Array.isArray(a) && a[0];
    if (typeof b === 'number') return 'line';

    const c = Array.isArray(b) && b[0];
    if (typeof c === 'number') return 'polygon';

    return null;
  }


}
