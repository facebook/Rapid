import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { utilArrayUniq, utilUniqueString } from '@rapid-sdk/util';
import { iso1A2Code } from '@rapideditor/country-coder';

import { uiIcon } from '../icon.js';
import { uiTooltip } from '../tooltip.js';
import { uiCombobox } from '../combobox.js';
import { utilGetSetValue, utilNoAuto, utilRebind } from '../../util/index.js';

var _languagesArray = [];


// Matches 'key:<code>', where <code> is a BCP47 locale code.
// Motivation is to avoid matching on similarly formatted tags that are
//  not for languages, e.g. name:left, name:source, etc. - iD#9124, iD#10333
export const LANGUAGE_SUFFIX_REGEX = /^(.*):([a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?)$/;


export function uiFieldLocalized(context, uifield) {
  const assets = context.systems.assets;
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;

    var dispatch = d3_dispatch('change', 'input');
    var wikipedia = context.services.wikipedia;
    var input = d3_select(null);
    var localizedInputs = d3_select(null);
    var _countryCode;
    var _tags;


    // A concern here in switching to async data means that languages will not
    // be available the first time through, so things like the fetchers and
    // the language() function will not work immediately.

    assets.loadAssetAsync('languages')
        .then(loadLanguagesArray)
        .catch(e => console.error(e));  // eslint-disable-line

    var _territoryLanguages = {};
    assets.loadAssetAsync('territory_languages')
        .then(data => _territoryLanguages = data.territoryLanguages)
        .catch(e => console.error(e));  // eslint-disable-line

    // reuse these combos
    var langCombo = uiCombobox(context, 'localized-lang')
        .fetcher(fetchLanguages)
        .minItems(0);

    var _selection = d3_select(null);
    var _multilingual = [];
    var _buttonTip = uiTooltip(context)
        .title(l10n.t('translate.translate'))
        .placement('left');
    var _wikiTitles;
    var _entityIDs = [];


    function loadLanguagesArray(data) {
      if (_languagesArray.length) return;  // done already

      // some conversion is needed to ensure correct OSM tags are used
      var replacements = {
        sr: 'sr-Cyrl',      // in OSM, `sr` implies Cyrillic
        'sr-Cyrl': false    // `sr-Cyrl` isn't used in OSM
      };

      const languages = data.languages;
      for (var code in languages) {
        if (replacements[code] === false) continue;
        var metaCode = code;
        if (replacements[code]) metaCode = replacements[code];

        _languagesArray.push({
          localName: l10n.languageName(metaCode, { localOnly: true }),
          nativeName: languages[metaCode].nativeName,
          code: code,
          label: l10n.languageName(metaCode)
        });
      }
    }


    function calcLocked() {
        const graph = editor.staging.graph;
        // Protect name field for suggestion presets that don't display a brand/operator field
        var isLocked = (uifield.id === 'name') &&
            _entityIDs.length &&
            _entityIDs.some(function(entityID) {
                var entity = graph.hasEntity(entityID);
                if (!entity) return false;

                // Features linked to Wikidata are likely important and should be protected
                if (entity.tags.wikidata) return true;

                // Assume the name has already been confirmed if its source has been researched
                if (entity.tags['name:etymology:wikidata']) return true;

                // Lock the `name` if this is a suggestion preset that assigns the name,
                // and the preset does not display a `brand` or `operator` field.
                // (For presets like hotels, car dealerships, post offices, the `name` should remain editable)
                // see also similar logic in `outdated_tags.js`
                var preset = presets.match(entity, graph);
                if (preset) {
                    var isSuggestion = preset.suggestion;
                    var fields = preset.fields();
                    var showsBrandField = fields.some(function(d) { return d.id === 'brand'; });
                    var showsOperatorField = fields.some(function(d) { return d.id === 'operator'; });
                    var setsName = preset.addTags.name;
                    var setsBrandWikidata = preset.addTags['brand:wikidata'];
                    var setsOperatorWikidata = preset.addTags['operator:wikidata'];

                    return (isSuggestion && setsName && (
                        (setsBrandWikidata && !showsBrandField) ||
                        (setsOperatorWikidata && !showsOperatorField)
                    ));
                }

                return false;
            });

        uifield.locked(isLocked);
    }


    // update _multilingual, maintaining the existing order
    function calcMultilingual(tags) {
        var existingLangsOrdered = _multilingual.map(function(item) {
            return item.lang;
        });
        var existingLangs = new Set(existingLangsOrdered.filter(Boolean));

        for (var k in tags) {
            var m = k.match(LANGUAGE_SUFFIX_REGEX);
            if (m && m[1] === uifield.key && m[2]) {
                var item = { lang: m[2], value: tags[k] };
                if (existingLangs.has(item.lang)) {
                    // update the value
                    _multilingual[existingLangsOrdered.indexOf(item.lang)].value = item.value;
                    existingLangs.delete(item.lang);
                } else {
                    _multilingual.push(item);
                }
            }
        }

        // Don't remove items based on deleted tags, since this makes the UI
        // disappear unexpectedly when clearing values - iD#8164
        _multilingual.forEach(function(item) {
            if (item.lang && existingLangs.has(item.lang)) {
                item.value = '';
            }
        });
    }


    function localized(selection) {
        _selection = selection;
        calcLocked();
        var isLocked = uifield.locked();

        var wrap = selection.selectAll('.form-field-input-wrap')
            .data([0]);

        // enter/update
        wrap = wrap.enter()
            .append('div')
            .attr('class', 'form-field-input-wrap form-field-input-' + uifield.type)
            .merge(wrap);

        input = wrap.selectAll('.localized-main')
            .data([0]);

        // enter/update
        input = input.enter()
            .append('input')
            .attr('type', 'text')
            .attr('id', uifield.uid)
            .attr('class', 'localized-main')
            .call(utilNoAuto)
            .merge(input);

        input
            .classed('disabled', !!isLocked)
            .attr('readonly', isLocked || null)
            .on('input', change(true))
            .on('blur', change())
            .on('change', change());


        var translateButton = wrap.selectAll('.localized-add')
            .data([0]);

        translateButton = translateButton.enter()
            .append('button')
            .attr('class', 'localized-add form-field-button')
            .call(uiIcon('#rapid-icon-plus'))
            .merge(translateButton);

        translateButton
            .classed('disabled', !!isLocked)
            .call(isLocked ? _buttonTip.destroy : _buttonTip)
            .on('click', addNew);


        if (_tags && !_multilingual.length) {
            calcMultilingual(_tags);
        }

        localizedInputs = selection.selectAll('.localized-multilingual')
            .data([0]);

        localizedInputs = localizedInputs.enter()
            .append('div')
            .attr('class', 'localized-multilingual')
            .merge(localizedInputs);

        localizedInputs
            .call(renderMultilingual);

        localizedInputs.selectAll('button, input')
            .classed('disabled', !!isLocked)
            .attr('readonly', isLocked || null);



        function addNew(d3_event) {
            d3_event.preventDefault();
            if (uifield.locked()) return;

            var defaultLang = l10n.languageCode().toLowerCase();
            var langExists = _multilingual.find(function(datum) { return datum.lang === defaultLang; });
            var isLangEn = defaultLang.indexOf('en') > -1;
            if (isLangEn || langExists) {
                defaultLang = '';
                langExists = _multilingual.find(function(datum) { return datum.lang === defaultLang; });
            }

            if (!langExists) {
                // prepend the value so it appears at the top
                _multilingual.unshift({ lang: defaultLang, value: '' });

                localizedInputs
                    .call(renderMultilingual);
            }
        }


        function change(onInput) {
            return function(d3_event) {
                if (uifield.locked()) {
                    d3_event.preventDefault();
                    return;
                }

                var val = utilGetSetValue(d3_select(this));
                if (!onInput) val = context.cleanTagValue(val);

                // don't override multiple values with blank string
                if (!val && Array.isArray(_tags[uifield.key])) return;

                var t = {};

                t[uifield.key] = val || undefined;
                dispatch.call('change', this, t, onInput);
            };
        }
    }


    function key(lang) {
        return uifield.key + ':' + lang;
    }


    function changeLang(d3_event, d) {
        var tags = {};

        // make sure unrecognized suffixes are lowercase - iD#7156
        var lang = utilGetSetValue(d3_select(this)).toLowerCase();

        var language = _languagesArray.find(function(d) {
            return d.label.toLowerCase() === lang ||
                (d.localName && d.localName.toLowerCase() === lang) ||
                (d.nativeName && d.nativeName.toLowerCase() === lang);
        });
        if (language) lang = language.code;

        if (d.lang && d.lang !== lang) {
            tags[key(d.lang)] = undefined;
        }

        var newKey = lang && context.cleanTagKey(key(lang));

        var value = utilGetSetValue(d3_select(this.parentNode).selectAll('.localized-value'));

        if (newKey && value) {
            tags[newKey] = value;
        } else if (newKey && _wikiTitles && _wikiTitles[d.lang]) {
            tags[newKey] = _wikiTitles[d.lang];
        }

        d.lang = lang;
        dispatch.call('change', this, tags);
    }


    function changeValue(d3_event, d) {
        if (!d.lang) return;
        var value = context.cleanTagValue(utilGetSetValue(d3_select(this))) || undefined;

        // don't override multiple values with blank string
        if (!value && Array.isArray(d.value)) return;

        var t = {};
        t[key(d.lang)] = value;
        d.value = value;
        dispatch.call('change', this, t);
    }


    function fetchLanguages(value, cb) {
        var v = value.toLowerCase();

        // show the user's language first
        var langCodes = [l10n.localeCode(), l10n.languageCode()];

        if (_countryCode && _territoryLanguages[_countryCode]) {
            langCodes = langCodes.concat(_territoryLanguages[_countryCode]);
        }

        var langItems = [];
        langCodes.forEach(function(code) {
            var langItem = _languagesArray.find(function(item) {
                return item.code === code;
            });
            if (langItem) langItems.push(langItem);
        });
        langItems = utilArrayUniq(langItems.concat(_languagesArray));

        cb(langItems.filter(function(d) {
            return d.label.toLowerCase().indexOf(v) >= 0 ||
                (d.localName && d.localName.toLowerCase().indexOf(v) >= 0) ||
                (d.nativeName && d.nativeName.toLowerCase().indexOf(v) >= 0) ||
                d.code.toLowerCase().indexOf(v) >= 0;
        }).map(function(d) {
            return { value: d.label };
        }));
    }


    function renderMultilingual(selection) {
        var entries = selection.selectAll('div.entry')
            .data(_multilingual, function(d) { return d.lang; });

        entries.exit()
            .style('top', '0')
            .style('max-height', '240px')
            .transition()
            .duration(200)
            .style('opacity', '0')
            .style('max-height', '0px')
            .remove();

        var entriesEnter = entries.enter()
            .append('div')
            .attr('class', 'entry')
            .each(function(_, index) {
                var wrap = d3_select(this);
                var uid = utilUniqueString(index);

                var label = wrap
                    .append('label')
                    .attr('class', 'field-label')
                    .attr('for', uid);

                var text = label
                    .append('span')
                    .attr('class', 'label-text');

                text
                    .append('span')
                    .attr('class', 'label-textvalue')
                    .html(l10n.tHtml('translate.localized_translation_label'));

                text
                    .append('span')
                    .attr('class', 'label-textannotation');

                label
                    .append('button')
                    .attr('class', 'remove-icon-multilingual')
                    .on('click', function(d3_event, d) {
                        if (uifield.locked()) return;
                        d3_event.preventDefault();

                        // remove the UI item manually
                        _multilingual.splice(_multilingual.indexOf(d), 1);

                        var langKey = d.lang && key(d.lang);
                        if (langKey && langKey in _tags) {
                            delete _tags[langKey];
                            // remove from entity tags
                            var t = {};
                            t[langKey] = undefined;
                            dispatch.call('change', this, t);
                            return;
                        }

                        renderMultilingual(selection);
                    })
                    .call(uiIcon('#rapid-operation-delete'));

                wrap
                    .append('input')
                    .attr('class', 'localized-lang')
                    .attr('id', uid)
                    .attr('type', 'text')
                    .attr('placeholder', l10n.t('translate.localized_translation_language'))
                    .on('blur', changeLang)
                    .on('change', changeLang)
                    .call(langCombo);

                wrap
                    .append('input')
                    .attr('type', 'text')
                    .attr('class', 'localized-value')
                    .on('blur', changeValue)
                    .on('change', changeValue);
            });

        entriesEnter
            .style('margin-top', '0px')
            .style('max-height', '0px')
            .style('opacity', '0')
            .transition()
            .duration(200)
            .style('margin-top', '10px')
            .style('max-height', '240px')
            .style('opacity', '1')
            .on('end', function() {
                d3_select(this)
                    .style('max-height', '')
                    .style('overflow', 'visible');
            });

        entries = entries.merge(entriesEnter);

        entries.order();

        // allow removing the entry UIs even if there isn't a tag to remove
        entries.classed('present', true);

        utilGetSetValue(entries.select('.localized-lang'), function(d) {
            var langItem = _languagesArray.find(function(item) {
                return item.code === d.lang;
            });
            if (langItem) return langItem.label;
            return d.lang;
        });

        utilGetSetValue(entries.select('.localized-value'), function(d) {
                return typeof d.value === 'string' ? d.value : '';
            })
            .attr('title', function(d) {
                return Array.isArray(d.value) ? d.value.filter(Boolean).join('\n') : null;
            })
            .attr('placeholder', function(d) {
                return Array.isArray(d.value) ? l10n.t('inspector.multiple_values') : l10n.t('translate.localized_translation_name');
            })
            .classed('mixed', function(d) {
                return Array.isArray(d.value);
            });
    }


    localized.tags = function(tags) {
        _tags = tags;

        // Fetch translations from wikipedia
        if (typeof tags.wikipedia === 'string' && !_wikiTitles) {
            _wikiTitles = {};
            var wm = tags.wikipedia.match(/([^:]+):(.+)/);
            if (wm && wm[0] && wm[1]) {
                wikipedia.translations(wm[1], wm[2], function(err, d) {
                    if (err || !d) return;
                    _wikiTitles = d;
                });
            }
        }

        var isMixed = Array.isArray(tags[uifield.key]);

        utilGetSetValue(input, typeof tags[uifield.key] === 'string' ? tags[uifield.key] : '')
            .attr('title', isMixed ? tags[uifield.key].filter(Boolean).join('\n') : undefined)
            .attr('placeholder', isMixed ? l10n.t('inspector.multiple_values') : uifield.placeholder)
            .classed('mixed', isMixed);

        calcMultilingual(tags);

        _selection
            .call(localized);
    };


    localized.focus = function() {
        input.node().focus();
    };


    localized.entityIDs = function(val) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val;
        _multilingual = [];
        loadCountryCode();
        return localized;
    };

    function loadCountryCode() {
        var extent = uifield.entityExtent;
        var countryCode = extent && iso1A2Code(extent.center());
        _countryCode = countryCode && countryCode.toLowerCase();
    }


    return utilRebind(localized, dispatch, 'on');
}
