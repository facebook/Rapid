import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { actionChangeTags } from '../../actions/change_tags.js';
import { uiIcon } from '../icon.js';
import { utilGetSetValue, utilNoAuto, utilRebind } from '../../util/index.js';
import { uiCombobox } from '../combobox.js';


export function uiFieldWikidata(context, uifield) {
    const editor = context.systems.editor;
    const l10n = context.systems.l10n;
    const wikidata = context.services.wikidata;
    const dispatch = d3_dispatch('change');

    var _selection = d3_select(null);
    var _searchInput = d3_select(null);
    var _qid = null;
    var _wikidataEntity = null;
    var _wikiURL = '';
    var _entityIDs = [];

    var _wikipediaKey = uifield.keys && uifield.keys.find(function(key) {
        return key.includes('wikipedia');
    });
    var _hintKey = uifield.key === 'wikidata' ? 'name' : uifield.key.split(':')[0];

    var combobox = uiCombobox(context, 'combo-' + uifield.safeid)
        .caseSensitive(true)
        .minItems(1);


    function wiki(selection) {
        _selection = selection;

        var wrap = selection.selectAll('.form-field-input-wrap')
            .data([0]);

        wrap = wrap.enter()
            .append('div')
            .attr('class', 'form-field-input-wrap form-field-input-' + uifield.type)
            .merge(wrap);


        var list = wrap.selectAll('ul')
            .data([0]);

        list = list.enter()
            .append('ul')
            .attr('class', 'rows')
            .merge(list);

        var searchRow = list.selectAll('li.wikidata-search')
            .data([0]);

        var searchRowEnter = searchRow.enter()
            .append('li')
            .attr('class', 'wikidata-search');

        searchRowEnter
            .append('input')
            .attr('type', 'text')
            .attr('id', uifield.uid)
            .style('flex', '1')
            .call(utilNoAuto)
            .on('focus', function() {
                var node = d3_select(this).node();
                node.setSelectionRange(0, node.value.length);
            })
            .on('blur', function() {
                setLabelForEntity();
            })
            .call(combobox.fetcher(fetchWikidataItems));

        combobox.on('accept', function(d) {
            if (d) {
                _qid = d.id;
                change();
            }
        }).on('cancel', function() {
            setLabelForEntity();
        });

        searchRowEnter
            .append('button')
            .attr('class', 'form-field-button wiki-link')
            .attr('title', l10n.t('icons.view_on', { domain: 'wikidata.org' }))
            .call(uiIcon('#rapid-icon-out-link'))
            .on('click', function(d3_event) {
                d3_event.preventDefault();
                if (_wikiURL) window.open(_wikiURL, '_blank');
            });

        searchRow = searchRow.merge(searchRowEnter);

        _searchInput = searchRow.select('input');

        var wikidataProperties = ['description', 'identifier'];

        var items = list.selectAll('li.labeled-input')
            .data(wikidataProperties);

        // Enter
        var enter = items.enter()
            .append('li')
            .attr('class', function(d) { return 'labeled-input preset-wikidata-' + d; });

        enter
            .append('div')
            .attr('class', 'label')
            .html(function(d) { return l10n.tHtml('wikidata.' + d); });

        enter
            .append('input')
            .attr('type', 'text')
            .call(utilNoAuto)
            .classed('disabled', 'true')
            .attr('readonly', 'true');

        enter
            .append('button')
            .attr('class', 'form-field-button')
            .attr('title', l10n.t('icons.copy'))
            .call(uiIcon('#rapid-operation-copy'))
            .on('click', function(d3_event) {
                d3_event.preventDefault();
                d3_select(this.parentNode)
                    .select('input')
                    .node()
                    .select();
                document.execCommand('copy');
            });

    }

    function fetchWikidataItems(q, callback) {
        if (!q && _hintKey) {
            // other tags may be good search terms
            const graph = editor.staging.graph;
            for (var i in _entityIDs) {
                const entity = graph.hasEntity(_entityIDs[i]);
                if (entity.tags[_hintKey]) {
                    q = entity.tags[_hintKey];
                    break;
                }
            }
        }

        wikidata.itemsForSearchQuery(q, function(err, data) {
            if (err) return;

            var result = data.map(function(item) {
                return {
                    id:    item.id,
                    value: item.label + ' (' + item.id + ')',
                    title: item.description,
                    terms: item.aliases
                };
            });

            if (callback) callback(result);
        });
    }


    function change() {
      const key = uifield.key;
      const syncTags = {};
      syncTags[key] = _qid;
      dispatch.call('change', this, syncTags);

      if (!_wikipediaKey) return;

      // attempt asynchronous update of wikipedia tag..
      const initGraph = editor.staging.graph;
      const initEntityIDs = _entityIDs;

      wikidata.entityByQID(_qid, (err, result) => {
        if (err || !result?.sitelinks) return;

        // If graph has changed, we can't apply this update.
        const graph = editor.staging.graph;
        if (graph !== initGraph) return;

        // Wikipedia sites can be in a bunch of languages.
        // We'll try to match the user's preferred languages first.
        const langs = new Set(wikidata.languagesToQuery());

        // use the label and description languages as fallbacks
        for (const key of ['labels', 'descriptions']) {
          if (!result[key]) continue;
          const moreLangs = Object.keys(result[key]);
          if (moreLangs.length === 0) continue;
          langs.add(moreLangs[0]);
        }

        let newValue;
        let foundPreferred = false;

        for (const lang of langs) {
          const siteID = lang.replace('-', '_') + 'wiki';
          if (result.sitelinks[siteID]) {
            foundPreferred = true;
            newValue = lang + ':' + result.sitelinks[siteID].title;
            break;
          }
        }

        // No wikipedia sites available in the user's language or the fallback languages,
        // default to any wikipedia sitelink
        if (!foundPreferred) {
          const wikiSiteKeys = Object.keys(result.sitelinks).filter(site => site.endsWith('wiki'));

          if (wikiSiteKeys.length === 0) {  // if no wikipedia pages are linked to this wikidata entity, delete the tag
            newValue = null;
          } else {
            const key = wikiSiteKeys[0];
            const lang = key.slice(0, -4).replace('_', '-');
            newValue = lang + ':' + result.sitelinks[key].title;
          }
        }

        if (newValue) {
          newValue = context.cleanTagValue(newValue);
        }

        if (typeof newValue === 'undefined') return;

        for (const entityID of initEntityIDs) {
          const entity = graph.entity(entityID);
          const asyncTags = Object.assign({}, entity.tags);  // shallow copy

          if (newValue === null) {  // remove wikipedia tag
            if (!asyncTags[_wikipediaKey]) continue;  // no change
            delete asyncTags[_wikipediaKey];

          } else {   // replace wikipedia tag
            if (asyncTags[_wikipediaKey] === newValue) continue;  // no change
            asyncTags[_wikipediaKey] = newValue;
          }

          editor.perform(actionChangeTags(entityID, asyncTags));
        }

        // do not dispatch.call('change') here, because entity_editor
        // changeTags() is not intended to be called asynchronously
      });
    }


    function setLabelForEntity() {
        var label = '';
        if (_wikidataEntity) {
            label = entityPropertyForDisplay(_wikidataEntity, 'labels');
            if (label.length === 0) {
                label = _wikidataEntity.id.toString();
            }
        }
        utilGetSetValue(_searchInput, label);
    }


    wiki.tags = function(tags) {
        let key = uifield.key;
        var isMixed = Array.isArray(tags[key]);
        _searchInput
            .attr('title', isMixed ? tags[key].filter(Boolean).join('\n') : null)
            .attr('placeholder', isMixed ? l10n.t('inspector.multiple_values') : '')
            .classed('mixed', isMixed);

        _qid = typeof tags[key] === 'string' && tags[key] || '';

        if (!/^Q[0-9]*$/.test(_qid)) {   // not a proper QID
            unrecognized();
            return;
        }

        // QID value in correct format
        _wikiURL = 'https://wikidata.org/wiki/' + _qid;
        wikidata.entityByQID(_qid, function(err, entity) {
            if (err) {
                unrecognized();
                return;
            }
            _wikidataEntity = entity;

            setLabelForEntity();

            var description = entityPropertyForDisplay(entity, 'descriptions');

            _selection.select('button.wiki-link')
                .classed('disabled', false);

            _selection.select('.preset-wikidata-description')
                .style('display', function(){
                    return description.length > 0 ? 'flex' : 'none';
                })
                .select('input')
                .attr('value', description);

            _selection.select('.preset-wikidata-identifier')
                .style('display', function(){
                    return entity.id ? 'flex' : 'none';
                })
                .select('input')
                .attr('value', entity.id);
        });


        // not a proper QID
        function unrecognized() {
            _wikidataEntity = null;
            setLabelForEntity();

            _selection.select('.preset-wikidata-description')
                .style('display', 'none');
            _selection.select('.preset-wikidata-identifier')
                .style('display', 'none');

            _selection.select('button.wiki-link')
                .classed('disabled', true);

            if (_qid && _qid !== '') {
                _wikiURL = 'https://wikidata.org/wiki/Special:Search?search=' + _qid;
            } else {
                _wikiURL = '';
            }
        }
    };

    function entityPropertyForDisplay(wikidataEntity, propKey) {
        if (!wikidataEntity[propKey]) return '';
        var propObj = wikidataEntity[propKey];
        var langKeys = Object.keys(propObj);
        if (langKeys.length === 0) return '';
        // sorted by priority, since we want to show the user's language first if possible
        var langs = wikidata.languagesToQuery();
        for (var i in langs) {
            var lang = langs[i];
            var valueObj = propObj[lang];
            if (valueObj && valueObj.value && valueObj.value.length > 0) return valueObj.value;
        }
        // default to any available value
        return propObj[langKeys[0]].value;
    }


    wiki.entityIDs = function(val) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val;
        return wiki;
    };


    wiki.focus = function() {
        _searchInput.node().focus();
    };


    return utilRebind(wiki, dispatch, 'on');
}
