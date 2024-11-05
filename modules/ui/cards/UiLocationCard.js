import { selection } from 'd3-selection';
import debounce from 'lodash-es/debounce.js';

import { AbstractUiCard } from './AbstractUiCard.js';
import { uiCmd } from '../cmd.js';
import { uiIcon } from '../icon.js';


/**
 * UiLocationCard
 */
export class UiLocationCard extends AbstractUiCard {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'location';

    const eventManager = context.systems.gfx.events;
    const l10n = context.systems.l10n;

    this._currLocation = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.updateLocation = this.updateLocation.bind(this);
    this._deferredUpdateLocation = debounce(this.updateLocation, 1000);  // no more than 1/sec

    // Event listeners
    eventManager.on('pointermove', this.rerender);

    this.key = uiCmd('⌘⇧' + l10n.t('info_panels.location.key'));
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
    const l10n = context.systems.l10n;
    const map = context.systems.map;
    const loc = map.mouseLoc();    // Mouse coordinates as [lon,lat]

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
      .text(l10n.t('info_panels.location.title'));

    // .card-content
    const $content = $wrap.selectAll('.card-content');

    // Empty out the DOM content and rebuild from scratch..
    $content.html('');


    const $list = $content
      .append('ul');

    // Append coordinates of mouse
    $list
      .append('li')
      .text(l10n.dmsCoordinatePair(loc))
      .append('li')
      .text(l10n.decimalCoordinatePair(loc));

    // Append reverse geolocated placename
    $content
      .append('div')
      .attr('class', 'location-info')
      .text(this._currLocation || ' ');

    this._deferredUpdateLocation(loc);
  }


  /**
   * updateLocation
   * Performs a reverse geolocation lookup to get the name of the place for the given loc
   * Then updates the `.location-info` div in the panel.
   * @param {Array<number>}  loc -  coordinates to lookup as [lon,lat]
   */
  updateLocation(loc) {
    if (!this.visible) return;
    if (!this.$wrap) return;   // called too early?

    const context = this.context;
    const l10n = context.systems.l10n;
    const nominatim = context.services.nominatim;
    const $content = this.$wrap.selectAll('.card-content');

    if (nominatim) {
      nominatim.reverse(loc, (err, result) => {
        this._currLocation = result ? result.display_name : l10n.t('info_panels.location.unknown_location');
        $content.selectAll('.location-info')
          .text(this._currLocation);
      });
    } else {
      this._currLocation = l10n.t('info_panels.location.unknown_location');
      $content.selectAll('.location-info')
        .text(this._currLocation);
    }
  }

}
