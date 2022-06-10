import { actionAddEntity } from '../actions/add_entity';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionAddVertex } from '../actions/add_vertex';

// import { BehaviorAddWay } from '../behavior/BehaviorAddWay';
import { modeDrawLine } from './draw_line';
import { osmNode, osmWay } from '../osm';

// RapiD
import { prefs } from '../core/preferences';


export function modeAddLine(context, mode) {
    mode.id = 'add-line';

    // var behavior = new BehaviorAddWay(context)
    var behavior = context.behaviors.get('add-way');
    behavior
      .on('start', start)
      .on('startFromWay', startFromWay)
      .on('startFromNode', startFromNode);


    var defaultTags = {};
    if (mode.preset) defaultTags = mode.preset.setTags(defaultTags, 'line');

    // RapiD tagSources
    var tagSources = prefs('rapid-internal-feature.tagSources') === 'true';
    if (tagSources && defaultTags.highway) {
        defaultTags.source = 'maxar';
    }


    function start(loc) {
        var startGraph = context.graph();
        var node = osmNode({ loc: loc });
        var way = osmWay({ tags: defaultTags });

        context.perform(
            actionAddEntity(node),
            actionAddEntity(way),
            actionAddVertex(way.id, node.id)
        );

        context.enter(modeDrawLine(context, way.id, startGraph, mode.button));
    }


    function startFromWay(loc, edge) {
        var startGraph = context.graph();
        var node = osmNode({ loc: loc });
        var way = osmWay({ tags: defaultTags });

        context.perform(
            actionAddEntity(node),
            actionAddEntity(way),
            actionAddVertex(way.id, node.id),
            actionAddMidpoint({ loc: loc, edge: edge }, node)
        );

        context.enter(modeDrawLine(context, way.id, startGraph, mode.button));
    }


    function startFromNode(loc, node) {
        var startGraph = context.graph();
        var way = osmWay({ tags: defaultTags });

        context.perform(
            actionAddEntity(way),
            actionAddVertex(way.id, node.id)
        );

        context.enter(modeDrawLine(context, way.id, startGraph, mode.button));
    }


    mode.enter = function() {
      context.enableBehaviors(['add-way', 'hover']);
      // context.install(behavior);
    };


    mode.exit = function() {
      // context.uninstall(behavior);
    };

    return mode;
}
