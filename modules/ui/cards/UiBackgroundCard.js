import { selection } from 'd3-selection';
import { Extent } from '@rapid-sdk/math';
import debounce from 'lodash-es/debounce.js';

import { AbstractUiCard } from './AbstractUiCard.js';
import { uiCmd } from '../cmd.js';
import { uiIcon } from '../icon.js';

const METADATA_KEYS = ['zoom', 'vintage', 'source', 'description', 'resolution', 'accuracy'];


/**
 * UiBackgroundCard
 */
export class UiBackgroundCard extends AbstractUiCard {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'background';

    const l10n = context.systems.l10n;
    const map = context.systems.map;

    this._currSourceID = null;
    this._metadata = {};

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.updateMetadata = this.updateMetadata.bind(this);
    this.deferredRender = debounce(this.rerender, 250);
    this.deferredUpdateMetadata = debounce(this.updateMetadata, 250);

    // Event listeners
    map
      .on('draw', this.deferredRender)
      .on('move', this.deferredUpdateMetadata);

    this.key = uiCmd('⌘⇧' + l10n.t('info_panels.background.key'));
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
    const imagery = context.systems.imagery;
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
      .text(l10n.t('info_panels.background.title'));


    // .card-content
    const $content = $wrap.selectAll('.card-content');

    const source = imagery.baseLayerSource();
    const sourceID = source?.key;  // note: use `key` here, for Wayback it will include the date
    if (!source) return;

    // Empty out metadata if source has changed..
    if (this._currSourceID !== sourceID) {
      this._currSourceID = sourceID;
      this._metadata = {};
    }

    // Empty out the DOM content and rebuild from scratch..
    $content.html('');

    let $list = $content
      .append('ul')
      .attr('class', 'background-info');

    $list
      .append('li')
      .text(source.name);

    // The metadata fetching is not currently working for the Esri sources.
    // todo: We should get that working, but for now just show the date we have.
    if (source.id === 'EsriWayback') {
      $list
        .append('li')
        .text(l10n.t('background.wayback.date') + ':')
        .append('span')
        .text(source.date || l10n.t('inspector.unknown'));
    }

    // Add list items for all the imagery metadata
    METADATA_KEYS.forEach(k => {
      $list
        .append('li')
        .attr('class', `background-info-list-${k}`)
        .classed('hide', !this._metadata[k])
        .text(l10n.t(`info_panels.background.${k}`) + ':')
        .append('span')
        .attr('class', `background-info-span-${k}`)
        .text(this._metadata[k]);
    });

    this.deferredUpdateMetadata();

    // Add buttons
    const toggleTiles = context.getDebug('tile') ? 'hide_tiles' : 'show_tiles';

    $content
      .append('a')
      .text(l10n.t(`info_panels.background.${toggleTiles}`))
      .attr('href', '#')
      .attr('class', 'button button-toggle-tiles')
      .on('click', e => {
        e.preventDefault();
        context.setDebug('tile', !context.getDebug('tile'));
        this.render();
      });
  }


  /**
   * updateMetadata
   */
  updateMetadata() {
    if (!this.visible) return;
    if (!this.$wrap) return;   // called too early?

    const context = this.context;
    const imagery = context.systems.imagery;
    const l10n = context.systems.l10n;
    const viewport = context.viewport;
    const $content = this.$wrap.selectAll('.card-content');

    const source = imagery.baseLayerSource();
    const sourceID = source?.key;  // note: use `key` here, for Wayback it will include the date
    if (!source) return;

    // Empty out metadata if source has changed..
    if (this._currSourceID !== sourceID) {
      this._currSourceID = sourceID;
      this._metadata = {};
    }

    // Look for a loaded tile that covers the center of the viewport.
    const centerLoc = viewport.centerLoc();
    const centerExtent = new Extent(centerLoc);
    const layer = context.scene().layers.get('background');
    const tileMap = layer?._tileMaps.get(sourceID);
    let tileCoord, tileZoom;

    if (tileMap) {
      for (const tile of tileMap.values()) {
        if (!tile.loaded) continue;
        if (tile.wgs84Extent.contains(centerExtent)) {
          tileCoord = tile.xyz;
          tileZoom = tile.xyz[2];
          break;
        }
      }
    }

    // update zoom
    const zoom = tileZoom || Math.floor(viewport.transform.zoom);
    this._metadata.zoom = String(zoom);
    $content.selectAll('.background-info-list-zoom')
      .classed('hide', false)
      .selectAll('.background-info-span-zoom')
      .text(this._metadata.zoom);

    if (!tileCoord) return;

    // attempt async update of the rest of the fields..
    source.getMetadata(centerLoc, tileCoord, (err, result) => {
      if (err || this._currSourceID !== sourceID) return;

      // update vintage
      const vintage = result.vintage;
      this._metadata.vintage = vintage?.range || l10n.t('inspector.unknown');
      $content.selectAll('.background-info-list-vintage')
        .classed('hide', false)
        .selectAll('.background-info-span-vintage')
        .text(this._metadata.vintage);

      // update other metadata
      METADATA_KEYS.forEach(k => {
        if (k === 'zoom' || k === 'vintage') return;  // done already

        const val = result[k];
        this._metadata[k] = val;
        $content.selectAll(`.background-info-list-${k}`)
          .classed('hide', !val)
          .selectAll(`.background-info-span-${k}`)
          .text(val);
      });
    });
  }

}
