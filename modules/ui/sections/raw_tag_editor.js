import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { utilArrayDifference, utilArrayIdentical, utilTagDiff } from '@rapid-sdk/util';

import { uiIcon } from '../icon.js';
import { uiCombobox } from '../combobox.js';
import { uiSection } from '../section.js';
import { uiTagReference } from '../tag_reference.js';
import { utilGetSetValue, utilNoAuto, utilRebind } from '../../util/index.js';


export function uiSectionRawTagEditor(context, id) {
  const assets = context.systems.assets;
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const storage = context.systems.storage;
  const taginfo = context.services.taginfo;
  const dispatch = d3_dispatch('change');

  const availableViews = [
    { id: 'list', icon: '#fas-th-list' },
    { id: 'text', icon: '#fas-i-cursor' }
  ];

  let section = uiSection(context, id)
    .classes('raw-tag-editor')
    .label(() => {
      const count = Object.keys(_tags).filter(Boolean).length;
      return l10n.t('inspector.title_count', { title: l10n.t('inspector.tags'), count: count });
    })
    .disclosureContent(renderDisclosureContent);


  let _discardKeys = new Set();
  assets.loadAssetAsync('tagging_discarded')
    .then(data => _discardKeys = new Set(Object.keys(data)));

  let _tagView = storage.getItem('raw-tag-editor-view') || 'list';   // 'list, 'text'
  let _readOnlyTags = [];
  let _orderedKeys = [];   // the keys in the order we want them to display
  let _didFocus = false;
  let _showBlank = false;
  let _pendingChange = null;
  let _state;    // can be 'hide', 'hover', or 'select'
  let _presets;
  let _tags;
  let _entityIDs = [];


  function renderDisclosureContent(wrap) {
    // remove deleted keys
    _orderedKeys = _orderedKeys.filter(k => _tags[k] !== undefined);

    // When switching to a different entity or changing the state (hover/select)
    // reorder the keys alphabetically.
    // We trigger this by emptying the `_orderedKeys` array, then it will be rebuilt here.
    // Otherwise leave their order alone - iD#5857, iD#5927
    const all = Object.keys(_tags).sort();
    const missingKeys = utilArrayDifference(all, _orderedKeys);
    for (let i in missingKeys) {
      _orderedKeys.push(missingKeys[i]);
    }

    // assemble row data
    const rowData = _orderedKeys.map((key, index) => {
      return { index: index, key: key, value: _tags[key] };
    });

    // append blank row last, if necessary
    if (!rowData.length || _showBlank) {
      _showBlank = false;
      rowData.push({ index: rowData.length, key: '', value: '' });
    }


    // View Options
    const options = wrap.selectAll('.raw-tag-options')
      .data([0]);

    const optionsEnter = options.enter()
      .insert('div', ':first-child')
      .attr('class', 'raw-tag-options');

    const optionEnter = optionsEnter.selectAll('.raw-tag-option')
      .data(availableViews, d => d.id)
      .enter();

    optionEnter
      .append('button')
      .attr('class', d => `raw-tag-option raw-tag-option-${d.id}` + (_tagView === d.id ? ' selected' : ''))
      .attr('title', d => l10n.t(`icons.${d.id}`))
      .on('click', function(d3_event, clicked) {
        _tagView = clicked.id;
        storage.setItem('raw-tag-editor-view', clicked.id);

        wrap.selectAll('.raw-tag-option')
          .classed('selected', d => d === clicked);

        wrap.selectAll('.tag-text')
          .classed('hide', (clicked.id !== 'text'))
          .each(setTextareaHeight);

        wrap.selectAll('.tag-list, .add-row')
          .classed('hide', (clicked.id !== 'list'));
      })
      .each((d, i, nodes) => {
        d3_select(nodes[i])
          .call(uiIcon(d.icon));
      });


    // View as Text
    const textData = rowsToText(rowData);
    let textarea = wrap.selectAll('.tag-text')
      .data([0]);

    textarea = textarea.enter()
      .append('textarea')
      .attr('class', 'tag-text' + (_tagView !== 'text' ? ' hide' : ''))
      .call(utilNoAuto)
      .attr('placeholder', l10n.t('inspector.key_value'))
      .attr('spellcheck', 'false')
      .merge(textarea);

    textarea
      .call(utilGetSetValue, textData)
      .each(setTextareaHeight)
      .on('input', setTextareaHeight)
      .on('focus', onFocus)
      .on('blur', textChanged)
      .on('change', textChanged);


    // View as List
    let list = wrap.selectAll('.tag-list')
      .data([0]);

    list = list.enter()
      .append('ul')
      .attr('class', 'tag-list' + (_tagView !== 'list' ? ' hide' : ''))
      .merge(list);


    // Container for the Add button
    const addRowEnter = wrap.selectAll('.add-row')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'add-row' + (_tagView !== 'list' ? ' hide' : ''));

    addRowEnter
      .append('button')
      .attr('class', 'add-tag')
      .call(uiIcon('#rapid-icon-plus', 'light'))
      .on('click', addTag);

    addRowEnter
      .append('div')
      .attr('class', 'space-value');   // preserve space

    addRowEnter
      .append('div')
      .attr('class', 'space-buttons');  // preserve space


    // Tag list items
    let items = list.selectAll('.tag-row')
      .data(rowData, d => d.key);

    items.exit()
      .each((d, i, nodes) => {
        const row = d3_select(nodes[i]);
        row.selectAll('input.key, input.value')
          .call(uiCombobox.off, context);
      })
      .remove();


    // Enter
    const itemsEnter = items.enter()
      .append('li')
      .attr('class', 'tag-row')
      .classed('readonly', isReadOnlyTag);

    const innerWrap = itemsEnter.append('div')
      .attr('class', 'inner-wrap');

    innerWrap
      .append('div')
      .attr('class', 'key-wrap')
      .append('input')
      .property('type', 'text')
      .attr('class', 'key')
      .call(utilNoAuto)
      .on('focus', onFocus)
      .on('blur', keyChange)
      .on('change', keyChange);

    innerWrap
      .append('div')
      .attr('class', 'value-wrap')
      .append('input')
      .property('type', 'text')
      .attr('class', 'value')
      .call(utilNoAuto)
      .on('focus', onFocus)
      .on('blur', valueChange)
      .on('change', valueChange)
      .on('keydown.push-more', pushMore);

    innerWrap
      .append('button')
      .attr('class', 'form-field-button remove')
      .attr('title', l10n.t('icons.remove'))
      .call(uiIcon('#rapid-operation-delete'));


    // Update
    items = items
      .merge(itemsEnter)
      .sort((a, b) => a.index - b.index);

    items
      .each((d, i, nodes) => {
        const row = d3_select(nodes[i]);
        row.select('input.key');      // propagate bound data
        row.select('input.value');    // propagate bound data

        if (_entityIDs.length && taginfo && _state !== 'hover') {
          addComboboxes(row);
        }

        const referenceOptions = { key: d.key };
        if (!isMultiValueTag(d)) {
          referenceOptions.value = d.value;
        }

        const reference = uiTagReference(context, referenceOptions);
        if (_state === 'hover') {
          reference.showing(false);
        }

        row.select('.inner-wrap')      // propagate bound data
          .call(reference.button);

        row.call(reference.body);

        row.select('button.remove');   // propagate bound data
      });

    items.selectAll('input.key')
      .attr('title', d => d.key)
      .attr('readonly', d => isReadOnlyTag(d) || isMultiValueTag(d) || null)
      .call(utilGetSetValue, d => d.key);

    items.selectAll('input.value')
      .classed('mixed', isMultiValueTag)
      .attr('title', d => isMultiValueTag(d) ? d.value.filter(Boolean).join('\n') : d.value)
      .attr('readonly', d => isReadOnlyTag(d) || null)
      .attr('placeholder', d => isMultiValueTag(d) ? l10n.t('inspector.multiple_values') : null)
      .call(utilGetSetValue, d => isMultiValueTag(d) ? '' : d.value);

    items.selectAll('button.remove')
      .on(('PointerEvent' in window ? 'pointer' : 'mouse') + 'down', removeTag);  // 'click' fires too late - iD#5878
  }


  function isReadOnlyTag(d) {
    for (const regex of _readOnlyTags) {
      if (regex.test(d.key)) return true;
    }
    return false;
  }


  function isMultiValueTag(d) {
    return Array.isArray(d.value);
  }


  function setTextareaHeight() {
    if (_tagView !== 'text') return;

    const selection = d3_select(this);
    const matches = selection.node().value.match(/\n/g);
    const lineCount = 2 + Number(matches && matches.length);
    const lineHeight = 20;

    selection.style('height', lineCount * lineHeight + 'px');
  }


  function stringify(s) {
    return JSON.stringify(s).slice(1, -1);   // without leading/trailing "
  }


  function unstringify(s) {
    let leading = '';
    let trailing = '';
    if (s.length < 1 || s.charAt(0) !== '"') {
      leading = '"';
    }
    if (s.length < 2 || s.charAt(s.length - 1) !== '"' ||
      (s.charAt(s.length - 1) === '"' && s.charAt(s.length - 2) === '\\')
    ) {
      trailing = '"';
    }
    return JSON.parse(leading + s + trailing);
  }


  function rowsToText(rows) {
    let str = rows
      .filter(row => row.key && row.key.trim() !== '')
      .map(row => {
        let rawVal = row.value;
        if (typeof rawVal !== 'string') rawVal = '*';
        const val = rawVal ? stringify(rawVal) : '';
        return stringify(row.key) + '=' + val;
      })
      .join('\n');

    if (_state !== 'hover' && str.length) {
      return str + '\n';
    }
    return  str;
  }


  function textChanged() {
    const newText = this.value.trim();
    const newTags = {};
    newText.split('\n').forEach(row => {
      const m = row.match(/^\s*([^=]+)=(.*)$/);
      if (m !== null) {
        const k = context.cleanTagKey(unstringify(m[1].trim()));
        const v = context.cleanTagValue(unstringify(m[2].trim()));
        newTags[k] = v;
      }
    });

    const tagDiff = utilTagDiff(_tags, newTags);
    if (!tagDiff.length) return;

    _pendingChange = _pendingChange || {};

    tagDiff.forEach(function(change) {
      if (isReadOnlyTag({ key: change.key })) return;

      // skip unchanged multiselection placeholders
      if (change.newVal === '*' && typeof change.oldVal !== 'string') return;

      if (change.type === '-') {
        _pendingChange[change.key] = undefined;
      } else if (change.type === '+') {
        _pendingChange[change.key] = change.newVal || '';
      }
    });

    if (Object.keys(_pendingChange).length === 0) {
      _pendingChange = null;
      return;
    }

    scheduleChange();
  }


  function pushMore(d3_event) {
    // if pressing Tab on the last value field with content, add a blank row
    if (d3_event.keyCode === 9 && !d3_event.shiftKey &&
      section.selection().selectAll('.tag-list li:last-child input.value').node() === this &&
      utilGetSetValue(d3_select(this))) {
      addTag();
    }
  }


  function addComboboxes(row) {
    const d = row.datum();
    const key = row.select('input.key');      // propagate bound data
    const value = row.select('input.value');  // propagate bound data

    if (isReadOnlyTag(d)) return;
    if (!_entityIDs.length) return;

    if (isMultiValueTag(d)) {
      value.call(uiCombobox(context, 'tag-value')
        .minItems(1)
        .fetcher(function(value, callback) {
          const keyString = utilGetSetValue(key);
          if (!_tags[keyString]) return;
          const data = _tags[keyString].filter(Boolean).map(tagValue => {
            return {
              value: tagValue,
              title: tagValue
            };
          });
          callback(data);
        }));
      return;
    }

    const graph = editor.staging.graph;
    const geometry = graph.geometry(_entityIDs[0]);

    key.call(uiCombobox(context, 'tag-key')
      .fetcher(function(value, callback) {
        taginfo.keys({
          debounce: true,
          geometry: geometry,
          query: value
        }, function(err, data) {
          if (!err) {
            const filtered = data.filter(d => {
              if (/_\d$/.test(d.value)) return false;          // tag like `_1`, see iD#9422
              if (_discardKeys.has(d.value)) return false;     // discardable, see iD#9817
              if (_tags[d.value] !== undefined) return false;  // already used as a tag
              return true;
            });
            callback(sort(value, filtered));
          }
        });
      }));

    value.call(uiCombobox(context, 'tag-value')
      .fetcher(function(value, callback) {
        taginfo.values({
          debounce: true,
          key: utilGetSetValue(key),
          geometry: geometry,
          query: value
        }, function(err, data) {
          if (!err) callback(sort(value, data));
        });
      }));


    function sort(value, data) {
      let sameletter = [];
      let other = [];
      for (const d of data) {
        if (d.value.substring(0, value.length) === value) {
          sameletter.push(d);
        } else {
          other.push(d);
        }
      }
      return sameletter.concat(other);
    }
  }


  function keyChange(d3_event, d) {
    if (d3_select(this).attr('readonly')) return;

    const kOld = d.key;

    // exit if we are currently about to delete this row anyway - iD#6366
    if (_pendingChange && _pendingChange.hasOwnProperty(kOld) && _pendingChange[kOld] === undefined) return;

    const kNew = context.cleanTagKey(this.value.trim());

    // allow no change if the key should be readonly
    if (isReadOnlyTag({ key: kNew })) {
      this.value = kOld;
      return;
    }

    // new key is already in use, switch focus to the existing row
    if (kNew && kNew !== kOld && _tags[kNew] !== undefined) {
      this.value = kOld;     // reset the key
      section.selection().selectAll('.tag-list input.value')
        .each((d, i, nodes) => {
          if (d.key === kNew) {     // send focus to that other value combo instead
            const input = nodes[i];
            input.focus();
            input.select();
          }
        });
      return;
    }

    const row = this.parentNode.parentNode;
    const inputVal = d3_select(row).selectAll('input.value');
    const vNew = context.cleanTagValue(utilGetSetValue(inputVal));

    _pendingChange = _pendingChange || {};

    if (kOld) {
      _pendingChange[kOld] = undefined;
    }

    _pendingChange[kNew] = vNew;

    // update the ordered key index so this row doesn't change position
    let existingKeyIndex = _orderedKeys.indexOf(kOld);
    if (existingKeyIndex !== -1) {
      _orderedKeys[existingKeyIndex] = kNew;
    }

    d.key = kNew;    // update datum to avoid exit/enter on tag update
    d.value = vNew;

    this.value = kNew;
    utilGetSetValue(inputVal, vNew);
    scheduleChange();
  }


  function valueChange(d3_event, d) {
    if (isReadOnlyTag(d)) return;

    // exit if this is a multiselection and no value was entered
    if (isMultiValueTag(d) && !this.value) return;

    // exit if we are currently about to delete this row anyway - iD#6366
    if (_pendingChange && _pendingChange.hasOwnProperty(d.key) && _pendingChange[d.key] === undefined) return;

    _pendingChange = _pendingChange || {};
    _pendingChange[d.key] = context.cleanTagValue(this.value);
    scheduleChange();
  }


  function removeTag(d3_event, d) {
    if (isReadOnlyTag(d)) return;

    if (d.key === '') {    // removing the blank row
      _showBlank = false;
      section.reRender();

    } else {
      // remove the key from the ordered key index
      _orderedKeys = _orderedKeys.filter(key => key !== d.key);
      _pendingChange = _pendingChange || {};
      _pendingChange[d.key] = undefined;
      scheduleChange();
    }
  }


  function addTag() {
    // Delay render in case this click is blurring an edited combo.
    // Without the setTimeout, the `content` render would wipe out the pending tag change.
    window.setTimeout(function() {
      _showBlank = true;
      section.reRender();
      section.selection().selectAll('.tag-list li:last-child input.key').node().focus();
    }, 20);
  }


  function onFocus() {
    _didFocus = true;
  }


  function scheduleChange() {
    // Cache IDs in case the editor is reloaded before the change event is called. - iD#6028
    const entityIDs = _entityIDs;

    // Delay change in case this change is blurring an edited combo. - iD#5878
    window.setTimeout(function() {
      if (!_pendingChange) return;
      dispatch.call('change', this, entityIDs, _pendingChange);
      _pendingChange = null;
    }, 10);
  }


  section.state = function(val) {
    if (!arguments.length) return _state;
    if (_state !== val) {
      _didFocus = false;
      _orderedKeys = [];
      _state = val;
    }
    return section;
  };


  section.presets = function(val) {
    if (!arguments.length) return _presets;
    _presets = val;

    // Force the raw tag editor to be expanded if ...
    if (_presets && _presets.length && _presets[0].isFallback()) {  // ... it's a fallback preset
      section.disclosureExpandOverride(true);
    } else if (_didFocus) {    // ... the user was just using it - iD#1881
      section.disclosureExpandOverride(true);
    } else {
      section.disclosureExpandOverride(undefined);
    }

    return section;
  };


  section.tags = function(val) {
    if (!arguments.length) return _tags;
    _tags = val;
    return section;
  };


  section.entityIDs = function(val) {
    if (!arguments.length) return _entityIDs;

    if (!_entityIDs || !val || !utilArrayIdentical(_entityIDs, val)) {
      _didFocus = false;
      _orderedKeys = [];
      _entityIDs = val;
    }
    return section;
  };


  // pass an array of regular expressions to test against the tag key
  section.readOnlyTags = function(val) {
    if (!arguments.length) return _readOnlyTags;
    _readOnlyTags = val;
    return section;
  };


  return utilRebind(section, dispatch, 'on');
}
