import { selection } from 'd3-selection';

import { JXON } from '../../util/jxon.js';
import { osmChangeset } from '../../osm/index.js';
import { actionDiscardTags } from '../../actions/index.js';
import { uiIcon } from '../icon.js';
import { uiTooltip } from '../tooltip.js';


/**
 * UiToolDownloadOsc
 * A toolbar section for the "Download OSC" button
 * This is an hidden/undocumented feature that only appears
 * if the url hash contains `&download_osc=true`
 */
export class UiToolDownloadOsc {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;
    this.id = 'download_osc';
    this.stringID = 'download_osc.title';

    const editor = context.systems.editor;

    // Create child components
    this.Tooltip = uiTooltip(context);

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.choose = this.choose.bind(this);
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument

    // Event listeners
    context.on('modechange', this.rerender);
    editor.on('stablechange', this.rerender);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent instanceof selection) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    const context = this.context;
    const editor = context.systems.editor;
    const l10n = context.systems.l10n;

    this.Tooltip
      .placement('bottom')
      .scrollContainer(context.container().select('.map-toolbar'))
      .title(l10n.t(editor.hasChanges() ? 'download_osc.help' : 'download_osc.no_changes'));

    // Button
    let $button = $parent.selectAll('button.downloadOsc')
      .data([0]);

    // enter
    const $$button = $button.enter()
      .append('button')
      .attr('class', 'downloadOsc disabled bar-button')
      .on('click', this.choose)
      .call(this.Tooltip)
      .call(uiIcon('#rapid-icon-download'));

    // update
    $button = $button.merge($$button);

    $button
      .classed('disabled', this.isDisabled());
  }


  /**
   * isDisabled
   * The button is disabled when there are no user changes to save
   * @return {boolean}  `true` if disabled, `false` if enabled
   */
  isDisabled() {
    const context = this.context;
    const editor = context.systems.editor;
    return (context.inIntro || !editor.hasChanges());
  }


  /**
   * choose
   * @param  {Event}  e? - the triggering event, if any (keypress or click)
   */
  choose(e) {
    if (e)  e.preventDefault();
    if (this.isDisabled()) return;

    const context = this.context;
    const editor = context.systems.editor;

    const changes = editor.changes(actionDiscardTags(editor.difference()));
    const changeset = new osmChangeset();
    const data = JXON.stringify(changeset.osmChangeJXON(changes));
    const fileName = 'change.osc';

    const a = document.createElement('a');   // Create an invisible link
    a.style.display = 'none';
    document.body.appendChild(a);

    // Set the HREF to a Blob representation of the data to be downloaded
    a.href = window.URL.createObjectURL(new Blob([data]));

    // Use download attribute to set set desired file name
    a.setAttribute('download', fileName);

    // Trigger the download by simulating click
    a.click();

    // Cleanup
    window.URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
  }

}
