import { utilArrayDifference, utilArrayUniq } from '@id-sdk/util';

import { t, localizer } from '../../core/localizer';
import { localize } from './helper';
import { prefs } from '../../core/preferences';
import { fileFetcher } from '../../core/file_fetcher';
import { Graph } from '../../core/Graph';
import { osmEntity } from '../../osm/entity';
import { services } from '../../services';
import { svgIcon } from '../../svg/icon';
import { uiCurtain } from '../curtain';

import { uiIntroWelcome } from './welcome';
import { uiIntroNavigation } from './navigation';
import { uiIntroPoint } from './point';
import { uiIntroArea } from './area';
import { uiIntroLine } from './line';
import { uiIntroBuilding } from './building';
import { uiIntroStartEditing } from './start_editing';
import { uiIntroRapid } from './rapid';

const chapterUi = {
  welcome: uiIntroWelcome,
  navigation: uiIntroNavigation,
  point: uiIntroPoint,
  area: uiIntroArea,
  line: uiIntroLine,
  building: uiIntroBuilding,
  rapid: uiIntroRapid,
  startEditing: uiIntroStartEditing
};

const chapterFlow = [
  'welcome',
  'navigation',
  'point',
  'area',
  'line',
  'building',
  'rapid',
  'startEditing'
];


export function uiIntro(context, skipToRapid) {
  const INTRO_IMAGERY = 'EsriWorldImageryClarity';
  let _introGraph = {};
  let _rapidGraph = {};
  let _currChapter;


  function intro(selection) {
    Promise.all([
      fileFetcher.get('intro_rapid_graph'),
      fileFetcher.get('intro_graph')
    ])
    .then(values => {
      const rapidData = values[0];
      const introData = values[1];

      for (const id in rapidData) {
        if (!_rapidGraph[id]) {
          _rapidGraph[id] = osmEntity(localize(rapidData[id]));
        }
      }
      for (const id in introData) {
        if (!_introGraph[id]) {
          _introGraph[id] = osmEntity(localize(introData[id]));
        }
      }

      selection.call(startIntro, skipToRapid);
    });
  }


  function startIntro(selection) {
    context.enter('browse');

    const osm = context.connection();
    const imagery = context.imagery();
    const history = context.history();

    // Save current state
    const original = {
      hash: window.location.hash,
      transform: context.map().transform(),
      opacity: context.background().brightness,
      baseLayer: imagery.baseLayerSource(),
      overlayLayers: imagery.overlayLayerSources(),
      historyJSON: history.toJSON(),
      baseEntities: history.graph().base().entities,
      caches: osm && osm.caches()
    };

    // Show sidebar and disable the sidebar resizing button
    // (this needs to be before `context.inIntro(true)`)
    context.ui().sidebar.expand();
    context.container().selectAll('button.sidebar-toggle').classed('disabled', true);

    // Block saving
    context.inIntro(true);

    // Load semi-real data used in intro
    if (osm) { osm.toggle(false).reset(); }
    history.reset();
    history.merge(Object.values(new Graph().load(_introGraph).entities));
    history.checkpoint('initial');

    // Setup imagery
    const introSource = imagery.findSource(INTRO_IMAGERY) || imagery.findSource('Bing');
    imagery.baseLayerSource(introSource);
    original.overlayLayers.forEach(d => imagery.toggleOverlayLayer(d));
    imagery.opacity = 1;

    // Setup data layers (only OSM & ai-features, and the background imagery)
    context.scene().onlyLayers(['osm', 'rapid', 'background']);

    // Setup RapiD Walkthrough dataset and disable service
    let rapidDatasets = context.rapidContext().datasets();
    const rapidDatasetsCopy = JSON.parse(JSON.stringify(rapidDatasets));   // deep copy
    Object.keys(rapidDatasets).forEach(id => rapidDatasets[id].enabled = false);

    rapidDatasets.rapid_intro_graph = {
      id: 'rapid_intro_graph',
      beta: false,
      added: true,
      enabled: true,
      conflated: false,
      service: 'fbml',
      color: '#da26d3',
      label: 'RapiD Walkthrough'
    };

    if (services.fbMLRoads) {
      services.fbMLRoads.toggle(false);    // disable network
      const entities = Object.values(new Graph().load(_rapidGraph).entities);
      services.fbMLRoads.merge('rapid_intro_graph', entities);
    }

    context.background().brightness = 1;

    const curtain = uiCurtain(context.container().node());
    selection.call(curtain);

    // Store that the user started the walkthrough..
    prefs('walkthrough_started', 'yes');

    // Restore previous walkthrough progress..
    const storedProgress = prefs('walkthrough_progress') || '';
    let progress = storedProgress.split(';').filter(Boolean);

    let chapters = chapterFlow.map((chapter, i) => {
      let s = chapterUi[chapter](context, curtain.reveal)
        .on('done', () => {

          buttons
            .filter(d => d.title === s.title)
            .classed('finished', true);

          if (i < chapterFlow.length - 1) {
            const next = chapterFlow[i + 1];
            context.container().select(`button.chapter-${next}`)
              .classed('next', true);
          }

          // Store walkthrough progress..
          progress.push(chapter);
          prefs('walkthrough_progress', utilArrayUniq(progress).join(';'));
        });
      return s;
    });

    // When leaving walkthrough...
    chapters[chapters.length - 1].on('startEditing', () => {
      // Store walkthrough progress..
      progress.push('startEditing');
      prefs('walkthrough_progress', utilArrayUniq(progress).join(';'));

      // Store if walkthrough is completed..
      const incomplete = utilArrayDifference(chapterFlow, progress);
      if (!incomplete.length) {
        prefs('walkthrough_completed', 'yes');
      }

      // Restore RapiD datasets and service
      let rapidDatasets = context.rapidContext().datasets();
      delete rapidDatasets.rapid_intro_graph;
      Object.keys(rapidDatasetsCopy).forEach(id => rapidDatasets[id].enabled = rapidDatasetsCopy[id].enabled);
      Object.assign(rapidDatasets, rapidDatasetsCopy);
      if (services.fbMLRoads) {
        services.fbMLRoads.toggle(true);
      }

      curtain.remove();
      navwrap.remove();
      context.container().selectAll('button.sidebar-toggle').classed('disabled', false);

      // Restore State
      if (original.caches) { osm.toggle(true).reset().caches(original.caches); }
      history.reset().merge(Object.values(original.baseEntities));
      imagery.baseLayerSource(original.baseLayer);
      original.overlayLayers.forEach(d => imagery.toggleOverlayLayer(d));
      context.background().brightness = original.opacity;
      if (original.historyJSON) { history.fromJSON(original.historyJSON, false); }
      context.map().transform(original.transform);
      window.location.replace(original.hash);

      context.inIntro(false);
    });


    let navwrap = selection
      .append('div')
      .attr('class', 'intro-nav-wrap fillD');

    navwrap
      .append('svg')
      .attr('class', 'intro-nav-wrap-logo')
      .append('use')
      .attr('xlink:href', '#iD-logo-walkthrough');

    let buttonwrap = navwrap
      .append('div')
      .attr('class', 'joined')
      .selectAll('button.chapter');

    let buttons = buttonwrap
      .data(chapters)
      .enter()
      .append('button')
      .attr('class', (d, i) => `chapter chapter-${chapterFlow[i]}`)
      .on('click', enterChapter);

    buttons
      .append('span')
      .html(d => t.html(d.title));

    buttons
      .append('span')
      .attr('class', 'status')
      .call(svgIcon((localizer.textDirection() === 'rtl' ? '#iD-icon-backward' : '#iD-icon-forward'), 'inline'));

    enterChapter(null, chapters[skipToRapid ? 6 : 0]);


    function enterChapter(d3_event, newChapter) {
      if (_currChapter) _currChapter.exit();
      context.enter('browse');

      _currChapter = newChapter;
      _currChapter.enter();

      buttons
        .classed('next', false)
        .classed('active', d => d.title === _currChapter.title);
    }
  }


  return intro;
}
