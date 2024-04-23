export class Task {
  constructor(loc, service, id, props) {
    // Store required properties
    this.loc = loc;
    this.service = service.id;

    // All tasks must have an ID for selection, use generic if none specified
    this.id = id ? id : `${Task.id()}`;

    this.update(props);
  }

  update(props) {
  // You can't override this initial information
  const { loc, service, id } = this;

  Object.keys(props).forEach(prop => this[prop] = props[prop]);

  this.loc = loc;
  this.service = service;
  this.id = id;
  this.type = props.type;

  return this;
}

  // Generic handling for newly created QAItems
  static id() {
    return this.nextId--;
  }
}
Task.nextId = -1;
