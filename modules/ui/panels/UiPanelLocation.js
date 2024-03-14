import { select as d3_select } from 'd3-selection';
import debounce from 'lodash-es/debounce.js';

import { AbstractUiPanel } from './AbstractUiPanel.js';


/**
 * UiPanelBackground
 */
export class UiPanelLocation extends AbstractUiPanel {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'location';

    const l10n = context.systems.l10n;
    this.title = l10n.t('info_panels.location.title');
    this.key = l10n.t('info_panels.location.key');

    this._selection = d3_select(null);
    this._currLocation = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.updateLocation = this.updateLocation.bind(this);
    this._deferredUpdateLocation = debounce(this.updateLocation, 1000);  // no more than 1/sec
  }


  /**
   * enable
   * @param  `selection`  A d3-selection to a `div` that the panel should render itself into
   */
  enable(selection) {
    if (this._enabled) return;

    this._enabled = true;
    this._selection = selection;
    this._currLocation = null;

    this.context.surface().on('pointermove.info-location', this.render);
  }


  /**
   * disable
   */
  disable() {
    if (!this._enabled) return;

    this._deferredUpdateLocation.cancel();

    this._selection.html('');  // empty DOM

    this._enabled = false;
    this._selection = d3_select(null);
    this._currLocation = null;

    this.context.surface().on('pointermove.info-location', null);
  }


  /**
   * render
   */
  render() {
    if (!this._enabled) return;

    const context = this.context;
    const selection = this._selection;
    const l10n = context.systems.l10n;
    const map = context.systems.map;
    const loc = map.mouseLoc();    // Mouse coordinates as [lon,lat]

    // Empty out the DOM content and rebuild from scratch..
    selection.html('');

    const list = selection
      .append('ul');

    // Append coordinates of mouse
    list
      .append('li')
      .text(l10n.dmsCoordinatePair(loc))
      .append('li')
      .text(l10n.decimalCoordinatePair(loc));

    // Append reverse geolocated placename
    selection
      .append('div')
      .attr('class', 'location-info')
      .text(this._currLocation || ' ');

    this._deferredUpdateLocation(loc);
  }


  /**
   * updateLocation
   * Performs a reverse geolocation lookup to get the name of the place for the given loc
   * Then updates the `.location-info` div in the panel.
   * @param `loc`  coordinates to lookup as [lon,lat]
   */
  updateLocation(loc) {
    if (!this._enabled) return;

    const selection = this._selection;
    const context = this.context;
    const l10n = context.systems.l10n;
    const nominatim = context.services.nominatim;

    if (nominatim) {
      nominatim.reverse(loc, (err, result) => {
        this._currLocation = result ? result.display_name : l10n.t('info_panels.location.unknown_location');
        selection.selectAll('.location-info')
          .text(this._currLocation);
      });
    } else {
      this._currLocation = l10n.t('info_panels.location.unknown_location');
      selection.selectAll('.location-info')
        .text(this._currLocation);
    }
  }

}
