import { easeLinear as d3_easeLinear } from 'd3-ease';
import { select as d3_select } from 'd3-selection';

import { localizer } from '../../core/localizer';
import { uiToggle } from '../toggle';


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

    this._curtain = d3_select(null);
    this._tooltip = d3_select(null);

    // The current box that the curtain is revealing
    this.box = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.enable = this.enable.bind(this);
    this.disable = this.disable.bind(this);
    this.resize = this.resize.bind(this);
    this.redraw = this.redraw.bind(this);
  }


  /**
   * enable
   * Creates curtain and adds it as a child of the given d3 selection, and registers event handlers
   * @param  `selection`  A d3-selection to a `div` that the panel should render itself into
   */
  enable(selection) {
    if (this._enabled) return;

    this._enabled = true;
    this._selection = selection;
    this.box = null;

    this._curtain = selection
      .append('svg')
      .attr('class', 'curtain')
      .style('top', 0)
      .style('left', 0);

    this._curtain
      .append('path')
      .attr('x', 0)
      .attr('y', 0)
      .attr('class', 'curtain-darkness');

    this._tooltip = selection
      .append('div')
      .attr('class', 'tooltip');

    this._tooltip
      .append('div')
      .attr('class', 'popover-arrow');

    this._tooltip
      .append('div')
      .attr('class', 'popover-inner');

    // register event handlers
    d3_select(window).on('resize.curtain', this.resize);

    this.resize();
  }


  /**
   * disable
   * Removes all curtain data and unregisters event handlers
   */
  disable() {
    if (!this._enabled) return;

    this._curtain.remove();
    this._tooltip.remove();

    this._curtain = d3_select(null);
    this._tooltip = d3_select(null);
    this.box = null;

    // unregister event handlers
    d3_select(window).on('resize.curtain', null);
  }


  /**
   * resize
   */
  resize() {
    const containerNode = this.context.container().node();

    this._curtain
      .attr('width', containerNode.clientWidth)
      .attr('height', containerNode.clientHeight);

    this.redraw();
  }


  /**
   * Reveal cuts the curtain to highlight the given box,
   * and shows a tooltip with instructions next to the box.
   *
   * @param  {String|ClientRect} [box]   box used to cut the curtain
   * @param  {String}    [text]          text for a tooltip
   * @param  {Object}    [options]
   * @param  {string}    [options.tooltipClass]    optional class to add to the tooltip
   * @param  {integer}   [options.duration]        transition time in milliseconds
   * @param  {string}    [options.buttonText]      if set, create a button with this text label
   * @param  {function}  [options.buttonCallback]  if set, the callback for the button
   * @param  {function}  [options.padding]         extra margin in px to put around bbox
   * @param  {String|ClientRect} [options.tooltipBox]  box for tooltip position, if different from box for the curtain
   */
  reveal(box, html, options) {
    const containerNode = this.context.container().node();
    options = options || {};

    if (typeof box === 'string') {
      box = d3_select(box).node();
    }
    if (box && box.getBoundingClientRect) {
      box = this._copyBox(box.getBoundingClientRect());
      let containerRect = containerNode.getBoundingClientRect();
      box.top -= containerRect.top;
      box.left -= containerRect.left;
    }
    if (box && options.padding) {
      box.top -= options.padding;
      box.left -= options.padding;
      box.bottom += options.padding;
      box.right += options.padding;
      box.height += options.padding * 2;
      box.width += options.padding * 2;
    }

    let tooltipBox;
    if (options.tooltipBox) {
      tooltipBox = options.tooltipBox;
      if (typeof tooltipBox === 'string') {
        tooltipBox = d3_select(tooltipBox).node();
      }
      if (tooltipBox && tooltipBox.getBoundingClientRect) {
        tooltipBox = this._copyBox(tooltipBox.getBoundingClientRect());
      }
    } else {
      tooltipBox = box;
    }

    if (tooltipBox && html) {
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

      if (options.buttonText && options.buttonCallback) {
        html += '<div class="button-section">' +
          '<button href="#" class="button action">' + options.buttonText + '</button></div>';
      }

      let classes = 'curtain-tooltip popover tooltip arrowed in ' + (options.tooltipClass || '');
      this._tooltip
        .classed(classes, true)
        .selectAll('.popover-inner')
        .html(html);

      if (options.buttonText && options.buttonCallback) {
        let button = this._tooltip.selectAll('.button-section .button.action');
        button
          .on('click', function(d3_event) {
            d3_event.preventDefault();
            options.buttonCallback();
          });
      }

      let tip = this._copyBox(this._tooltip.node().getBoundingClientRect());
      const [w, h] = [containerNode.clientWidth, containerNode.clientHeight];
      const TOOLTIP_WIDTH = 200;
      const TOOLTIP_ARROW = 5;
      let side;
      let pos;

      // hack: this will have bottom placement,
      // so need to reserve extra space for the tooltip illustration.
      if (options.tooltipClass === 'intro-mouse') {
        tip.height += 80;
      }

      // trim box dimensions to just the portion that fits in the container..
      if (tooltipBox.top + tooltipBox.height > h) {
        tooltipBox.height -= (tooltipBox.top + tooltipBox.height - h);
      }
      if (tooltipBox.left + tooltipBox.width > w) {
        tooltipBox.width -= (tooltipBox.left + tooltipBox.width - w);
      }

      // determine tooltip placement..
      if (tooltipBox.top + tooltipBox.height < 100) {   // tooltip below box..
        side = 'bottom';
        pos = [
          tooltipBox.left + tooltipBox.width / 2 - tip.width / 2,
          tooltipBox.top + tooltipBox.height
        ];

      } else if (tooltipBox.top > h - 140) {  // tooltip above box..
        side = 'top';
        pos = [
          tooltipBox.left + tooltipBox.width / 2 - tip.width / 2,
          tooltipBox.top - tip.height
        ];

      } else {   // tooltip to the side of the tooltipBox..
        const tipY = tooltipBox.top + tooltipBox.height / 2 - tip.height / 2;

        if (localizer.textDirection() === 'rtl') {
          if (tooltipBox.left - TOOLTIP_WIDTH - TOOLTIP_ARROW < 70) {
            side = 'right';
            pos = [tooltipBox.left + tooltipBox.width + TOOLTIP_ARROW, tipY];
          } else {
            side = 'left';
            pos = [tooltipBox.left - TOOLTIP_WIDTH - TOOLTIP_ARROW, tipY];
          }
        } else {
          if (tooltipBox.left + tooltipBox.width + TOOLTIP_ARROW + TOOLTIP_WIDTH > w - 70) {
            side = 'left';
            pos = [tooltipBox.left - TOOLTIP_WIDTH - TOOLTIP_ARROW, tipY];
          } else {
            side = 'right';
            pos = [tooltipBox.left + tooltipBox.width + TOOLTIP_ARROW, tipY];
          }
        }
      }

      if (options.duration !== 0 || !this._tooltip.classed(side)) {
        this._tooltip.call(uiToggle(true));
      }

      this._tooltip
        .style('top', pos[1] + 'px')
        .style('left', pos[0] + 'px')
        .attr('class', classes + ' ' + side);

      // shift popover-inner if it is very close to the top or bottom edge
      // (doesn't affect the placement of the popover-arrow)
      let shiftY = 0;
      if (side === 'left' || side === 'right') {
        if (pos[1] < 60) {
          shiftY = 60 - pos[1];
        } else if (pos[1] + tip.height > h - 100) {
          shiftY = h - pos[1] - tip.height - 100;
        }
      }
      this._tooltip.selectAll('.popover-inner')
        .style('top', shiftY + 'px');

    } else {
      this._tooltip
        .classed('in', false)
        .call(uiToggle(false));
    }

    this.box = box;
    this.redraw(options.duration);

    return this._tooltip;
  }


  /**
   * redraw
   * Redraws the darkness
   * @param  duration?  optional duration in milliseconds to ease the curtain into view.
   */
  redraw(duration = 0) {
    const containerNode = this.context.container().node();
    const box = this.box;
    const path = this._curtain.selectAll('path');

    path
      .datum(box)
      .interrupt();

    let selection;
    if (duration === 0) {
      selection = path;
    } else {
      selection = path
        .transition()
        .duration(duration || 600)
        .ease(d3_easeLinear);
    }

    selection
      .attr('d', d => {
        const [w, h] = [containerNode.clientWidth, containerNode.clientHeight];
        let path = `M0,0 L0,${h} L${w},${h}, L${w},0 Z`;  // cover container in darkness

        if (d) {   // cut out a hole
          const [left, top, right, bottom] = [d.left, d.top, (d.left + d.width), (d.top + d.height)];
          path += ` M${left},${top} L${left},${bottom} L${right},${bottom}, L${right},${top} Z`;
        }
        return path;
      });
  }


  /**
   * _copyBox
   * ClientRects are immutable, so copy them to an Object, in case we need to trim the height/width.
   * @param    src      Source client rect
   * @returns  Object containing the copied properties
   */
  _copyBox(src) {
    return {
      top: src.top,
      right: src.right,
      bottom: src.bottom,
      left: src.left,
      width: src.width,
      height: src.height
    };
  }

}
