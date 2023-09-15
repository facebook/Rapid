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


const INTRO_IMAGERY = 'EsriWorldImageryClarity';

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
  let _introGraph = {};
  let _rapidGraph = {};
  let _currChapter;


  function intro(selection) {
    const dataloader = context.systems.dataloader;
    Promise.all([
      dataloader.getDataAsync('intro_rapid_graph'),
      dataloader.getDataAsync('intro_graph')
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

      selection.call(startIntro);
    });
  }


  function startIntro(selection) {
    const editor = context.systems.editor;
    const imagery = context.systems.imagery;
    const l10n = context.systems.l10n;
    const mapwithai = context.services.mapwithai;
    const osm = context.services.osm;
    const prefs = context.systems.storage;
    const rapid = context.systems.rapid;
    const urlhash = context.systems.urlhash;

    urlhash.disable();
    context.inIntro = true;
    context.enter('browse');

    // Save current state
    const original = {
      hash: window.location.hash,
      transform: context.systems.map.transform(),
      brightness: imagery.brightness,
      baseLayer: imagery.baseLayerSource(),
      overlayLayers: imagery.overlayLayerSources(),
      layersEnabled: new Set(),     // Set(layerID)
      datasetsEnabled: new Set(),   // Set(datasetID)
      edits: editor.toJSON()
    };

    // Remember which layers were enabled before, enable only certain ones in the walkthrough.
    for (const [layerID, layer] of context.scene().layers) {
      if (layer.enabled) {
        original.layersEnabled.add(layerID);
      }
    }
    context.scene().onlyLayers(['background', 'osm', 'labels']);

    // Show sidebar and disable the sidebar resizing button
    context.systems.ui.sidebar.expand();
    context.container().selectAll('button.sidebar-toggle').classed('disabled', true);

    // Disable OSM
    if (osm) {
      osm.toggle(false);
    }

    // Load walkthrough data
    editor.reset();
    editor.merge(Object.values(_introGraph));
    editor.setCheckpoint('initial');

    // Setup imagery
    const introSource = imagery.getSource(INTRO_IMAGERY) || imagery.getSource('Bing');
    imagery.baseLayerSource(introSource);
    original.overlayLayers.forEach(d => imagery.toggleOverlayLayer(d));
    imagery.brightness = 1;

    // Setup Rapid Walkthrough dataset and disable service
    for (const [datasetID, dataset] of rapid.datasets) {
      if (dataset.enabled) {
        original.datasetsEnabled.add(datasetID);
        dataset.enabled = false;
      }
    }

    rapid.datasets.set('rapid_intro_graph', {
      id: 'rapid_intro_graph',
      beta: false,
      added: true,
      enabled: true,
      conflated: false,
      service: 'mapwithai',
      color: '#da26d3',
      dataUsed: [],
      label: 'Rapid Walkthrough'
    });

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

    // When completing each chapter..
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
      for (const [datasetID, dataset] of rapid.datasets) {
        dataset.enabled = original.datasetsEnabled.has(datasetID);
      }
      rapid.datasets.delete('rapid_intro_graph');

      curtain.disable();
      navwrap.remove();
      context.container().selectAll('button.sidebar-toggle').classed('disabled', false);

      // Restore Map State
      for (const [layerID, layer] of context.scene().layers) {
        layer.enabled = original.layersEnabled.has(layerID);
      }
      imagery.baseLayerSource(original.baseLayer);
      original.overlayLayers.forEach(d => imagery.toggleOverlayLayer(d));
      imagery.brightness = original.brightness;
      context.systems.map.transform(original.transform);
      window.location.replace(original.hash);

      // Restore edits and re-enable services.
      context.resetAsync()
        .then(() => {
          if (original.edits) {
            editor.fromJSON(original.edits, true);
          }

          if (osm) {
            osm.toggle(true);
          }

          if (mapwithai) {
            mapwithai.toggle(true);
          }

          context.inIntro = false;
          urlhash.enable();
        });
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
