import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { actionChangeTags } from '../../actions/change_tags';
import { uiIcon } from '../icon';
import { utilGetSetValue, utilNoAuto, utilRebind } from '../../util';
import { uiCombobox } from '../combobox';


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
            .append('span')
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
            const graph = editor.current.graph;
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
        let key = uifield.key;
        var syncTags = {};
        syncTags[key] = _qid;
        dispatch.call('change', this, syncTags);

        // attempt asynchronous update of wikidata tag..
        var initGraph = editor.current.graph;
        var initEntityIDs = _entityIDs;

        wikidata.entityByQID(_qid, function(err, entity) {
            if (err) return;

            // If graph has changed, we can't apply this update.
            if (editor.current.graph !== initGraph) return;

            if (!entity.sitelinks) return;

            var langs = wikidata.languagesToQuery();
            // use the label and description languages as fallbacks
            ['labels', 'descriptions'].forEach(function(key) {
                if (!entity[key]) return;

                var valueLangs = Object.keys(entity[key]);
                if (valueLangs.length === 0) return;
                var valueLang = valueLangs[0];

                if (langs.indexOf(valueLang) === -1) {
                    langs.push(valueLang);
                }
            });

            var newWikipediaValue;

            if (_wikipediaKey) {
                var foundPreferred;
                for (var i in langs) {
                    var lang = langs[i];
                    var siteID = lang.replace('-', '_') + 'wiki';
                    if (entity.sitelinks[siteID]) {
                        foundPreferred = true;
                        newWikipediaValue = lang + ':' + entity.sitelinks[siteID].title;
                        // use the first match
                        break;
                    }
                }

                if (!foundPreferred) {
                    // No wikipedia sites available in the user's language or the fallback languages,
                    // default to any wikipedia sitelink

                    var wikiSiteKeys = Object.keys(entity.sitelinks).filter(function(site) {
                        return site.endsWith('wiki');
                    });

                    if (wikiSiteKeys.length === 0) {
                        // if no wikipedia pages are linked to this wikidata entity, delete that tag
                        newWikipediaValue = null;
                    } else {
                        var wikiLang = wikiSiteKeys[0].slice(0, -4).replace('_', '-');
                        var wikiTitle = entity.sitelinks[wikiSiteKeys[0]].title;
                        newWikipediaValue = wikiLang + ':' + wikiTitle;
                    }
                }
            }

            if (newWikipediaValue) {
                newWikipediaValue = context.cleanTagValue(newWikipediaValue);
            }

            if (typeof newWikipediaValue === 'undefined') return;

            var actions = initEntityIDs.map(function(entityID) {
                var entity = initGraph.hasEntity(entityID);
                if (!entity) return null;

                var currTags = Object.assign({}, entity.tags);  // shallow copy
                if (newWikipediaValue === null) {
                    if (!currTags[_wikipediaKey]) return null;

                    delete currTags[_wikipediaKey];
                } else {
                    currTags[_wikipediaKey] = newWikipediaValue;
                }

                return actionChangeTags(entityID, currTags);
            }).filter(Boolean);

            if (!actions.length) return;

            // Coalesce the update of wikidata tag into the previous tag change
            editor.overwrite(
                function actionUpdateWikipediaTags(graph) {
                    actions.forEach(function(action) {
                        graph = action(graph);
                    });
                    return graph;
                },
                editor.undoAnnotation()
            );

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
