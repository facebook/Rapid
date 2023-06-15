import { select as d3_select } from 'd3-selection';

import { AbstractSystem } from './AbstractSystem';
import { utilDetect } from '../util/detect';
import { utilGetDimensions } from '../util/dimensions';

import {
  uiAccount, uiAttribution, uiContributors, UiDefs, uiEditMenu,
  uiFeatureInfo, uiFlash, uiFullScreen, uiGeolocate, uiIcon,
  uiInfo, uiIntro, uiIssuesInfo, uiLoading, uiMapInMap,
  uiMap3dViewer, uiPhotoViewer, uiRapidServiceLicense,
  uiRapidWhatsNew, uiRapidSplash, uiRestore, uiScale, uiShortcuts,
  uiSidebar, uiSourceSwitch, uiSpinner, uiStatus, uiTooltip,
  uiTopToolbar, uiVersion, uiZoom, uiZoomToSelection, uiCmd,
} from '../ui';

import {
  uiPaneBackground, uiPaneHelp, uiPaneIssues, uiPaneMapData, uiPanePreferences
} from '../ui/panes';


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
    this._loadPromise = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.resize = this.resize.bind(this);
    this._clickBugLink = this._clickBugLink.bind(this);
  }


  /**
   * init
   * Called one time after all objects have been instantiated.
   */
  init() {
    const context = this.context;

    this.authModal = uiLoading(context).blocking(true);
    this.defs = new UiDefs(context);
    this.flash = uiFlash(context);
    this.editMenu = uiEditMenu(context);
    // this.info = uiInfo(context);
    this.sidebar = uiSidebar(context);
    this.photoviewer = uiPhotoViewer(context);
    this.shortcuts = uiShortcuts(context);

    // Setup event handlers
    window.addEventListener('beforeunload', () => context.save());
    window.addEventListener('unload', () => context.editSystem().unlock());
    window.addEventListener('resize', this.resize);

    const l10n = this.context.localizationSystem();
    l10n.initAsync()
      .then(() => {
        this.authModal.message(l10n.tHtml('loading_auth'));

        const osm = context.services.get('osm');
        if (osm) {
          osm
            .on('authLoading', () => context.container()?.call(this.authModal))
            .on('authDone', () => this.authModal.close());
        }

        context.keybinding()
          .on('⌫', e => e.preventDefault())
          .on([l10n.t('sidebar.key'), '`', '²', '@'], this.sidebar.toggle)   // iD#5663, iD#6864 - common QWERTY, AZERTY
          .on(uiCmd('⌘' + l10n.t('background.key')), e => {
            if (e) {
              e.stopImmediatePropagation();
              e.preventDefault();
            }
            const imagerySystem = context.imagerySystem();
            const storageSystem = context.storageSystem();
            const previousBackground = imagerySystem.findSource(storageSystem.getItem('background-last-used-toggle'));
            if (previousBackground) {
              const currentBackground = imagerySystem.baseLayerSource();
              storageSystem.setItem('background-last-used-toggle', currentBackground.id);
              storageSystem.setItem('background-last-used', previousBackground.id);
              imagerySystem.baseLayerSource(previousBackground);
            }
          });
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



  render(container) {
// this is a bit non-standard for how our ui components usually render, but for now
// we'll guard so that this code can only happen one time to set everything up..
if (this._didRender) return;  // one time only
this.didRender = true;

    const context = this.context;
    const l10n = context.localizationSystem();

    container
      .attr('lang', l10n.localeCode())
      .attr('dir', l10n.textDirection());

    // setup fullscreen keybindings (no button shown at this time)
    container
      .call(uiFullScreen(context));

    const map = context.mapSystem();
    map.redrawEnabled = false;  // don't draw until we've set zoom/lat/long

    container
      .append('svg')
      .attr('id', 'rapid-defs')
      .call(this.defs.render);

    // Sidebar
    container
      .append('div')
      .attr('class', 'sidebar')
      .call(this.sidebar);

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
      .attr('class', 'map-control zoombuttons')
      .call(uiZoom(context));

    controls
      .append('div')
      .attr('class', 'map-control zoom-to-selection-control')
      .call(uiZoomToSelection(context));

    controls
      .append('div')
      .attr('class', 'map-control geolocate-control')
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
      .call(uiTooltip(context).title(l10n.tHtml('report_a_bug')).placement('top'));

    issueLinks
      .append('a')
      .attr('target', '_blank')
      .attr('href', 'https://github.com/openstreetmap/iD/blob/develop/CONTRIBUTING.md#translating')
      .call(uiIcon('#rapid-icon-translate', 'light'))
      .call(uiTooltip(context).title(l10n.tHtml('help_translate')).placement('top'));

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
    map.redrawEnabled = true;

    context.enter('browse');


    // What to show first?
    const editSystem = context.editSystem();
    const urlHash = context.urlHashSystem();
    const startWalkthrough = urlHash.initialHashParams.get('walkthrough') === 'true';

    if (startWalkthrough) {
      container.call(uiIntro(context));   // Jump right into walkthrough..

    } else if (editSystem.lock() && editSystem.hasRestorableChanges()) {
      container.call(uiRestore(context));   // Offer to restore previous edits..

    } else {
// uiRapidSplash is a bit outdated, so just always start with uiRapidWhatsNew
//      if (context.storageSystem().getItem('sawRapidSplash')) {
       container.call(uiRapidWhatsNew(context));    // Show "Whats New"
//      } else {
//        container.call(uiRapidSplash(context));      // Show "Welcome to Rapid"
//      }
    }
  }


  // renders the Rapid interface into the container node
  ensureLoaded() {
    if (this._loadPromise) return this._loadPromise;

    // Wait for strings and presets to be ready before rendering the UI
    const context = this.context;
    const l10n = context.localizationSystem();
    const presetSystem = context.presetSystem();

    return this._loadPromise = Promise.all([
      l10n.initAsync(),
      presetSystem.initAsync()
    ])
    .then(() => {
      const container = context.container();
      if (!container.empty()) {
        this.render(container);
      }
    })
    .catch(err => console.error(err));  // eslint-disable-line
  }


// Removing for now, this will not work as written (it is a good idea though)
// For it to work, it has to live in context, and all the core systems will need to have
// their own restart method.  They would need to do things like reload the localizations
// and then re-init all the things, including setting up the key bindings and strings
//  // `restart()` will destroy and rebuild the entire Rapid interface,
//  // for example to switch the locale while Rapid is running.
//  restart() {
//    context.keybinding().clear();
//    this._loadPromise = null;
//    context.container().selectAll('*').remove();
//    this.ensureLoaded();
//  }


  resize(offset) {
    const context = this.context;
    const container = context.container();
    const map = context.mapSystem();

    // Recalc dimensions of map and sidebar.. (`true` = force recalc)
    // This will call `getBoundingClientRect` and trigger reflow,
    //  but the values will be cached for later use.
    const dims = utilGetDimensions(container.select('.main-content'), true);
    utilGetDimensions(container.select('.sidebar'), true);

    // When adjusting the sidebar width, pan the map so it stays centered on the same location.
    if (offset !== undefined) {
      map.pan(offset);
    }

    map.dimensions = dims;
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
    const l10n = context.localizationSystem();
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



  /* showEditMenu
   * @param  anchorPoint  Array [x,y] screen coordinate where the menu should be anchored
   * @param  triggerType  String  'touch', 'pen', or 'rightclick' that triggered the menu
   * @param  operations   seems not passed in - code below figures it out.
   */
  showEditMenu(anchorPoint, triggerType, operations) {
    this.editMenu.close();   // remove any displayed menu

    const context = this.context;
    const mode = context.mode();
    //TODO: Remove this after the mode rewrite has completed
    if (!operations && mode.operations) operations = typeof mode.operations === 'function' ? mode.operations() : mode.operations;
    if (!operations || !operations.length) return;
    if (!context.editable()) return;

    let surfaceNode = context.surface().node();
    if (surfaceNode.focus) {   // FF doesn't support it
      // focus the surface or else clicking off the menu may not trigger browse mode
      surfaceNode.focus();
    }

    for (const operation of operations) {
      if (typeof operation.point === 'function') {
        operation.point(anchorPoint);  // let the operation know where the menu is
      }
    }

    this.editMenu
      .anchorLoc(context.projection.invert(anchorPoint))
      .triggerType(triggerType)
      .operations(operations);

    // render the menu
    context.mapSystem().overlay.call(this.editMenu);
  }


  // remove any existing menu no matter how it was added
  closeEditMenu() {
    this.editMenu.close();
  }


  _clickBugLink() {
    let link = new URL('https://github.com/facebook/Rapid/issues/new');

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
