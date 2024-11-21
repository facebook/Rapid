import { selection } from 'd3-selection';
import debounce from 'lodash-es/debounce.js';

import { AbstractUiCard } from './AbstractUiCard.js';
import { uiIcon } from '../icon.js';
import { utilCmd } from '../../util/cmd.js';


/**
 * UiHistoryCard
 */
export class UiHistoryCard extends AbstractUiCard {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'history';

    const l10n = context.systems.l10n;
    const map = context.systems.map;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.deferredRender = debounce(this.rerender, 250);
    this.renderEntity = this.renderEntity.bind(this);
    this.renderNote = this.renderNote.bind(this);
    this.renderUser = this.renderUser.bind(this);
    this.renderChangeset = this.renderChangeset.bind(this);
    this.displayTimestamp = this.displayTimestamp.bind(this);

    // Event listeners
    map.on('draw', this.deferredRender);
    context.on('modechange', this.rerender);

    this.key = utilCmd('⌘⇧' + l10n.t('shortcuts.command.toggle_history_card.key'));
    context.keybinding().on(this.key, this.toggle);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent instanceof selection) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    if (!this.visible) return;

    const context = this.context;
    const graph = context.systems.editor.staging.graph;
    const l10n = context.systems.l10n;


    // .card-container
    let $wrap = $parent.selectAll('.card-container')
      .data([this.id], d => d);

    // enter
    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', d => `fillD2 card-container card-container-${d}`);

    const $$title = $$wrap
      .append('div')
      .attr('class', 'fillD2 card-title');

    $$title
      .append('h3');

    $$title
      .append('button')
      .attr('class', 'close')
      .on('click', this.toggle)
      .call(uiIcon('#rapid-icon-close'));

    $$wrap
      .append('div')
      .attr('class', d => `card-content card-content-${d}`);


    // update
    this.$wrap = $wrap = $wrap.merge($$wrap);

    $wrap.selectAll('h3')
      .text(l10n.t('info_panels.history.title'));

    // .card-content
    const $content = $wrap.selectAll('.card-content');

    // Empty out the DOM content and rebuild from scratch..
    $content.html('');

// //
//     let selectedNoteID = context.selectedNoteID();

    let selected, note, entity;
//     if (selectedNoteID && osm) {       // selected 1 note
//       selected = [ l10n.t('note.note') + ' ' + selectedNoteID ];
//       note = osm.getNote(selectedNoteID);
//     } else {                           // selected 1..n entities

// select only OSM entities for now
      selected = context.selectedIDs().filter(e => graph.hasEntity(e));
      if (selected.length) {
        entity = graph.entity(selected[0]);
      }
//     }

    const singular = selected.length === 1 ? selected[0] : null;

    $content
      .append('h4')
      .attr('class', 'history-heading')
      .text(singular || l10n.t('info_panels.selected', { n: selected.length }));

    if (!singular) return;

    if (entity) {
      $content.call(this.renderEntity, entity);
    } else if (note) {
      $content.call(this.renderNote, note);
    }
  }


  /**
   * renderNote
   * @param  {d3-selection} $selection - A d3-selection to a HTMLElement that this function should render itself into
   * @param  {Note}         note       - The OSM Note to display details for
   */
  renderNote($selection, note) {
    const context = this.context;
    const l10n = context.systems.l10n;
    const osm = context.services.osm;

    if (!note || note.isNew()) {
      $selection
        .append('div')
        .text(l10n.t('info_panels.history.note_no_history'));
      return;
    }

    const $list = $selection
      .append('ul');

    $list
      .append('li')
      .text(l10n.t('info_panels.history.note_comments') + ':')
      .append('span')
      .text(note.comments.length);

    if (note.comments.length) {
      $list
        .append('li')
        .text(l10n.t('info_panels.history.note_created_date') + ':')
        .append('span')
        .text(this.displayTimestamp(note.comments[0].date));

      $list
        .append('li')
        .text(l10n.t('info_panels.history.note_created_user') + ':')
        .call(this.renderUser, note.comments[0].user);
    }

    if (osm) {
      $selection
        .append('a')
        .attr('class', 'view-history-on-osm')
        .attr('target', '_blank')
        .attr('href', osm.noteURL(note))
        .call(uiIcon('#rapid-icon-out-link', 'inline'))
        .append('span')
        .text(l10n.t('info_panels.history.note_link_text'));
    }
  }


  /**
   * renderEntity
   * @param  {d3-selection} $selection - A d3-selection to a HTMLElement that this function should render itself into
   * @param  {Entity}       entity     - The OSM entity (node, way, relation) to display details for
   */
  renderEntity($selection, entity) {
    const context = this.context;
    const l10n = context.systems.l10n;
    const osm = context.services.osm;

    if (!entity || entity.isNew()) {
      $selection
        .append('div')
        .text(l10n.t('info_panels.history.no_history'));
      return;
    }

    const $links = $selection
      .append('div')
      .attr('class', 'links');

    if (osm) {
      $links
        .append('a')
        .attr('class', 'view-history-on-osm')
        .attr('href', osm.historyURL(entity))
        .attr('target', '_blank')
        .attr('title', l10n.t('info_panels.history.link_text'))
        .text('OSM');
    }

    $links
      .append('a')
      .attr('class', 'pewu-history-viewer-link')
      .attr('href', 'https://pewu.github.io/osm-history/#/' + entity.type + '/' + entity.osmId())
      .attr('target', '_blank')
      .attr('tabindex', -1)
      .text('PeWu');

    const $list = $selection
      .append('ul');

    $list
      .append('li')
      .text(l10n.t('info_panels.history.version') + ':')
      .append('span')
      .text(entity.version);

    $list
      .append('li')
      .text(l10n.t('info_panels.history.last_edit') + ':')
      .append('span')
      .text(this.displayTimestamp(entity.timestamp));

    $list
      .append('li')
      .text(l10n.t('info_panels.history.edited_by') + ':')
      .call(this.renderUser, entity.user);

    $list
      .append('li')
      .text(l10n.t('info_panels.history.changeset') + ':')
      .call(this.renderChangeset, entity.changeset);
  }


  /**
   * displayTimestamp
   * @param  {string}  stringified timestamp
   * @return {string}  localized `String` for the given timestamp (or localized 'unknown' string)
   */
  displayTimestamp(timestamp) {
    const context = this.context;
    const l10n = context.systems.l10n;

    if (!timestamp) return l10n.t('inspector.unknown');

    const options = {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric'
    };

    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return l10n.t('inspector.unknown');

    const localeCode = context.systems.l10n.localeCode();
    return d.toLocaleString(localeCode, options);
  }


  /**
   * renderUser
   * @param  {d3-selection} $selection - A d3-selection to a HTMLElement that this function should render itself into
   * @param  {string}       username   - The OSM username to display details for
   */
  renderUser($selection, username) {
    const context = this.context;
    const l10n = context.systems.l10n;
    const osm = context.services.osm;

    if (!username) {
      $selection
        .append('span')
        .text(l10n.t('inspector.unknown'));
      return;
    }

    $selection
      .append('span')
      .attr('class', 'user-name')
      .text(username);

    const $links = $selection
      .append('div')
      .attr('class', 'links');

    if (osm) {
      $links
        .append('a')
        .attr('class', 'user-osm-link')
        .attr('href', osm.userURL(username))
        .attr('target', '_blank')
        .text('OSM');
    }

    $links
      .append('a')
      .attr('class', 'user-hdyc-link')
      .attr('href', `https://hdyc.neis-one.org/?${username}`)
      .attr('target', '_blank')
      .attr('tabindex', -1)
      .text('HDYC');
  }


  /**
   * renderChangeset
   * @param  {d3-selection} $selection  - A d3-selection to a HTMLElement that this function should render itself into
   * @param  {string}       changesetID - The OSM changeset id to display details for
   */
  renderChangeset($selection, changesetID) {
    const context = this.context;
    const l10n = context.systems.l10n;
    const osm = context.services.osm;

    if (!changesetID) {
      $selection
        .append('span')
        .text(l10n.t('inspector.unknown'));
      return;
    }

    $selection
      .append('span')
      .attr('class', 'changeset-id')
      .text(changesetID);

    const $links = $selection
      .append('div')
      .attr('class', 'links');

    if (osm) {
      $links
        .append('a')
        .attr('class', 'changeset-osm-link')
        .attr('href', osm.changesetURL(changesetID))
        .attr('target', '_blank')
        .text('OSM');
    }

    $links
      .append('a')
      .attr('class', 'changeset-osmcha-link')
      .attr('href', `https://osmcha.org/changesets/${changesetID}`)
      .attr('target', '_blank')
      .text('OSMCha');

    $links
      .append('a')
      .attr('class', 'changeset-achavi-link')
      .attr('href', `https://overpass-api.de/achavi/?changeset=${changesetID}`)
      .attr('target', '_blank')
      .text('Achavi');
  }

}
