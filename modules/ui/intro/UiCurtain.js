import { Extent, numClamp, vecAdd } from '@rapid-sdk/math';
import { easeLinear } from 'd3-ease';
import { selection, select } from 'd3-selection';
import * as Polyclip from 'polyclip-ts';


/**
 * UiCurtain
 */
export class UiCurtain {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this._enabled = false;

    this._revealOptions = null;
    this._revealPolygon = [];       // The hole in the curtain being revealed

    this._darknessDirty = true;     // need to recompute the darkness?
    this._tooltipDirty = true;      // need to recompute the tooltip?
    this._inTransition = false;

    // D3 selections
    this.$parent = null;
    this.$curtain = null;
    this.$tooltip = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.enable = this.enable.bind(this);
    this.disable = this.disable.bind(this);
    this.redraw = this.redraw.bind(this);
    this.resize = this.resize.bind(this);
  }


  /**
   * enable
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  enable($parent = this.$parent) {
    if ($parent instanceof selection) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    if (this._enabled) return;
    this._enabled = true;

    this._revealOptions = null;
    this._revealPolygon = [];

    this._darknessDirty = true;
    this._tooltipDirty = true;
    this._inTransition = false;

    this.$curtain = $parent
      .append('svg')
      .attr('class', 'curtain')
      .style('top', 0)
      .style('left', 0);

    this.$tooltip = $parent
      .append('div')
      .attr('class', 'tooltip');

    this.$tooltip
      .append('div')
      .attr('class', 'popover-arrow');

    this.$tooltip
      .append('div')
      .attr('class', 'popover-inner');

    // register event handlers
    this.context.systems.map.on('move', this.redraw);
    this.context.systems.ui.on('uichange', this.resize);

    this.resize();   // get the width/height
  }


  /**
   * disable
   * Removes all curtain data and unregisters event handlers
   */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    this.$curtain.remove();
    this.$curtain = null;

    this.$tooltip.remove();
    this.$tooltip = null;

    this._revealOptions = null;
    this._revealPolygon = [];

    // unregister event handlers
    this.context.systems.map.off('move', this.redraw);
    this.context.systems.ui.off('uichange', this.resize);
  }


  /**
   * resize
   * Recalculate the dimensions of container and map rectangles and redraw everything
   */
  resize() {
    if (!this.$curtain) return;  // called too early?

    this._revealPolygon = [];
    this._darknessDirty = true;
    this.$curtain.selectAll('path').interrupt();
    this._inTransition = false;
    this.redraw();
  }


  /**
   * Hide just makes the curtain completely black
   */
  hide() {
    this.reveal({ duration: 0 });
  }


  /**
   * Reveal locks in the details of what the curtain should be doing
   *   - what to reveal
   *   - tooltip / action button
   *
   * @param  {Object}    [opts]
   * @param  {integer}   [opts.duration]        transition time in milliseconds (default 250ms)
   * @param  {string}    [opts.revealSelector]  reveal selector
   * @param  {Element}   [opts.revealNode]      reveal node
   * @param  {Extent}    [opts.revealExtent]    reveal Extent in WGS85 coords [lon,lat]
   * @param  {number}    [opts.revealPadding]   reveal additional padding in px
   * @param  {string}    [opts.tipSelector]     tooltip selector
   * @param  {Element}   [opts.tipNode]         tooltip node
   * @param  {string}    [opts.tipHtml]         tooltip html
   * @param  {string}    [opts.tipClass]        tooltip class
   * @param  {string}    [opts.buttonText]      create a button with this text label
   * @param  {function}  [opts.buttonCallback]  the callback for the button
   */
  reveal(opts = {}) {
    if (!this.$tooltip) return;  // called too early?

    this._revealOptions = Object.assign({}, opts, { duration: 250 });
    this._revealPolygon = [];
    this._darknessDirty = true;
    this._tooltipDirty = true;

    this.redrawDarkness(this._revealOptions.duration);
    this.redrawTooltip();

    return this.$tooltip;
  }


  /**
   * redraw
   */
  redraw() {
    if (this._inTransition) return;
    this.redrawDarkness();
    this.redrawTooltip();
  }


  /**
   * redrawDarkness
   * Recalculates the curtain path and the `_revealPolygon` hole being revealed.
   *
   * This is only done one time, unless there is a revealExtent that needs
   *  to be reprojected whenver the map moves
   */
  redrawDarkness(duration = 0) {
    if (!this._darknessDirty) return;  // nothing to do
    if (!this.$curtain) return;   // called too early

    const context = this.context;
    const $container = context.container();
    const containerNode = $container.node();
    const containerRect = this._copyRect(containerNode.getBoundingClientRect());

    const mapNode = $container.select('.main-map').node();
    const mapRect = this._copyRect(mapNode.getBoundingClientRect());

    const opts = this._revealOptions;
    this._revealPolygon = [];

    // Determine what to reveal in the hole..
    if (opts) {

      // An Extent in lon/lat coords
      if (opts.revealExtent instanceof Extent) {
        const view = this.context.viewport;

        // Add 50px overscan experiment, see UISystem.js
        // Maybe find a nicer way to include overscan and view padding into places like this.
        const origin = [mapRect.left - 50, mapRect.top - 50];
        // Normally `view.project` projects lng/lat coordinates to map coordinates.
        // `true` = consider rotation and project to coordinates on the surface instead
        const extentPolygon = opts.revealExtent.polygon().map(point => vecAdd(origin, view.project(point, true)));

        // Note: padding not supported for revealExtent
        // (If you want it padded, just request a larger extent)

        // For extent reveals, clip the polygon to include only the portion that fits in the map..
        // (otherwise we could pan the reveal off the map but still reveal a square of sidebar)
        // trim away from toolbars
        mapRect.top += 72;
        mapRect.botom -= 30;

        const mapPolygon = [
          [mapRect.left, mapRect.top],
          [mapRect.left, mapRect.bottom],
          [mapRect.right, mapRect.bottom],
          [mapRect.right, mapRect.top],
          [mapRect.left, mapRect.top]
        ];

        const clipped = Polyclip.intersection([extentPolygon], [mapPolygon]);
        if (clipped?.length) {
          this._revealPolygon = clipped[0][0];  // Polyclip returns a multipolygon
        }

      // A D3-selector selector or a DOMElement (in screen coordinates)
      } else {
        if (opts.revealSelector && !opts.revealNode) {   // d3-select an element
          opts.revealNode = select(opts.revealSelector).node();
        }
        if (opts.revealNode instanceof Element) {
          const rect = this._copyRect(opts.revealNode.getBoundingClientRect());

          // Include padding..
          const padding = opts?.revealPadding ?? 0;
          rect.left -= padding;
          rect.top -= padding;
          rect.right += padding;
          rect.bottom += padding;

          this._revealPolygon = [
            [rect.left, rect.top],
            [rect.left, rect.bottom],
            [rect.right, rect.bottom],
            [rect.right, rect.top],
            [rect.left, rect.top]
          ];
        }
      }
    }

    // calculate path
    // cover container in darkness
    const cr = containerRect;
    let path = `M${cr.left},${cr.top} L${cr.left},${cr.bottom} L${cr.right},${cr.bottom}, L${cr.right},${cr.top} Z`;

    if (this._revealPolygon.length) {   // cut out the hole
      const polygon = this._revealPolygon;
      path += ` M${polygon[0]} `;
      for (let i = 1; i < polygon.length - 1; i++) {   // can skip the last one, 'Z' will close it
        path += `L${polygon[i]} `;
      }
      path += 'Z';
    }

    let $darkness = this.$curtain.selectAll('path')
      .data([0])
      .interrupt();

    // enter
    const $$darkness = $darkness.enter()
      .append('path')
      .attr('class', 'curtain-darkness');

    // update
    $darkness = $darkness.merge($$darkness);

    if (duration > 0) {
      this._inTransition = true;
      $darkness = $darkness
        .transition()
        .duration(duration)
        .ease(easeLinear)
        .on('end interrupt', () => this._inTransition = false);

    } else {
      this._inTransition = false;
    }

    $darkness
      .attr('d', path);

    // We don't need to recompute the darkness again, unless there is
    // a `revealExtent` that needs to be recalculated on every map move.
    this._darknessDirty = opts?.revealExtent;
  }


  /**
   * redrawTooltip
   * Recalculates the tooltip contents and placement.
   * Contents are only updated once, but placement recalculates whenever this is called.
   */
  redrawTooltip() {
    if (!this.$tooltip) return;   // called too early

    const context = this.context;
    const isRTL = context.systems.l10n.isRTL();

    const $container = context.container();
    const containerNode = $container.node();
    const containerRect = this._copyRect(containerNode.getBoundingClientRect());

    const opts = this._revealOptions;
    let reveal;   // bounding box of the thing being revealed

    // Determine the reveal rectangle to use to determine the tooltip placement...
    // It can be specified separately, but it defaults to the already calculated `this._revealPolygon`
    if (opts) {
      if (opts.tipSelector && !opts.tipNode) {   // d3-select an element
        opts.tipNode = select(opts.tipSelector).node();
      }
      if (opts.tipNode instanceof Element) {   // get rect from the tipNode
        reveal = this._copyRect(opts.tipNode.getBoundingClientRect());
      }
      if (!reveal && this._revealPolygon.length) {  // convert existing reveal polygon to rectangle bounds
        reveal = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
        for (const [x, y] of this._revealPolygon) {
          reveal.left = Math.min(reveal.left, x);
          reveal.top = Math.min(reveal.top, y);
          reveal.right = Math.max(reveal.right, x);
          reveal.bottom = Math.max(reveal.bottom, y);
        }
      }
    }

    // If we have a reveal rectangle and html, make the tooltip and calculate its placement...
    let html = opts?.tipHtml;
    if (reveal && html) {
      const klass = 'curtain-tooltip popover tooltip arrowed in ' + (opts.tooltipClass || '');

      if (this._tooltipDirty) {   // Replace tooltip contents...

        // Extract instruction, if any
        let instruction = '';
        const match = html.match(/\*\*(.*?)\*\*/);
        if (match) {
          instruction = match[1];
          html = html.replace(/\*\*.*?\*\*/g, '');
        }

        html = html.replace(/<span[^>]*><\/span>/g, '');    // remove empty spans
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');   // emphasis
        html = html.replace(/\{br\}/g, '<br/>');            // linebreak

        if (instruction) {
          html += `<div class="instruction">${instruction}</div>`;
        }
        if (opts.buttonText && opts.buttonCallback) {
          html += `<div class="button-section"><button href="#" class="button action">${opts.buttonText}</button></div>`;
        }

        this.$tooltip
          .attr('class', klass)
          .selectAll('.popover-inner')
          .html(html);

        if (opts.buttonText && opts.buttonCallback) {
          this.$tooltip.selectAll('button.action')
            .on('click', e => {
              e.preventDefault();
              opts.buttonCallback();
            });
        }

        this._tooltipDirty = false;
      }

      // Determine the size the tooltip wants to be.
      const ARROW = 5;  // allow extra space for the arrow
      const tip = this._copyRect(this.$tooltip.node().getBoundingClientRect());
      let placement, tipX, tipY;

      // Clamp reveal rectangle to container and update width/height..
      reveal.left   = numClamp(reveal.left,   containerRect.left, containerRect.right);
      reveal.top    = numClamp(reveal.top,    containerRect.top,  containerRect.bottom);
      reveal.right  = numClamp(reveal.right,  containerRect.left, containerRect.right);
      reveal.bottom = numClamp(reveal.bottom, containerRect.top,  containerRect.bottom);
      reveal.width  = reveal.right - reveal.left;
      reveal.height = reveal.bottom - reveal.top;

      // Determine tooltip placement..
      if (reveal.bottom < 100) {   // reveal near top of view, tooltip below it..
        placement = 'bottom';
        tipX = reveal.left + (reveal.width / 2) - (tip.width / 2);
        tipY = reveal.bottom;

      } else if (reveal.top > containerRect.height - 140) {  // reveal near bottom of view, tooltip above it..
        placement = 'top';
        tipX = reveal.left + (reveal.width / 2) - (tip.width / 2);
        tipY = reveal.top - tip.height;

      } else {   // tooltip to the side of the reveal..
        tipY = reveal.top + (reveal.height / 2) - (tip.height / 2);

        if (isRTL) {
          if (reveal.left - tip.width - ARROW < 70) {
            placement = 'right';
            tipX = reveal.right + ARROW;
          } else {
            placement = 'left';
            tipX = reveal.left - tip.width - ARROW;
          }
        } else {
          if (reveal.right + ARROW + tip.width > containerRect.width - 70) {
            placement = 'left';
            tipX = reveal.left - tip.width - ARROW;
          } else {
            placement = 'right';
            tipX = reveal.right + ARROW;
          }
        }
      }

      this.$tooltip
        .style('left', `${tipX}px`)
        .style('top', `${tipY}px`)
        .attr('class', klass + ' ' + placement);

      // shift popover-inner if it is very close to the top or bottom edge
      // (doesn't affect the placement of the popover-arrow)
      let shiftY = 0;
      if (placement === 'left' || placement === 'right') {
        if (tipY < 60) {
          shiftY = 60 - tipY;
        } else if (tipY + tip.height > containerRect.height - 100) {
          shiftY = containerRect.height - tipY - tip.height - 100;
        }
      }
      this.$tooltip.selectAll('.popover-inner')
        .style('top', `${shiftY}px`);

    } else {
      this.$tooltip.classed('in', false);
      this._tooltipDirty = false;
    }
  }


  /**
   * _copyRect
   * ClientRects are immutable, so copy them to an Object in case we need to pad/trim them.
   * @param   {DOMRect}  src - rectangle (or something that looks like one)
   * @returns {Object}  Object containing the copied properties
   */
  _copyRect(src) {
    return {
      x: src.x,
      y: src.y,
      left: src.left,
      top: src.top,
      right: src.right,
      bottom: src.bottom,
      width: src.width,
      height: src.height
    };
  }

}
