import { select as d3_select } from 'd3-selection';
import { vecAdd } from '@rapid-sdk/math';

import { AbstractSystem } from './AbstractSystem.js';
import { utilDetect } from '../util/detect.js';
import { utilGetDimensions } from '../util/dimensions.js';

import {
  uiAccount, uiAttribution, uiBearing, uiContributors, UiDefs, uiEditMenu,
  uiFeatureInfo, uiFlash, uiFullScreen, uiGeolocate, uiIcon,
  uiInfo, uiIntro, uiIssuesInfo, uiLoading, uiMapInMap,
  uiMap3dViewer, uiPhotoViewer, uiRapidServiceLicense,
  uiSplash, uiRestore, uiScale, uiShortcuts,
  uiSidebar, uiSourceSwitch, uiSpinner, uiStatus, uiTooltip,
  uiTopToolbar, uiVersion, uiWhatsNew, uiZoom, uiZoomToSelection
} from '../ui/index.js';

import {
  uiPaneBackground, uiPaneHelp, uiPaneIssues, uiPaneMapData, uiPanePreferences
} from '../ui/panes/index.js';


/**
 * `UiSystem` maintains the user interface
 */
export class UiSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'ui';
    this.dependencies = new Set(['editor', 'imagery', 'l10n', 'map', 'storage', 'urlhash']);

    this.authModal = null;
    this.defs = null;
    this.flash = null;
    this.editMenu = null;
    this.info = null;
    this.sidebar = null;
    this.photoviewer = null;
    this.shortcuts = null;

    this._didRender = false;
    this._needWidth = {};
    this._startPromise = null;
    this._initPromise = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.resize = this.resize.bind(this);
    this._clickBugLink = this._clickBugLink.bind(this);
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    if (this._initPromise) return this._initPromise;

    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
        return Promise.reject(`Cannot init:  ${this.id} requires ${id}`);
      }
    }

    const context = this.context;
    const l10n = context.systems.l10n;
    const prerequisites = Promise.all([
      l10n.initAsync(),
    ]);

    return this._initPromise = prerequisites
      .then(() => {
        window.addEventListener('resize', () =>  this.resize());

        // After l10n is ready we can make these
        this.authModal = uiLoading(context).blocking(true);
        this.defs = new UiDefs(context);
        this.flash = uiFlash(context);
        this.editMenu = uiEditMenu(context);
        // this.info = uiInfo(context);
        this.sidebar = uiSidebar(context);
        this.photoviewer = uiPhotoViewer(context);
        this.shortcuts = uiShortcuts(context);

        this.authModal.message(l10n.tHtml('loading_auth'));

        const osm = context.services.osm;
        if (osm) {
          osm
            .on('authLoading', () => context.container()?.call(this.authModal))
            .on('authDone', () => this.authModal.close());
        }
      });

// not sure what these were for
//    container.on('click.ui', d3_event => {
//      if (d3_event.button !== 0) return;  // we're only concerned with the primary mouse button
//      if (!d3_event.composedPath) return;
//
//      // some targets have default click events we don't want to override
//      const isOkayTarget = d3_event.composedPath().some(node => {
//        return node.nodeType === 1 && (  // we only care about element nodes
//          node.nodeName === 'INPUT' ||   // clicking <input> focuses it and/or changes a value
//          node.nodeName === 'LABEL' ||   // clicking <label> affects its <input> by default
//          node.nodeName === 'A');        // clicking <a> opens a hyperlink by default
//       });
//      if (isOkayTarget) return;
//
//      d3_event.preventDefault();   // disable double-tap-to-zoom on touchscreens
//    });
//
//    // only WebKit supports gesture events
//    // Listening for gesture events on iOS 13.4+ breaks double-tapping,
//    // but we only need to do this on desktop Safari anyway. – #7694
//    if ('GestureEvent' in window && !detected.isMobileWebKit) {
//      // On iOS we disable pinch-to-zoom of the UI via the `touch-action`
//      // CSS property, but on desktop Safari we need to manually cancel the
//      // default gesture events.
//      container.on('gesturestart.ui gesturechange.ui gestureend.ui', d3_event => {
//        // disable pinch-to-zoom of the UI via multitouch trackpads on macOS Safari
//        d3_event.preventDefault();
//      });
//    }

  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    if (this._startPromise) return this._startPromise;

    // Render one time
    const container = this.context.container();
    if (!container.empty()) {
      this.render(container);
    }

    this._started = true;
    return this._startPromise = Promise.resolve();
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    // don't leave stale state in the inspector
    const container = this.context.container();
    if (!container.empty()) {
      container.select('.inspector-wrap *').remove();
    }

    return Promise.resolve();
  }


  /**
   * render
   */
  render(container) {
// this is a bit non-standard for how our ui components usually render, but for now
// we'll guard so that this code can only happen one time to set everything up..
if (this._didRender) return;  // one time only
this.didRender = true;

    const context = this.context;
    const l10n = context.systems.l10n;

    container
      .attr('lang', l10n.localeCode())
      .attr('dir', l10n.textDirection());

    // setup fullscreen keybindings (no button shown at this time)
    container
      .call(uiFullScreen(context));

    const map = context.systems.map;
    map.pause();  // don't draw until we've set zoom/lat/long

    container
      .append('svg')
      .attr('id', 'rapid-defs')
      .call(this.defs.render);

    // Sidebar
    container
      .append('div')
      .attr('class', 'sidebar')
      .call(this.sidebar);

    // Now that the sidebar has been insantiated, it's safe to bind the keypress handlers
// bhousel - todo: not sure why this is here - the sidebar should be responsible for this
    context.keybinding()
      .on([l10n.t('sidebar.key'), '`', '²', '@'], this.sidebar.toggle);   // iD#5663, iD#6864 - common QWERTY, AZERTY

    const content = container
      .append('div')
      .attr('class', 'main-content active');

    // The map
    content
      .append('div')
      .attr('class', 'main-map')
      .attr('dir', 'ltr')
      .call(map.render);

    // Top toolbar
    content
      .append('div')
      .attr('class', 'top-toolbar-wrap')
      .append('div')
      .attr('class', 'top-toolbar fillD')
      .call(uiTopToolbar(context));


    // Over Map
    const overMap = content
      .append('div')
      .attr('class', 'over-map');

    // HACK: Mobile Safari 14 likes to select anything selectable when long-
    // pressing, even if it's not targeted. This conflicts with long-pressing
    // to show the edit menu. We add a selectable offscreen element as the first
    // child to trick Safari into not showing the selection UI.
    overMap
      .append('div')
      .attr('class', 'select-trap')
      .text('t');

    overMap
      .call(uiMapInMap(context));

    overMap
      .call(uiMap3dViewer(context));

    overMap
      .append('div')
      .attr('class', 'spinner')
      .call(uiSpinner(context));


    // Map controls
    const controls = overMap
      .append('div')
      .attr('class', 'map-controls');

    controls
      .append('div')
      .attr('class', 'map-control bearing')
      .call(uiBearing(context));

    controls
      .append('div')
      .attr('class', 'map-control zoombuttons')
      .call(uiZoom(context));

    controls
      .append('div')
      .attr('class', 'map-control zoom-to-selection')
      .call(uiZoomToSelection(context));

    controls
      .append('div')
      .attr('class', 'map-control geolocate')
      .call(uiGeolocate(context));


    // Panes
    // This should happen after map is initialized, as some require surface()
    const panes = overMap
      .append('div')
      .attr('class', 'map-panes');

    const uiPanes = [
      uiPaneBackground(context),
      uiPaneMapData(context),
      uiPaneIssues(context),
      uiPanePreferences(context),
      uiPaneHelp(context)
    ];

    for (const component of uiPanes) {
      controls
        .append('div')
        .attr('class', `map-control map-pane-control ${component.id}-control`)
        .call(component.renderToggleButton);

      panes
        .call(component.renderPane);
    }


    // Info Panels
    this.info = uiInfo(context);
    overMap
      .call(this.info);

    overMap
      .append('div')
      .attr('class', 'photoviewer')
      .classed('al', true)       // 'al'=left,  'ar'=right
      .classed('hide', true)
      .call(this.photoviewer);

    overMap
      .append('div')
      .attr('class', 'attribution-wrap')
      .attr('dir', 'ltr')
      .call(uiAttribution(context));

    // Footer
    let about = content
      .append('div')
      .attr('class', 'map-footer');

    about
      .append('div')
      .attr('class', 'api-status')
      .call(uiStatus(context));

    let footer = about
      .append('div')
      .attr('class', 'map-footer-bar fillD');

    footer
      .append('div')
      .attr('class', 'flash-wrap footer-hide');

    let footerWrap = footer
      .append('div')
      .attr('class', 'main-footer-wrap footer-show');

    footerWrap
      .append('div')
      .attr('class', 'scale-block')
      .call(uiScale(context));

    let aboutList = footerWrap
      .append('div')
      .attr('class', 'info-block')
      .append('ul')
      .attr('class', 'map-footer-list');

    aboutList
      .append('li')
      .attr('class', 'user-list')
      .call(uiContributors(context));

    aboutList
      .append('li')
      .attr('class', 'fb-road-license')
      .attr('tabindex', -1)
      .call(uiRapidServiceLicense(context));

    const apiConnections = context.apiConnections;
    if (apiConnections && apiConnections.length > 1) {
      aboutList
        .append('li')
        .attr('class', 'source-switch')
        .call(uiSourceSwitch(context).keys(apiConnections));
    }

    aboutList
      .append('li')
      .attr('class', 'issues-info')
      .call(uiIssuesInfo(context));

//    aboutList
//      .append('li')
//      .attr('class', 'feature-warning')
//      .call(uiFeatureInfo(context));

    const issueLinks = aboutList
      .append('li');

    issueLinks
      .append('button')
      .attr('class', 'bugnub')
      .attr('tabindex', -1)
      .on('click', this._clickBugLink)
      .call(uiIcon('#rapid-icon-bug', 'bugnub'))
      .call(uiTooltip(context).title(l10n.t('report_a_bug')).placement('top'));

    issueLinks
      .append('a')
      .attr('target', '_blank')
      .attr('href', 'https://github.com/facebook/Rapid/blob/main/CONTRIBUTING.md#translations')
      .call(uiIcon('#rapid-icon-translate', 'light'))
      .call(uiTooltip(context).title(l10n.t('help_translate')).placement('top'));

    aboutList
      .append('li')
      .attr('class', 'version')
      .call(uiVersion(context));

    if (!context.embed()) {
      aboutList
        .call(uiAccount(context));
    }

    container
      .call(this.shortcuts);


    // Setup map dimensions, and allow rendering..
    // This should happen after .main-content and toolbars exist.
    this.resize();
    map.resume();

    context.enter('browse');


    // What to show first?
    const editor = context.systems.editor;
    const storage = context.systems.storage;
    const urlhash = context.systems.urlhash;

    const startWalkthrough = urlhash.initialHashParams.get('walkthrough') === 'true';
    const sawPrivacyVersion = parseInt(storage.getItem('sawPrivacyVersion'), 10) || 0;
    const sawWhatsNewVersion = parseInt(storage.getItem('sawWhatsNewVersion'), 10) || 0;

    if (startWalkthrough) {
      container.call(uiIntro(context));          // Jump right into walkthrough..
    } else if (editor.canRestoreBackup) {
      container.call(uiRestore(context));        // Offer to restore backup edits..
    } else if (sawPrivacyVersion !== context.privacyVersion) {
      container.call(uiSplash(context));         // Show "Welcome to Rapid" / Privacy Policy
    } else if (sawWhatsNewVersion !== context.whatsNewVersion) {
      container.call(uiWhatsNew(context));       // Show "Whats New"
    }
  }



// Removing for now, this will not work as written (it is a good idea though)
// For it to work, it has to live in context, and all the core systems will need to have
// their own restart method.  They would need to do things like reload the localizations
// and then re-init all the things, including setting up the key bindings and strings
//  // `restart()` will destroy and rebuild the entire Rapid interface,
//  // for example to switch the locale while Rapid is running.
//  restart() {
//    context.keybinding().clear();
//    this._startPromise = null;
//    context.container().selectAll('*').remove();
//    this.ensureLoaded();
//  }


  resize(offset) {
    const context = this.context;
    const container = context.container();
    const map = context.systems.map;
    const viewport = context.viewport;

    // Recalc dimensions of map and sidebar.. (`true` = force recalc)
    // This will call `getBoundingClientRect` and trigger reflow,
    //  but the values will be cached for later use.
    let dims = utilGetDimensions(container.select('.main-content'), true);
    utilGetDimensions(container.select('.sidebar'), true);

    // When adjusting the sidebar width, pan the map so it stays centered on the same location.
    if (offset !== undefined) {
      map.pan(offset);
    }

// experiment:
// Previously, the map surfaces were anchored to the top left of the main-map.
// Now, the map surfaces are centered in a CSS Grid, to support rotation around the center.
// We can extend the map dimensions a little bit so that as the user pans, we dont see seams at the edges of the map.
const overscan = 50;
dims = vecAdd(dims, [overscan * 2, overscan * 2]);

    viewport.dimensions = dims;
    this.photoviewer.onMapResize();

    // check if header or footer have overflowed
    this.checkOverflow('.top-toolbar');
    this.checkOverflow('.map-footer-bar');

// this was for the restrictions editor?
// or any other component that needs to know when resizing is happening
//    // Use outdated code so it works on Explorer
//    const resizeWindowEvent = document.createEvent('Event');
//    resizeWindowEvent.initEvent('resizeWindow', true, true);
//    document.dispatchEvent(resizeWindowEvent);
  }


  // Call checkOverflow when resizing or whenever the contents change.
  // I think this was to make button labels in the top bar disappear
  // when more buttons are added than the screen has available width
  checkOverflow(selector, reset) {
    if (reset) {
      delete this._needWidth[selector];
    }

    const selection = this.context.container().select(selector);
    if (selection.empty()) return;

    const scrollWidth = selection.property('scrollWidth');
    const clientWidth = selection.property('clientWidth');
    let needed = this._needWidth[selector] || scrollWidth;

    if (scrollWidth > clientWidth) {    // overflow happening
      selection.classed('narrow', true);
      if (!this._needWidth[selector]) {
        this._needWidth[selector] = scrollWidth;
      }

    } else if (scrollWidth >= needed) {
      selection.classed('narrow', false);
    }
  }


  togglePanes(showPane) {
    const context = this.context;
    const l10n = context.systems.l10n;
    const container = context.container();

    let hidePanes = container.selectAll('.map-pane.shown');
    const side = l10n.isRTL() ? 'left' : 'right';

    hidePanes
      .classed('shown', false)
      .classed('hide', true);

    container.selectAll('.map-pane-control button')
      .classed('active', false);

    if (showPane) {
      hidePanes
        .classed('shown', false)
        .classed('hide', true)
        .style(side, '-500px');

      container.selectAll('.' + showPane.attr('pane') + '-control button')
        .classed('active', true);

      showPane
        .classed('shown', true)
        .classed('hide', false);
      if (hidePanes.empty()) {
        showPane
          .style(side, '-500px')
          .transition()
          .duration(200)
          .style(side, '0px');
      } else {
        showPane
          .style(side, '0px');
      }
    } else {
      hidePanes
        .classed('shown', true)
        .classed('hide', false)
        .style(side, '0px')
        .transition()
        .duration(200)
        .style(side, '-500px')
        .on('end', function() {
          d3_select(this)
            .classed('shown', false)
            .classed('hide', true);
        });
    }
  }


  /*
   * showEditMenu
   * This shows the contextual edit menu, called by the select behavior when the
   *  user right clicks, or long presses, or presses the menu key.
   * @param  {Array}   anchorPoint  - `[x,y]` screen coordinate where the menu should be anchored
   * @param  {string}  triggerType  - (not used?)  'touch', 'pen', or 'rightclick' that triggered the menu
   */
  showEditMenu(anchorPoint, triggerType) {
    this.editMenu.close();   // remove any displayed menu

    const context = this.context;
    const map = context.systems.map;
    const viewport = context.viewport;

    // The mode decides which operations are available
    const operations = context.mode?.operations ?? [];
    if (!operations.length) return;
    if (!context.editable()) return;

    // Focus the surface, otherwise clicking off the menu may not trigger browse mode
    // (bhousel - I don't know whether this is needed anymore in 2024)
    const surfaceNode = context.surface().node();
    if (surfaceNode.focus) {   // FF doesn't support it
      surfaceNode.focus();
    }

    for (const operation of operations) {
      if (typeof operation.point === 'function') {
        operation.point(anchorPoint);  // let the operation know where the menu is
      }
    }

    this.editMenu
      .anchorLoc(viewport.unproject(anchorPoint))
      .triggerType(triggerType)
      .operations(operations);

    // render the menu
    map.overlay.call(this.editMenu);
  }


  /*
   * redrawEditMenu
   * This just redraws the edit menu in place if it is already showing, used in
   * situations where its available operations may have changed, such as Rapid#1311
   */
  redrawEditMenu() {
    const context = this.context;
    const map = context.systems.map;

    // If the menu isn't showing, there's nothing to do
    if (map.overlay.selectAll('.edit-menu').empty()) return;

    // The mode decides which operations are available
    const operations = context.mode?.operations ?? [];

    if (operations.length && context.editable()) {
      this.editMenu.operations(operations);
      map.overlay.call(this.editMenu);   // redraw it
    } else {
      this.editMenu.close();
    }
  }


  /*
   * closeEditMenu
   * Remove any existing menu
   */
  closeEditMenu() {
    this.editMenu.close();
  }


  /*
   * _clickBugLink
   * Opens GitHub to report a bug
   */
  _clickBugLink() {
    const link = new URL('https://github.com/facebook/Rapid/issues/new');

    // From the template we set up at https://github.com/facebook/Rapid/blob/main/.github/ISSUE_TEMPLATE/bug_report.yml
    link.searchParams.append('template', 'bug_report.yml');
    const detected = utilDetect();
    const browser = `${detected.browser} v${detected.version}`;
    const os = `${detected.os}`;
    const userAgent = navigator.userAgent;

    link.searchParams.append('browser', browser);
    link.searchParams.append('os', os);
    link.searchParams.append('useragent', userAgent);
    link.searchParams.append('URL', window.location.href);
    link.searchParams.append('version', this.context.version);

    window.open(link.toString(), '_blank');
  }

}
