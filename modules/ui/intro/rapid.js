import { dispatch as d3_dispatch } from 'd3-dispatch';

import {
    event as d3_event,
    select as d3_select
} from 'd3-selection';

import marked from 'marked'; 
import { t } from '../../util/locale';
import { modeBrowse} from '../../modes';
import { utilRebind } from '../../util/rebind';
import { icon, pad, transitionTime } from './helper';
import { services } from '../../services';


export function uiIntroRapid(context, reveal) {
    var dispatch = d3_dispatch('done');
    var timeouts = [];

    var tulipLaneStart = [-85.6297512, 41.9561476];
    var tulipLaneMid = [-85.6281089, 41.9561288];
    var tulipLaneEnd = [-85.6272670, 41.9558780];
    var chapter = {
        title: 'intro.rapid.title'
    };


    function timeout(f, t) {
        timeouts.push(window.setTimeout(f, t));
    }


    function tulipLaneEndBoundingBox(){
        var padding = 70 * Math.pow(2, context.map().zoom() -18);
        var box = pad(tulipLaneEnd, padding, context);
        box.height = box.height + 65;
        box.width = box.width + 65;

        return box;
    }

    function tulipLaneBoundingBox(){
        var padding = 70 * Math.pow(2, context.map().zoom() -18);
        var box = pad(tulipLaneStart, padding, context);
        box.height = box.height + 65;
        box.width = box.width + 600;

        return box;
    }


    function aiFeaturesEnabled(context) {
        return context.layers().layer('ai-features').enabled();
    }


    function aiFeaturesToggle(context) {
        var aiFeatures = context.layers().layer('ai-features');
        aiFeatures.enabled(!aiFeatures.enabled());
    }



    function eventCancel() {
        d3_event.stopPropagation();
        d3_event.preventDefault();
    }


    function welcome() {
        if (aiFeaturesEnabled(context)) {
            aiFeaturesToggle(context);
        }
        context.enter(modeBrowse(context));
        context.history().reset('initial');
        services.fbMLRoads.reset('initial');
        reveal('.intro-nav-wrap .chapter-rapid',
            t('intro.rapid.start', { rapid: icon('#iD-logo-rapid', 'pre-text') }),
            { buttonText: t('intro.ok'), buttonCallback: showHideRoads }
        );
    }


    function showHideRoads() {
        var msec = transitionTime(tulipLaneMid, context.map().center());
        if (msec) { reveal(null, null, { duration: 0 }); }
        context.map().centerZoomEase(tulipLaneMid, 18.5, msec);

        reveal(
            'button.ai-features-toggle',
            t('intro.rapid.ai_roads', { rapid: icon('#iD-logo-rapid', 'pre-text') }),
            { buttonText: t('intro.ok'), buttonCallback: selectRoad });    
    }


    function selectRoad() {
        var drawAiFeatures = context.layers().layer('ai-features');
        drawAiFeatures.enabled(true);

        // disallow scrolling
        d3_select('.inspector-wrap').on('wheel.intro', eventCancel);
        reveal(tulipLaneBoundingBox(), t('intro.rapid.select_road'));

        timeout(function() {
            var fbRoad = d3_select('.data-layer.ai-features');
            fbRoad.on('click.intro', function() {
                continueTo(addRoad);
            });
        }, 250);

        function continueTo(nextStep) {
            nextStep();
        }
    }


    function addRoad() {
        timeout(function() {
            reveal('button.ai-features-accept', t('intro.rapid.add_road'));

            var button = d3_select('button.ai-features-accept');
            button.on('click.intro', function() {
                continueTo(roadAdded);
            });
        }, 250);


        function continueTo(nextStep) {
            nextStep();
        }
    }


    function roadAdded() {
        if (context.mode().id !== 'select') return chapter.restart();
         timeout(function() {
            reveal(tulipLaneBoundingBox(),
                t('intro.rapid.add_road_not_saved_yet', { rapid: icon('#iD-logo-rapid', 'pre-text') }),
                { buttonText: t('intro.ok'), buttonCallback: showLint }
            );

         }, 250);
    }

    function showLint() {
        var button = d3_select('li.issue-list-item.actionable > button');
        button.on('click.intro', function() {
            continueTo(fixLint);
        });

        if (context.mode().id !== 'select') return chapter.restart();
            timeout(function() {

            reveal('div.issue.severity-warning',
                t('intro.rapid.new_lints'),
                { buttonText: t('intro.ok'), buttonCallback: fixLint }
            );
         }, 250);

         function continueTo(nextStep) {
            button.on('click.intro', null);
            nextStep();
        }
    }


    function fixLint() {
        if (context.mode().id !== 'select') return chapter.restart();

        var button = d3_select('li.issue-fix-item.actionable');
        button.on('click.intro', function() {
            continueTo(showFixedRoad);
        });

        timeout(function() {
            reveal('li.issue-fix-item.actionable',
                t('intro.rapid.fix_lint', {connect: icon('#iD-icon-crossing', 'pre-text') })
            );
        }, 250);

        function continueTo(nextStep) {
            button.on('click.intro', null);
            nextStep();
        }
    }


    function showFixedRoad() {
        if (context.mode().id !== 'select') return chapter.restart();
        timeout(function() {
            reveal(tulipLaneEndBoundingBox(),
                t('intro.rapid.fixed_lint'),
                {buttonText: t('intro.ok'), buttonCallback: undoFixLint}
            );
        }, 250);
    }


    function undoFixLint() {
        if (context.mode().id !== 'select') return chapter.restart();

        timeout(function() {

            var button = d3_select('#bar button.undo-button');

            var iconName = '#iD-icon-undo';
            reveal('#bar button.undo-button',
                t('intro.rapid.undo_fix_lint', { button: icon(iconName, 'pre-text') })
            );

            button.on('click.intro', function() {
                continueTo(undoRoadAdd);
            });

        }, 250);

        function continueTo(nextStep) {
            nextStep();
        }
    }

    function undoRoadAdd() {
        if (context.mode().id !== 'select') return chapter.restart();

        timeout(function() {

            var button = d3_select('#bar button.undo-button');

            var iconName = '#iD-icon-undo';
            reveal('#bar button.undo-button',
                t('intro.rapid.undo_road_add', { button: icon(iconName, 'pre-text') })
            );

            button.on('click.intro', function() {
                continueTo(afterUndoRoadAdd);
            });

        }, 250);

        function continueTo(nextStep) {
            nextStep();
        }
    }


    function afterUndoRoadAdd() {
        timeout(function() {
            reveal(tulipLaneBoundingBox(),
                t('intro.rapid.undo_road_add_aftermath'),
                { buttonText: t('intro.ok'), buttonCallback: function() { selectRoadAgain(); } }
            );
         }, 250);
    }


    function selectRoadAgain() {
        timeout(function() {
            reveal(tulipLaneBoundingBox(), t('intro.rapid.select_road_again'));
            var fbRoad = d3_select('.data-layer.ai-features');
            fbRoad.on('click.intro', function() { deleteRoad(); } );
        }, 250);
    }


    function deleteRoad() {
        timeout(function() {
            reveal('button.ai-features-reject', t('intro.rapid.delete_road'));
            var button = d3_select('button.ai-features-reject');
            button.on('click.intro', function() { showHelp(); });
        }, 250);
    }


    function showHelp() {
        reveal(
            '.map-control.help-control',
            t('intro.rapid.help',
                {
                    rapid: icon('#iD-logo-rapid', 'pre-text'),
                    button: icon('#iD-icon-help', 'pre-text'),
                    key: t('help.key')
                }
            ),
            {
                buttonText: t('intro.ok'),
                buttonCallback: function() { allDone(); }
            }
        );
    }


    function allDone() {
        if (context.mode().id !== 'browse') return chapter.restart();
        dispatch.call('done');
        reveal('.intro-nav-wrap .chapter-startEditing',
            marked(t('intro.rapid.done',{ next: t('intro.startediting.title') }))
        );
    }


    chapter.enter = function() {
        welcome();
    };


    chapter.exit = function() {
        timeouts.forEach(window.clearTimeout);
        d3_select(window).on('mousedown.intro-rapid', null, true);
        context.on('enter.intro-rapid exit.intro-rapid', null);
        context.map().on('move.intro-rapid drawn.intro-rapid', null);
        context.history().on('change.intro-rapid', null);
        d3_select('.inspector-wrap').on('wheel.intro-rapid', null);
        d3_select('.preset-list-button').on('click.intro-rapid', null);
    };


    chapter.restart = function() {
        chapter.exit();
        chapter.enter();
    };


    return utilRebind(chapter, dispatch, 'on');

}
