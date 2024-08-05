import { uiEntityEditor } from './entity_editor.js';
import { uiPresetList } from './preset_list.js';
import { uiViewOnOSM } from './view_on_osm.js';


/**
 * UiInspector
 * The Inspector is a UI component for viewing/editing OSM Entities in the sidebar.
 * It consists of two divs that can slide side to side (only one will be visible at a time).
 * (The order may be swapped depending on `l10n.isRTL`)
 *
 * +--------+--------+
 * |        |        |
 * | Preset | Entity |
 * |  List  | Editor |
 * |        |        |
 * |        |        |
 * +--------+--------+
 *
 * @example
 *  <div class='inspector-wrap'>
 *    <div class='panewrap'>
 *      <div class='preset-list-pane'/>      // Preset List
 *      <div class='entity-editor-pane'/>    // Entity Editor
 *    </div>
 *    <div class='sidebar-footer'/>          // Footer, usually contains "View on OSM" link
 *  </div>
 */
export class UiInspector {
  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    // create child components
    this.PresetList = uiPresetList(context);
    this.EntityEditor = uiEntityEditor(context);

    // d3 selections
    this.$parent = null;
    this.$inspector = null;
    this.$paneWrap = null;
    this.$presetPane = null;
    this.$editorPane = null;

    this._state = '';       // can be 'hide', 'hover', or 'select'
    this._entityIDs = [];
    this._newFeature = false;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.setPreset = this.setPreset.bind(this);
    this.showPresetList = this.showPresetList.bind(this);
    this.showEntityEditor = this.showEntityEditor.bind(this);
    this._onMerge = this._onMerge.bind(this);

    // Setup event handlers
    context.systems.editor
      .on('merge', this._onMerge);

    this.PresetList
      .on('choose', choice => this.setPreset(choice))
      .on('cancel', () => this.setPreset());

    this.EntityEditor
      .on('choose', selected => this.showPresetList(selected, true));  // true = animate in
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders.)
   * @param {d3-selection} $parent - A d3-selection to a HTMLEement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const validator = context.systems.validator;

    const state = this._state;
    const entityIDs = this._entityIDs;
    const newFeature = this._newFeature;

    // propagate state to children
    this.PresetList
      .entityIDs(entityIDs)
      .autofocus(newFeature);

    this.EntityEditor
      .state(state)
      .entityIDs(entityIDs);

    // add .inspector-wrap
    let $inspector = $parent.selectAll('.inspector-wrap')
      .data([0]);

    const $$inspector = $inspector.enter()
      .append('div')
      .attr('class', 'inspector-wrap inspector-hidden');

    this.$inspector = $inspector = $inspector.merge($$inspector);

    $inspector
      .classed('inspector-hidden', !entityIDs.length);


    // add .panewrap
    let $paneWrap = $inspector.selectAll('.panewrap')
      .data([0]);

    const $$paneWrap = $paneWrap.enter()
      .append('div')
      .attr('class', 'panewrap');

    $$paneWrap
      .append('div')
      .attr('class', 'preset-list-pane pane');

    $$paneWrap
      .append('div')
      .attr('class', 'entity-editor-pane pane');

    this.$paneWrap = $paneWrap = $paneWrap.merge($$paneWrap);
    this.$presetPane = $paneWrap.selectAll('.preset-list-pane');
    this.$editorPane = $paneWrap.selectAll('.entity-editor-pane');

    if (_shouldDefaultToPresetList()) {
      this.showPresetList();
    } else {
      this.showEntityEditor();
    }

    // add .sidebar-footer
    const entityID = graph.hasEntity(entityIDs.length === 1 && entityIDs[0]);
    let $footer = $inspector.selectAll('.sidebar-footer')
      .data([entityID]);

    $footer.exit()
      .remove();

    const $$footer = $footer.enter()
      .append('div')
      .attr('class', 'sidebar-footer');

    $footer = $$footer.merge($footer);

    $footer
      .call(uiViewOnOSM(context).what(entityID));


    // Intrnal function for deciding which pane to show
    function _shouldDefaultToPresetList() {
      // always show the inspector on hover
      if (state !== 'select') return false;

      // can only change preset on single selection
      if (entityIDs.length !== 1) return false;

      const entityID = entityIDs[0];
      const entity = graph.hasEntity(entityID);
      if (!entity) return false;

      // default to inspector if there are already tags
      if (entity.hasNonGeometryTags()) return false;

      // prompt to select preset if feature is new and untagged
      if (newFeature) return true;

      // all existing features except vertices should default to inspector
      if (entity.geometry(graph) !== 'vertex') return false;

      // show vertex relations if any
      if (graph.parentRelations(entity).length) return false;

      // show vertex issues if there are any
      if (validator.getEntityIssues(entityID).length) return false;

      // show turn retriction editor for junction vertices
      if (entity.isHighwayIntersection(graph)) return false;

      // otherwise show preset list for uninteresting vertices
      return true;
    }
  }

  /**
   * showPresetList
   * Show the preset list , optionally with given selected array, and optionally with a slide-in animation
   * @param  {Array}    selected? - optional Array of presets selected
   * @param  {boolean}  animate? - whether to animate the pane
   */
  showPresetList(selected, animate) {
    const $paneWrap = this.$paneWrap;
    const $presetPane = this.$presetPane;
    const $editorPane = this.$editorPane;
    if (!$paneWrap || !$presetPane || !$editorPane) return false;  // called too early?

    const context = this.context;
    const l10n = context.systems.l10n;
    const isRTL = l10n.isRTL();
    const prop = isRTL ? 'margin-right' : 'margin-left';

    if (animate) {
      $paneWrap.transition().style(prop, '0%');
    } else {
      $paneWrap.style(prop, '0%');
    }

    // Update the state of the PresetList before showing it.
    this.PresetList
      .entityIDs(this._entityIDs)
      .selected(selected || [])
      .autofocus(this._newFeature || animate);

    $presetPane
      .call(this.PresetList);
  }


  /**
   * showEntityEditor
   * Show the entity editor, optionally with the given presets, optionally with slide-in animation
   * @param  {Array}    presets? - optional Array of presets selected
   * @param  {boolean}  animate? - whether to animate the pane
   */
  showEntityEditor(presets, animate) {
    const $paneWrap = this.$paneWrap;
    const $presetPane = this.$presetPane;
    const $editorPane = this.$editorPane;
    if (!$paneWrap || !$presetPane || !$editorPane) return false;  // called too early?

    const context = this.context;
    const l10n = context.systems.l10n;
    const isRTL = l10n.isRTL();
    const prop = isRTL ? 'margin-right' : 'margin-left';

    if (animate) {
      $paneWrap.transition().style(prop, '-100%');
    } else {
      $paneWrap.style(prop, '-100%');
    }

    // Update the state of the EntityEditor before showing it.
    if (Array.isArray(presets)) {
      this.EntityEditor.presets(presets);
    }
    this.EntityEditor
      .state(this._state)
      .entityIDs(this._entityIDs);

    $editorPane
      .call(this.EntityEditor);
  }


  /**
   * setPreset
   * Choose the given preset
   * @param {Preset} preset - the Preset to choose
   */
  setPreset(preset) {
    const $presetPane = this.$presetPane;
    if (!$presetPane) return false;  // called too early?

    // upon choosing multipolygon, re-render the area preset list instead of the editor
    if (preset?.id === 'type/multipolygon') {
      this.showPresetList();
    } else {
      const choice = preset ? [preset] : null;
      const input = $presetPane.select('.preset-search-input').node();
      input.value = '';
      this.showEntityEditor(choice, true);  // true = animate
    }
  }


  /**
   * _onMerge
   * If the inspector is showing `_entityIDs` already,
   * and we get new versions of them loaded from the server
   * refresh this component and its children. Rapid#1311
   */
  _onMerge(newIDs) {
    if (!(newIDs instanceof Set)) return;
    if (!this._entityIDs.length) return;

    let needsRedraw = false;
    for (const entityID of this._entityIDs) {
      if (newIDs.has(entityID)) {
        needsRedraw = true;
        break;
      }
    }

    if (needsRedraw) {
      this.render();
    }
  }


  // old style getter/setters

  state(val) {
    if (val === undefined) return this._state;
    this._state = val;
    this.EntityEditor.state(this._state);

    // remove any old field help overlay that might have gotten attached to the inspector
    this.context.container().selectAll('.field-help-body').remove();

    return this;
  }


  entityIDs(val) {
    if (val === undefined) return this._entityIDs;
    this._entityIDs = val ?? [];
    return this;
  }


  newFeature(val) {
    if (val === undefined) return this._newFeature;
    this._newFeature = val;
    return this;
  }

}
