export class Task {
  constructor(loc, service, id, props) {
    // Store required properties
    this.loc = loc;
    this.service = service.id;

    // All issues must have an ID for selection, use generic if none specified
    this.id = id ? id : `${Task.id()}`;

    this.update(props);
  }

  update(props) {
    // You can't override this initial information
    const { loc, service, itemType, id } = this;

    Object.keys(props).forEach(prop => this[prop] = props[prop]);

    this.loc = loc;
    this.service = service;
    this.itemType = itemType;
    this.id = id;

    return this;
  }

  // Generic handling for newly created QAItems
  static id() {
    return this.nextId--;
  }

  // Return extent object for zoom-in on-click
  extent(){
    return {};
  }
}
Task.nextId = -1;
