import { Extent } from '@rapid-sdk/math';


/**
 * utilTotalExtent
 * Returns an `Extent` that contains all of the given Entities or entityIDs.
 * @param   {Array|Set}  vals - Entities -or- EntityIDs
 * @return  {Extent}     Total Extent that contains the given Entities
 */
export function utilTotalExtent(vals, graph) {
  const extent = new Extent();

  for (const val of vals) {
    const entity = (typeof val === 'string' ? graph.hasEntity(val) : val);
    if (entity) {
      extent.extendSelf(entity.extent(graph));
    }
  }

  return extent;
}

/**
 * geojsonFeatures
 * The given GeoJSON may be a single Feature or a FeatureCollection.
 * Here we expand it to an Array of Features.
 * @return {Array}  GeoJSON Features
 */
export function geojsonFeatures(geojson) {
  if (!geojson) return [];
  return (geojson.type === 'FeatureCollection') ? geojson.features : [geojson];
}


/**
 * geojsonExtent
 * @param  {Object}  geojson - a GeoJSON Feature or FeatureCollection
 * @return {Extent}
 */
export function geojsonExtent(geojson) {
  const extent = new Extent();
  if (!geojson) return extent;

  for (const feature of geojsonFeatures(geojson)) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    const type = geometry.type;
    const coords = geometry.coordinates;

    // Treat single types as multi types to keep the code simple
    const parts = /^Multi/.test(type) ? coords : [coords];

    if (/Polygon$/.test(type)) {
      for (const polygon of parts) {
        const outer = polygon[0];  // No need to iterate over inners
        for (const point of outer) {
          extent.extendSelf(point);
        }
      }
    } else if (/LineString$/.test(type)) {
      for (const line of parts) {
        for (const point of line) {
          extent.extendSelf(point);
        }
      }
    } else if (/Point$/.test(type)) {
      for (const point of parts) {
        extent.extendSelf(point);
      }
    }
  }

  return extent;
}


// Adds or removes highlight styling for the specified entities
export function utilHighlightEntities(entityIDs, highlighted, context) {
  const editor = context.systems.editor;
  const map = context.systems.map;
  const scene = map.scene;
  if (!scene) return;  // called too soon?

  if (highlighted) {
    for (const entityID of entityIDs) {
      scene.classData('osm', entityID, 'highlighted');

      // When highlighting a relation, try to highlight its members.
      if (entityID[0] === 'r') {
        const relation = editor.staging.graph.hasEntity(entityID);
        if (!relation) continue;
        for (const member of relation.members) {
          scene.classData('osm', member.id, 'highlighted');
        }
      }
    }

  } else {
    scene.clearClass('highlighted');
  }

  map.immediateRedraw();
}


// Returns whether value looks like a valid color we can display
export function utilIsColorValid(value) {
  // OSM only supports hex or named colors
  if (!value.match(/^(#([0-9a-fA-F]{3}){1,2}|\w+)$/)) {
    return false;
  }
  // see https://stackoverflow.com/a/68217760/1627467
  if (!CSS.supports('color', value) || ['unset', 'inherit', 'initial', 'revert'].includes(value)) {
    return false;
  }

  return true;
}


// `utilSetTransform`
// Applies a CSS transformation to the given selection
export function utilSetTransform(selection, x, y, scale, rotate) {
  const t = `translate3d(${x}px,${y}px,0)`;
  const s = (scale && scale !== 1) ? ` scale(${scale})` : '';
  const r = rotate ? ` rotate(${rotate}rad)` : '';
  return selection.style('transform', `${t}${s}${r}`);
}


/**
 * utilFunctor
 * A functor is just a way of turning anything into a function.
 * This is particulary useful in places where D3 wants a function to be.
 * If passed a function, it returns that function.
 * If passed a value, it returns a function that returns that value.
 * @param   {*} value any value
 * @return  {Function} a function that returns that value or the value if it's a function
 */
export function utilFunctor(value) {
  return (typeof value === 'function') ? value : (() => value);
}


/**
 * utilNoAuto
 * Sets common attributes on `<input>` or `<textarea>` elements to avoid autocomplete and other annoyances.
 * @param   {d3-selection} selection - A d3-selection to a `<input>` or `<textarea>`
 * @return  {d3-selection} same selection but with the attributes set
 */
export function utilNoAuto(selection) {
  const isText = (selection.size() && selection.node().tagName.toLowerCase() === 'textarea');

  // assign 'new-password' even for non-password fields to prevent browsers (Chrome) ignoring 'off'
  // https://developer.mozilla.org/en-US/docs/Web/Security/Securing_your_site/Turning_off_form_autocompletion

  return selection
    .attr('autocomplete',  'new-password')
    .attr('autocorrect', 'off')
    .attr('autocapitalize', 'off')
    .attr('data-1p-ignore', '')      // Rapid#1085
    .attr('data-lpignore', 'true')   // Rapid#1085
    .attr('spellcheck', isText ? 'true' : 'false');
}
