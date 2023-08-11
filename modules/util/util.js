import { Extent } from '@rapid-sdk/math';
import { utilEntityOrDeepMemberSelector } from '@rapid-sdk/util';


// Accepts an array of entities -or- entityIDs
export function utilTotalExtent(array, graph) {
  return array.reduce(function(extent, val) {
    let entity = (typeof val === 'string' ? graph.hasEntity(val) : val);
    if (entity) {
      let other = entity.extent(graph);
      // update extent in place
      extent.min = [ Math.min(extent.min[0], other.min[0]), Math.min(extent.min[1], other.min[1]) ];
      extent.max = [ Math.max(extent.max[0], other.max[0]), Math.max(extent.max[1], other.max[1]) ];
    }
    return extent;
  }, new Extent());
}


// Adds or removes highlight styling for the specified entities
export function utilHighlightEntities(ids, highlighted, context) {
  const scene = context.scene();

  if (highlighted) {
    ids.forEach(id => scene.classData('osm', id, 'highlighted'));
  } else {
    scene.clearClass('highlighted');
  }
  context.systems.map.immediateRedraw();
}


// `utilSetTransform`
// Applies a CSS transformation to the given selection
export function utilSetTransform(selection, x, y, scale, rotate) {
  const t = `translate3d(${x}px,${y}px,0)`;
  const s = scale ? ` scale(${scale})` : '';
  const r = rotate ? ` rotate(${rotate}deg)` : '';
  return selection.style('transform', `${t}${s}${r}`);
}


// a d3.mouse-alike which
// 1. Only works on HTML elements, not SVG
// 2. Does not cause style recalculation
export function utilFastMouse(container) {
  const rect = container.getBoundingClientRect();
  const rectLeft = rect.left;
  const rectTop = rect.top;
  const clientLeft = +container.clientLeft;
  const clientTop = +container.clientTop;
  return function(e) {
    return [
      e.clientX - rectLeft - clientLeft,
      e.clientY - rectTop - clientTop
    ];
  };
}


// wraps an index to an interval [0..length-1]
export function utilWrap(index, length) {
  if (index < 0) {
    index += Math.ceil(-index/length)*length;
  }
  return index % length;
}


/**
 * a replacement for functor
 *
 * @param {*} value any value
 * @returns {Function} a function that returns that value or the value if it's a function
 */
export function utilFunctor(value) {
  return (typeof value === 'function') ? value : (() => value);
}


export function utilNoAuto(selection) {
  const isText = (selection.size() && selection.node().tagName.toLowerCase() === 'textarea');

  return selection
    // assign 'new-password' even for non-password fields to prevent browsers (Chrome) ignoring 'off'
    .attr('autocomplete', 'new-password')
    .attr('autocorrect', 'off')
    .attr('autocapitalize', 'off')
    .attr('spellcheck', isText ? 'true' : 'false');
}
