
/**
 * `Edit` encapsulates the state of a single edit.
 */
export class Edit {
  constructor(props) {
    this.graph       = props.graph;
    this.annotation  = props.annotation;
    this.imageryUsed = props.imageryUsed;
    this.photosUsed  = props.photosUsed;
    this.transform   = props.transform;
    this.selectedIDs = props.selectedIDs;
  }
}
