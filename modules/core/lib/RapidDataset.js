const RAPID_MAGENTA = '#da26d3';

export class RapidDataset {

  /**
   * @constructor
   * @param {Context}  context - Global shared application context
   * @param {Object}   props   - Object containing the dataset properties
   */
  constructor(context, props) {
    this.context = context;

    this.id = props.id;
    this.beta = props.beta ?? false;
    this.added = props.added ?? false;          // whether it should appear in the list
    this.enabled = props.enabled ?? false;      // whether the user has checked it on
    this.conflated = props.conflated ?? false;

    this.service = props.service;
    this.color = props.color ?? RAPID_MAGENTA;
    this.dataUsed = props.dataUsed ?? [];
    this.overlay = props.overlay;
    this.tags = props.tags;
    this.extent = props.extent;
    this.licenseUrl = props.licenseUrl;

    this.labelStringID = props.labelStringID;

    // If a `label` property are passed in, store it,
    // but prefer to use localize on the fly
    this._label = props.label;
    this.label = this.getLabel();
  }

  // Attempt to localize the dataset name, fallback to 'label' or 'id'
  getLabel() {
    const l10n = this.context.systems.l10n;
    return this.labelStringID ? l10n.t(this.labelStringID) : (this._label || this.id);
  }
}
