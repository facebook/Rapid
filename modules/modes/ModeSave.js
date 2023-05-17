import { select as d3_select } from 'd3-selection';

import { AbstractMode } from './AbstractMode';
import { t } from '../core/localizer';
import { uiConflicts } from '../ui/conflicts';
import { uiConfirm } from '../ui/confirm';
import { uiCommit } from '../ui/commit';
import { uiSuccess } from '../ui/success';
import { utilKeybinding } from '../util';

const DEBUG = false;


/**
 * `ModeSave`
 * In this mode, the user is ready to upload their changes
 */
export class ModeSave extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'save';

    this._keybinding = utilKeybinding('modeSave');

    // Make sure the event handlers have `this` bound correctly
    this._cancel = this._cancel.bind(this);
    this._keybindingOff = this._keybindingOff.bind(this);
    this._keybindingOn= this._keybindingOn.bind(this);
    this._prepareForSuccess = this._prepareForSuccess.bind(this);
    this._showConflicts = this._showConflicts.bind(this);
    this._showErrors = this._showErrors.bind(this);
    this._showProgress = this._showProgress.bind(this);
    this._showSuccess = this._showSuccess.bind(this);

    this._location = null;
    this._successUI = null;
    this._conflictsUI = null;

    this._commitUI = uiCommit(context)
      .on('cancel', this._cancel);

    this.uploader = context.uploader()
      .on('saveStarted.modeSave', this._keybindingOff)
      .on('willAttemptUpload.modeSave', this._prepareForSuccess)
      .on('progressChanged.modeSave', this._showProgress)
      .on('resultNoChanges.modeSave', this._cancel)
      .on('resultErrors.modeSave', this._showErrors)
      .on('resultConflicts.modeSave', this._showConflicts)
      .on('resultSuccess.modeSave', this._showSuccess);
  }


  /**
   * enter
   */
  enter() {
    if (DEBUG) {
      console.log('ModeSave: entering');  // eslint-disable-line no-console
    }

    // Show sidebar
    const context = this.context;
    context.ui().sidebar.expand();

    const osm = context.services.get('osm');
    if (!osm) return false;  // can't enter save mode

    if (osm.authenticated()) {
      context.ui().sidebar.show(this._commitUI);
    } else {
      osm.authenticate(err => {
        if (err) {
          this._cancel();
        } else {
          context.ui().sidebar.show(this._commitUI);
        }
      });
    }

    this._active = true;
    context.container().selectAll('.main-content')
      .classed('active', false)
      .classed('inactive', true);

    this._keybindingOn();
    this.context.enableBehaviors(['map-interaction']);
    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    if (DEBUG) {
      console.log('ModeSave: exiting');  // eslint-disable-line no-console
    }

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
      .text(t('save.conflict_progress', { num: num, total: total }));
  }


  /**
   * showConflicts handler
   */
  _showConflicts(changeset, conflicts, origChanges) {
    const selection = this.context.container().select('.sidebar')
      .append('div')
      .attr('class','sidebar-component');

    const mainContent = this.context.container().selectAll('.main-content');

    mainContent
      .classed('active', true)
      .classed('inactive', false);

    this._conflictsUI = uiConflicts(this.context)
      .conflictList(conflicts)
      .origChanges(origChanges)
      .on('cancel', () => {
        mainContent
          .classed('active', false)
          .classed('inactive', true);
        selection.remove();
        this._keybindingOn();
        this.uploader.cancelConflictResolution();
      })
      .on('save', () => {
        mainContent
          .classed('active', false)
          .classed('inactive', true);
        selection.remove();
        this.uploader.processResolvedConflicts(changeset);
      });

    selection.call(this._conflictsUI);
  }


  /**
   * showErrors handler
   */
  _showErrors(errors) {
    this._keybindingOn();

    const selection = uiConfirm(this.context.container());
    selection
      .select('.modal-section.header')
      .append('h3')
      .text(t('save.error'));

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
      .text(d => d.msg || t('save.unknown_error_details'))
      .on('click', function(d3_event) {
        d3_event.preventDefault();

        var error = d3_select(this);
        var detail = d3_select(this.nextElementSibling);
        var exp = error.classed('expanded');

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
    this._commitUI.reset();

    const successContent = this._successUI
      .changeset(changeset)
      .location(this._location)
      .on('cancel', () => {
        this.context.ui().sidebar.hide();
      });

    this.context.enter('browse');
    this.context.ui().sidebar.show(successContent);
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
    this._successUI = uiSuccess(this.context);
    this._location = null;

    const loc = this.context.map().center();
    const nominatim = this.context.services.get('nominatim');

    nominatim?.reverse(loc, (err, result) => {
      if (err || !result || !result.address) return;

      const addr = result.address;
      const place = addr?.town ?? addr?.city ?? addr?.county ?? '';
      const region = addr?.state ?? addr?.country ?? '';
      const separator = (place && region) ? t('success.thank_you_where.separator') : '';

      this._location = t('success.thank_you_where.format',
        { place: place, separator: separator, region: region }
      );
    });
  }

// mode.selectedIDs = function() {
//     return _conflictsUI ? _conflictsUI.shownEntityIds() : [];
// };

}

