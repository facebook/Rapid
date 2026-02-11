import { select } from 'd3-selection';

import { icon } from './intro/helper.js';
import { uiIcon } from './icon.js';
import { uiModal } from './modal.js';
import { uiRapidColorpicker } from './rapid_colorpicker.js';
import { UiRapidCatalog } from './UiRapidCatalog.js';
import { utilCmd } from '../util/cmd.js';
import { utilKeybinding } from '../util/keybinding.js';


/**
 * UiRapidDatasetToggle
 * This is the modal where the user can toggle on and off datasets.
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
    this.ColorPicker = null;

    // D3 selections
    this.$modal = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.show = this.show.bind(this);
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.renderDatasets = this.renderDatasets.bind(this);
    this.changeColor = this.changeColor.bind(this);
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
   */
  show() {
    const context = this.context;
    const $container = context.container();   // $container is always the parent for a modal

    const isShowing = $container.selectAll('.shaded').size();
    if (isShowing) return;  // a modal is already showing

    this.$modal = uiModal($container);

    this.$modal.select('.modal')
      .attr('class', 'modal rapid-modal');

    this.ColorPicker = uiRapidColorpicker(context, this.$modal)
      .on('change', this.changeColor);

    this.$modal.select('.content')
      .attr('class', 'content rapid-stack');

    this.render();
  }


  /**
   * render
   * Renders the content inside the modal.
   * Note that most `render` functions accept a parent selection,
   *  this one doesn't need it - `$modal` is always the parent.
   */
  render() {
    // Modals are created at the time when `show()` is first called
    if (!this.$modal) return;

    const context = this.context;
    const l10n = context.systems.l10n;
    const scene = context.systems.gfx.scene;
    const rtl = l10n.isRTL() ? '-rtl' : '';
    const isRapidEnabled = scene.layers.get('rapid')?.enabled;
    const $content = this.$modal.select('.content');

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
      .html(l10n.t('rapid_menu.toggle_all', {
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


    /* Ignored Overture IDs */
    const rapid = context.systems.rapid;
    const ignoredCount = rapid.ignoredGersIDs.size;

    let $ignoredLink = $content.selectAll('.rapid-ignored-ids')
      .data(ignoredCount > 0 ? [0] : []);

    $ignoredLink.exit()
      .remove();

    const $$ignoredLink = $ignoredLink.enter()
      .append('div')
      .attr('class', 'rapid-ignored-ids');

    $$ignoredLink
      .append('a')
      .attr('class', 'rapid-ignored-ids-link')
      .attr('href', '#')
      .on('click', (e) => {
        e.preventDefault();
        this._showIgnoredIdsDialog();
      });

    $ignoredLink = $ignoredLink.merge($$ignoredLink);

    $ignoredLink.selectAll('.rapid-ignored-ids-link')
      .text(l10n.t(
        ignoredCount === 1 ? 'rapid_menu.ignored_ids.link_one' : 'rapid_menu.ignored_ids.link',
        { count: ignoredCount }
      ));


    /* View/Manage Datasets */
    let $manageDatasets = $content.selectAll('.rapid-manage-datasets')
      .data([0]);

    // enter
    const $$manageDatasets = $manageDatasets.enter()
      .append('div')
      .attr('class', 'modal-section rapid-checkbox rapid-manage-datasets')
      .on('click', () => {
        const CatalogModal = new UiRapidCatalog(context, this.$modal).on('done', this.rerender);
        context.container().call(CatalogModal.show);
      });

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
      .text(l10n.t('rapid_menu.add_manage_datasets'));

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
   * @param {d3-selection} $selection - A d3-selection to a HTMLElement that this component should render itself into
   */
  renderDatasets($selection) {
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

    let $rows = $selection.selectAll('.rapid-checkbox-dataset')
      .data(datasets, d => d.id);

    // exit
    $rows.exit()
      .remove();

    // enter
    const $$rows = $rows.enter()
      .append('div')
      .attr('class', 'rapid-checkbox rapid-checkbox-dataset');

    const $$label = $$rows
      .append('div')
      .attr('class', 'rapid-feature');

    // line1: name and optional beta badge
    const $$line1 = $$label
      .append('div')
      .attr('class', 'rapid-feature-label-container');

    $$line1
      .append('div')
      .attr('class', 'rapid-feature-label');

    $$line1
      .filter(d => d.beta)
      .append('div')
      .attr('class', 'rapid-feature-label-beta beta');

    // line2:  extent and license link
    const $$line2 = $$label
      .append('div')
      .attr('class', 'rapid-feature-extent-container');

    $$line2
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

    const $$license = $$line2
      .filter(d => d.licenseUrl);

    $$license
      .append('div')
      .attr('class', 'rapid-feature-label-divider');

    const $$link = $$license
      .append('div')
      .attr('class', 'rapid-feature-license')
      .append('a')
      .attr('class', 'rapid-feature-licence-link')
      .attr('target', '_blank')
      .attr('href', d => d.licenseUrl);

    $$link
      .append('span')
      .attr('class', 'rapid-feature-license-link-text');

    $$link
      .call(uiIcon('#rapid-icon-out-link', 'inline'));


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
      .text(d => d.getLabel());

    $rows.selectAll('.rapid-feature-label-beta')
      .attr('title', l10n.t('rapid_poweruser.beta'));   // alt text

    $rows.selectAll('.rapid-feature-description')
      .text(d => d.description);

    $rows.selectAll('.rapid-feature-license-link-text')
      .text(l10n.t('rapid_menu.license'));

    $rows.selectAll('.rapid-feature-extent-center-map')
      .text(l10n.t('rapid_menu.center_map'));

    $rows.selectAll('.rapid-feature-extent-worldwide')
      .text(l10n.t('rapid_menu.worldwide'));

    $rows.selectAll('.rapid-colorpicker-label')
      .attr('disabled', isRapidEnabled ? null : true)
      .call(this.ColorPicker);

    $rows.selectAll('.rapid-checkbox-label')
      .classed('disabled', !isRapidEnabled);

    $rows.selectAll('.rapid-feature-checkbox')
      .property('checked', d => d.enabled)
      .attr('disabled', isRapidEnabled ? null : true);
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
   * @param  {*}      d - bound datum (the RapidDataset in this case)
   */
  toggleDataset(e, d) {
    const context = this.context;
    const rapid = context.systems.rapid;

    context.enter('browse');   // return to browse mode (in case something was selected)
    rapid.toggleDatasets(d.id);
  }


  /**
   * _showIgnoredIdsDialog
   * Shows a dialog with the ignored GERS IDs and options to copy or download them.
   */
  _showIgnoredIdsDialog() {
    const context = this.context;
    const l10n = context.systems.l10n;
    const rapid = context.systems.rapid;
    const ids = [...rapid.ignoredGersIDs];
    const idsText = ids.join('\n') + '\n';

    const $container = context.container();
    const $shaded = $container.selectAll('.shaded');
    if ($shaded.empty()) return;
    if ($shaded.selectAll('.rapid-ignored-dialog').size()) return;  // already open

    // Save and override parent modal close so it can't be dismissed while this is open
    const origClose = this.$modal.close;
    this.$modal.close = () => { /* ignore */ };

    const closeDialog = () => {
      $wrap
        .transition()
        .duration(200)
        .style('opacity', 0)
        .on('end', () => $wrap.remove());

      this.$modal.close = origClose;  // restore parent close

      let keybinding = utilKeybinding('modal');
      keybinding.on(['⌫', '⎋'], origClose);
      select(document).call(keybinding);
    };

    // Intercept Escape key to close this dialog instead of the parent
    let keybinding = utilKeybinding('modal');
    keybinding.on(['⌫', '⎋'], closeDialog);
    select(document).call(keybinding);

    // Create wrapper and modal inside existing .shaded overlay (same pattern as UiRapidCatalog)
    let $wrap = $shaded.append('div')
      .attr('class', 'catalog-wrap')
      .style('opacity', 0);

    const $modal = $wrap.append('div')
      .attr('class', 'modal rapid-modal rapid-ignored-dialog');

    $modal.append('button')
      .attr('class', 'close')
      .on('click', closeDialog)
      .call(uiIcon('#rapid-icon-close'));

    const $content = $modal.append('div')
      .attr('class', 'content')
      .style('padding', '20px');

    $content
      .append('h3')
      .text(l10n.t(
        ids.length === 1 ? 'rapid_menu.ignored_ids.title_one' : 'rapid_menu.ignored_ids.title',
        { count: ids.length }
      ));

    $content
      .append('p')
      .attr('class', 'rapid-ignored-instructions')
      .html(l10n.t('rapid_menu.ignored_ids.instructions'));

    const previewText = ids.length <= 20
      ? idsText
      : ids.slice(0, 20).join('\n') + '\n' + l10n.t('rapid_menu.ignored_ids.more', { count: ids.length - 20 });

    $content
      .append('pre')
      .attr('class', 'rapid-ignored-preview')
      .text(previewText);

    const $buttons = $content
      .append('div')
      .attr('class', 'rapid-ignored-buttons');

    const copyLabel = l10n.t('rapid_menu.ignored_ids.copy');
    const copiedLabel = l10n.t('rapid_menu.ignored_ids.copied');

    const $copyBtn = $buttons
      .append('button')
      .attr('class', 'button action')
      .text(copyLabel)
      .on('click', () => {
        navigator.clipboard.writeText(idsText).then(() => {
          $copyBtn.text(copiedLabel);
          setTimeout(() => $copyBtn.text(copyLabel), 2000);
        });
      });

    $buttons
      .append('button')
      .attr('class', 'button secondary')
      .text(l10n.t('rapid_menu.ignored_ids.download'))
      .on('click', () => {
        const blob = new Blob([idsText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ignored-overture-ids.txt';
        a.click();
        URL.revokeObjectURL(url);
      });

    // Fade in
    $wrap
      .transition()
      .style('opacity', 1);
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

      scene.dirtyLayers(['rapid', 'rapidoverlay']);
      gfx.immediateRedraw();
      this.render();

      // In case a Rapid feature is already selected, reselect it to update sidebar too
      const mode = context.mode;
      if (mode?.id === 'select') {  // new (not legacy) select mode
        const selection = new Map(mode.selectedData);
        context.enter('select', { selection: selection });
      }
    }
  }

}
