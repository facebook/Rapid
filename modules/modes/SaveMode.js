import { select as d3_select } from 'd3-selection';

import { AbstractMode } from './AbstractMode';
import { uiCommit } from '../ui/commit';
import { uiConfirm } from '../ui/confirm';
import { uiConflicts } from '../ui/conflicts';
import { uiLoading } from '../ui/loading';
import { uiSuccess } from '../ui/success';
import { utilKeybinding } from '../util';

const DEBUG = false;


/**
 * `SaveMode`
 * In this mode, the user is ready to upload their changes
 */
export class SaveMode extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'save';

    this._keybinding = utilKeybinding('SaveMode');

    // Make sure the event handlers have `this` bound correctly
    this._cancel = this._cancel.bind(this);
    this._hideLoading = this._hideLoading.bind(this);
    this._keybindingOff = this._keybindingOff.bind(this);
    this._keybindingOn = this._keybindingOn.bind(this);
    this._prepareForSuccess = this._prepareForSuccess.bind(this);
    this._showConflicts = this._showConflicts.bind(this);
    this._showErrors = this._showErrors.bind(this);
    this._showLoading = this._showLoading.bind(this);
    this._showProgress = this._showProgress.bind(this);
    this._showSuccess = this._showSuccess.bind(this);

    this._location = null;
    this._uiConflicts = null;
    this._uiLoading = null;
    this._uiSuccess = null;
  }


  /**
   * enter
   */
  enter() {
    if (DEBUG) {
      console.log('SaveMode: entering');  // eslint-disable-line no-console
    }

    // Show sidebar
    const context = this.context;
    context.ui().sidebar.expand();

    const osm = context.services.get('osm');
    if (!osm) return false;  // can't enter save mode

    this._active = true;

    this._uiCommit = uiCommit(context)
      .on('cancel', this._cancel);

    if (osm.authenticated()) {
      context.ui().sidebar.show(this._uiCommit);
    } else {
      osm.authenticate(err => {
        if (err) {
          this._cancel();
        } else {
          context.ui().sidebar.show(this._uiCommit);
        }
      });
    }

    context.container().selectAll('.main-content')
      .classed('active', false)
      .classed('inactive', true);

    this._keybindingOn();
    context.enableBehaviors(['map-interaction']);

    context.uploaderSystem()
      .on('progressChanged', this._showProgress)
      .on('resultConflicts', this._showConflicts)
      .on('resultErrors', this._showErrors)
      .on('resultNoChanges', this._cancel)
      .on('resultSuccess', this._showSuccess)
      .on('saveEnded', this._hideLoading)
      .on('saveStarted', this._keybindingOff)
      .on('saveStarted', this._showLoading)
      .on('willAttemptUpload', this._prepareForSuccess);

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    if (DEBUG) {
      console.log('SaveMode: exiting');  // eslint-disable-line no-console
    }

    this._uiCommit.on('cancel', null);
    this._uiCommit = null;

    this.context.uploaderSystem()
      .off('progressChanged', this._showProgress)
      .off('resultConflicts', this._showConflicts)
      .off('resultErrors', this._showErrors)
      .off('resultNoChanges', this._cancel)
      .off('resultSuccess', this._showSuccess)
      .off('saveEnded', this._hideLoading)
      .off('saveStarted', this._keybindingOff)
      .off('saveStarted', this._showLoading)
      .off('willAttemptUpload', this._prepareForSuccess);

    this._keybindingOff();

    this.context.container().selectAll('.main-content')
      .classed('active', true)
      .classed('inactive', false);

    this.context.ui().sidebar.hide();
  }


  /**
   * cancel handler
   */
  _cancel() {
    this.context.enter('browse');
  }


  /**
   * showProgress handler
   */
  _showProgress(num, total) {
    const modal = this.context.container().select('.loading-modal .modal-section');
    const progress = modal.selectAll('.progress')
      .data([0]);

    // enter/update
    progress.enter()
      .append('div')
      .attr('class', 'progress')
      .merge(progress)
      .text(this.context.t('save.conflict_progress', { num: num, total: total }));
  }


  /**
   * showConflicts handler
   */
  _showConflicts(conflicts, origChanges) {
    const context = this.context;
    const uploader = context.uploaderSystem();

    const selection = context.container().select('.sidebar')
      .append('div')
      .attr('class','sidebar-component');

    const mainContent = context.container().selectAll('.main-content');

    mainContent
      .classed('active', true)
      .classed('inactive', false);

    this._uiConflicts = uiConflicts(context)
      .conflictList(conflicts)
      .origChanges(origChanges)
      .on('cancel', () => {
        mainContent
          .classed('active', false)
          .classed('inactive', true);
        selection.remove();
        this._keybindingOn();
        uploader.cancelConflictResolution();
      })
      .on('save', () => {
        mainContent
          .classed('active', false)
          .classed('inactive', true);
        selection.remove();
        uploader.processResolvedConflicts();
      });

    selection.call(this._uiConflicts);
  }


  /**
   * showErrors handler
   */
  _showErrors(errors) {
    this._keybindingOn();

    const selection = uiConfirm(this.context, this.context.container());
    selection
      .select('.modal-section.header')
      .append('h3')
      .text(this.context.t('save.error'));

    this._addErrors(selection, errors);
    selection.okButton();
  }


  /**
   * _addErrors
   */
  _addErrors(selection, data) {
    const message = selection
      .select('.modal-section.message-text');

    const items = message
      .selectAll('.error-container')
      .data(data);

    const enter = items.enter()
      .append('div')
      .attr('class', 'error-container');

    enter
      .append('a')
      .attr('class', 'error-description')
      .attr('href', '#')
      .classed('hide-toggle', true)
      .text(d => d.msg || this.context.t('save.unknown_error_details'))
      .on('click', function(d3_event) {
        d3_event.preventDefault();

        const error = d3_select(this);
        const detail = d3_select(this.nextElementSibling);
        const exp = error.classed('expanded');

        detail.style('display', exp ? 'none' : 'block');
        error.classed('expanded', !exp);
      });

    const details = enter
      .append('div')
      .attr('class', 'error-detail-container')
      .style('display', 'none');

    details
      .append('ul')
      .attr('class', 'error-detail-list')
      .selectAll('li')
      .data(d => d.details || [])
      .enter()
      .append('li')
      .attr('class', 'error-detail-item')
      .text(d => d);

    items.exit()
      .remove();
  }


  /**
   * _showSuccess handler
   */
  _showSuccess(changeset) {
    const context = this.context;
    const successContent = this._uiSuccess
      .changeset(changeset)
      .location(this._location)
      .on('cancel', () => context.ui().sidebar.hide());

    context.enter('browse');
    context.ui().sidebar.show(successContent);
  }


  /**
   * _showLoading
   */
  _showLoading() {
    const context = this.context;
    this._saveLoading = uiLoading(context)
      .message(context.tHtml('save.uploading'))
      .blocking(true);
    context.container().call(this._saveLoading);  // block input during upload
  }


  /**
   * _hideLoading
   */
  _hideLoading() {
    this._saveLoading.close();
    this._saveLoading = null;
  }


  /**
   * _keybindingOn
   */
  _keybindingOn() {
    d3_select(document).call(this._keybinding.on('⎋', this._cancel, true));
  }


  /**
   * _keybindingOff
   */
  _keybindingOff() {
    d3_select(document).call(this._keybinding.unbind);
  }


  // Reverse geocode current map location so we can display a message on
  // the success screen like "Thank you for editing around place, region."
  _prepareForSuccess() {
    this._uiSuccess = uiSuccess(this.context);
    this._location = null;

    const loc = this.context.mapSystem().center();
    const nominatim = this.context.services.get('nominatim');

    nominatim?.reverse(loc, (err, result) => {
      if (err || !result || !result.address) return;

      const addr = result.address;
      const place = addr?.town ?? addr?.city ?? addr?.county ?? '';
      const region = addr?.state ?? addr?.country ?? '';
      const separator = (place && region) ? this.context.t('success.thank_you_where.separator') : '';

      this._location = this.context.t('success.thank_you_where.format',
        { place: place, separator: separator, region: region }
      );
    });
  }

}
