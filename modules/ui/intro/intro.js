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
  const dataloader = context.systems.dataloader;
  const editor = context.systems.editor;
  const imagery = context.systems.imagery;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const mapwithai = context.services.mapwithai;
  const osm = context.services.osm;
  const rapid = context.systems.rapid;
  const storage = context.systems.storage;
  const urlhash = context.systems.urlhash;
  const ui = context.systems.ui;

  let _introGraph = {};
  let _rapidGraph = {};
  let _currChapter;


  /**
   * intro
   * Call this to start the intro walkthrough
   * @param  selection  D3-selection to render the walkthrough content into (the root container)
   */
  function intro(selection) {
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

      selection.call(_startIntro);
    });
  }


  /**
   * _startIntro
   * Call this to render the intro walkthrough
   * @param  selection  D3-selection to render the walkthrough content into (the root container)
   */
  function _startIntro(selection) {
    urlhash.disable();
    context.inIntro = true;
    context.enter('browse');

    // Save current state
    const original = {
      hash: window.location.hash,
      transform: map.transform(),
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
    ui.sidebar.expand();
    context.container().selectAll('button.sidebar-toggle').classed('disabled', true);

    // Disable OSM
    osm?.pause();

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
      mapwithai.pause();    // disable network
      mapwithai.merge('rapid_intro_graph', Object.values(_rapidGraph));
    }

    const curtain = new UiCurtain(context);
    selection.call(curtain.enable);

    // Store that the user started the walkthrough..
    storage.setItem('walkthrough_started', 'yes');

    // Restore previous walkthrough progress..
    const storedProgress = storage.getItem('walkthrough_progress') || '';
    const progress = storedProgress.split(';').filter(Boolean);

    // Create the chapters
    const chapters = chapterFlow.map((chapterID, i) => {
      const s = chapterUi[chapterID](context, curtain)
        .on('done', () => {    // When completing each chapter..
          buttons
            .filter(d => d.title === s.title)
            .classed('finished', true);

          // Store walkthrough progress..
          progress.push(chapterID);
          storage.setItem('walkthrough_progress', utilArrayUniq(progress).join(';'));

          if (i < chapterFlow.length - 1) {
            const nextID = chapterFlow[i + 1];
            context.container().select(`button.chapter-${nextID}`)
              .classed('next', true);
          } else {
            _finish();
          }
        });
      return s;
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


    /**
     * _enterChapter
     * Call this to enter a new chapter.
     * Either called explicitly or by clicking a button the chapter navigation bar.
     * @param  d3_event    If clicked on a button, the click event (not used)
     * @param  newChapter  The chapter to enter
     */
    function _enterChapter(d3_event, newChapter) {
      if (_currChapter) _currChapter.exit();
      context.enter('browse');

      _currChapter = newChapter;
      _currChapter.enter();

      buttons
        .classed('next', false)
        .classed('active', d => d.title === _currChapter.title);
    }


    /**
     * _finish
     * Cleanup, restore state, and leave the walkthrough
     */
    function _finish() {
      // Store if walkthrough is completed..
      const incomplete = utilArrayDifference(chapterFlow, progress);
      if (!incomplete.length) {
        storage.setItem('walkthrough_completed', 'yes');
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
      map.transform(original.transform);
      window.location.replace(original.hash);

      // Restore edits and re-enable services.
      context.resetAsync()
        .then(() => {
          osm?.resume();
          mapwithai?.resume();

          if (original.edits) {
            editor.fromJSON(original.edits, true);
          }

          context.inIntro = false;
          urlhash.enable();
        });
    }

  }

  return intro;
}
