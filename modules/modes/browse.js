import { t } from '../core/localizer';

// import { BehaviorHover } from '../behaviors/BehaviorHover';
// import { behaviorLasso } from '../behaviors/lasso';
// import { BehaviorPaste } from '../behaviors/BehaviorPaste';
// import { BehaviorSelect } from '../behaviors/BehaviorSelect';

import { modeDragNode } from './drag_node';
import { modeDragNote } from './drag_note';
import { operationPaste } from '../operations/paste';


export function modeBrowse(context) {
    var mode = {
        button: 'browse',
        id: 'browse',
        title: t('modes.browse.title'),
        description: t('modes.browse.description')
    };
    var sidebar;

    // var _selectBehavior;
    // var _behaviors = [];

    // var behavior = context.behaviors.get('select');

    mode.selectBehavior = () =>  { console.error('error: do not call modeBrowse.selectBehavior anymore'); };
    // mode.selectBehavior = function() {
    //   if (!arguments.length) return behavior;
    //   /* no value set, keep it around */
    //   else return mode;
    //     // if (!arguments.length) return _selectBehavior;
    //     // _selectBehavior = val;
    //     // return mode;
    // };


    mode.enter = function() {
      context.enableBehaviors(['hover', 'select', 'drag']);
        // if (!_behaviors.length) {
        //     if (!_selectBehavior) _selectBehavior = new BehaviorSelect(context);
        //     _behaviors = [
        //         new BehaviorHover(context),
        //         new BehaviorPaste(context),
        //         _selectBehavior,
        //         behaviorLasso(context),
        //         modeDragNode(context).behavior,
        //         // modeDragNote(context).behavior
        //     ];
        // }
        // _behaviors.forEach(context.install);

        // Get focus on the body.
        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }

        if (sidebar) {
            context.ui().sidebar.show(sidebar);
        } else {
            context.ui().sidebar.select(null);
        }
    };


    mode.exit = function() {
        // _behaviors.forEach(context.uninstall);
        if (sidebar) {
            context.ui().sidebar.hide();
        }
    };


    mode.sidebar = function(val) {
        if (!arguments.length) return sidebar;
        sidebar = val;
        return mode;
    };


    mode.operations = function() {
        return [operationPaste(context)];
    };


    return mode;
}
