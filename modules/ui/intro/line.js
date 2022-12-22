import { Extent } from '@id-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { presetManager } from '../../presets';
import { t } from '../../core/localizer';
import { geoSphericalDistance } from '@id-sdk/geo';
import { modeSelect } from '../../modes/select';
import { utilRebind } from '../../util/rebind';
import { helpHtml, icon, transitionTime } from './helper';


export function uiIntroLine(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.lines.title' };
  const container = context.container();
  const history = context.history();
  const map = context.map();

  const flowerStreetID = 'w646';
  const tulipRoadStartExtent = new Extent([-85.63016, 41.95749], [-85.62937, 41.95843]);
  const tulipRoadMidExtent = new Extent([-85.63044, 41.95686], [-85.62900, 41.95843]);
  const tulipRoadIntersection = [-85.629745, 41.95742];
  const roadCategory = presetManager.item('category-road_minor');
  const residentialPreset = presetManager.item('highway/residential');

  const woodStreetID = 'w525';
  const woodStreetEndID = 'n2862';
  const woodStreetExtent = new Extent([-85.62457, 41.95381], [-85.62326, 41.9548]);
  const woodStreetAddNode = [-85.62390, 41.95397];
  const woodStreetDragEndpoint = [-85.62387, 41.95467];
  const woodStreetDragMidpoint = [-85.62386, 41.95430];

  const washingtonStreetID = 'w522';
  const twelfthAvenueID = 'w1';
  const eleventhAvenueEndID = 'n3550';
  const twelfthAvenueEndID = 'n5';
  const deleteLinesExtent = new Extent([-85.62304, 41.95084], [-85.62087, 41.95336]);
  const eleventhAvenueEnd = context.entity(eleventhAvenueEndID).loc;
  const twelfthAvenueEnd = context.entity(twelfthAvenueEndID).loc;
  const deleteLinesLoc = [-85.6219395542764, 41.95228033922477];
  const twelfthAvenue = [-85.62219310052491, 41.952505413152956];

  let _washingtonSegmentID = null;
  let _timeouts = [];
  let _tulipRoadID = null;



  function timeout(fn, t) {
    _timeouts.push(window.setTimeout(fn, t));
  }


  function eventCancel(d3_event) {
    d3_event.stopPropagation();
    d3_event.preventDefault();
  }


  // "Lines are used to represent features such as roads, railroads, and rivers."
  // Click "Add Line" button to advance
  function addLine() {
    context.enter('browse');
    history.reset('initial');
    _tulipRoadID = null;

    const loc = tulipRoadStartExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    map
      .setCenterZoomAsync(loc, 18.5, msec)
      .then(() => {
        const tooltip = curtain.reveal({
          revealSelector: 'button.draw-line',
          tipHtml: helpHtml('intro.lines.add_line')
        });

        tooltip.selectAll('.popover-inner')
          .insert('svg', 'span')
          .attr('class', 'tooltip-illustration')
          .append('use')
          .attr('xlink:href', '#iD-graphic-lines');

        context.on('enter.intro', mode => {
          if (mode.id === 'draw-line') continueTo(startLine);
        });
      });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Here is a road that is missing. Let's add it!"
  // Place the first point to advance
  function startLine() {
    if (context.mode().id !== 'draw-line') return chapter.restart();

    _tulipRoadID = null;

    function onClick() {
      if (context.mode().id !== 'draw-line') return chapter.restart();
      continueTo(drawLine);
    }

    const textID = context.lastPointerType() === 'mouse' ? 'start_line' : 'start_line_tap';
    const startLineString = helpHtml('intro.lines.missing_road') + '{br}' +
      helpHtml('intro.lines.line_draw_info') + helpHtml(`intro.lines.${textID}`);

    curtain.reveal({
      revealExtent: tulipRoadStartExtent,
      tipHtml: startLineString
    });

    context.behaviors.get('draw').on('click', onClick);

    function continueTo(nextStep) {
      context.behaviors.get('draw').off('click', onClick);
      nextStep();
    }
  }


  // Helper function to determine if the roads are connected properly
  function _isTulipRoadConnected() {
    const tulipRoad = _tulipRoadID && context.hasEntity(_tulipRoadID);
    const flowerStreet = flowerStreetID && context.hasEntity(flowerStreetID);
    if (!tulipRoad || !flowerStreet) return false;

    const graph = context.graph();
    const drawNodes = graph.childNodes(tulipRoad);

    return drawNodes.some(node => {
      return graph.parentWays(node).some(parent => parent.id === flowerStreetID);
    });
  }


  // "Continue drawing the line by placing more nodes along the road."
  // "Place an intersection node on {name} to connect the two lines."
  function drawLine() {
    if (context.mode().id !== 'draw-line') return chapter.restart();

    const loc = tulipRoadMidExtent.center();
    const msec = transitionTime(loc, map.center());

    map
      .setCenterZoomAsync(loc, 18.5, msec)
      .then(() => {
        curtain.reveal({
          revealExtent: tulipRoadMidExtent,
          tipHtml: helpHtml('intro.lines.intersect', { name: t('intro.graph.name.flower-street') })
        });
      });

    function onClick() {
      if (_isTulipRoadConnected()) {
        continueTo(continueLine);
      }
    }
    function onFinish() {
      if (!_isTulipRoadConnected()) {
        continueTo(retryIntersect);
      }
    }

    context.behaviors.get('draw').on('click', onClick);
    context.behaviors.get('draw').on('finish', onFinish);

    function continueTo(nextStep) {
      context.behaviors.get('draw').off('click', onClick);
      context.behaviors.get('draw').off('finish', onFinish);
      nextStep();
    }
  }


  // "The road needs to intersect {name}. Let's try again!"
  // This step just returns back to beginning after a short delay
  function retryIntersect() {
    d3_select(window).on('pointerdown.intro mousedown.intro', eventCancel, true);

    curtain.reveal({
      revealExtent: new Extent(tulipRoadIntersection).padByMeters(15),
      tipHtml: helpHtml('intro.lines.intersect', { name: t('intro.graph.name.flower-street') })
    });

    timeout(chapter.restart, 3000);
  }


  // "Continue drawing the line for the new road. Remember that you can drag and zoom the map if needed."
  // "When you're finished, click the last node again or press return."
  // Finish the road to advance
  function continueLine() {
    if (context.mode().id !== 'draw-line') return chapter.restart();
    const entity = _tulipRoadID && context.hasEntity(_tulipRoadID);
    if (!entity) return chapter.restart();

    const loc = tulipRoadMidExtent.center();
    const msec = transitionTime(loc, map.center());

    map
      .setCenterZoomAsync(loc, 18.5, msec)
      .then(() => {
        const continueLineText = helpHtml('intro.lines.continue_line') + '{br}' +
          helpHtml('intro.lines.finish_line_' + (context.lastPointerType() === 'mouse' ? 'click' : 'tap')) +
          helpHtml('intro.lines.finish_road');

        curtain.reveal({
          revealSelector: '.main-map',
          tipHtml: continueLineText
        });
      });

    context.on('enter.intro', mode => {
      if (mode.id === 'draw-line') {
        return;
      } else if (mode.id === 'select') {
        return continueTo(chooseCategoryRoad);
      } else {
        return chapter.restart();
      }
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Select Road from the list."
  // Open the Road category to advance
  function chooseCategoryRoad() {
    if (context.mode().id !== 'select') return chapter.restart();

    context.on('enter.intro', () => chapter.restart());

    const button = container.select('.preset-category-road_minor .preset-list-button');
    if (button.empty()) return chapter.restart();

    // disallow scrolling
    container.select('.inspector-wrap').on('wheel.intro', eventCancel);

    timeout(() => {
      // reset pane, in case user somehow happened to change it..
      container.select('.inspector-wrap .panewrap').style('right', '-100%');

      curtain.reveal({
        revealNode: button.node(),
        revealPadding: 5,
        tipHtml: helpHtml('intro.lines.choose_category_road', { category: roadCategory.name() })
      });

      button.on('click.intro', () => continueTo(choosePresetResidential));

    }, 400);  // after editor pane visible

    function continueTo(nextStep) {
      button.on('click.intro', null);
      container.select('.inspector-wrap').on('wheel.intro', null);
      container.select('.preset-list-button').on('click.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "There are many different types of roads, but this one is a Residential Road..."
  // Select a preset to advance
  function choosePresetResidential() {
    if (context.mode().id !== 'select') return chapter.restart();

    context.on('enter.intro', () => chapter.restart());

    const subgrid = container.select('.preset-category-road_minor .subgrid');
    if (subgrid.empty()) return chapter.restart();

    subgrid.selectAll(':not(.preset-highway-residential) .preset-list-button')
      .on('click.intro', () => continueTo(retryPresetResidential));

    subgrid.selectAll('.preset-highway-residential .preset-list-button')
      .on('click.intro', () => continueTo(nameRoad));

    timeout(() => {
      curtain.reveal({
        revealNode: subgrid.node(),
        revealPadding: 5,
        tipSelector: '.preset-highway-residential .preset-list-button',
        tipHtml: helpHtml('intro.lines.choose_preset_residential', { preset: residentialPreset.name() })
      });
    }, 300);

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      container.selectAll('.preset-list-button').on('click.intro', null);
      nextStep();
    }
  }


  // "You didn't select the Residential type."
  // Click the preset button to advance
  function retryPresetResidential() {
    if (context.mode().id !== 'select') return chapter.restart();

    context.on('enter.intro', () => chapter.restart());

    // disallow scrolling
    container.select('.inspector-wrap').on('wheel.intro', eventCancel);

    timeout(() => {
      const button = container.select('.entity-editor-pane .preset-list-button');
      button.on('click.intro', () => continueTo(chooseCategoryRoad));

      curtain.reveal({
        revealNode: button.node(),
        revealPadding: 5,
        tipHtml: helpHtml('intro.lines.retry_preset_residential', { preset: residentialPreset.name() })
      });
    }, 500);

    function continueTo(nextStep) {
      container.select('.inspector-wrap').on('wheel.intro', null);
      container.select('.preset-list-button').on('click.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Give this road a name, then press the X button or Esc to close the feature editor."
  // Close entity editor / leave select mode to advance
  function nameRoad() {
    context.on('enter.intro', () => continueTo(didNameRoad));

    timeout(() => {
      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.lines.name_road', { button: icon('#iD-icon-close', 'inline') }),
        tooltipClass: 'intro-lines-name_road'  // why?
      });
    }, 500);

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Looks good! Next we will learn how to update the shape of a line."
  // Click Ok to advance
  function didNameRoad() {
    history.checkpoint('doneAddLine');
    curtain.reveal({
      revealSelector: '.main-map',
      tipHtml: helpHtml('intro.lines.did_name_road'),
      buttonText: t.html('intro.ok'),
      buttonCallback: updateLine
    });
  }


  // "Sometimes you will need to change the shape of an existing line. Here is a road that doesn't look quite right."
  // Click Ok to advance
  function updateLine() {
    history.reset('doneAddLine');
    if (!context.hasEntity(woodStreetID) || !context.hasEntity(woodStreetEndID)) {
      return chapter.restart();
    }

    const loc = woodStreetExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    map
      .setCenterZoomAsync(loc, 19, msec)
      .then(() => {
        curtain.reveal({
          revealExtent: woodStreetExtent,
          tipHtml: helpHtml('intro.lines.update_line'),
          buttonText: t.html('intro.ok'),
          buttonCallback: addNode
        });
      });
  }


  // "We can add some nodes to this line to improve its shape."
  // "One way to add a node is to double-click the line where you want to add a node."
  // Create a node on Wood Street to advance
  function addNode() {
    history.reset('doneAddLine');
    if (!context.hasEntity(woodStreetID) || !context.hasEntity(woodStreetEndID)) {
      return chapter.restart();
    }

    curtain.reveal({
      revealExtent: new Extent(woodStreetAddNode).padByMeters(15),
      tipHtml: helpHtml('intro.lines.add_node' + (context.lastPointerType() === 'mouse' ? '' : '_touch'))
    });

    history.on('change.intro', changed => {
      if (!context.hasEntity(woodStreetID) || !context.hasEntity(woodStreetEndID)) {
        return continueTo(updateLine);
      }
      if (changed.created().length === 1) {
        timeout(() => continueTo(startDragEndpoint), 500);
      }
    });

    context.on('enter.intro', mode => {
      if (mode.id !== 'select') {
        continueTo(updateLine);
      }
    });

    function continueTo(nextStep) {
      history.on('change.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "When a line is selected, you can adjust any of its nodes by clicking and holding down the left mouse button while you drag."
  // Drag the endpoint of Wood Street to the expected location to advance
  function startDragEndpoint() {
    if (!context.hasEntity(woodStreetID) || !context.hasEntity(woodStreetEndID)) {
      return continueTo(updateLine);
    }
    const startDragString = helpHtml('intro.lines.start_drag_endpoint' + (context.lastPointerType() === 'mouse' ? '' : '_touch')) +
      helpHtml('intro.lines.drag_to_intersection');

    curtain.reveal({
      revealExtent: new Extent(woodStreetDragEndpoint).padByMeters(20),
      tipHtml: startDragString
    });

    context.behaviors.get('drag').on('move', checkDrag);


    function checkDrag() {
      if (!context.hasEntity(woodStreetID) || !context.hasEntity(woodStreetEndID)) {
        return continueTo(updateLine);
      }
      const entity = context.entity(woodStreetEndID);
      if (geoSphericalDistance(entity.loc, woodStreetDragEndpoint) <= 4) {   // point is close enough
        continueTo(finishDragEndpoint);   // advance to next step
      }
    }

    function continueTo(nextStep) {
      context.behaviors.get('drag').off('move', checkDrag);
      nextStep();
    }
  }


  // "This spot looks good. Release the mouse button to finish dragging..."
  // Leave drag mode to advance
  function finishDragEndpoint() {
    if (!context.hasEntity(woodStreetID) || !context.hasEntity(woodStreetEndID)) {
      return continueTo(updateLine);
    }

    const finishDragString = helpHtml('intro.lines.spot_looks_good') +
      helpHtml('intro.lines.finish_drag_endpoint' + (context.lastPointerType() === 'mouse' ? '' : '_touch'));

    curtain.reveal({
      revealExtent: new Extent(woodStreetDragEndpoint).padByMeters(20),
      tipHtml: finishDragString
    });

    context.behaviors.get('drag').on('move', checkDrag);
    context.on('enter.intro', () => continueTo(startDragMidpoint));

    function checkDrag() {
      if (!context.hasEntity(woodStreetID) || !context.hasEntity(woodStreetEndID)) {
        return continueTo(updateLine);
      }
      const entity = context.entity(woodStreetEndID);
      if (geoSphericalDistance(entity.loc, woodStreetDragEndpoint) > 4) {   // point is too far
        continueTo(startDragEndpoint);   // back to previous step
      }
    }

    function continueTo(nextStep) {
      context.behaviors.get('drag').off('move', checkDrag);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Small triangles are drawn at the *midpoints* between nodes."
  // "Another way to create a new node is to drag a midpoint to a new location."
  // Create a node on Wood Street to advance
  function startDragMidpoint() {
    if (!context.hasEntity(woodStreetID) || !context.hasEntity(woodStreetEndID)) {
      return continueTo(updateLine);
    }
    if (context.selectedIDs().indexOf(woodStreetID) === -1) {
      context.enter(modeSelect(context, [woodStreetID]));
    }

    curtain.reveal({
      revealExtent: new Extent(woodStreetDragMidpoint).padByMeters(20),
      tipHtml: helpHtml('intro.lines.start_drag_midpoint')
    });

    history.on('change.intro', changed => {
      if (changed.created().length === 1) {
        continueTo(continueDragMidpoint);
      }
    });

    context.on('enter.intro', mode => {
      if (mode.id !== 'select') {  // keep Wood Street selected so midpoint triangles are drawn..
        context.enter(modeSelect(context, [woodStreetID]));
      }
    });

    function continueTo(nextStep) {
      history.on('change.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "This line is looking much better! Continue to adjust this line until the curve matches the road shape."
  // "When you're happy with how the line looks, press Ok"
  // Click Ok to advance
  function continueDragMidpoint() {
    if (!context.hasEntity(woodStreetID) || !context.hasEntity(woodStreetEndID)) {
      return continueTo(updateLine);
    }

    curtain.reveal({
      revealExtent: woodStreetExtent,
      tipHtml: helpHtml('intro.lines.continue_drag_midpoint'),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => continueTo(deleteLines)
    });

    function continueTo(nextStep) {
      history.checkpoint('doneUpdateLine');
      nextStep();
    }
  }


  // "It's OK to delete lines for roads that don't exist in the real world..
  // Click Ok to advance
  function deleteLines() {
    history.reset('doneUpdateLine');
    context.enter('browse');

    if (!context.hasEntity(washingtonStreetID) ||
      !context.hasEntity(twelfthAvenueID) ||
      !context.hasEntity(eleventhAvenueEndID)
    ) {
      return chapter.restart();
    }

    const loc = deleteLinesExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    map
      .setCenterZoomAsync(loc, 18, msec)
      .then(() => {
        curtain.reveal({
          revealExtent: deleteLinesExtent,
          tipHtml: helpHtml('intro.lines.delete_lines', { street: t('intro.graph.name.12th-avenue') }),
          buttonText: t.html('intro.ok'),
          buttonCallback: rightClickIntersection
        });
      });
  }


  // "We will split Washington Street at this intersection and remove everything above it."
  // Select point with edit menu open to advance
  function rightClickIntersection() {
    history.reset('doneUpdateLine');
    context.enter('browse');

    const textID = (context.lastPointerType() === 'mouse') ? 'rightclick_intersection' : 'edit_menu_intersection_touch';
    const rightClickString = helpHtml('intro.lines.split_street', {
      street1: t('intro.graph.name.11th-avenue'),
      street2: t('intro.graph.name.washington-street')
    }) + helpHtml(`intro.lines.${textID}`);

    curtain.reveal({
      revealExtent: new Extent(eleventhAvenueEnd).padByMeters(10),
      tipHtml: rightClickString
    });

    context.on('enter.intro', mode => {
      if (mode.id !== 'select') return;
      const ids = context.selectedIDs();
      if (ids.length !== 1 || ids[0] !== eleventhAvenueEndID) return;

      timeout(() => {
        const node = container.select('.edit-menu-item-split').node();
        if (!node) return;
        continueTo(splitIntersection);
      }, 50);  // after menu visible
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Press the Split button to divide Washington Street"
  // Split Washington Street to advance
  function splitIntersection() {
    if (!context.hasEntity(washingtonStreetID) ||
      !context.hasEntity(twelfthAvenueID) ||
      !context.hasEntity(eleventhAvenueEndID)
    ) {
      return continueTo(deleteLines);
    }

    const node = container.select('.edit-menu-item-split').node();
    if (!node) { return continueTo(rightClickIntersection); }

    _washingtonSegmentID = null;

    curtain.reveal({
      revealSelector: '.edit-menu',
      revealPadding: 50,
      tipHtml: helpHtml('intro.lines.split_intersection', { street: t('intro.graph.name.washington-street') })
    });

    history.on('change.intro', changed => {
      timeout(() => {
        if (history.undoAnnotation() === t('operations.split.annotation.line', { n: 1 })) {
          _washingtonSegmentID = changed.created()[0].id;
          continueTo(didSplit);
        } else {
          _washingtonSegmentID = null;
          continueTo(retrySplit);
        }
      }, 300);  // after any transition (e.g. if user deleted intersection)
    });

    function continueTo(nextStep) {
      history.on('change.intro', null);
      nextStep();
    }
  }


  // "You didn't press the Split button. Try again."
  // Click Ok to advance
  function retrySplit() {
    context.enter('browse');
    curtain.reveal({
      revealExtent: deleteLinesExtent,
      tipHtml: helpHtml('intro.lines.retry_split'),
      buttonText: t.html('intro.ok'),
      buttonCallback: rightClickIntersection
    });
  }


  // Helper function to ensure that the road segments needed
  // to complete this part of the tutorial exist in the graph.
  function _hasAllSegments() {
    return (
      _washingtonSegmentID &&
      context.hasEntity(_washingtonSegmentID) &&
      context.hasEntity(washingtonStreetID) &&
      context.hasEntity(twelfthAvenueID) &&
      context.hasEntity(eleventhAvenueEndID)
    );
  }


  // "Good job! Washington Street is now split into two pieces."
  // "The top part can be removed. Select the top part of Washington Street"
  // Select Washington Street top segment to advance
  function didSplit() {
    if (!_hasAllSegments()) return continueTo(rightClickIntersection);

    const ids = context.selectedIDs();
    const string = 'intro.lines.did_split_' + (ids.length > 1 ? 'multi' : 'single');
    const street = t('intro.graph.name.washington-street');

//    const padding = 200 * Math.pow(2, map.zoom() - 18);
//    const box = pad(twelfthAvenue, padding, context);
//    box.width = box.width / 2;
//    curtain.reveal(box, helpHtml(string, { street1: street, street2: street }), { duration: 500 } );

    curtain.reveal({
      revealExtent: deleteLinesExtent,
      tipHtml: helpHtml(string, { street1: street, street2: street })
    });

    context.on('enter.intro', () => {
      const ids = context.selectedIDs();
      if (ids.length === 1 && ids[0] === _washingtonSegmentID) {
        continueTo(multiSelect);
      }
    });

    history.on('change.intro', () => {
      if (!_hasAllSegments()) return continueTo(rightClickIntersection);
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      history.on('change.intro', null);
      nextStep();
    }
  }


  // "Washington Street is now selected. Let's also select 12th Avenue."
  // "You can hold Shift while clicking to select multiple things."
  // Multiselect both Washington Street top segment and 12th Avenue to advance
  function multiSelect() {
    if (!_hasAllSegments()) return continueTo(rightClickIntersection);

    const ids = context.selectedIDs();
    const hasWashington = ids.indexOf(_washingtonSegmentID) !== -1;
    const hasTwelfth = ids.indexOf(twelfthAvenueID) !== -1;

    if (hasWashington && hasTwelfth) {
      return continueTo(multiRightClick);
    } else if (!hasWashington && !hasTwelfth) {
      return continueTo(didSplit);
    }

    // map.centerZoomEase(twelfthAvenue, 18, 500);

    // timeout(() => {
      let selected, other, padding, box;
      if (hasWashington) {
        selected = t('intro.graph.name.washington-street');
        other = t('intro.graph.name.12th-avenue');
//        padding = 60 * Math.pow(2, map.zoom() - 18);
//        box = pad(twelfthAvenueEnd, padding, context);
//        box.width *= 3;
      } else {
        selected = t('intro.graph.name.12th-avenue');
        other = t('intro.graph.name.washington-street');
//        padding = 200 * Math.pow(2, map.zoom() - 18);
//        box = pad(twelfthAvenue, padding, context);
//        box.width /= 2;
      }

      const textID = (context.lastPointerType() === 'mouse') ? 'click' : 'touch';
      const string =
        helpHtml('intro.lines.multi_select', { selected: selected, other1: other }) + ' ' +
        helpHtml(`intro.lines.add_to_selection_${textID}`, { selected: selected, other2: other });

      curtain.reveal({
        revealExtent: deleteLinesExtent,
        tipHtml: string
      });

    // }, msec + 100);


    context.on('enter.intro', () => continueTo(multiSelect));

    history.on('change.intro', () => {
      if (!_hasAllSegments()) return continueTo(rightClickIntersection);
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      history.on('change.intro', null);
      nextStep();
    }
  }


  // "Good! Both lines to delete are now selected."
  // "Right-click on one of the lines to show the edit menu."
  // Open edit menu with both lines multiselected to advance
  function multiRightClick() {
    if (!_hasAllSegments()) return continueTo(rightClickIntersection);

//    const padding = 200 * Math.pow(2, map.zoom() - 18);
//    const box = pad(twelfthAvenue, padding, context);
//    curtain.reveal(box, rightClickString);

    // const loc = deleteLinesExtent.center();
    // const msec = transitionTime(loc, map.center());
    // if (msec > 0) curtain.hide();
    // map.centerZoomEase(loc, 18, msec);

    // timeout(() => {
      const rightClickString = helpHtml('intro.lines.multi_select_success') +
        helpHtml('intro.lines.multi_' + (context.lastPointerType() === 'mouse' ? 'rightclick' : 'edit_menu_touch'));

      curtain.reveal({
        revealExtent: deleteLinesExtent,
        tipHtml: rightClickString
      });
    // }, msec + 100);

    context.ui().editMenu().on('toggled.intro', open => {
      if (!open) return;

      timeout(() => {
        const ids = context.selectedIDs();
        if (ids.length === 2 && ids.indexOf(twelfthAvenueID) !== -1 && ids.indexOf(_washingtonSegmentID) !== -1) {
          const node = container.select('.edit-menu-item-delete').node();
          if (!node) return;
          continueTo(multiDelete);
        } else if (ids.length === 1 && ids.indexOf(_washingtonSegmentID) !== -1) {
          return continueTo(multiSelect);
        } else {
          return continueTo(didSplit);
        }
      }, 300);  // after edit menu visible
    });

    history.on('change.intro', () => {
      if (!_hasAllSegments()) return continueTo(rightClickIntersection);
    });

    function continueTo(nextStep) {
      context.ui().editMenu().on('toggled.intro', null);
      history.on('change.intro', null);
      nextStep();
    }
  }


  // "Press the Delete button to remove the extra lines."
  // Both lines should be deleted to advance
  function multiDelete() {
    if (!_hasAllSegments()) return continueTo(rightClickIntersection);

    const node = container.select('.edit-menu-item-delete').node();
    if (!node) return continueTo(multiRightClick);

    curtain.reveal({
      revealSelector: '.edit-menu',
      revealPadding: 50,
      tipHtml: helpHtml('intro.lines.multi_delete')
    });

    context.on('enter.intro', () => {
      if (context.hasEntity(_washingtonSegmentID) || context.hasEntity(twelfthAvenueID)) {
        return continueTo(multiSelect);  // exited select mode but roads still exist
      }
    });

    history.on('change.intro', () => {
      if (context.hasEntity(_washingtonSegmentID) || context.hasEntity(twelfthAvenueID)) {
        continueTo(retryDelete);   // changed something but roads still exist
      } else {
        continueTo(play);
      }
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      history.on('change.intro', null);
      nextStep();
    }
  }


  // "You didn't press the {delete_icon} {delete} button. Try again."
  // Click Ok to advance
  function retryDelete() {
    context.enter('browse');
    curtain.reveal({
      revealExtent: deleteLinesExtent,
      tipHtml: helpHtml('intro.lines.retry_delete'),
      buttonText: t.html('intro.ok'),
      buttonCallback: multiSelect
    });
  }


  // Free play
  // Click on Lines (or another) chapter to advance
  function play() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-building',
      tipHtml: helpHtml('intro.lines.play', { next: t('intro.buildings.title') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
  }


  chapter.enter = () => {
    addLine();
  };


  chapter.exit = () => {
    _timeouts.forEach(window.clearTimeout);
    d3_select(window).on('pointerdown.intro mousedown.intro', null, true);
    context.on('enter.intro', null);
    history.on('change.intro', null);
    container.select('.inspector-wrap').on('wheel.intro', null);
    container.select('.preset-list-button').on('click.intro', null);
  };


  chapter.restart = () => {
    chapter.exit();
    chapter.enter();
  };


  return utilRebind(chapter, dispatch, 'on');
}
