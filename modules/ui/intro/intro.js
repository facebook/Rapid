import { utilArrayDifference, utilArrayUniq } from '@rapid-sdk/util';

import { localize } from './helper';
import { osmEntity } from '../../osm/entity';
import { uiIcon } from '../icon';

import { UiCurtain } from './UiCurtain';
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
    const dataLoaderSystem = context.dataLoaderSystem();
    Promise.all([
      dataLoaderSystem.get('intro_rapid_graph'),
      dataLoaderSystem.get('intro_graph')
    ])
    .then(values => {
      const rapidData = values[0];
      const introData = values[1];

      for (const [id, data] of Object.entries(rapidData)) {
        if (!_rapidGraph[id]) {
          _rapidGraph[id] = osmEntity(localize(context, data));
        }
      }
      for (const [id, data] of Object.entries(introData)) {
        if (!_introGraph[id]) {
          _introGraph[id] = osmEntity(localize(context, data));
        }
      }

      selection.call(startIntro, skipToRapid);
    });
  }


  function startIntro(selection) {
    context.inIntro(true);
    context.enter('browse');

    const l10n = context.localizationSystem();
    const prefs = context.storageSystem();
    const osm = context.services.get('osm');
    const mapwithai = context.services.get('mapwithai');
    const imagery = context.imagerySystem();
    const history = context.history();

    // Save current state
    const original = {
      hash: window.location.hash,
      transform: context.map().transform(),
      brightness: imagery.brightness,
      baseLayer: imagery.baseLayerSource(),
      overlayLayers: imagery.overlayLayerSources(),
      layerEnabled: new Map(),  // Map(layerID -> Boolean)
      historyJSON: history.toJSON()
    };

    // Remember which layers were enabled before, enable only certain ones in the walkthrough.
    for (const [layerID, layer] of context.scene().layers) {
      original.layerEnabled.set(layerID, layer.enabled);
    }
    context.scene().onlyLayers(['background','osm','labels']);

    // Show sidebar and disable the sidebar resizing button
    // (this needs to be before `context.inIntro(true)`)
    context.ui().sidebar.expand();
    context.container().selectAll('button.sidebar-toggle').classed('disabled', true);

    // Disable OSM
    if (osm) {
      osm.toggle(false).reset();
    }

    // Load walkthrough data
    history.reset();
    history.merge(Object.values(_introGraph));
    history.checkpoint('initial');

    // Setup imagery
    const introSource = imagery.findSource(INTRO_IMAGERY) || imagery.findSource('Bing');
    imagery.baseLayerSource(introSource);
    original.overlayLayers.forEach(d => imagery.toggleOverlayLayer(d));
    imagery.brightness = 1;

    // Setup Rapid Walkthrough dataset and disable service
    let rapidDatasets = context.rapidContext().datasets();
    const rapidDatasetsCopy = JSON.parse(JSON.stringify(rapidDatasets));   // deep copy
    Object.keys(rapidDatasets).forEach(id => rapidDatasets[id].enabled = false);

    rapidDatasets.rapid_intro_graph = {
      id: 'rapid_intro_graph',
      beta: false,
      added: true,
      enabled: true,
      conflated: false,
      service: 'mapwithai',
      color: '#da26d3',
      label: 'Rapid Walkthrough'
    };

    if (mapwithai) {
      mapwithai.toggle(false);    // disable network
      mapwithai.merge('rapid_intro_graph', Object.values(_rapidGraph));
    }

    const curtain = new UiCurtain(context);
    selection.call(curtain.enable);

    // Store that the user started the walkthrough..
    prefs.setItem('walkthrough_started', 'yes');

    // Restore previous walkthrough progress..
    const storedProgress = prefs.getItem('walkthrough_progress') || '';
    let progress = storedProgress.split(';').filter(Boolean);

    let chapters = chapterFlow.map((chapter, i) => {
      let s = chapterUi[chapter](context, curtain)
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
          prefs.setItem('walkthrough_progress', utilArrayUniq(progress).join(';'));
        });
      return s;
    });

    // When leaving walkthrough...
    chapters[chapters.length - 1].on('startEditing', () => {
      // Store walkthrough progress..
      progress.push('startEditing');
      prefs.setItem('walkthrough_progress', utilArrayUniq(progress).join(';'));

      // Store if walkthrough is completed..
      const incomplete = utilArrayDifference(chapterFlow, progress);
      if (!incomplete.length) {
        prefs.setItem('walkthrough_completed', 'yes');
      }

      // Restore Rapid datasets and service
      let rapidDatasets = context.rapidContext().datasets();
      delete rapidDatasets.rapid_intro_graph;
      Object.keys(rapidDatasetsCopy).forEach(id => rapidDatasets[id].enabled = rapidDatasetsCopy[id].enabled);
      Object.assign(rapidDatasets, rapidDatasetsCopy);
      if (mapwithai) {
        mapwithai.toggle(true);
      }

      curtain.disable();
      navwrap.remove();
      context.container().selectAll('button.sidebar-toggle').classed('disabled', false);

      // Restore Map State
      for (const [layerID, layer] of context.scene().layers) {
        layer.enabled = original.layerEnabled.get(layerID);
      }
      imagery.baseLayerSource(original.baseLayer);
      original.overlayLayers.forEach(d => imagery.toggleOverlayLayer(d));
      imagery.brightness = original.brightness;
      context.map().transform(original.transform);
      window.location.replace(original.hash);

      // Restore History and Edits
      history.reset();
      if (original.historyJSON) {
        history.fromJSON(original.historyJSON, true);
      }

      // Enable OSM
      if (osm) {
        osm.toggle(true).reset();
      }

      context.inIntro(false);
    });


    let navwrap = selection
      .append('div')
      .attr('class', 'intro-nav-wrap fillD');

    navwrap
      .append('svg')
      .attr('class', 'intro-nav-wrap-logo')
      .append('use')
      .attr('xlink:href', '#rapid-logo-walkthrough');

    let buttonwrap = navwrap
      .append('div')
      .attr('class', 'joined')
      .selectAll('button.chapter');

    let buttons = buttonwrap
      .data(chapters)
      .enter()
      .append('button')
      .attr('class', (d, i) => `chapter chapter-${chapterFlow[i]}`)
      .on('click', _enterChapter);

    buttons
      .append('span')
      .html(d => l10n.tHtml(d.title));

    buttons
      .append('span')
      .attr('class', 'status')
      .call(uiIcon(l10n.isRTL() ? '#rapid-icon-backward' : '#rapid-icon-forward', 'inline'));

    _enterChapter(null, chapters[skipToRapid ? 6 : 0]);


    function _enterChapter(d3_event, newChapter) {
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
