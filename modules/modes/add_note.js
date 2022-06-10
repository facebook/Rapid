import { t } from '../core/localizer';
// import { BehaviorDraw } from '../behavior/BehaviorDraw';
import { modeBrowse } from './browse';
import { modeSelectNote } from './select_note';
import { osmNote } from '../osm';
import { services } from '../services';


export function modeAddNote(context) {
    var mode = {
        id: 'add-note',
        button: 'note',
        description: t.html('modes.add_note.description'),
        key: t('modes.add_note.key')
    };

    // var behavior = new BehaviorDraw(context)
    var behavior = context.behaviors.get('draw');
    behavior
      .on('click', add)
      .on('cancel', cancel)
      .on('finish', cancel);


    function add(loc) {
        var osm = services.osm;
        if (!osm) return;

        var note = osmNote({ loc: loc, status: 'open', comments: [] });
        osm.replaceNote(note);

        // force a reraw (there is no history change that would otherwise do this)
        context.map().immediateRedraw();

        context
            .selectedNoteID(note.id)
            .enter(modeSelectNote(context, note.id).newFeature(true));
    }


    function cancel() {
        context.enter(modeBrowse(context));
    }


    mode.enter = function() {
      context.enableBehaviors(['draw', 'hover']);
        // context.install(behavior);
    };


    mode.exit = function() {
      // context.uninstall(behavior);
    };


    return mode;
}
