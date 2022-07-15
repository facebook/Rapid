import _debounce from 'lodash-es/debounce';
import { select as d3_select } from 'd3-selection';
import { Extent } from '@id-sdk/math';

import { AbstractUiPanel } from './AbstractUiPanel';
import { t } from '../../core/localizer';

const METADATA_KEYS = ['zoom', 'vintage', 'source', 'description', 'resolution', 'accuracy'];


/**
 * UiPanelBackground
 */
export class UiPanelBackground extends AbstractUiPanel {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'background';
    this.label = t.html('info_panels.background.title');
    this.key = t('info_panels.background.key');

    this._selection = d3_select(null);
    this._currSourceID = null;
    this._metadata = {};

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.updateMetadata = this.updateMetadata.bind(this);

    this._deferredRender = _debounce(this.render, 250);
    this._deferredUpdateMetadata = _debounce(this.updateMetadata, 250);
  }


  /**
   * enable
   * @param  `selection`  A d3-selection to a `div` that the panel should render itself into
   */
  enable(selection) {
    if (this._enabled) return;

    this._enabled = true;
    this._selection = selection;
    this._currSourceID = null;
    this._metadata = {};

    this.context.map()
      .on('drawn.info-background', this._deferredRender)
      .on('move.info-background', this._deferredUpdateMetadata);
  }


  /**
   * disable
   */
  disable() {
    if (!this._enabled) return;

    this._deferredRender.cancel();
    this._deferredUpdateMetadata.cancel();

    this._selection.html('');  // empty DOM

    this._enabled = false;
    this._selection = d3_select(null);
    this._currSourceID = null;
    this._metadata = {};

    this.context.map()
      .on('drawn.info-background', null)
      .on('move.info-background', null);
  }


  /**
   * render
   */
  render() {
    if (!this._enabled) return;

    const context = this.context;
    const selection = this._selection;
    const background = context.background();

    const source = background.baseLayerSource();
    if (!source) return;

    // Empty out metadata if source has changed..
    if (this._currSourceID !== source.id) {
      this._currSourceID = source.id;
      this._metadata = {};
    }

    // Empty out the DOM content and rebuild from scratch..
    selection.html('');

    let list = selection
      .append('ul')
      .attr('class', 'background-info');

    list
      .append('li')
      .html(source.label());

    // Add list items for all the imagery metadata
    METADATA_KEYS.forEach(k => {
      list
        .append('li')
        .attr('class', `background-info-list-${k}`)
        .classed('hide', !this._metadata[k])
        .html(t.html(`info_panels.background.${k}`) + ':')
        .append('span')
        .attr('class', `background-info-span-${k}`)
        .text(this._metadata[k]);
    });

    this._deferredUpdateMetadata();

    // Add buttons
    const toggleTiles = context.getDebug('tile') ? 'hide_tiles' : 'show_tiles';

    selection
      .append('a')
      .html(t.html(`info_panels.background.${toggleTiles}`))
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
    if (!this._enabled) return;

    const context = this.context;
    const selection = this._selection;
    const background = context.background();

    const source = background.baseLayerSource();
    if (!source) return;

    // Empty out metadata if source has changed..
    if (this._currSourceID !== source.id) {
      this._currSourceID = source.id;
      this._metadata = {};
    }

    // Look for a loaded tile that covers the center of the map.
    const center = context.map().center();
    const centerExtent = new Extent(center);
    const layer = context.map().layers().getLayer('background');
    const tileMap = layer && layer._tileMaps.get(source.id);
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
    const zoom = tileZoom || Math.floor(context.map().zoom());
    this._metadata.zoom = String(zoom);
    selection.selectAll('.background-info-list-zoom')
      .classed('hide', false)
      .selectAll('.background-info-span-zoom')
      .text(this._metadata.zoom);

    if (!tileCoord) return;

    // attempt async update of the rest of the fields..
    source.getMetadata(center, tileCoord, (err, result) => {
      if (err || this._currSourceID !== source.id) return;

      // update vintage
      const vintage = result.vintage;
      this._metadata.vintage = (vintage && vintage.range) || t('info_panels.background.unknown');
      selection.selectAll('.background-info-list-vintage')
        .classed('hide', false)
        .selectAll('.background-info-span-vintage')
        .text(this._metadata.vintage);

      // update other metadata
      METADATA_KEYS.forEach(k => {
        if (k === 'zoom' || k === 'vintage') return;  // done already

        const val = result[k];
        this._metadata[k] = val;
        selection.selectAll(`.background-info-list-${k}`)
          .classed('hide', !val)
          .selectAll(`.background-info-span-${k}`)
          .text(val);
      });
    });
  }

}
