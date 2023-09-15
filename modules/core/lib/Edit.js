
/**
 * `Edit` encapsulates the state of a single edit.
 */
export class Edit {
  constructor(props) {
    this.annotation  = props.annotation;
    this.graph       = props.graph;
    this.selectedIDs = props.selectedIDs;
    this.sources     = props.sources || {};
    this.transform   = props.transform;
  }
}
