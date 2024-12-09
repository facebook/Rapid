const RAPID_MAGENTA = '#da26d3';


export class RapidDataset {

  /**
   * @constructor
   * @param {Context}  context - Global shared application context
   * @param {Object}   props   - Object containing the dataset properties
   */
  constructor(context, props) {
    this.context = context;
    const assets = context.systems.assets;

    this.id = props.id;
    this.service = props.service;                      // 'esri', 'mapwithai', 'overture'
    this.categories = props.categories ?? new Set();   // e.g. 'buildings' 'addresses'
    this.color = props.color ?? RAPID_MAGENTA;
    this.dataUsed = props.dataUsed ?? [];
    this.extent = props.extent;
    this.overlay = props.overlay;
    this.tags = props.tags;

    this.itemUrl = props.itemUrl ?? '';
    this.licenseUrl = props.licenseUrl ?? '';
    this.thumbnailUrl = props.thumbnailUrl ?? assets.getFileURL('img/test-pattern.png');

    // flags
    this.added = props.added ?? false;        // whether it should appear in the list
    this.beta = props.beta ?? this.categories.has('preview');
    this.enabled = props.enabled ?? false;    // whether the user has checked it on
    this.featured = props.featured ?? this.categories.has('featured');
    this.filtered = props.filtered ?? false;  // filtered from the catalog display
    this.hidden = props.hidden ?? false;      // hide this dataset from the catalog (e.g. the walkthrough data)
    this.conflated = props.conflated ?? false;

    this.labelStringID = props.labelStringID;
    this.descriptionStringID = props.descriptionStringID;

    // If a `label` or `description` properties are passed in, store them,
    // but prefer to use the methods below to localize on the fly..
    this._label = props.label;
    this._description = props.description;
    this.label = this.getLabel();
    this.description = this.getDescription();
  }

  // Attempt to localize the dataset name, fallback to 'label' or 'id'
  getLabel() {
    const l10n = this.context.systems.l10n;
    return this.labelStringID ? l10n.t(this.labelStringID) : (this._label || this.id);
  }

  // Attempt to localize the dataset description
  getDescription() {
    const l10n = this.context.systems.l10n;
    return this.descriptionStringID ? l10n.t(this.descriptionStringID) : (this._description || this.id);
  }

}
