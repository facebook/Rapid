import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { utilUniqueString } from '@rapid-sdk/util';

import { uiIcon } from './icon.js';
import { uiTooltip } from './tooltip.js';
// import { uiFieldHelp } from './field_help.js';
import { uiFields } from './fields/index.js';
import { uiTagReference } from './tag_reference.js';
import { utilRebind, utilTotalExtent } from '../util/index.js';
import { LANGUAGE_SUFFIX_REGEX } from './fields/localized.js';


/**
 * UiField
 * Creates a new field, wraps the actual _internal implementation of that field
 */
export class UiField {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context, presetField, entityIDs = [], options = {}) {
    this.context = context;
    this.presetField = presetField;
    this.entityIDs = entityIDs;

    this.options = Object.assign({
      show: true,
      wrap: true,
      remove: true,
      revert: true,
      info: true
    }, options);

//    // Don't show the remove and revert buttons if any of the entity IDs are FB features
//    // with source=digitalglobe or source=maxar
//    const someFbRoadsSelected = entityIDs ? entityIDs.some(function(entity) {
//      return entity.__fbid__ && (entity.tags.source === 'maxar' || entity.tags.source === 'digitalglobe');
//    }) : false;
//    if (someFbRoadsSelected) {
//      this.options.remove = false;
//      this.options.revert = false;
//    }

    // copy some commonly used stuff from the presetField
    this.id = presetField.id;
    this.type = presetField.type;
    this.title = presetField.title();
    this.label = presetField.label();
    this.terms = presetField.terms();
    this.placeholder = presetField.placeholder();
    this.default = presetField.default;
    this.key = presetField.key;
    this.keys = presetField.keys;
    this.safeid = presetField.safeid;
    this.t = presetField.t;
    this.tHtml = presetField.tHtml;
    this.hasTextForStringID = presetField.hasTextForStringID;
    this.uid = utilUniqueString(`form-field-${presetField.safeid}`);

    this._show = this.options.show;
    this._internal = null;
    this._state = '';
    this._tags = {};

    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const l10n = context.systems.l10n;

    this.entityExtent = null;
    if (entityIDs?.length) {
      this.entityExtent = utilTotalExtent(entityIDs, graph);
    }

    this._locked = false;
    this._lockedTip = uiTooltip(context)
      .title(l10n.t('inspector.lock.suggestion', { label: this.label }))
      .placement('bottom');


    this.dispatch = d3_dispatch('change', 'revert');
    utilRebind(this, this.dispatch, 'on');

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.isAllowed = this.isAllowed.bind(this);
    this.isModified = this.isModified.bind(this);
    this.isShown = this.isShown.bind(this);
    this.remove = this.remove.bind(this);
    this.render = this.render.bind(this);
    this.revert = this.revert.bind(this);
    this.tagsContainFieldKey = this.tagsContainFieldKey.bind(this);

    // Create the field internals now if we know it will be shown
    if (this._show) {
      this._createField();
    }
  }


  // Creates the field.. This is done lazily,
  // once we know that the field will be shown.
  _createField() {
    if (this._internal) return;

    this._internal = uiFields[this.type](this.context, this)
      .on('change', (tagChange, onInput) => {
        this.dispatch.call('change', this, tagChange, onInput);
      });

    // If this field cares about the entities, pass them along
    if (typeof this._internal.entityIDs === 'function') {
      this._internal.entityIDs(this.entityIDs);
    }
  }


  isModified() {
    if (!this.entityIDs?.length) return false;

    const editor = this.context.systems.editor;
    const baseGraph = editor.base.graph;
    const currGraph = editor.staging.graph;

    return this.entityIDs.some(entityID => {
      const original = baseGraph.hasEntity(entityID);
      const current = currGraph.hasEntity(entityID);
      return this.keys.some(key => {
        return original ? current.tags[key] !== original.tags[key] : current.tags[key];
      });
    });
  }


  tagsContainFieldKey() {
    return this.keys.some(key => {

      if (this.type === 'multiCombo') {
        for (const tagKey in this._tags) {
          if (tagKey.indexOf(key) === 0) {
            return true;
          }
        }
        return false;

      } else if (this.type === 'localized') {
        for (const tagKey in this._tags) {
          // Matches 'key:<code>', where <code> is a BCP47 locale code.
          const match = tagKey.match(LANGUAGE_SUFFIX_REGEX);
          if (match && match[1] === this.key && match[2]) {
            return true;
          }
        }
      }

      return this._tags[key] !== undefined;
    });
  }


  revert(d3_event) {
    d3_event.stopPropagation();
    d3_event.preventDefault();
    if (!this.entityIDs?.length || this._locked) return;

    // Crossings.. :-(  If reverting any of these, revert the related ones.  Rapid#1260
    const keys = new Set(this.keys);
    if (keys.has('crossing')) {
      keys.add('crossing:markings');
      keys.add('crossing:signals');
    }
    if (keys.has('crossing:markings') || keys.has('crossing:signals')) {
      keys.add('crossing');
    }

    this.dispatch.call('revert', this, [...keys]);
  }


  remove(d3_event) {
    d3_event.stopPropagation();
    d3_event.preventDefault();
    if (this._locked) return;

    // Crossings.. :(  If removing any of these, remove the related ones.  Rapid#1260
    const keys = new Set(this.keys);
    if (keys.has('crossing')) {
      keys.add('crossing:markings');
      keys.add('crossing:signals');
    }
    if (keys.has('crossing:markings') || keys.has('crossing:signals')) {
      keys.add('crossing');
    }

    const tagChange = {};
    for (const k of keys) {
      tagChange[k] = undefined;
    }
    this.dispatch.call('change', this, tagChange);
  }



  /**
   * render
   * @param  `selection`  A d3-selection to a parent element that the field should render itself into
   */
  render(selection) {
    const l10n = this.context.systems.l10n;

    let container = selection.selectAll('.form-field')
      .data([this]);

    // Enter
    let enter = container.enter()
      .append('div')
      .attr('class', `form-field form-field-${this.safeid}`)
      .classed('nowrap', !this.options.wrap);

    if (this.options.wrap) {
      let labelEnter = enter
        .append('label')
        .attr('class', 'field-label')
        .attr('for', this.uid);

      let textEnter = labelEnter
        .append('span')
        .attr('class', 'label-text');

      textEnter
        .append('span')
        .attr('class', 'label-textvalue')
        .html(this.label);

      textEnter
        .append('span')
        .attr('class', 'label-textannotation');

      if (this.options.remove) {
        labelEnter
          .append('button')
          .attr('class', 'remove-icon')
          .attr('title', l10n.t('icons.remove'))
          .call(uiIcon('#rapid-operation-delete'));
      }

      if (this.options.revert) {
        labelEnter
          .append('button')
          .attr('class', 'modified-icon')
          .attr('title', l10n.t('icons.undo'))
          .call(uiIcon(l10n.isRTL() ? '#rapid-icon-redo' : '#rapid-icon-undo'));
      }
    }


    // Update
    container = container
      .merge(enter);

    container.select('.field-label > .remove-icon')  // propagate bound data
      .on('click', this.remove);

    container.select('.field-label > .modified-icon')  // propagate bound data
      .on('click', this.revert);

// kind of a convoluted way to do it.. selection.each over one thing that is just `this`? :-/
    container
      .each((d, i, nodes) => {
        let selection = d3_select(nodes[i]);

        if (!this._internal) {
          this._createField();
        }

//        // instantiate field help
//        let help;
//        if (this.options.wrap && this.type === 'restrictions') {
//           help = uiFieldHelp(this.context, 'restrictions');
//        }

        // instantiate tag reference
        let reference;
        if (this.options.wrap && this.options.info) {
          let referenceKey = this.key || '';
          if (this.type === 'multiCombo') {   // lookup key without the trailing ':'
            referenceKey = referenceKey.replace(/:$/, '');
          }

          reference = uiTagReference(this.context, this.reference || { key: referenceKey });
          if (this._state === 'hover') {
            reference.showing(false);
          }
        }

        selection
          .call(this._internal);

//        // add field help components
//        if (help) {
//          selection
//            .call(help.body)
//            .select('.field-label')
//            .call(help.button);
//        }

        // add tag reference components
        if (reference) {
          selection
            .call(reference.body)
            .select('.field-label')
            .call(reference.button);
        }

        this._internal.tags(this._tags);
      });


    container
      .classed('locked', this._locked)
      .classed('modified', this.isModified())
      .classed('present', this.tagsContainFieldKey());

    // show a tip and lock icon if the field is locked
    let annotation = container.selectAll('.field-label .label-textannotation');
    let icon = annotation.selectAll('.icon')
      .data(this._locked ? [0]: []);

    icon.exit()
      .remove();

    icon.enter()
      .append('svg')
      .attr('class', 'icon')
      .append('use')
      .attr('xlink:href', '#fas-lock');

    container.call(this._locked ? this._lockedTip : this._lockedTip.destroy);
  }



  // old style getter/setters

  state(val) {
    if (val === undefined) return this._state;
    this._state = val;
    return this;
  }


  tags(val) {
    if (val === undefined) return this._tags;
    this._tags = val;

    // always show a field if it has a value to display
    if (this.tagsContainFieldKey() && !this._show) {
      this._show = true;
      if (!this._internal) {
        this._createField();
      }
    }

    return this;
  }


  locked(val) {
    if (val === undefined) return this._locked;
    this._locked = val;
    return this;
  }


  show() {
    this._show = true;
    if (!this._internal) {
      this._createField();
    }
    if (this.default && this.key && this._tags[this.key] !== this.default) {
      let tagChange = {};
      tagChange[this.key] = this.default;
      this.dispatch.call('change', this, tagChange);
    }
  }


  // A shown field has a visible UI, a non-shown field is in the 'Add field' dropdown
  isShown() {
    return this._show;
  }


  /**
   * isAllowed
   * An allowed field can appear in the UI or in the 'Add field' dropdown.
   * A non-allowed field is hidden from the user altogether
   * Some reasons why a field may be hidden:
   *   - the user has selected multiple things and they don't all apply to the field
   *   - the field is not available in the location where the user is editing
   *
   * @return `true` if the field can be shown, `false` if the field should be hidden
   */
  isAllowed() {
    const context = this.context;
    const graph = context.systems.editor.staging.graph;
    const locations = context.systems.locations;
    const presetField = this.presetField;

    // Most of the time we have entityIDs to consider, but if not, just return `true`.
    // For example: the fields on the upload dialog that set the changeset tags.
    if (!this.entityIDs?.length) return true;

    // Does this field support multiselection?
    if (this.entityIDs.length > 1 && uiFields[this.type].supportsMultiselection === false) {
      return false;
    }

    // Does this field work with all the geometries of the entities selected?
    if (presetField.geometry && !this.entityIDs.every(entityID => {
      return presetField.matchGeometry(graph.geometry(entityID));
    })) {
      return false;
    }

    // Is this field allowed in this location?
    if (this.entityExtent && presetField.locationSetID) {
      const validHere = locations.locationSetsAt(this.entityExtent.center());
      if (!validHere[presetField.locationSetID]) return false;
    }

    // Does this field require another tag to be set first?
    // (ignore tagging prerequisites if the field already has a value)
    const prerequisiteTag = presetField.prerequisiteTag;
    if (prerequisiteTag && !this.tagsContainFieldKey()) {
      const isPrerequisiteSatisfied = this.entityIDs.every(entityID => {
        const entity = graph.entity(entityID);
        if (prerequisiteTag.key) {
          const value = entity.tags[prerequisiteTag.key];
          if (!value) return false;

          if (prerequisiteTag.valueNot) {
            return prerequisiteTag.valueNot !== value;
          }
          if (prerequisiteTag.value) {
            return prerequisiteTag.value === value;
          }
        } else if (prerequisiteTag.keyNot) {
          if (entity.tags[prerequisiteTag.keyNot]) return false;
        }
        return true;
      });

      if (!isPrerequisiteSatisfied) return false;
    }

    return true;
  }


  focus() {
    if (this._internal) {
      this._internal.focus();
    }
  }

}
