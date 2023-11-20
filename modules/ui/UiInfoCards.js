import { selection } from 'd3-selection';

import { UiBackgroundCard } from './cards/UiBackgroundCard.js';
import { UiHistoryCard } from './cards/UiHistoryCard.js';
import { UiLocationCard } from './cards/UiLocationCard.js';
import { UiMeasurementCard } from './cards/UiMeasurementCard.js';
import { UiYuleLogCard } from './cards/UiYuleLogCard.js';
import { utilCmd } from '../util/cmd.js';


/**
 * UiInfoCards
 * This component acts as the container for the information cards.
 * "Cards" are user interface elements that can float on top of the map
 * and provide extra information about the map or the selection.
 */
export class UiInfoCards {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this._wasVisible = new Set();
    this._keys = null;

    // Create child components
    this.BackgroundCard = new UiBackgroundCard(context);
    this.HistoryCard = new UiHistoryCard(context);
    this.LocationCard = new UiLocationCard(context);
    this.MeasurementCard = new UiMeasurementCard(context);
    this.YuleLogCard = new UiYuleLogCard(context);

    // Info Cards
    this.cards = [
      this.BackgroundCard,
      this.HistoryCard,
      this.LocationCard,
      this.MeasurementCard,
      this.YuleLogCard
    ];

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.toggle = this.toggle.bind(this);
    this._setupKeybinding = this._setupKeybinding.bind(this);

    // Setup event handlers..
    const l10n = context.systems.l10n;
    l10n.on('localechange', this._setupKeybinding);
    this._setupKeybinding();
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

    // .info-cards container
    let $wrap = $parent.selectAll('.info-cards')
      .data([0]);

    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', 'info-cards');

    $wrap = $wrap.merge($$wrap);

    for (const Card of this.cards) {
      $wrap.call(Card.render);
    }
  }


  /**
   * toggle
   * Toggles all info cards on/off
   * @param  {Event} e? - triggering event (if any)
   */
  toggle(e) {
    if (e) e.preventDefault();

    // Which cards are currently visible?
    const currVisible = new Set();
    for (const Card of this.cards) {
      if (Card.visible) {
        currVisible.add(Card);
      }
    }

    // Some cards are shown - toggle them off
    if (currVisible.size) {
      this._wasVisible = currVisible;
      for (const Card of currVisible) {
        Card.hide(e);
      }

    // No cards are shown - toggle them on
    } else {
      if (!this._wasVisible.size) {
        this._wasVisible.add(this.MeasurementCard);  // at least 1 should be visible
      }
      for (const Card of this._wasVisible) {
        Card.show(e);
      }
    }

    this.render();
  }


  /**
   * _setupKeybinding
   * This sets up the keybinding, replacing existing if needed
   */
  _setupKeybinding() {
    const context = this.context;
    const keybinding = context.keybinding();
    const l10n = context.systems.l10n;

    if (Array.isArray(this._keys)) {
      keybinding.off(this._keys);
    }

    // Bind ⌘I to show/hide all cards
    this._keys = [utilCmd('⌘' + l10n.t('shortcuts.command.toggle_all_cards.key'))];
    context.keybinding().on(this._keys, this.toggle);
  }

}
