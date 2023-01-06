import { t, localizer } from '../../core/localizer';
import { vecNormalizedDot } from '@id-sdk/math';
import { geoSphericalDistance } from '@id-sdk/geo';
import { uiCmd } from '../cmd';

/**
 * icon
 */
export function icon(name, svgklass, useklass) {
  return '<svg class="icon ' + (svgklass || '') + '">' +
    '<use xlink:href="' + name + '"' +
    (useklass ? ' class="' + useklass + '"' : '') + '></use></svg>';
}


// Returns the localized HTML element for `id` with a standardized set of icon, key, and
// label replacements suitable for tutorials and documentation. Optionally supplemented
// with custom `replacements`
let helpStringReplacements;
export function helpHtml(id, replacements) {
  // only load these the first time
  if (!helpStringReplacements) {
    helpStringReplacements = {
      // insert icons corresponding to various UI elements
      point_icon: icon('#iD-icon-point', 'inline'),
      line_icon: icon('#iD-icon-line', 'inline'),
      area_icon: icon('#iD-icon-area', 'inline'),
      note_icon: icon('#iD-icon-note', 'inline add-note'),
      plus: icon('#iD-icon-plus', 'inline'),
      minus: icon('#iD-icon-minus', 'inline'),
      layers_icon: icon('#iD-icon-layers', 'inline'),
      data_icon: icon('#iD-icon-data', 'inline'),
      inspect: icon('#iD-icon-inspect', 'inline'),
      help_icon: icon('#iD-icon-help', 'inline'),
      undo_icon: icon(localizer.textDirection() === 'rtl' ? '#iD-icon-redo' : '#iD-icon-undo', 'inline'),
      redo_icon: icon(localizer.textDirection() === 'rtl' ? '#iD-icon-undo' : '#iD-icon-redo', 'inline'),
      save_icon: icon('#iD-icon-save', 'inline'),

      // operation icons
      circularize_icon: icon('#iD-operation-circularize', 'inline operation'),
      continue_icon: icon('#iD-operation-continue', 'inline operation'),
      copy_icon: icon('#iD-operation-copy', 'inline operation'),
      delete_icon: icon('#iD-operation-delete', 'inline operation'),
      disconnect_icon: icon('#iD-operation-disconnect', 'inline operation'),
      downgrade_icon: icon('#iD-operation-downgrade', 'inline operation'),
      extract_icon: icon('#iD-operation-extract', 'inline operation'),
      merge_icon: icon('#iD-operation-merge', 'inline operation'),
      move_icon: icon('#iD-operation-move', 'inline operation'),
      orthogonalize_icon: icon('#iD-operation-orthogonalize', 'inline operation'),
      paste_icon: icon('#iD-operation-paste', 'inline operation'),
      reflect_long_icon: icon('#iD-operation-reflect-long', 'inline operation'),
      reflect_short_icon: icon('#iD-operation-reflect-short', 'inline operation'),
      reverse_icon: icon('#iD-operation-reverse', 'inline operation'),
      rotate_icon: icon('#iD-operation-rotate', 'inline operation'),
      split_icon: icon('#iD-operation-split', 'inline operation'),
      straighten_icon: icon('#iD-operation-straighten', 'inline operation'),

      // interaction icons
      leftclick: icon('#iD-walkthrough-mouse-left', 'inline operation'),
      rightclick: icon('#iD-walkthrough-mouse-right', 'inline operation'),
      mousewheel_icon: icon('#iD-walkthrough-mousewheel', 'inline operation'),
      tap_icon: icon('#iD-walkthrough-tap', 'inline operation'),
      doubletap_icon: icon('#iD-walkthrough-doubletap', 'inline operation'),
      longpress_icon: icon('#iD-walkthrough-longpress', 'inline operation'),
      touchdrag_icon: icon('#iD-walkthrough-touchdrag', 'inline operation'),
      pinch_icon: icon('#iD-walkthrough-pinch-apart', 'inline operation'),

      // insert keys; may be localized and platform-dependent
      shift: uiCmd.display('⇧'),
      alt: uiCmd.display('⌥'),
      return: uiCmd.display('↵'),
      esc: t.html('shortcuts.key.esc'),
      space: t.html('shortcuts.key.space'),
      add_note_key: t.html('modes.add_note.key'),
      help_key: t.html('help.key'),
      shortcuts_key: t.html('shortcuts.toggle.key'),

      // reference localized UI labels directly so that they'll always match
      save: t.html('save.title'),
      undo: t.html('undo.title'),
      redo: t.html('redo.title'),
      upload: t.html('commit.save'),
      point: t.html('modes.add_point.title'),
      line: t.html('modes.add_line.title'),
      area: t.html('modes.add_area.title'),
      note: t.html('modes.add_note.label'),

      circularize: t.html('operations.circularize.title'),
      continue: t.html('operations.continue.title'),
      copy: t.html('operations.copy.title'),
      delete: t.html('operations.delete.title'),
      disconnect: t.html('operations.disconnect.title'),
      downgrade: t.html('operations.downgrade.title'),
      extract: t.html('operations.extract.title'),
      merge: t.html('operations.merge.title'),
      move: t.html('operations.move.title'),
      orthogonalize: t.html('operations.orthogonalize.title'),
      paste: t.html('operations.paste.title'),
      reflect_long: t.html('operations.reflect.title.long'),
      reflect_short: t.html('operations.reflect.title.short'),
      reverse: t.html('operations.reverse.title'),
      rotate: t.html('operations.rotate.title'),
      split: t.html('operations.split.title'),
      straighten: t.html('operations.straighten.title'),

      map_data: t.html('map_data.title'),
      osm_notes: t.html('map_data.layers.notes.title'),
      fields: t.html('inspector.fields'),
      tags: t.html('inspector.tags'),
      relations: t.html('inspector.relations'),
      new_relation: t.html('inspector.new_relation'),
      turn_restrictions: t.html('_tagging.presets.fields.restrictions.label'),
      background_settings: t.html('background.description'),
      imagery_offset: t.html('background.fix_misalignment'),
      start_the_walkthrough: t.html('splash.walkthrough'),
      help: t.html('help.title'),
      ok: t.html('intro.ok')
    };
  }

  var reps;
  if (replacements) {
    reps = Object.assign(replacements, helpStringReplacements);
  } else {
    reps = helpStringReplacements;
  }

  return t.html(id, reps).replace(/\`(.*?)\`/g, '<kbd>$1</kbd>');   // use keyboard key styling for shortcuts
}


/**
 * slugify
 * @param  text
 */
function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with '-'
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple '-' with single '-'
    .replace(/^-+/, '')             // Trim '-' from start of text
    .replace(/-+$/, '');            // Trim '-' from end of text
}


export let missingStrings = {};

/**
 * _checkKey
 * Warn about any missing walkthrough names
 * @param  key
 * @param  text
 */
function _checkKey(key, text) {
  if (t(key, { default: undefined }) === undefined) {
    if (missingStrings.hasOwnProperty(key)) return;  // warn once
    missingStrings[key] = text;
    const missing = `${key}: ${text}`;
    if (typeof console !== 'undefined') console.log(missing); // eslint-disable-line
  }
}

/**
 * localize
 * Localize the given walkthrough entity
 * @param  obj
 */
export function localize(obj) {
  let key;

  // Assign name if entity has one..
  let name = obj.tags && obj.tags.name;
  if (name) {
    key = 'intro.graph.name.' + slugify(name);
    obj.tags.name = t(key, { default: name });
    _checkKey(key, name);
  }

  // Assign street name if entity has one..
  let street = obj.tags && obj.tags['addr:street'];
  if (street) {
    key = 'intro.graph.name.' + slugify(street);
    obj.tags['addr:street'] = t(key, { default: street });
    _checkKey(key, street);

    // Add address details common across walkthrough..
    const ADDR_TAGS = [
      'block_number', 'city', 'county', 'district', 'hamlet', 'neighbourhood',
      'postcode', 'province', 'quarter', 'state', 'subdistrict', 'suburb'
    ];
    ADDR_TAGS.forEach(k => {
      const key = `intro.graph.${k}`;
      const tag = `addr:${k}`;
      const val = obj.tags && obj.tags[tag];
      const str = t(key, { default: val });

      if (str) {
        if (str.match(/^<.*>$/) !== null) {
          delete obj.tags[tag];
        } else {
          obj.tags[tag] = str;
        }
      }
    });
  }

  return obj;
}


/**
 * isMostlySquare
 * Used to detect squareness.. some duplicataion of code from actionOrthogonalize.
 * @param  points
 */
export function isMostlySquare(points) {
  // note: uses 15 here instead of the 12 from actionOrthogonalize because
  // actionOrthogonalize can actually straighten some larger angles as it iterates
  const threshold = 15; // degrees within right or straight
  const lowerBound = Math.cos((90 - threshold) * Math.PI / 180);  // near right
  const upperBound = Math.cos(threshold * Math.PI / 180);         // near straight

  for (let i = 0; i < points.length; i++) {
    const a = points[(i - 1 + points.length) % points.length];
    const origin = points[i];
    const b = points[(i + 1) % points.length];

    const dotp = vecNormalizedDot(a, b, origin);
    const mag = Math.abs(dotp);
    if (mag > lowerBound && mag < upperBound) {
      return false;
    }
  }

  return true;
}


/**
 * transitionTime
 * Take a bit more time if the locations are further apart
 * @param   loc1  `Array` [lon,lat]
 * @param   loc2  `Array` [lon,lat]
 * @return  milliseconds to ease from `loc1` to `loc2`
 */
export function transitionTime(loc1, loc2) {
  const dist = geoSphericalDistance(loc1, loc2);
  if (dist < 1e-4) {
    return 0;
  } else if (dist < 200) {   // meters
    return 500;
  } else {
    return 1000;
  }
}


/**
 * delayAsync
 * Wait for animations or other stuff to finish before continuing.
 * We have a bunch of animations that happen all throughout the app.
 * For example, to open preset picker or side panes.
 * History transitions finish in 150ms, and the default for d3 transition is 250ms.
 * @param  ms  milliseconds of delay (defaults to 300)
 * @return Promise that settles after the delay
 */
export function delayAsync(ms = 300) {
  return new Promise(resolve => window.setTimeout(resolve, ms));  // eslint-disable-line no-promise-executor-return
}
