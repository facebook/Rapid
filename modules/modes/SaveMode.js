import { select as d3_select } from 'd3-selection';

import { AbstractMode } from './AbstractMode.js';
import { uiCommit } from '../ui/commit.js';
import { uiConfirm } from '../ui/confirm.js';
import { uiConflicts } from '../ui/conflicts.js';
import { uiLoading } from '../ui/loading.js';
import { uiSuccess } from '../ui/success.js';
import { utilKeybinding } from '../util/index.js';

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
    this._progressChanged = this._progressChanged.bind(this);
    this._resultConflicts = this._resultConflicts.bind(this);
    this._resultErrors = this._resultErrors.bind(this);
    this._resultNoChanges = this._resultNoChanges.bind(this);
    this._resultSuccess = this._resultSuccess.bind(this);
    this._saveEnded = this._saveEnded.bind(this);
    this._saveStarted = this._saveStarted.bind(this);
    this._showLoading = this._showLoading.bind(this);

    this._location = null;
    this._uiConflicts = null;
    this._uiLoading = null;
    this._uiSuccess = null;
    this._wasSuccessfulSave = false;
  }


  /**
   * enter
   * Enters the mode.
   */
  enter() {
    const context = this.context;
    const osm = context.services.osm;
    const sidebar = context.systems.ui.sidebar;
    const uploader = context.systems.uploader;

    if (!osm) return false;  // can't enter save mode

    if (DEBUG) {
      console.log('SaveMode: entering');  // eslint-disable-line no-console
    }

    // Show sidebar
    sidebar.expand();

    this._active = true;
    this._wasSuccessfulSave = false;

    this._uiCommit = uiCommit(context)
      .on('cancel', this._cancel);

    if (osm.authenticated()) {
      sidebar.show(this._uiCommit);
    } else {
      osm.authenticate(err => {
        if (err) {
          this._cancel();
        } else {
          sidebar.show(this._uiCommit);
        }
      });
    }

    context.container().selectAll('.main-content')
      .classed('active', false)
      .classed('inactive', true);

    this._keybindingOn();
    context.enableBehaviors(['mapInteraction']);

    uploader
      .on('progressChanged', this._progressChanged)
      .on('resultConflicts', this._resultConflicts)
      .on('resultErrors', this._resultErrors)
      .on('resultNoChanges', this._resultNoChanges)
      .on('resultSuccess', this._resultSuccess)
      .on('saveEnded', this._saveEnded)
      .on('saveStarted', this._saveStarted)
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

    const context = this.context;
    const sidebar = context.systems.ui.sidebar;
    const uploader = context.systems.uploader;

    this._uiCommit.on('cancel', null);
    this._uiCommit = null;

    uploader
      .off('progressChanged', this._progressChanged)
      .off('resultConflicts', this._resultConflicts)
      .off('resultErrors', this._resultErrors)
      .off('resultNoChanges', this._resultNoChanges)
      .off('resultSuccess', this._resultSuccess)
      .off('saveEnded', this._saveEnded)
      .off('saveStarted', this._saveStarted)
      .off('willAttemptUpload', this._prepareForSuccess);

    this._keybindingOff();
    this._hideLoading();

    context.container().selectAll('.main-content')
      .classed('active', true)
      .classed('inactive', false);

    // After a successful save, we want to leave the "thanks" content in the sidebar
    if (!this._wasSuccessfulSave) {
      sidebar.hide();
    }
  }


  /**
   * cancel handler
   */
  _cancel() {
    this.context.enter('browse');
  }


  /**
   * _progressChanged handler
   */
  _progressChanged(num, total) {
    const context = this.context;
    const l10n = context.systems.l10n;

    const modal = context.container().select('.loading-modal .modal-section');
    const progress = modal.selectAll('.progress')
      .data([0]);

    // enter/update
    progress.enter()
      .append('div')
      .attr('class', 'progress')
      .merge(progress)
      .text(l10n.t('save.conflict_progress', { num: num, total: total }));
  }


  /**
   * resultConflicts handler
   */
  _resultConflicts(conflicts, origChanges) {
    const context = this.context;
    const uploader = context.systems.uploader;

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
   * resultErrors handler
   */
  _resultErrors(errors) {
    const context = this.context;
    const l10n = context.systems.l10n;

    this._keybindingOn();

    const selection = uiConfirm(context, context.container());
    selection
      .select('.modal-section.header')
      .append('h3')
      .text(l10n.t('save.error'));

    this._addErrors(selection, errors);
    selection.okButton();
  }


  /**
   * _addErrors
   */
  _addErrors(selection, data) {
    const context = this.context;
    const l10n = context.systems.l10n;

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
      .text(d => d.msg || l10n.t('save.unknown_error_details'))
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
   * resultNoChanges handler
   */
  _resultNoChanges() {
    const context = this.context;
    context.resetAsync()
      .then(() => context.enter('browse'));
  }


  /**
   * _resultSuccess handler
   */
  _resultSuccess(changeset) {
    const context = this.context;
    const sidebar = context.systems.ui.sidebar;

    const successContent = this._uiSuccess
      .changeset(changeset)
      .location(this._location)
      .on('cancel', () => sidebar.hide());

    this._wasSuccessfulSave = true;
    sidebar.show(successContent);

    // Add delay before resetting to allow for postgres replication iD#1646 iD#2678
    window.setTimeout(() => {
      context.resetAsync()
        .then(() => context.enter('browse'));
    }, 2500);
  }


  /**
   * _saveStarted handler
   * At this point, a changeset is inflight and we need to block the UI
   */
  _saveStarted() {
    this._keybindingOff();
    this._showLoading();
  }


  /**
   * _saveEnded handler
   * At this point, the changeset is no longer inflight and we can unblock the UI
   * (It may occur after an error condition.)
   */
  _saveEnded() {
    this._keybindingOn();
    this._hideLoading();
  }


  /**
   * _showLoading
   * Block the UI by adding a spinner
   */
  _showLoading() {
    if (this._saveLoading) return;

    const context = this.context;
    const l10n = context.systems.l10n;

    this._saveLoading = uiLoading(context).blocking(true).message(l10n.t('save.uploading'));
    context.container().call(this._saveLoading);  // block input during upload
  }


  /**
   * _hideLoading
   * Unlock the UI by removing the spinner
   */
  _hideLoading() {
    if (!this._saveLoading) return;

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

    const context = this.context;
    const l10n = context.systems.l10n;
    const loc = context.viewport.centerLoc();

    const nominatim = context.services.nominatim;
    if (!nominatim) return;

    nominatim.reverse(loc, (err, result) => {
      if (err || !result || !result.address) return;

      const addr = result.address;
      const place = addr?.town ?? addr?.city ?? addr?.county ?? '';
      const region = addr?.state ?? addr?.country ?? '';
      const separator = (place && region) ? l10n.t('success.thank_you_where.separator') : '';

      this._location = l10n.t('success.thank_you_where.format',
        { place: place, separator: separator, region: region }
      );
    });
  }

}
