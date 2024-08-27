import { EventEmitter } from '@pixi/utils';
import { numClamp } from '@rapid-sdk/math';
import { select as d3_select } from 'd3-selection';

import { uiIcon } from './icon.js';

const [minW, minH] = [320, 240];
const [trimW, trimH] = [45, 105];  // trim amounts to allow for toolbars


/**
 * UiPhotoViewer
 * The photo viewer is absolutely positioned in the `over-map` div (it floats over the map).
 * It creates a "nine slice" frame like below to allow for resize handles be placed around the edges:
 * (aside: we should extract this into its own component and use it other places
 *  where we want a resizable, movable window - minimap, 3dmap, maybe others)
 *
 *       top-left |   top-middle  | top-right
 *    ------------+---------------+------------
 *    middle-left | middle-middle | middle-right
 *    ------------+---------------+------------
 *    bottom-left | bottom-middle | bottom-right
 *
 *  The 'middle-middle' section is where the various photo services can add their viewers.
 *  Each viewer is classed as 'photo-wrapper' and is absolutely positioned within middle-middle,
 *    inset slightly to allow the user enough of space to use the resize handles.
 *  At any time, only one of the viewers will be visible.
 *
 *
 * Events available:
 *   `resize`  Fires when the photo viewer resizes, receives the new dimensions as `[width, height]`
 *
 * @example
 *  <div class='photoviewer nineslice'>
 *    <div class='top-left'/>
 *    <div class='top-middle'/>
 *    <div class='top-right'/>
 *    <div class='middle-left'/>
 *    <div class='middle-middle'>    // The middle-middle section is where content can go:
 *      <div class='photo-wrapper ms-wrapper'/>   // Streetside photo viewer
 *      <div class='photo-wrapper mly-wrapper'/>  // Mapillary photo viewer
 *      <div class='photo-wrapper osc-wrapper'/>  // KartaView (OpenStreetCam) viewer
 *    </div>
 *    <div class='middle-right'/>
 *    <div class='bottom-left'/>
 *    <div class='bottom-middle'/>
 *    <div class='bottom-right'/>
 *  </div>
 */
export class UiPhotoViewer extends EventEmitter {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super();
    this.context = context;

    // D3 selections
    this.$parent = null;
    this.$viewer = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this._buildResizer = this._buildResizer.bind(this);
    this._onMapResize = this._onMapResize.bind(this);

    const ui = context.systems.ui;
    ui.on('uichange', this._onMapResize);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLEement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    const context = this.context;
    const l10n = context.systems.l10n;
    const photos = context.systems.photos;
    const isRTL = l10n.isRTL();

    // add .photoviewer
    let $viewer = $parent.selectAll('.photoviewer')
      .data([0]);

    const $$viewer = $viewer.enter()
      .append('div')
      .attr('class', 'photoviewer nineslice')
      .attr('dir', 'ltr')
      .classed('hide', true);

    // add .thumb-hide  (Close 'X' button)
    $$viewer
      .append('button')
      .attr('class', 'thumb-hide')
      .on('click', () => photos.hideViewer())
      .append('div')
      .call(uiIcon('#rapid-icon-close'));

    this.$viewer = $viewer = $viewer.merge($$viewer);


    // Construct the nineslice grid
    // (doing this procedurally because the different resize handles have different needs)
    for (const y of ['top', 'middle', 'bottom']) {
      for (const x of ['left', 'middle', 'right']) {
        const k = `${y}-${x}`;

        // enter
        $viewer
          .selectAll(`.${k}`)
          .data([k])
          .enter()
          .append('div')
          .attr('class', k)
          .on('touchstart touchdown touchend', e => e.preventDefault());

        // update - apply the appropriate resizing behaviors
        const $cell = $viewer
          .selectAll(`.${k}`);

        if (k === 'top-left' && isRTL) {
          $cell
            .style('cursor', 'nwse-resize')
            .on('pointerdown', this._buildResizer(k));

        } else if (k === 'top-middle') {
          $cell
            .style('cursor', 'ns-resize')
            .on('pointerdown', this._buildResizer(k));

        } else if (k === 'top-right' && !isRTL) {
          $cell
            .style('cursor', 'nesw-resize')
            .on('pointerdown', this._buildResizer(k));

        } else if (k === 'middle-left' && isRTL) {
          $cell
            .style('cursor', 'ew-resize')
            .on('pointerdown', this._buildResizer(k));

        } else if (k === 'middle-right' && !isRTL) {
          $cell
            .style('cursor', 'ew-resize')
            .on('pointerdown', this._buildResizer(k));

        } else {
          $cell
            .style('cursor', null)
            .on('pointerdown', null);
        }
      }
    }
  }


  /*
   * _buildResizer
   * Creates event handlers for the viewer cell identified by the key.
   * @param  {string}   k - cell key, for example 'top-left', 'top-right', etc.
   * @return {Function} the resizer pointerdown function to attach to the cell
   */
  _buildResizer(k) {
    let pointerId;
    let startX, startY, rectW, rectH;

    /*
     * _pointerdown
     * Pointerdown event handler starts the resize.
     * @param  {PointerEvent}  e - the pointerdown event
     */
    const _pointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      pointerId = e.pointerId || 'mouse';
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.$viewer.node().getBoundingClientRect();
      rectW = rect.width;
      rectH = rect.height;

      d3_select(window)
        .on('pointermove.resize', _pointermove)
        .on('pointerup.resize pointercancel.resize', _pointerup);
    };

    /*
     * _pointermove
     * Pointermove event handler continues the resize.
     * @param  {PointerEvent}  e - the pointermove event
     */
    const _pointermove = (e) => {
      if (pointerId !== (e.pointerId || 'mouse')) return;

      e.preventDefault();
      e.stopPropagation();

      const $content = this.context.container().selectAll('.main-content');
      const mapRect = $content.node().getBoundingClientRect();
      const [maxW, maxH] = [mapRect.width - trimW, mapRect.height - trimH];

      let [w, h] = [rectW, rectH];
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (/left/.test(k))   w -= dx;
      if (/right/.test(k))  w += dx;
      if (/top/.test(k))    h -= dy;

      w = numClamp(w, minW, maxW);
      h = numClamp(h, minH, maxH);

      this.$viewer
        .style('width', `${w}px`)
        .style('height', `${h}px`);

      this.emit('resize', [w, h]);
    };

    /*
     * _pointerup
     * Pointerup event handler completes the resize.
     * @param  {PointerEvent}  e - the pointerup (or pointercancel) event
     */
    const _pointerup = (e) => {
      if (pointerId !== (e.pointerId || 'mouse')) return;

      e.preventDefault();
      e.stopPropagation();

      d3_select(window)
        .on('pointermove.resize pointerup.resize pointercancel.resize', null);
    };

    return _pointerdown;
  }


  /*
   * _onMapResize
   * Called when the main window or sidebar resizes,
   * to check whether the photo viewer still has the space it needs.
   */
  _onMapResize() {
    const $content = this.context.container().selectAll('.main-content');
    const $viewer = this.$viewer;
    if (!$content.size() || !$viewer) return;  // called too early?

    const mapRect = $content.node().getBoundingClientRect();
    const viewerRect = $viewer.node().getBoundingClientRect();
    const [maxW, maxH] = [mapRect.width - trimW, mapRect.height - trimH];
    const [w, h] = [viewerRect.width, viewerRect.height];
    if (w === 0 || h === 0) return;   // viewer is hidden

    const w2 = numClamp(w, minW, maxW);
    const h2 = numClamp(h, minH, maxH);

    if (w !== w2 || h !== h2) {
      $viewer
        .style('width', `${w2}px`)
        .style('height', `${h2}px`);

      this.emit('resize', [w2, h2]);
    }
  }

}
