import { geoSphericalDistance, vecNormalizedDot } from '@rapid-sdk/math';
import { uiCmd } from '../cmd.js';

/**
 * Insert an icon
 */
export function icon(name, klass) {
  // Generate alt text for interaction icons
  let title = '';
  const matched = name.toLowerCase().match(/^#rapid-interaction-(.*)$/);
  if (matched) {
    title = '<title>' + matched[1].replace(/\-/g, ' ') + '</title>';
  }

  const svgklass = 'icon' + (klass ? ` ${klass}` : '');
  return `<svg class="${svgklass}">${title}<use xlink:href="${name}"></use></svg>`;
}


/**
 * Event handler that just cancels the event
 */
export function eventCancel(d3_event) {
  d3_event.stopPropagation();
  d3_event.preventDefault();
}


// Returns the localized HTML element for `id` with a standardized set of icon, key, and
// label replacements suitable for tutorials and documentation. Optionally supplemented
// with custom `replacements`
let helpStringReplacements;
export function helpHtml(context, id, replacements) {
  const l10n = context.systems.l10n;
  const isRTL = l10n.isRTL();

  // only load these the first time
  if (!helpStringReplacements) {
    helpStringReplacements = {
      // insert icons corresponding to various UI elements
      point_icon: icon('#rapid-icon-point', 'inline'),
      line_icon: icon('#rapid-icon-line', 'inline'),
      area_icon: icon('#rapid-icon-area', 'inline'),
      note_icon: icon('#rapid-icon-note', 'inline add-note'),
      plus: icon('#rapid-icon-plus', 'inline'),
      minus: icon('#rapid-icon-minus', 'inline'),
      layers_icon: icon('#rapid-icon-layers', 'inline'),
      data_icon: icon('#rapid-icon-data', 'inline'),
      inspect: icon('#rapid-icon-inspect', 'inline'),
      help_icon: icon('#rapid-icon-help', 'inline'),
      undo_icon: icon(isRTL ? '#rapid-icon-redo' : '#rapid-icon-undo', 'inline'),
      redo_icon: icon(isRTL ? '#rapid-icon-undo' : '#rapid-icon-redo', 'inline'),
      save_icon: icon('#rapid-icon-save', 'inline'),

      // operation icons
      circularize_icon: icon('#rapid-operation-circularize', 'operation'),
      continue_icon: icon('#rapid-operation-continue', 'operation'),
      copy_icon: icon('#rapid-operation-copy', 'operation'),
      delete_icon: icon('#rapid-operation-delete', 'operation'),
      disconnect_icon: icon('#rapid-operation-disconnect', 'operation'),
      downgrade_icon: icon('#rapid-operation-downgrade', 'operation'),
      extract_icon: icon('#rapid-operation-extract', 'operation'),
      merge_icon: icon('#rapid-operation-merge', 'operation'),
      move_icon: icon('#rapid-operation-move', 'operation'),
      orthogonalize_icon: icon('#rapid-operation-orthogonalize', 'operation'),
      paste_icon: icon('#rapid-operation-paste', 'operation'),
      reflect_long_icon: icon('#rapid-operation-reflect-long', 'operation'),
      reflect_short_icon: icon('#rapid-operation-reflect-short', 'operation'),
      reverse_icon: icon('#rapid-operation-reverse', 'operation'),
      rotate_icon: icon('#rapid-operation-rotate', 'operation'),
      split_icon: icon('#rapid-operation-split', 'operation'),
      straighten_icon: icon('#rapid-operation-straighten', 'operation'),

      // interaction icons
      keyboard_arrows_all: icon('#rapid-interaction-keyboard-arrows-all', 'operation'),
      keyboard_arrows_down: icon('#rapid-interaction-keyboard-arrows-down', 'operation'),
      keyboard_arrows_left: icon('#rapid-interaction-keyboard-arrows-left', 'operation'),
      keyboard_arrows_right: icon('#rapid-interaction-keyboard-arrows-right', 'operation'),
      keyboard_arrows_up: icon('#rapid-interaction-keyboard-arrows-up', 'operation'),
      keyboard_arrows_up_down: icon('#rapid-interaction-keyboard-arrows-up-down', 'operation'),
      keyboard_arrows_left_right: icon('#rapid-interaction-keyboard-arrows-left-right', 'operation'),
      mouse_left_icon: icon('#rapid-interaction-mouse-left', 'operation'),
      mouse_right_icon: icon('#rapid-interaction-mouse-right', 'operation'),
      mouse_wheel_icon: icon('#rapid-interaction-mouse-wheel', 'operation'),
      onefinger_tap_icon: icon('#rapid-interaction-onefinger-tap', 'operation'),
      onefinger_tap_and_hold_icon: icon('#rapid-interaction-onefinger-tap-and-hold', 'operation'),
      onefinger_tap_and_drag_icon: icon('#rapid-interaction-onefinger-tap-and-drag', 'operation'),
      twofinger_tap_and_drag_icon: icon('#rapid-interaction-twofinger-tap-and-drag', 'operation'),
      twofinger_pinch_icon: icon('#rapid-interaction-twofinger-pinch', 'operation'),
      twofinger_zoom_icon: icon('#rapid-interaction-twofinger-zoom', 'operation'),
      twofinger_rotate_icon: icon('#rapid-interaction-twofinger-rotate', 'operation'),

      // insert keys; may be localized and platform-dependent
      shift: uiCmd.display(context, '⇧'),
      option: uiCmd.display(context, '⌥'),
      control: uiCmd.display(context, '⌃'),
      return: uiCmd.display(context, '↵'),
      esc: uiCmd.display(context, '⎋'),
      space: l10n.t('shortcuts.key.space'),
      add_note_key: l10n.t('modes.add_note.key'),
      help_key: l10n.t('help.key'),
      shortcuts_key: l10n.t('shortcuts.toggle.key'),

      // reference localized UI labels directly so that they'll always match
      save: l10n.t('save.title'),
      undo: l10n.t('undo.title'),
      redo: l10n.t('redo.title'),
      upload: l10n.t('commit.save'),
      point: l10n.t('modes.add_point.title'),
      line: l10n.t('modes.add_line.title'),
      area: l10n.t('modes.add_area.title'),
      note: l10n.t('modes.add_note.title'),

      circularize: l10n.t('operations.circularize.title'),
      continue: l10n.t('operations.continue.title'),
      copy: l10n.t('operations.copy.title'),
      delete: l10n.t('operations.delete.title'),
      disconnect: l10n.t('operations.disconnect.title'),
      downgrade: l10n.t('operations.downgrade.title'),
      extract: l10n.t('operations.extract.title'),
      merge: l10n.t('operations.merge.title'),
      move: l10n.t('operations.move.title'),
      orthogonalize: l10n.t('operations.orthogonalize.title'),
      paste: l10n.t('operations.paste.title'),
      reflect_long: l10n.t('operations.reflect.title.long'),
      reflect_short: l10n.t('operations.reflect.title.short'),
      reverse: l10n.t('operations.reverse.title'),
      rotate: l10n.t('operations.rotate.title'),
      split: l10n.t('operations.split.title'),
      straighten: l10n.t('operations.straighten.title'),

      map_data: l10n.t('map_data.title'),
      osm_notes: l10n.t('map_data.layers.notes.title'),
      fields: l10n.t('inspector.fields'),
      tags: l10n.t('inspector.tags'),
      relations: l10n.t('inspector.relations'),
      new_relation: l10n.t('inspector.new_relation'),
      turn_restrictions: l10n.t('_tagging.presets.fields.restrictions.label'),
      background_settings: l10n.t('background.description'),
      imagery_offset: l10n.t('background.fix_misalignment'),
      start_the_walkthrough: l10n.t('splash.walkthrough'),
      help: l10n.t('help.title'),
      ok: l10n.t('intro.ok')
    };
  }

  let reps;
  if (replacements) {
    reps = Object.assign(replacements, helpStringReplacements);
  } else {
    reps = helpStringReplacements;
  }

  return l10n.tHtml(id, reps).replace(/\`(.*?)\`/g, '<kbd>$1</kbd>');   // use keyboard key styling for shortcuts
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
function _checkKey(context, key, text) {
  const l10n = context.systems.l10n;
  if (l10n.t(key, { default: undefined }) === undefined) {
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
export function localize(context, obj) {
  const l10n = context.systems.l10n;
  let key;

  // Assign name if entity has one..
  let name = obj.tags && obj.tags.name;
  if (name) {
    key = 'intro.graph.name.' + slugify(name);
    obj.tags.name = l10n.t(key, { default: name });
    _checkKey(context, key, name);
  }

  // Assign street name if entity has one..
  let street = obj.tags && obj.tags['addr:street'];
  if (street) {
    key = 'intro.graph.name.' + slugify(street);
    obj.tags['addr:street'] = l10n.t(key, { default: street });
    _checkKey(context, key, street);

    // Add address details common across walkthrough..
    const addrTags = [
      'block_number', 'city', 'county', 'district', 'hamlet', 'neighbourhood',
      'postcode', 'province', 'quarter', 'state', 'subdistrict', 'suburb'
    ];

    for (const k of addrTags) {
      const key = `intro.graph.${k}`;
      const tag = `addr:${k}`;
      const val = obj.tags && obj.tags[tag];
      const str = l10n.t(key, { default: val });

      if (str) {
        if (str.match(/^<.*>$/) !== null) {   // A placeholder string like "<value for addr:state>"
          delete obj.tags[tag];               // In this situation we don't actually want the tag.
        } else {
          obj.tags[tag] = str;
        }
      }
    }
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
