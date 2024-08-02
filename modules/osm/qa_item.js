
export class QAItem {
  constructor(service, itemType, id, props) {
    // Store required properties
    this.service = service.id;
    this.itemType = itemType;

    // All issues must have an ID for selection, use generic if none specified
    this.id = id ? id : `${QAItem.id()}`;

    // Internal version
    this.v = 0;

    this.update(props);

    // Some QA services have marker icons to differentiate issues
    if (service && typeof service.getIcon === 'function') {
      this.icon = service.getIcon(itemType);
    }
  }


  // Bump internal version in place
  touch() {
    this.v++;
    return this;
  }


  isNew() {
    return parseInt(this.id, 10) < 0;
  }


  // Replace props in place
  update(props) {
    // You can't override this initial information
    const { service, itemType, id } = this;

    Object.keys(props).forEach(prop => this[prop] = props[prop]);

    this.service = service;
    this.itemType = itemType;
    this.id = id;

    return this.touch();
  }

  // A function suitable for use as the second argument to d3.selection#data().
  get key() {
    return this.id + 'v' + (this.v || 0);
  }

  // Generic handling for newly created QAItems
  static id() {
    return this.nextId--;
  }
}
QAItem.nextId = -1;
