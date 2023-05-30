
export class ValidationFix {
  constructor(props) {
    this.title = props.title;                     // Required
    this.onClick = props.onClick;                 // Optional - the function to run to apply the fix
    this.disabledReason = props.disabledReason;   // Optional - a string explaining why the fix is unavailable, if any
    this.icon = props.icon;                       // Optional - shows 'rapid-icon-wrench' if not set
    this.entityIds = props.entityIds || [];       // Optional - used for hover-higlighting.
//    this.autoArgs = props.autoArgs;             // Optional - pass [actions, annotation] arglist if this fix can automatically run

    this.issue = null;    // Generated link - added by ValidationIssue
  }
}
