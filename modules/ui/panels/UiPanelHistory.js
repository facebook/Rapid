import { select as d3_select } from 'd3-selection';

import { AbstractUiPanel } from './AbstractUiPanel';
import { uiIcon } from '../icon';


/**
 * UiPanelHistory
 */
export class UiPanelHistory extends AbstractUiPanel {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'history';
    this.label = context.tHtml('info_panels.history.title');
    this.key = context.t('info_panels.history.key');

    this._selection = d3_select(null);

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.renderEntity = this.renderEntity.bind(this);
    this.renderNote = this.renderNote.bind(this);
    this.renderUser = this.renderUser.bind(this);
    this.renderChangeset = this.renderChangeset.bind(this);
    this.displayTimestamp = this.displayTimestamp.bind(this);
  }


  /**
   * enable
   * @param  `selection`  A d3-selection to a `div` that the panel should render itself into
   */
  enable(selection) {
    if (this._enabled) return;

    this._enabled = true;
    this._selection = selection;

    this.context.mapSystem().on('draw', this.render);
    this.context.on('modechange', this.render);
  }


  /**
   * disable
   */
  disable() {
    if (!this._enabled) return;

    this._selection.html('');  // empty DOM

    this._enabled = false;
    this._selection = d3_select(null);

    this.context.mapSystem().off('draw', this.render);
    this.context.off('modechange', this.render);
  }


  /**
   * render
   */
  render() {
    if (!this._enabled) return;

    const context = this.context;
    const selection = this._selection;
//    const osm = context.services.get('osm');

    // Empty out the DOM content and rebuild from scratch..
    selection.html('');

// //
//     let selectedNoteID = context.selectedNoteID();

    let selected, note, entity;
//     if (selectedNoteID && osm) {       // selected 1 note
//       selected = [ context.t('note.note') + ' ' + selectedNoteID ];
//       note = osm.getNote(selectedNoteID);
//     } else {                           // selected 1..n entities

// select only OSM entities for now
      selected = context.selectedIDs().filter(e => context.hasEntity(e));
      if (selected.length) {
        entity = context.entity(selected[0]);
      }
//     }

    const singular = selected.length === 1 ? selected[0] : null;

    selection
      .append('h4')
      .attr('class', 'history-heading')
      .html(singular || context.tHtml('info_panels.selected', { n: selected.length }));

    if (!singular) return;

    if (entity) {
      selection.call(this.renderEntity, entity);
    } else if (note) {
      selection.call(this.renderNote, note);
    }
  }


  /**
   * renderNote
   * @param  `selection`  A d3-selection to render into
   * @param  `entity`     The OSM note to display details for
   */
  renderNote(selection, note) {
    const context = this.context;
    const osm = context.services.get('osm');

    if (!note || note.isNew()) {
      selection
        .append('div')
        .html(context.tHtml('info_panels.history.note_no_history'));
      return;
    }

    let list = selection
      .append('ul');

    list
      .append('li')
      .html(context.tHtml('info_panels.history.note_comments') + ':')
      .append('span')
      .html(note.comments.length);

    if (note.comments.length) {
      list
        .append('li')
        .html(context.tHtml('info_panels.history.note_created_date') + ':')
        .append('span')
        .text(this.displayTimestamp(note.comments[0].date));

      list
        .append('li')
        .html(context.tHtml('info_panels.history.note_created_user') + ':')
        .call(this.renderUser, note.comments[0].user);
    }

    if (osm) {
      selection
        .append('a')
        .attr('class', 'view-history-on-osm')
        .attr('target', '_blank')
        .attr('href', osm.noteURL(note))
        .call(uiIcon('#rapid-icon-out-link', 'inline'))
        .append('span')
        .html(context.tHtml('info_panels.history.note_link_text'));
    }
  }


  /**
   * renderEntity
   * @param  `selection`  A d3-selection to render into
   * @param  `entity`     The OSM entity (node, way, relation) to display details for
   */
  renderEntity(selection, entity) {
    const context = this.context;
    const osm = context.services.get('osm');

    if (!entity || entity.isNew()) {
      selection
        .append('div')
        .html(context.tHtml('info_panels.history.no_history'));
      return;
    }

    let links = selection
      .append('div')
      .attr('class', 'links');

    if (osm) {
      links
        .append('a')
        .attr('class', 'view-history-on-osm')
        .attr('href', osm.historyURL(entity))
        .attr('target', '_blank')
        .attr('title', context.t('info_panels.history.link_text'))
        .text('OSM');
    }

    links
      .append('a')
      .attr('class', 'pewu-history-viewer-link')
      .attr('href', 'https://pewu.github.io/osm-history/#/' + entity.type + '/' + entity.osmId())
      .attr('target', '_blank')
      .attr('tabindex', -1)
      .text('PeWu');

    let list = selection
      .append('ul');

    list
      .append('li')
      .html(context.tHtml('info_panels.history.version') + ':')
      .append('span')
      .text(entity.version);

    list
      .append('li')
      .html(context.tHtml('info_panels.history.last_edit') + ':')
      .append('span')
      .text(this.displayTimestamp(entity.timestamp));

    list
      .append('li')
      .html(context.tHtml('info_panels.history.edited_by') + ':')
      .call(this.renderUser, entity.user);

    list
      .append('li')
      .html(context.tHtml('info_panels.history.changeset') + ':')
      .call(this.renderChangeset, entity.changeset);
  }


  /**
   * displayTimestamp
   * @returns   localized `String` for the given timestamp (or localized 'unknown' string)
   */
  displayTimestamp(timestamp) {
    const context = this.context;
    if (!timestamp) return context.t('info_panels.history.unknown');

    const options = {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric'
    };

    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return context.t('info_panels.history.unknown');

    const localeCode = context.localizationSystem().localeCode();
    return d.toLocaleString(localeCode, options);
  }


  /**
   * renderUser
   * @param  `selection`  A d3-selection to render into
   * @param  `userName`   The OSM username to display links for
   */
  renderUser(selection, userName) {
    const context = this.context;
    const osm = context.services.get('osm');

    if (!userName) {
      selection
        .append('span')
        .html(context.tHtml('info_panels.history.unknown'));
      return;
    }

    selection
      .append('span')
      .attr('class', 'user-name')
      .html(userName);

    let links = selection
      .append('div')
      .attr('class', 'links');

    if (osm) {
      links
        .append('a')
        .attr('class', 'user-osm-link')
        .attr('href', osm.userURL(userName))
        .attr('target', '_blank')
        .text('OSM');
    }

    links
      .append('a')
      .attr('class', 'user-hdyc-link')
      .attr('href', `https://hdyc.neis-one.org/?${userName}`)
      .attr('target', '_blank')
      .attr('tabindex', -1)
      .text('HDYC');
  }


  /**
   * renderChangeset
   * @param  `selection`  A d3-selection to render into
   * @param  `changeset`  the OSM changeset to display the links for
   */
  renderChangeset(selection, changeset) {
    const context = this.context;
    const osm = context.services.get('osm');

    if (!changeset) {
      selection
        .append('span')
        .html(context.tHtml('info_panels.history.unknown'));
      return;
    }

    selection
      .append('span')
      .attr('class', 'changeset-id')
      .text(changeset);

    let links = selection
      .append('div')
      .attr('class', 'links');

    if (osm) {
      links
        .append('a')
        .attr('class', 'changeset-osm-link')
        .attr('href', osm.changesetURL(changeset))
        .attr('target', '_blank')
        .text('OSM');
    }

    links
      .append('a')
      .attr('class', 'changeset-osmcha-link')
      .attr('href', `https://osmcha.org/changesets/${changeset}`)
      .attr('target', '_blank')
      .text('OSMCha');

    links
      .append('a')
      .attr('class', 'changeset-achavi-link')
      .attr('href', `https://overpass-api.de/achavi/?changeset=${changeset}`)
      .attr('target', '_blank')
      .text('Achavi');
  }

}
