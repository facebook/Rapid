import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { actionChangeTags } from '../../actions/change_tags.js';
import { uiIcon } from '../icon.js';
import { uiCombobox } from '../combobox.js';
import { utilGetSetValue, utilNoAuto, utilRebind } from '../../util/index.js';


export function uiFieldWikipedia(context, uifield) {
  const assets = context.systems.assets;
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const wikipedia = context.services.wikipedia;
  const wikidata = context.services.wikidata;
  const dispatch = d3_dispatch('change');

  let _langInput = d3_select(null);
  let _titleInput = d3_select(null);
  let _wikiURL = '';
  let _entityIDs;
  let _tags;

  let _dataWikipedia = [];
  assets.loadAssetAsync('wmf_sitematrix')
    .then(d => {
      _dataWikipedia = d;
      if (_tags) updateForTags(_tags);
    })
    .catch(e => console.error(e));  // eslint-disable-line


  const langCombo = uiCombobox(context, 'wikipedia-lang')
    .fetcher((value, callback) => {
      const v = value.toLowerCase();
      callback(_dataWikipedia
        .filter(d => {
          return d[0].toLowerCase().indexOf(v) >= 0 ||
            d[1].toLowerCase().indexOf(v) >= 0 ||
            d[2].toLowerCase().indexOf(v) >= 0;
        })
        .map(d => ({ value: d[1] }))
      );
    });

  const titleCombo = uiCombobox(context, 'wikipedia-title')
    .fetcher((value, callback) => {
      if (!value) {
        value = '';
        const graph = editor.staging.graph;
        for (let i in _entityIDs) {
          let entity = graph.hasEntity(_entityIDs[i]);
          if (entity.tags.name) {
            value = entity.tags.name;
            break;
          }
        }
      }
      const searchfn = value.length > 7 ? wikipedia.search : wikipedia.suggestions;
      searchfn(language()[2], value, (query, data) => {
        callback( data.map(d => ({ value: d })) );
      });
    });


  function wiki(selection) {
    let wrap = selection.selectAll('.form-field-input-wrap')
      .data([0]);

    wrap = wrap.enter()
      .append('div')
      .attr('class', `form-field-input-wrap form-field-input-${uifield.type}`)
      .merge(wrap);


    let langContainer = wrap.selectAll('.wiki-lang-container')
      .data([0]);

    langContainer = langContainer.enter()
      .append('div')
      .attr('class', 'wiki-lang-container')
      .merge(langContainer);


    _langInput = langContainer.selectAll('input.wiki-lang')
      .data([0]);

    _langInput = _langInput.enter()
      .append('input')
      .attr('type', 'text')
      .attr('class', 'wiki-lang')
      .attr('placeholder', l10n.t('translate.localized_translation_language'))
      .call(utilNoAuto)
      .call(langCombo)
      .merge(_langInput);

    _langInput
      .on('blur', changeLang)
      .on('change', changeLang);


    let titleContainer = wrap.selectAll('.wiki-title-container')
      .data([0]);

    titleContainer = titleContainer.enter()
      .append('div')
      .attr('class', 'wiki-title-container')
      .merge(titleContainer);

    _titleInput = titleContainer.selectAll('input.wiki-title')
      .data([0]);

    _titleInput = _titleInput.enter()
      .append('input')
      .attr('type', 'text')
      .attr('class', 'wiki-title')
      .attr('id', uifield.uid)
      .call(utilNoAuto)
      .call(titleCombo)
      .merge(_titleInput);

    _titleInput
      .on('blur', function() {
        change(true);
      })
      .on('change', function() {
        change(false);
      });


    let link = titleContainer.selectAll('.wiki-link')
      .data([0]);

    link = link.enter()
      .append('button')
      .attr('class', 'form-field-button wiki-link')
      .attr('title', l10n.t('icons.view_on', { domain: 'wikipedia.org' }))
      .call(uiIcon('#rapid-icon-out-link'))
      .merge(link);

    link
      .on('click', (d3_event) => {
        d3_event.preventDefault();
        if (_wikiURL) window.open(_wikiURL, '_blank');
      });
  }


  function defaultLanguageInfo(skipEnglishFallback) {
    const langCode = l10n.languageCode().toLowerCase();

    for (let i in _dataWikipedia) {
      let d = _dataWikipedia[i];
      // default to the language of Rapid's current locale
      if (d[2] === langCode) return d;
    }

    // fallback to English
    return skipEnglishFallback ? ['', '', ''] : ['English', 'English', 'en'];
  }


  function language(skipEnglishFallback) {
    const value = utilGetSetValue(_langInput).toLowerCase();

    for (let i in _dataWikipedia) {
      let d = _dataWikipedia[i];
      // return the language already set in the UI, if supported
      if (d[0].toLowerCase() === value ||
        d[1].toLowerCase() === value ||
        d[2] === value) return d;
    }

    // fallback to English
    return defaultLanguageInfo(skipEnglishFallback);
  }


  function changeLang() {
    utilGetSetValue(_langInput, language()[1]);
    change(true);
  }


  function change(skipWikidata) {
    let value = utilGetSetValue(_titleInput);
    const m = value.match(/https?:\/\/([-a-z]+)\.wikipedia\.org\/(?:wiki|\1-[-a-z]+)\/([^#]+)(?:#(.+))?/);
    const langInfo = m && _dataWikipedia.find(d => m[1] === d[2]);
    let syncTags = {};

    if (langInfo) {
      const nativeLangName = langInfo[1];
      // Normalize title http://www.mediawiki.org/wiki/API:Query#Title_normalization
      value = decodeURIComponent(m[2]).replace(/_/g, ' ');
      if (m[3]) {
        let anchor;
        // try {
        // leave this out for now - iD#6232
          // Best-effort `anchordecode:` implementation
          // anchor = decodeURIComponent(m[3].replace(/\.([0-9A-F]{2})/g, '%$1'));
        // } catch (e) {
        anchor = decodeURIComponent(m[3]);
        // }
        value += '#' + anchor.replace(/_/g, ' ');
      }
      value = value.slice(0, 1).toUpperCase() + value.slice(1);
      utilGetSetValue(_langInput, nativeLangName);
      utilGetSetValue(_titleInput, value);
    }

    if (value) {
      syncTags.wikipedia = context.cleanTagValue(language()[2] + ':' + value);
    } else {
      syncTags.wikipedia = undefined;
    }

    dispatch.call('change', this, syncTags);


    if (skipWikidata || !value || !language()[2]) return;

    // attempt asynchronous update of wikidata tag..
    const initGraph = editor.staging.graph;
    const initEntityIDs = _entityIDs;

    wikidata.itemsByTitle(language()[2], value, (err, data) => {
      if (err || !data || !Object.keys(data).length) return;

      // If graph has changed, we can't apply this update.
      const graph = editor.staging.graph;
      if (graph !== initGraph) return;

      const qids = Object.keys(data);
      const value = qids && qids.find(id => id.match(/^Q\d+$/));

      for (const entityID of initEntityIDs) {
        const entity = graph.entity(entityID);
        const asyncTags = Object.assign({}, entity.tags);  // shallow copy
        if (asyncTags.wikidata !== value) {
          asyncTags.wikidata = value;
          editor.perform(actionChangeTags(entityID, asyncTags));
        }
      }
      // do not dispatch.call('change') here, because entity_editor
      // changeTags() is not intended to be called asynchronously
    });
  }


  wiki.tags = (tags) => {
    _tags = tags;
    updateForTags(tags);
  };

  function updateForTags(tags) {
    let key = uifield.key;
    const value = typeof tags[key] === 'string' ? tags[key] : '';
    // Expect tag format of `tagLang:tagArticleTitle`, e.g. `fr:Paris`, with
    // optional suffix of `#anchor`
    const m = value.match(/([^:]+):([^#]+)(?:#(.+))?/);
    const tagLang = m && m[1];
    const tagArticleTitle = m && m[2];
    let anchor = m && m[3];
    const tagLangInfo = tagLang && _dataWikipedia.find(d => tagLang === d[2]);

    // value in correct format
    if (tagLangInfo) {
      const nativeLangName = tagLangInfo[1];
      utilGetSetValue(_langInput, nativeLangName);
      utilGetSetValue(_titleInput, tagArticleTitle + (anchor ? ('#' + anchor) : ''));

      const path = wiki.encodePath(tagArticleTitle, anchor);
      _wikiURL = `https://${tagLang}.wikipedia.org/wiki/${path}`;

    // unrecognized value format
    } else {
      utilGetSetValue(_titleInput, value);
      if (value && value !== '') {
        utilGetSetValue(_langInput, '');
        const defaultLangInfo = defaultLanguageInfo();
        _wikiURL = `https://${defaultLangInfo[2]}.wikipedia.org/w/index.php?fulltext=1&search=${value}`;
      } else {
        const shownOrDefaultLangInfo = language(true /* skipEnglishFallback */);
        utilGetSetValue(_langInput, shownOrDefaultLangInfo[1]);
        _wikiURL = '';
      }
    }
  }


  wiki.encodePath = (tagArticleTitle, anchor) => {
    const underscoredTitle = tagArticleTitle.replace(/ /g, '_');
    const uriEncodedUnderscoredTitle = encodeURIComponent(underscoredTitle);
    const uriEncodedAnchorFragment = wiki.encodeURIAnchorFragment(anchor);
    return `${uriEncodedUnderscoredTitle}${uriEncodedAnchorFragment}`;
  };


  wiki.encodeURIAnchorFragment = (anchor) => {
    if (!anchor) return '';
    const underscoredAnchor = anchor.replace(/ /g, '_');
    return '#' + encodeURIComponent(underscoredAnchor);
  };


  wiki.entityIDs = (val) => {
    if (!arguments.length) return _entityIDs;
    _entityIDs = val;
    return wiki;
  };


  wiki.focus = () => {
    _titleInput.node().focus();
  };


  return utilRebind(wiki, dispatch, 'on');
}

uiFieldWikipedia.supportsMultiselection = false;
