import { utilArrayDifference, utilArrayUniq } from '@rapid-sdk/util';

import { localize } from './helper.js';
import { osmEntity } from '../../osm/entity.js';
import { uiIcon } from '../icon.js';
import { UiCurtain } from './UiCurtain.js';

import { uiIntroWelcome } from './welcome.js';
import { uiIntroNavigation } from './navigation.js';
import { uiIntroPoint } from './point.js';
import { uiIntroArea } from './area.js';
import { uiIntroLine } from './line.js';
import { uiIntroBuilding } from './building.js';
import { uiIntroStartEditing } from './start_editing.js';
import { uiIntroRapid } from './rapid.js';


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
  const assets = context.systems.assets;
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
  let _original = {};
  let _progress = [];
  let _currChapter;
  let _buttons;
  let _curtain;
  let _navwrap;


  /**
   * intro
   * Call this to start the intro walkthrough
   * @param  selection  D3-selection to render the walkthrough content into (the root container)
   */
  function intro(selection) {
    Promise.all([
      assets.loadAssetAsync('intro_rapid_graph'),
      assets.loadAssetAsync('intro_graph')
    ])
    .then(values => {
      const rapidData = values[0].introRapidGraph;
      const introData = values[1].introGraph;

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
   * After the walkthrough data has been loaded, this starts the walkthrough.
   * @param  selection  D3-selection to render the walkthrough content into (the root container)
   */
  function _startIntro(selection) {
    urlhash.pause();       // disable updates
    osm?.pause();          // disable network
    mapwithai?.pause();    // disable network

    context.container().classed('inIntro', true);
    context.inIntro = true;
    context.enter('browse');

    // Save current state
    _original = {
      hash: window.location.hash,
      transform: context.viewport.transform.props,
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
        _original.layersEnabled.add(layerID);
      }
    }
    context.scene().onlyLayers(['background', 'osm', 'labels']);

    // Remember which Rapid datasets were enabled before - we will show only a fake walkthrough dataset
    for (const [datasetID, dataset] of rapid.datasets) {
      if (dataset.enabled) {
        _original.datasetsEnabled.add(datasetID);
        dataset.enabled = false;
      }
    }

    rapid.datasets.set('rapid_intro_graph', {
      id: 'rapid_intro_graph',
      beta: false,
      added: true,
      enabled: false,   // start disabled, rapid chapter will enable it
      conflated: false,
      service: 'mapwithai',
      color: '#da26d3',
      dataUsed: [],
      label: 'Rapid Walkthrough'
    });

    // Show sidebar and disable the sidebar resizing button
    ui.sidebar.expand();
    context.container().selectAll('button.sidebar-toggle').classed('disabled', true);

    // Setup imagery
    const introSource = imagery.getSourceByID(INTRO_IMAGERY) || imagery.getSourceByID('Bing');
    imagery.baseLayerSource(introSource);
    _original.overlayLayers.forEach(d => imagery.toggleOverlayLayer(d));
    imagery.brightness = 1;

    _curtain = new UiCurtain(context);
    selection.call(_curtain.enable);

    // Store that the user started the walkthrough..
    storage.setItem('walkthrough_started', 'yes');

    // Restore previous walkthrough progress..
    const storedProgress = storage.getItem('walkthrough_progress') || '';
    _progress = storedProgress.split(';').filter(Boolean);

    // Create the chapters
    const chapters = chapterFlow.map((chapterID, i) => {
      const s = chapterUi[chapterID](context, _curtain)
        .on('done', () => {    // When completing each chapter..
          _buttons
            .filter(d => d.title === s.title)
            .classed('finished', true);

          // Store walkthrough progress..
          _progress.push(chapterID);
          storage.setItem('walkthrough_progress', utilArrayUniq(_progress).join(';'));

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


    _navwrap = selection
      .append('div')
      .attr('class', 'intro-nav-wrap fillD');

    _navwrap
      .append('svg')
      .attr('class', 'intro-nav-wrap-logo')
      .append('use')
      .attr('xlink:href', '#rapid-logo-walkthrough');

    const buttonwrap = _navwrap
      .append('div')
      .attr('class', 'joined')
      .selectAll('button.chapter');

    _buttons = buttonwrap
      .data(chapters)
      .enter()
      .append('button')
      .attr('class', (d, i) => `chapter chapter-${chapterFlow[i]}`)
      .on('click', _enterChapter);

    _buttons
      .append('span')
      .html(d => l10n.tHtml(d.title));

    _buttons
      .append('span')
      .attr('class', 'status')
      .call(uiIcon(l10n.isRTL() ? '#rapid-icon-backward' : '#rapid-icon-forward', 'inline'));


    // Reset, then load the data into the editor and start.
    context.resetAsync()
      .then(() => {
        editor.merge(Object.values(_introGraph));
        mapwithai?.merge('rapid_intro_graph', Object.values(_rapidGraph));
        editor.setCheckpoint('initial');
        _enterChapter(null, chapters[skipToRapid ? 6 : 0]);
      });
  }


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

    _buttons
      .classed('next', false)
      .classed('active', d => d.title === _currChapter.title);
  }


  /**
   * _finish
   * Cleanup, restore state, and leave the walkthrough
   */
  function _finish() {
    // Store if walkthrough is completed..
    const incomplete = utilArrayDifference(chapterFlow, _progress);
    if (!incomplete.length) {
      storage.setItem('walkthrough_completed', 'yes');
    }

    // Restore Rapid datasets and service
    for (const [datasetID, dataset] of rapid.datasets) {
      dataset.enabled = _original.datasetsEnabled.has(datasetID);
    }
    rapid.datasets.delete('rapid_intro_graph');

    _curtain.disable();
    _navwrap.remove();
    context.container().selectAll('button.sidebar-toggle').classed('disabled', false);

    // Restore Map State
    for (const [layerID, layer] of context.scene().layers) {
      layer.enabled = _original.layersEnabled.has(layerID);
    }
    imagery.baseLayerSource(_original.baseLayer);
    _original.overlayLayers.forEach(d => imagery.toggleOverlayLayer(d));
    imagery.brightness = _original.brightness;
    map.transform(_original.transform);
    window.location.replace(_original.hash);

    context.container().classed('inIntro', false);
    context.inIntro = false;
    osm?.resume();
    mapwithai?.resume();
    urlhash.resume();

    // Reset, then restore the user's edits, if any...
    context.resetAsync()
      .then(() => {
        if (_original.edits) {
          return editor.fromJSONAsync(_original.edits);
        } else {
          return Promise.resolve();
        }
      });
  }


  return intro;
}
