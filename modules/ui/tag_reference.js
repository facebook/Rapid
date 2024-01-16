import { select as d3_select } from 'd3-selection';

import { uiIcon } from './icon.js';


// Pass `what` object of the form:
// {
//   key: 'string',     // required
//   value: 'string'    // optional
// }
//   -or-
// {
//   qid: 'string'      // brand wikidata  (e.g. 'Q37158')
// }
//
export function uiTagReference(context, what) {
  const l10n = context.systems.l10n;
  const wikibase = context.services[what.qid ? 'wikidata' : 'osmwikibase'];
  let tagReference = {};

  let _button = d3_select(null);
  let _body = d3_select(null);
  let _loaded;
  let _showing;


  function load() {
    if (!wikibase) return;

    _button
        .classed('tag-reference-loading', true);

    wikibase.getDocs(what, gotDocs);
  }


  function gotDocs(err, docs) {
    _body.html('');

    if (!docs || !docs.title) {
      _body
        .append('p')
        .attr('class', 'tag-reference-description')
        .html(l10n.tHtml('inspector.no_documentation_key'));
      done();
      return;
    }

    if (docs.imageURL) {
      _body
        .append('img')
        .attr('class', 'tag-reference-wiki-image')
        .attr('src', docs.imageURL)
        .on('load', () => done())
        .on('error', function() {
          d3_select(this).remove();
          done();
        });
    } else {
      done();
    }

    let docsHtml;
    if (docs.description) {
      docsHtml = l10n.htmlForLocalizedText(docs.description, docs.descriptionLocaleCode);
    } else {
      docsHtml = l10n.tHtml('inspector.no_documentation_key');
    }

    _body
      .append('p')
      .attr('class', 'tag-reference-description')
      .html(docsHtml)
      .append('a')
      .attr('class', 'tag-reference-edit')
      .attr('target', '_blank')
      .attr('title', l10n.t('inspector.edit_reference'))
      .attr('href', docs.editURL)
      .call(uiIcon('#rapid-icon-edit', 'inline'));

    if (docs.wiki) {
      _body
        .append('a')
        .attr('class', 'tag-reference-link')
        .attr('target', '_blank')
        .attr('href', docs.wiki.url)
        .call(uiIcon('#rapid-icon-out-link', 'inline'))
        .append('span')
        .html(l10n.tHtml(docs.wiki.text));
    }

    // Add link to info about "good changeset comments" - iD#2923
    if (what.key === 'comment') {
      _body
        .append('a')
        .attr('class', 'tag-reference-comment-link')
        .attr('target', '_blank')
        .call(uiIcon('#rapid-icon-out-link', 'inline'))
        .attr('href', l10n.t('commit.about_changeset_comments_link'))
        .append('span')
        .html(l10n.tHtml('commit.about_changeset_comments'));
    }
  }


  function done() {
    _loaded = true;

    _button
      .classed('tag-reference-loading', false);

    _body
      .classed('expanded', true)
      .transition()
      .duration(200)
      .style('max-height', '200px')
      .style('opacity', '1');

    _showing = true;

    _button.selectAll('svg.icon use')
      .each((d, i, nodes) => {
        let iconUse = d3_select(nodes[i]);
        if (iconUse.attr('href') === '#rapid-icon-info') {
          iconUse.attr('href', '#rapid-icon-info-filled');
        }
      });
  }


  function hide() {
    _body
      .transition()
      .duration(200)
      .style('max-height', '0px')
      .style('opacity', '0')
      .on('end', () => {
        _body.classed('expanded', false);
      });

    _showing = false;

    _button.selectAll('svg.icon use')
      .each((d, i, nodes) => {
        let iconUse = d3_select(nodes[i]);
        if (iconUse.attr('href') === '#rapid-icon-info-filled') {
          iconUse.attr('href', '#rapid-icon-info');
        }
      });
  }


  tagReference.button = function(selection, klass, iconName) {
    _button = selection.selectAll('.tag-reference-button')
      .data([0]);

    _button = _button.enter()
      .append('button')
      .attr('class', 'tag-reference-button ' + (klass || ''))
      .attr('title', l10n.t('icons.information'))
      .call(uiIcon('#rapid-icon-' + (iconName || 'inspect')))
      .merge(_button);

    _button
      .on('click', function (d3_event) {
        d3_event.stopPropagation();
        d3_event.preventDefault();
        this.blur();    // avoid keeping focus on the button - iD#4641
        if (_showing) {
          hide();
        } else if (_loaded) {
          done();
        } else {
          load();
        }
      });
  };


  tagReference.body = function(selection) {
    let itemID = what.qid || (what.key + '-' + (what.value || ''));
    _body = selection.selectAll('.tag-reference-body')
      .data([itemID], d => d);

    _body.exit()
      .remove();

    _body = _body.enter()
      .append('div')
      .attr('class', 'tag-reference-body')
      .style('max-height', '0')
      .style('opacity', '0')
      .merge(_body);

    if (_showing === false) {
      hide();
    }
  };


  tagReference.showing = function(val) {
    if (!arguments.length) return _showing;
    _showing = val;
    return tagReference;
  };


  return tagReference;
}
