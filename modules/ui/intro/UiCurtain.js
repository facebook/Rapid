import { Extent, numClamp, vecAdd } from '@rapid-sdk/math';
import { easeLinear as d3_easeLinear } from 'd3-ease';
import { select as d3_select } from 'd3-selection';

import { uiToggle } from '../toggle.js';


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
    this._containerRect = null;     // The container rectangle covers the entire Rapid application
    this._mapRect = null;           // The map rectangle is the div in which the map will be drawn
    this._supersurfaceRect = null;  // The supersurface contains the drawing canvas, may be expanded/rotated
    this._revealRect = null;        // The hole in the curtain being revealed

    this._darknessDirty = true;     // need to recompute the darkness?
    this._tooltipDirty = true;      // need to recompute the tooltip?
    this._inTransition = false;

    this._curtain = d3_select(null);
    this._tooltip = d3_select(null);

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.enable = this.enable.bind(this);
    this.disable = this.disable.bind(this);
    this.redraw = this.redraw.bind(this);
    this.resize = this.resize.bind(this);
  }


  /**
   * enable
   * Creates curtain and adds it as a child of the given d3 selection, and registers event handlers
   * @param  `selection`  A d3-selection to a `div` that the curtain should render itself into
   */
  enable(selection) {
    if (this._enabled) return;
    this._enabled = true;

    this._revealOptions = null;
    this._containerRect = null;
    this._mapRect = null;
    this._supersurfaceRect = null;
    this._revealRect = null;

    this._darknessDirty = true;
    this._tooltipDirty = true;
    this._inTransition = false;

    this._curtain = selection
      .append('svg')
      .attr('class', 'curtain')
      .style('top', 0)
      .style('left', 0);

    this._tooltip = selection
      .append('div')
      .attr('class', 'tooltip');

    this._tooltip
      .append('div')
      .attr('class', 'popover-arrow');

    this._tooltip
      .append('div')
      .attr('class', 'popover-inner');

// bhousel todo
// I think if the use resizes the sidebar, it will affect the size of mainmap
// and the math of things will be wrong.  We might need to build some UiSystem
// resize event instead of just listening to the `window` resize event.
    // register event handlers
    d3_select(window).on('resize.curtain', this.resize);
    this.context.systems.map.on('move', this.redraw);

    this.resize();   // get the width/height
  }


  /**
   * disable
   * Removes all curtain data and unregisters event handlers
   */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    this._curtain.remove();
    this._curtain = d3_select(null);

    this._tooltip.remove();
    this._tooltip = d3_select(null);

    this._revealOptions = null;
    this._containerRect = null;
    this._mapRect = null;
    this._supersurfaceRect = null;
    this._revealRect = null;

    // unregister event handlers
    d3_select(window).on('resize.curtain', null);
    this.context.systems.map.off('move', this.redraw);
  }


  /**
   * resize
   * Recalculate the dimensions of container and map rectangles and redraw everything
   */
  resize() {
    const container = this.context.container();
    const containerNode = container.node();
    this._containerRect = this._copyRect(containerNode.getBoundingClientRect());

    const mapNode = container.select('.main-map').node();
    this._mapRect = this._copyRect(mapNode.getBoundingClientRect());

    const supersurfaceNode = container.select('.main-map > .supersurface').node();
    this._supersurfaceRect = this._copyRect(supersurfaceNode.getBoundingClientRect());

    const [w, h] = [this._containerRect.width, this._containerRect.height];
    this._curtain
      .attr('width', w)
      .attr('height', h);

    this._revealRect = null;
    this._darknessDirty = true;
    this._curtain.selectAll('path').interrupt();
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
    this._revealOptions = Object.assign({}, opts, { duration: 250 });

    this._revealRect = null;
    this._darknessDirty = true;
    this._tooltipDirty = true;

    this.redrawDarkness(this._revealOptions.duration);
    this.redrawTooltip();

    return this._tooltip;
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
   * Recalculates the curtain path and the `_revealRect` hole being revealed.
   *
   * This is only done one time, unless there is a revealExtent that needs
   *  to be reprojected whenver the map moves
   */
  redrawDarkness(duration = 0) {
    if (!this._darknessDirty) return;  // nothing to do

    const container = this._containerRect;
    const mainmap = this._mapRect;
    const supersurface = this._supersurfaceRect;
    if (!container || !mainmap || !supersurface) return;   // called too early

    const opts = this._revealOptions;
    const padding = opts?.revealPadding ?? 0;
    let reveal;   // reveal rectangle
    let clampTo;

    // Determine what to reveal in the hole..
    if (opts) {

      // An Extent in lon/lat coords
      if (opts.revealExtent instanceof Extent) {
        // Watch out, we can't project min/max directly (because Y is flipped).
        // Construct topLeft, bottomRight corners and project those.
        // `true` = consider rotation and project to screen coordinates, not surface coordinates
        const view = this.context.viewport;
        let min = view.project([opts.revealExtent.min[0], opts.revealExtent.max[1]], true);  // topLeft
        let max = view.project([opts.revealExtent.max[0], opts.revealExtent.min[1]], true);  // bottomRight

        // Convert map coords on the supersurface to global coords in the container
        min = vecAdd(min, [supersurface.left, supersurface.top]);
        max = vecAdd(max, [supersurface.left, supersurface.top]);

        // For extent reveals, clamp the dimensions to just the portion that fits in the map mainmap..
        // (otherwise we could pan a point off the map but still reveal a square of sidebar)
        clampTo = mainmap;

        reveal = {
          left:   min[0],
          top:    min[1],
          right:  max[0],
          bottom: max[1],
          width:  max[0] - min[0],
          height: max[1] - min[1]
        };

      // A D3-selector selector or a DOMElement (in screen coordinates)
      } else {
        if (opts.revealSelector && !opts.revealNode) {   // d3-select an element
          opts.revealNode = d3_select(opts.revealSelector).node();
        }
        if (opts.revealNode instanceof Element) {   // calculate rect in screen coords
          clampTo = container;
          reveal = this._copyRect(opts.revealNode.getBoundingClientRect());
        }
      }

      if (reveal) {
        // apply clamp and padding
        reveal.left   = numClamp(reveal.left - padding, clampTo.left, clampTo.right);
        reveal.top    = numClamp(reveal.top - padding, clampTo.top, clampTo.bottom);
        reveal.right  = numClamp(reveal.right + padding, clampTo.left, clampTo.right);
        reveal.bottom = numClamp(reveal.bottom + padding, clampTo.top, clampTo.bottom);
        reveal.width = reveal.right - reveal.left;
        reveal.height = reveal.bottom - reveal.top;

        this._revealRect = reveal;
      }
    }

    // calculate path
    // cover container in darkness
    const c = container;
    const r = reveal;
    let path = `M${c.left},${c.top} L${c.left},${c.bottom} L${c.right},${c.bottom}, L${c.right},${c.top} Z`;
    if (r) {   // cut out a hole
      path += ` M${r.left},${r.top} L${r.left},${r.bottom} L${r.right},${r.bottom}, L${r.right},${r.top} Z`;
    }

    let darkness = this._curtain.selectAll('path')
      .data([0])
      .interrupt();

    let enter = darkness.enter()
      .append('path')
      .attr('x', 0)
      .attr('y', 0)
      .attr('class', 'curtain-darkness');

    let update = darkness.merge(enter);

    if (duration > 0) {
      this._inTransition = true;
      update = update
        .transition()
        .duration(duration)
        .ease(d3_easeLinear)
        .on('end interrupt', () => this._inTransition = false);

    } else {
      this._inTransition = false;
    }

    update
      .attr('d', path);

    // We don't need to recompute the darkness again, unless there is
    // a `revealExtent` that needs to be reprojected on every map move.
    this._darknessDirty = opts?.revealExtent;
  }


  /**
   * redrawTooltip
   * Recalculates the tooltip contents and placement.
   * Contents are only updated once, but placement recalculates whenever this is called.
   */
  redrawTooltip() {
    const container = this._containerRect;
    if (!container) return;   // called too early

    const opts = this._revealOptions;
    let reveal;   // reveal rectangle

    // Determine the reveal rectangle to use to determine the tooltip placement...
    // It can be specified separately, but it defaults to the already calculated `this._revealRect`
    if (opts) {
      if (opts.tipSelector && !opts.tipNode) {   // d3-select an element
        opts.tipNode = d3_select(opts.tipSelector).node();
      }

      if (opts.tipNode instanceof Element) {   // calculate rect in screen coords
        reveal = this._copyRect(opts.tipNode.getBoundingClientRect());
      }
      if (!reveal && this._revealRect) {
        reveal = this._copyRect(this._revealRect);
      }
    }

    // If we have a reveal rectangle and html, make the tooltip and calculate its placement...
    let html = opts?.tipHtml;
    if (reveal && html) {
      const klass = 'curtain-tooltip popover tooltip arrowed in ' + (opts.tooltipClass || '');

      if (this._tooltipDirty) {   // Replace tooltip contents...
        if (html.indexOf('**') !== -1) {
          if (html.indexOf('<span') === 0) {
            html = html.replace(/^(<span.*?>)(.+?)(\*\*)/, '$1<span>$2</span>$3');
          } else {
            html = html.replace(/^(.+?)(\*\*)/, '<span>$1</span>$2');
          }
          // pseudo markdown bold text for the instruction section..
          html = html.replace(/\*\*(.*?)\*\*/g, '<span class="instruction">$1</span>');
        }

        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');   // emphasis
        html = html.replace(/\{br\}/g, '<br/><br/>');       // linebreak

        if (opts.buttonText && opts.buttonCallback) {
          html += `<div class="button-section"><button href="#" class="button action">${opts.buttonText}</button></div>`;
        }

        this._tooltip
          .attr('class', klass)
          .selectAll('.popover-inner')
          .html(html);

        if (opts.buttonText && opts.buttonCallback) {
          this._tooltip.selectAll('button.action')
            .on('click', e => {
              e.preventDefault();
              opts.buttonCallback();
            });
        }

        this._tooltipDirty = false;
      }

      // Determine the size the tooltip wants to be.
      const ARROW = 5;  // allow extra space for the arrow
      let tip = this._copyRect(this._tooltip.node().getBoundingClientRect());
      let placement, tipX, tipY;

      // Clamp reveal box to container
      reveal.left   = numClamp(reveal.left, container.left, container.right);
      reveal.top    = numClamp(reveal.top, container.top, container.bottom);
      reveal.right  = numClamp(reveal.right, container.left, container.right);
      reveal.bottom = numClamp(reveal.bottom, container.top, container.bottom);
      reveal.width = reveal.right - reveal.left;
      reveal.height = reveal.bottom - reveal.top;

      // Determine tooltip placement..
      if (reveal.bottom < 100) {   // reveal near top of view, tooltip below it..
        placement = 'bottom';
        tipX = reveal.left + (reveal.width / 2) - (tip.width / 2);
        tipY = reveal.bottom;

      } else if (reveal.top > container.height - 140) {  // reveal near bottom of view, tooltip above it..
        placement = 'top';
        tipX = reveal.left + (reveal.width / 2) - (tip.width / 2);
        tipY = reveal.top - tip.height;

      } else {   // tooltip to the side of the reveal..
        tipY = reveal.top + (reveal.height / 2) - (tip.height / 2);

        if (this.context.systems.l10n.textDirection() === 'rtl') {
          if (reveal.left - tip.width - ARROW < 70) {
            placement = 'right';
            tipX = reveal.right + ARROW;
          } else {
            placement = 'left';
            tipX = reveal.left - tip.width - ARROW;
          }
        } else {
          if (reveal.right + ARROW + tip.width > container.width - 70) {
            placement = 'left';
            tipX = reveal.left - tip.width - ARROW;
          } else {
            placement = 'right';
            tipX = reveal.right + ARROW;
          }
        }
      }

//      if (opts.duration !== 0 || !this._tooltip.classed(placement)) {
//        this._tooltip.call(uiToggle(true));
//      }

      this._tooltip
        .style('left', `${tipX}px`)
        .style('top', `${tipY}px`)
        .attr('class', klass + ' ' + placement);

      // shift popover-inner if it is very close to the top or bottom edge
      // (doesn't affect the placement of the popover-arrow)
      let shiftY = 0;
      if (placement === 'left' || placement === 'right') {
        if (tipY < 60) {
          shiftY = 60 - tipY;
        } else if (tipY + tip.height > container.height - 100) {
          shiftY = container.height - tipY - tip.height - 100;
        }
      }
      this._tooltip.selectAll('.popover-inner')
        .style('top', `${shiftY}px`);

    } else {
      this._tooltip.classed('in', false).call(uiToggle(false));
      this._tooltipDirty = false;
    }
  }


  /**
   * _copyRect
   * ClientRects are immutable, so copy them to an Object in case we need to trim the height/width.
   * @param    src   Source `DOMRect` (or something that looks like one)
   * @returns  Object containing the copied properties
   */
  _copyRect(src) {
    return {
      left: src.left,
      top: src.top,
      right: src.right,
      bottom: src.bottom,
      width: src.width,
      height: src.height
    };
  }

}
