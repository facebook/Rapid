import { Extent } from '@rapid-sdk/math';

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
  // This converts the polygon returned by 
  extent(){
    let sortX = this.task.bounding.coordinates[0].sort(
      (a, b) => {
        return b[0] - a[0];
      }
    );
    const minX = sortX[0][0];
    const maxX = sortX[sortX.length - 1][0];
    let sortY = this.task.bounding.coordinates[0].sort(
      (a, b) => {
        return b[1] - a[1];
      }
    );
    const minY = sortY[0][1];
    const maxY = sortY[sortY.length - 1][1];

    return new Extent([minX, minY], [maxX, maxY]);
  }
}
Task.nextId = -1;
