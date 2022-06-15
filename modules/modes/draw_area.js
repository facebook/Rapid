import { t } from '../core/localizer';
// import { behaviorDrawWay } from '../behaviors/draw_way';


export function modeDrawArea(context, wayID, startGraph, button) {
    var mode = {
        button: button,
        id: 'draw-area'
    };

//    var behavior = behaviorDrawWay(context, wayID, mode, startGraph)
//        .on('rejectedSelfIntersection.modeDrawArea', function() {
//            context.ui().flash
//                .iconName('#iD-icon-no')
//                .label(t('self_intersection.error.areas'))();
//        });

    mode.wayID = wayID;

    mode.enter = function() {
      context.enableBehaviors(['hover', 'select']);
      // context.install(behavior);
      return true;
    };

    mode.exit = function() {
        // context.uninstall(behavior);
    };

    mode.selectedIDs = function() {
        return [wayID];
    };

    mode.activeID = function() {
        // return (behavior && behavior.activeID()) || [];
    };

    return mode;
}
