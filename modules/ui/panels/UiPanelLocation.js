import _debounce from 'lodash-es/debounce';
import { select as d3_select } from 'd3-selection';

import { AbstractUiPanel } from './AbstractUiPanel';
import { decimalCoordinatePair, dmsCoordinatePair } from '../../util/units';
import { t } from '../../core/localizer';


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
    this.label = t.html('info_panels.location.title');
    this.key = t('info_panels.location.key');

    this._selection = d3_select(null);
    this._currLocation = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.updateLocation = this.updateLocation.bind(this);
    this._deferredUpdateLocation = _debounce(this.updateLocation, 1000);  // no more than 1/sec
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

    // Empty out the DOM content and rebuild from scratch..
    selection.html('');

    let list = selection
      .append('ul');

    // Mouse coordinates as [lon,lat]
    let loc = context.map().mouseLoc();
    if (loc.some(isNaN)) {
      loc = context.map().center();
    }

    // Append coordinates of mouse
    list
      .append('li')
      .text(dmsCoordinatePair(loc))
      .append('li')
      .text(decimalCoordinatePair(loc));

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
    const nominatim = this.context.services.get('nominatim');

    if (!nominatim) {
      this._currLocation = t('info_panels.location.unknown_location');
      selection.selectAll('.location-info')
        .text(this._currLocation);
    } else {
      nominatim.reverse(loc, (err, result) => {
        this._currLocation = result ? result.display_name : t('info_panels.location.unknown_location');
        selection.selectAll('.location-info')
          .text(this._currLocation);
      });
    }
  }

}
