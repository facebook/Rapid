import { select, selection } from 'd3-selection';
import { marked } from 'marked';

import { icon } from './intro/helper.js';
import { uiIcon } from './icon.js';
import { uiModal } from './modal.js';
import { uiRapidColorpicker } from './rapid_colorpicker.js';
import { uiRapidViewManageDatasets } from './rapid_view_manage_datasets.js';
import { utilCmd } from '../util/cmd.js';


/**
 * UiRapidDatasetToggle
 * This is the modal dialog where the user can toggle on and off datasets.
 * It is shown by clicking the main "Rapid" button in the top menu.
 *
 * @example
 * <div class='modal rapid-modal'>
 *   <button class='close'/>
 *   <div class='content'>
 *     <div class='rapid-stack'>
 *       <div class='modal-section rapid-toggle-all'/>       // "Toggle All Rapid Features"
 *       <div class='rapid-datasets-container'> … </div>     //   …list of datasets…
 *       <div class='modal-section rapid-manage-datasets'/>  // "Add/Manage Datasets"
 *       <div class='modal-section buttons'/>                // "OK" button
 *     </div>
 *   </div>
 * </div>
 */
export class UiRapidDatasetToggle {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    const l10n = context.systems.l10n;
    const scene = context.systems.gfx.scene;

    // Child components (will be created in `show()`)
    this.CatalogModal = null;
    this.ColorPicker = null;

    // D3 selections
    this.$parent = null;
    this.$content = null;
    this.$modal = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.show = this.show.bind(this);
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.renderDatasets = this.renderDatasets.bind(this);
    this.changeColor = this.changeColor.bind(this);
    this.isDatasetEnabled = this.isDatasetEnabled.bind(this);
    this.toggleDataset = this.toggleDataset.bind(this);
    this.toggleRapid = this.toggleRapid.bind(this);

    // Setup event handlers
    scene.on('layerchange', this.rerender);
    l10n.on('localechange', this.rerender);
  }


  /**
   * show
   * This shows the datataset modal if it isn't already being shown.
   * For this kind of popup component, must first `show()` to create the modal.
   * Accepts a parent selection, and renders the content under it.
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  show($parent) {
    const context = this.context;
    const isShowing = $parent.selectAll('.shaded').size();

    if (!isShowing) {
      this.$modal = uiModal($parent);

      this.$modal.select('.modal')
        .attr('class', 'modal rapid-modal');

      this.CatalogModal = uiRapidViewManageDatasets(context, this.$modal)
        .on('done', this.rerender);

      this.ColorPicker = uiRapidColorpicker(context, this.$modal)
        .on('change', this.changeColor);

      this.$content = this.$modal.select('.content')
        .append('div')
        .attr('class', 'rapid-stack');
    }

    this.render($parent);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders.)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent instanceof selection) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    const context = this.context;
    const l10n = context.systems.l10n;
    const scene = context.systems.gfx.scene;
    const rtl = l10n.isRTL() ? '-rtl' : '';
    const isRapidEnabled = scene.layers.get('rapid')?.enabled;

    if (!this.$modal) return;  // need to call `show()` first to create the modal.

    const $content = this.$content;

    /* Toggle All */
    let $toggleAll = $content.selectAll('.rapid-toggle-all')
      .data([0]);

    // enter
    const $$toggleAll = $toggleAll
      .enter()
      .append('div')
      .attr('class', 'modal-section rapid-checkbox rapid-toggle-all');

    const $$toggleAllText = $$toggleAll
      .append('div')
      .attr('class', 'rapid-feature-label-container');

    $$toggleAllText
      .append('div')
      .attr('class', 'rapid-feature-label');

    $$toggleAllText
      .append('span')
      .attr('class', 'rapid-feature-hotkey');

    const $$toggleAllLabel = $$toggleAll
      .append('div')
      .attr('class', 'rapid-checkbox-inputs')
      .append('label')
      .attr('class', 'rapid-checkbox-label');

    $$toggleAllLabel
      .append('input')
      .attr('type', 'checkbox')
      .attr('class', 'rapid-feature-checkbox')
      .on('click', this.toggleRapid);

    $$toggleAllLabel
      .append('div')
      .attr('class', 'rapid-checkbox-custom');

    // update
    $toggleAll = $toggleAll.merge($$toggleAll);

    $toggleAll.selectAll('.rapid-feature-label')
      .html(l10n.t('rapid_feature_toggle.toggle_all', {
        rapidicon: icon(`#rapid-logo-rapid-wordmark${rtl}`, 'logo-rapid')
      }));

    const toggleKey = utilCmd('⇧' + l10n.t('shortcuts.command.toggle_rapid_data.key'));
    $toggleAll.selectAll('.rapid-feature-hotkey')
      .text('(' + toggleKey + ')');

    $toggleAll.selectAll('.rapid-feature-checkbox')
      .property('checked', isRapidEnabled);


    /* Dataset List */
    let $datasets = $content.selectAll('.rapid-datasets-container')
      .data([0]);

    // enter
    const $$datasets = $datasets.enter()
      .append('div')
      .attr('class', 'rapid-datasets-container');

    // update
    $datasets = $datasets.merge($$datasets);

    $datasets
      .call(this.renderDatasets);


    /* View/Manage Datasets */
    let $manageDatasets = $content.selectAll('.rapid-manage-datasets')
      .data([0]);

    // enter
    const $$manageDatasets = $manageDatasets.enter()
      .append('div')
      .attr('class', 'modal-section rapid-checkbox rapid-manage-datasets')
      .on('click', () => context.container().call(this.CatalogModal));

    $$manageDatasets
      .append('div')
      .attr('class', 'rapid-feature-label-container')
      .append('div')
      .attr('class', 'rapid-feature-label');

    $$manageDatasets
      .append('div')
      .attr('class', 'rapid-checkbox-inputs')
      .append('div')
      .attr('class', 'rapid-checkbox-label')
      .call(uiIcon('', 'icon-30'));

    // update
    $manageDatasets = $manageDatasets.merge($$manageDatasets);

    $manageDatasets.selectAll('.rapid-feature-label')
      .text(l10n.t('rapid_feature_toggle.view_manage_datasets'));

    $manageDatasets.selectAll('.rapid-checkbox-label use')
      .attr('xlink:href', l10n.isRTL() ? '#rapid-icon-backward' : '#rapid-icon-forward');


    /* OK Button */
    let $buttons = $content.selectAll('.modal-section.buttons')
      .data([0]);

    // enter
    const $$buttons = $buttons.enter()
      .append('div')
      .attr('class', 'modal-section buttons');

    $$buttons
      .append('button')
      .attr('class', 'button ok-button action')
      .on('click', () => this.$modal.close());

    // set focus (but only on enter)
    const buttonNode = $$buttons.selectAll('button').node();
    if (buttonNode) buttonNode.focus();

    // update
    $buttons = $buttons.merge($$buttons);

    $buttons.selectAll('.button')
      .text(l10n.t('confirm.okay'));
  }


  /**
   * renderDatasets
   * Renders the list of datasets into the `.rapid-datasets-container` div.
   * @param {d3-selection} $container - A d3-selection to a HTMLElement that this component should render itself into
   */
  renderDatasets($container) {
    const context = this.context;
    const l10n = context.systems.l10n;
    const map = context.systems.map;
    const rapid = context.systems.rapid;
    const scene = context.systems.gfx.scene;
    const storage = context.systems.storage;

    const isRapidEnabled = scene.layers.get('rapid')?.enabled;
    const showPreview = storage.getItem('rapid-internal-feature.previewDatasets') === 'true';
    const datasets = [...rapid.datasets.values()]
      .filter(d => d.added && (showPreview || !d.beta));    // exclude preview datasets unless user has opted into them

    let $rows = $container.selectAll('.rapid-checkbox-dataset')
      .data(datasets, d => d.id);

    // exit
    $rows.exit()
      .remove();

    // enter
    const $$rows = $rows.enter()
      .append('div')
      .attr('class', 'rapid-checkbox rapid-checkbox-dataset');

    $$rows
      .append('div')
      .attr('class', 'rapid-feature')
      .each((d, i, nodes) => {
        const $$row = select(nodes[i]);

        // line1: name and details
        const $$label = $$row
          .append('div')
          .attr('class', 'rapid-feature-label-container');

        $$label
          .append('div')
          .attr('class', 'rapid-feature-label');

        if (d.beta) {
          $$label
            .append('div')
            .attr('class', 'rapid-feature-label-beta beta');
        }

        if (d.description) {
          $$label
            .append('div')
            .attr('class', 'rapid-feature-label-divider');

          $$label
            .append('div')
            .attr('class', 'rapid-feature-description');
        }

        if (d.license_markdown) {
          $$label
            .append('div')
            .attr('class', 'rapid-feature-label-divider');

          $$label
            .append('div')
            .attr('class', 'rapid-feature-license');
        }

        // line2: dataset extent
        $$row
          .append('div')
          .attr('class', 'rapid-feature-extent-container')
          .each((d, i, nodes) => {
            const $$extent = select(nodes[i]);

            // if the data spans more than 100°*100°, it might as well be worldwide
            if (d.extent && d.extent.area() < 10000) {
              $$extent
                .append('a')
                .attr('class', 'rapid-feature-extent-center-map')
                .attr('href', '#')
                .on('click', (e) => {
                  e.preventDefault();
                  map.extent(d.extent);
                });
            } else {
              $$extent
                .append('span')
                .attr('class', 'rapid-feature-extent-worldwide');
            }
          });
      });

    const $$inputs = $$rows
      .append('div')
      .attr('class', 'rapid-checkbox-inputs');

    $$inputs
      .append('label')
      .attr('class', 'rapid-colorpicker-label');

    const $$checkboxes = $$inputs
      .append('label')
      .attr('class', 'rapid-checkbox-label');

    $$checkboxes
      .append('input')
      .attr('type', 'checkbox')
      .attr('class', 'rapid-feature-checkbox')
      .on('click', this.toggleDataset);

    $$checkboxes
      .append('div')
      .attr('class', 'rapid-checkbox-custom');


    // update
    $rows = $rows.merge($$rows);

    $rows
      .classed('disabled', !isRapidEnabled);

    // localize and style everything...
    $rows.selectAll('.rapid-feature-label')
      .text(d => {  // Attempt to localize the dataset name, fallback to 'label' or 'id'
        return d.labelStringID ? l10n.t(d.labelStringID) : (d.label || d.id);
      });

    $rows.selectAll('.rapid-feature-label-beta')
      .attr('title', l10n.t('rapid_poweruser_features.beta'));

    $rows.selectAll('.rapid-feature-description')
      .text(d => d.description);

    $rows.selectAll('.rapid-feature-license')
      .html(d => {  // Attempt to localize the dataset license, fallback to 'license_markdown' or nothing
        const markdown = d.licenseStringID ? l10n.t(d.licenseStringID) : (d.license_markdown || '');
        return marked.parse(markdown);
      });

    $rows.selectAll('.rapid-feature-license p a')
      .attr('target', '_blank');   // make sure the markdown links go to a new page

    $rows.selectAll('.rapid-feature-extent-center-map')
      .text(l10n.t('rapid_feature_toggle.center_map'));

    $rows.selectAll('.rapid-feature-extent-worldwide')
      .text(l10n.t('rapid_feature_toggle.worldwide'));

    $rows.selectAll('.rapid-colorpicker-label')
      .attr('disabled', isRapidEnabled ? null : true)
      .call(this.ColorPicker);

    $rows.selectAll('.rapid-checkbox-label')
      .classed('disabled', !isRapidEnabled);

    $rows.selectAll('.rapid-feature-checkbox')
      .property('checked', d => this.isDatasetEnabled(d))
      .attr('disabled', isRapidEnabled ? null : true);
  }


  /**
   * isDatasetEnabled
   * @param  {*}  d - bound datum (the dataset in this case)
   */
  isDatasetEnabled(d) {
    const rapid = this.context.systems.rapid;
    const dataset = rapid.datasets.get(d.id);
    return dataset?.enabled;
  }


  /**
   * toggleRapid
   * Called when a user has clicked the checkbox to toggle all Rapid layers on/off.
   * @param  {Event}  e? - triggering event (if any)
   */
  toggleRapid() {
    const scene = this.context.systems.gfx.scene;
    scene.toggleLayers('rapid');
  }


  /**
   * toggleDataset
   * Called when a user has clicked the checkbox to toggle a dataset on/off.
   * @param  {Event}  e? - triggering event (if any)
   * @param  {*}      d - bound datum (the dataset in this case)
   */
  toggleDataset(e, d) {
    const context = this.context;
    const rapid = context.systems.rapid;
    const scene = context.systems.gfx.scene;
    const urlhash = context.systems.urlhash;

    const dataset = rapid.datasets.get(d.id);
    if (dataset) {
      dataset.enabled = !dataset.enabled;

      // update url hash
      const datasetIDs = [...rapid.datasets.values()]
        .filter(ds => ds.added && ds.enabled)
        .map(ds => ds.id)
        .join(',');

      urlhash.setParam('datasets', datasetIDs.length ? datasetIDs : null);
      scene.dirtyLayers(['rapid', 'rapid-overlay', 'overture']);
      context.enter('browse');   // return to browse mode (in case something was selected)
    }
  }


  /**
   * changeColor
   * Called when a user has selected a color with the colorpicker
   * @param  {string}  datasetID  - the datasetID to update
   * @param  {string}  color      - hexstring for the color e.g. '#da26d3'
   */
  changeColor(datasetID, color) {
    const context = this.context;
    const gfx = context.systems.gfx;
    const rapid = context.systems.rapid;
    const scene = gfx.scene;

    const dataset = rapid.datasets.get(datasetID);
    if (dataset) {
      dataset.color = color;

      scene.dirtyLayers(['rapid', 'rapid-overlay', 'overture']);
      gfx.immediateRedraw();
      this.rerender();

      // In case a Rapid feature is already selected, reselect it to update sidebar too
      const mode = context.mode;
      if (mode?.id === 'select') {  // new (not legacy) select mode
        const selection = new Map(mode.selectedData);
        context.enter('select', { selection: selection });
      }
    }
  }

}
