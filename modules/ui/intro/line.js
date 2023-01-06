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
  let _lineID = null;



  function timeout(fn, t) {
    _timeouts.push(window.setTimeout(fn, t));
  }


  function eventCancel(d3_event) {
    d3_event.stopPropagation();
    d3_event.preventDefault();
  }


  // Helper function to make sure the line exists
  function _doesLineExist() {
    return _lineID && context.hasEntity(_lineID);
  }

  // Helper function to make sure the line is selected
  function _isLineSelected() {
    if (context.mode().id !== 'select') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === _lineID;
  }

  // Helper function to determine if the roads are connected properly
  function _isLineConnected() {
    const tulipRoad = _lineID && context.hasEntity(_lineID);
    const flowerStreet = flowerStreetID && context.hasEntity(flowerStreetID);
    if (!tulipRoad || !flowerStreet) return false;

    const graph = context.graph();
    const drawNodes = graph.childNodes(tulipRoad);

    return drawNodes.some(node => {
      return graph.parentWays(node).some(parent => parent.id === flowerStreetID);
    });
  }

  // Helper function to ensure that the Wood Street parts exist in the graph
  function _hasWoodStreet() {
    return context.hasEntity(woodStreetID) && context.hasEntity(woodStreetEndID);
  }

  // Helper function to make sure Wood Street is selected
  function _isWoodStreetSelected() {
    if (context.mode().id !== 'select') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === woodStreetID;
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

  // Helper function to force the entity inspector open
  // These things happen automatically but we want to be sure
  function _showEntityEditor() {
    container.select('.inspector-wrap .entity-editor-pane').classed('hide', false);
    container.select('.inspector-wrap .preset-list-pane').classed('hide', true);
    container.select('.inspector-wrap .panewrap').style('right', '0%');
  }

  // Helper function to force the preset list open
  // These things happen automatically but we want to be sure
  function _showPresetList() {
    container.select('.inspector-wrap .entity-editor-pane').classed('hide', true);
    container.select('.inspector-wrap .preset-list-pane').classed('hide', false);
    container.select('.inspector-wrap .panewrap').style('right', '-100%');
  }


  /* DRAW TULIP ROAD */

  // "Lines are used to represent features such as roads, railroads, and rivers."
  // Click "Add Line" button to advance
  function addLine() {
    context.enter('browse');
    history.reset('initial');
    _lineID = null;

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
      });

    context.on('enter.intro', () => continueTo(startLine));

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Here is a road that is missing. Let's add it!"
  // Place the first point to advance
  function startLine() {
    if (context.mode().id !== 'draw-line') return continueTo(addLine);
    _lineID = null;

    const textID = context.lastPointerType() === 'mouse' ? 'start_line' : 'start_line_tap';
    const startLineString = helpHtml('intro.lines.missing_road') + '{br}' +
      helpHtml('intro.lines.line_draw_info') + helpHtml(`intro.lines.${textID}`);

    curtain.reveal({
      revealExtent: tulipRoadStartExtent,
      tipHtml: startLineString
    });

    history.on('change.intro', difference => {
      if (!difference) return;
      for (const entity of difference.created()) {  // created a node and a way
        if (entity.type === 'way') {
          _lineID = entity.id;
          return continueTo(drawLine);
        }
      }
    });

    context.on('enter.intro', () => continueTo(addLine));

    function continueTo(nextStep) {
      history.on('change.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Continue drawing the line by placing more nodes along the road."
  // "Place an intersection node on {name} to connect the two lines."
  function drawLine() {
    if (!_doesLineExist() || context.mode().id !== 'draw-line') return continueTo(addLine);

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

    history.on('change.intro', () => {
      if (_isLineConnected()) {
        return continueTo(finishLine);
      }
    });

    context.on('enter.intro', () => continueTo(retryIntersect));

    function continueTo(nextStep) {
      history.on('change.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "The road needs to intersect {name}. Let's try again!"
  // This step just returns back to beginning after a short delay
  function retryIntersect() {
    curtain.reveal({
      revealExtent: new Extent(tulipRoadIntersection).padByMeters(15),
      tipHtml: helpHtml('intro.lines.retry_intersect', { name: t('intro.graph.name.flower-street') })
    });

    timeout(chapter.restart, 3000);
  }


  // "Continue drawing the line for the new road. Remember that you can drag and zoom the map if needed."
  // "When you're finished, click the last node again or press return."
  // Finish the road to advance
  function finishLine() {
    if (!_doesLineExist() || context.mode().id !== 'draw-line') return continueTo(addLine);

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

    context.on('enter.intro', () => continueTo(chooseCategoryRoad));

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Select Minor Roads from the list."
  // Open the Minor Roads category to advance
  function chooseCategoryRoad() {
    if (!_doesLineExist()) return continueTo(addLine);
    if (!_isLineSelected()) context.enter(modeSelect(context, [_lineID]));

    container.select('.inspector-wrap').on('wheel.intro', eventCancel);  // disallow scrolling

    timeout(() => {
      _showPresetList();

      const category = container.select('.preset-category-road_minor .preset-list-button');
      if (category.classed('expanded')) return continueTo(choosePresetResidential);  // advance - already expanded

      curtain.reveal({
        revealNode: category.node(),
        revealPadding: 5,
        tipHtml: helpHtml('intro.lines.choose_category_road', { category: roadCategory.name() })
      });

      category.on('click.intro', () => {
        category.on('click.intro', null);
        continueTo(choosePresetResidential);
      });
    }, 400);  // after animation


    context.on('enter.intro', () => continueTo(chooseCategoryRoad));  // retry

    function continueTo(nextStep) {
      container.select('.inspector-wrap').on('wheel.intro', null);
      container.select('.preset-list-button').on('click.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "There are many different types of roads, but this one is a Residential Road..."
  // Select a preset to advance
  function choosePresetResidential() {
    if (!_doesLineExist()) return continueTo(addLine);
    if (!_isLineSelected()) context.enter(modeSelect(context, [_lineID]));

    container.select('.inspector-wrap').on('wheel.intro', eventCancel);  // disallow scrolling

    timeout(() => {
      _showPresetList();

      const category = container.select('.preset-category-road_minor .preset-list-button');
      if (!category.classed('expanded')) return continueTo(chooseCategoryRoad);  // category not expanded - go back

      // reveal all choices - at this point in the tutorial we are giving the user more freedom
      const subgrid = container.select('.preset-category-road_minor .subgrid');
      if (subgrid.empty()) return continueTo(addLine);  // no minor road presets?

      curtain.reveal({
        revealNode: subgrid.node(),
        revealPadding: 5,
        tipSelector: '.preset-highway-residential .preset-list-button',
        tipHtml: helpHtml('intro.lines.choose_preset_residential', { preset: residentialPreset.name() })
      });
    }, 400);  // after animation

    history.on('change.intro', difference => {
      if (!difference) return;
      const modified = difference.modified();
      if (modified.length === 1) {
        if (presetManager.match(modified[0], context.graph()) === residentialPreset) {
          return continueTo(nameRoad);
        } else {
          return continueTo(retryPresetResidential);  // didn't pick residential, retry
        }
      }
    });

    context.on('enter.intro', () => continueTo(chooseCategoryRoad));  // retry

    function continueTo(nextStep) {
      history.on('change.intro', null);
      context.on('enter.intro', null);
      container.select('.inspector-wrap').on('wheel.intro', null);
      nextStep();
    }
  }


  // "You didn't select the Residential type."
  // Click the preset button to advance
  function retryPresetResidential() {
    if (!_doesLineExist()) return continueTo(addLine);
    if (!_isLineSelected()) context.enter(modeSelect(context, [_lineID]));

    container.select('.inspector-wrap').on('wheel.intro', eventCancel);  // disallow scrolling

    timeout(() => {
      _showPresetList();

      const category = container.select('.preset-category-road_minor .preset-list-button');
      if (!category.classed('expanded')) return continueTo(chooseCategoryRoad);  // category not expanded - go back

      // reveal just the button we want them to click
      const preset = container.select('.preset-highway-residential .preset-list-button');
      curtain.reveal({
        revealNode: preset.node(),
        revealPadding: 5,
        tipHtml: helpHtml('intro.lines.retry_preset_residential', { preset: residentialPreset.name() })
      });
    }, 400);  // after animation

    history.on('change.intro', difference => {
      if (!difference) return;
      const modified = difference.modified();
      if (modified.length === 1) {
        if (presetManager.match(modified[0], context.graph()) === residentialPreset) {
          return continueTo(nameRoad);
        } else {
          return continueTo(chooseCategoryRoad);
        }
      }
    });

    context.on('enter.intro', () => continueTo(chooseCategoryRoad));  // retry

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
    if (!_doesLineExist()) return continueTo(addLine);
    if (!_isLineSelected()) context.enter(modeSelect(context, [_lineID]));

    timeout(() => {
      _showEntityEditor();

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.lines.name_road', { button: icon('#iD-icon-close', 'inline') }),
        tooltipClass: 'intro-lines-name_road'
      });
    }, 400);

    context.on('enter.intro', () => continueTo(didNameRoad));

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


  /* REALIGN WOOD STREET */

  // "Sometimes you will need to change the shape of an existing line. Here is a road that doesn't look quite right."
  // Click Ok to advance
  function updateLine() {
    history.reset('doneAddLine');
    if (!_hasWoodStreet()) return chapter.restart();

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
    if (!_hasWoodStreet()) return chapter.restart();

    curtain.reveal({
      revealExtent: new Extent(woodStreetAddNode).padByMeters(15),
      tipHtml: helpHtml('intro.lines.add_node' + (context.lastPointerType() === 'mouse' ? '' : '_touch'))
    });

    history.on('change.intro', changed => {
      if (!_hasWoodStreet()) return continueTo(updateLine);

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
    if (!_hasWoodStreet()) return continueTo(updateLine);

    const textID = context.lastPointerType() === 'mouse' ? '' : '_touch';
    const startDragString = helpHtml(`intro.lines.start_drag_endpoint${textID}`) +
      helpHtml('intro.lines.drag_to_intersection');

    curtain.reveal({
      revealExtent: new Extent(woodStreetDragEndpoint).padByMeters(20),
      tipHtml: startDragString
    });

    context.behaviors.get('drag').on('move', _checkDrag);

    function _checkDrag() {
      if (!_hasWoodStreet()) return continueTo(updateLine);
      const entity = context.entity(woodStreetEndID);
      if (geoSphericalDistance(entity.loc, woodStreetDragEndpoint) <= 4) {   // point is close enough
        continueTo(finishDragEndpoint);   // advance to next step
      }
    }

    function continueTo(nextStep) {
      context.behaviors.get('drag').off('move', _checkDrag);
      nextStep();
    }
  }


  // "This spot looks good. Release the mouse button to finish dragging..."
  // Leave drag mode to advance
  function finishDragEndpoint() {
    if (!_hasWoodStreet()) return continueTo(updateLine);

    const textID = context.lastPointerType() === 'mouse' ? '' : '_touch';
    const finishDragString = helpHtml('intro.lines.spot_looks_good') +
      helpHtml(`intro.lines.finish_drag_endpoint${textID}`);

    curtain.reveal({
      revealExtent: new Extent(woodStreetDragEndpoint).padByMeters(20),
      tipHtml: finishDragString
    });

    context.behaviors.get('drag').on('move', _checkDrag);
    context.on('enter.intro', () => continueTo(startDragMidpoint));

    function _checkDrag() {
      if (!_hasWoodStreet()) return continueTo(updateLine);
      const entity = context.entity(woodStreetEndID);
      if (geoSphericalDistance(entity.loc, woodStreetDragEndpoint) > 4) {   // point is too far
        continueTo(startDragEndpoint);   // back to previous step
      }
    }

    function continueTo(nextStep) {
      context.behaviors.get('drag').off('move', _checkDrag);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Small triangles are drawn at the *midpoints* between nodes."
  // "Another way to create a new node is to drag a midpoint to a new location."
  // Create a node on Wood Street to advance
  function startDragMidpoint() {
    if (!_hasWoodStreet()) return continueTo(updateLine);
    if (!_isWoodStreetSelected()) context.enter(modeSelect(context, [woodStreetID]));

    curtain.reveal({
      revealExtent: new Extent(woodStreetDragMidpoint).padByMeters(20),
      tipHtml: helpHtml('intro.lines.start_drag_midpoint')
    });

    history.on('change.intro', difference => {
      if (!difference) return;
      if (difference.created().length === 1) {
        return continueTo(continueDragMidpoint);
      }
    });

    context.on('enter.intro', () => continueTo(startDragMidpoint));

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
    if (!_hasWoodStreet()) return continueTo(updateLine);

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


  /* MULTISELECT AND DELETE 12TH AVE */

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
    _washingtonSegmentID = null;

    const textID = (context.lastPointerType() === 'mouse') ? 'rightclick_intersection' : 'edit_menu_intersection_touch';
    const rightClickString = helpHtml('intro.lines.split_street', {
      street1: t('intro.graph.name.11th-avenue'),
      street2: t('intro.graph.name.washington-street')
    }) + helpHtml(`intro.lines.${textID}`);

    curtain.reveal({
      revealExtent: new Extent(eleventhAvenueEnd).padByMeters(10),
      tipHtml: rightClickString
    });

    context.ui().editMenu().on('toggled.intro', open => {
      if (open) return continueTo(splitIntersection);  // user opened menu, advance
    });

    history.on('change.intro', () => continueTo(rightClickIntersection));  // retry

    function continueTo(nextStep) {
      context.ui().editMenu().on('toggled.intro', null);
      history.on('change.intro', null);
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
    if (!node) return continueTo(rightClickIntersection);

    _washingtonSegmentID = null;

    timeout(() => {
      curtain.reveal({
        revealSelector: '.edit-menu',
        revealPadding: 50,
        tipHtml: helpHtml('intro.lines.split_intersection', { street: t('intro.graph.name.washington-street') })
      });
    }, 400);  // after menu visible

    context.ui().editMenu().on('toggled.intro', open => {
      if (!open) return continueTo(rightClickIntersection);  // user closed menu, go back
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
      context.ui().editMenu().on('toggled.intro', null);
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



  // "Good job! Washington Street is now split into two pieces."
  // "The top part can be removed. Select the top part of Washington Street"
  // Select Washington Street top segment to advance
  function didSplit() {
    if (!_hasAllSegments()) return continueTo(rightClickIntersection);

    const ids = context.selectedIDs();
    const string = 'intro.lines.did_split_' + (ids.length > 1 ? 'multi' : 'single');
    const street = t('intro.graph.name.washington-street');

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

    let selected, other, padding, box;
    if (hasWashington) {
      selected = t('intro.graph.name.washington-street');
      other = t('intro.graph.name.12th-avenue');
    } else {
      selected = t('intro.graph.name.12th-avenue');
      other = t('intro.graph.name.washington-street');
    }

    const textID = (context.lastPointerType() === 'mouse') ? 'click' : 'touch';
    const string =
      helpHtml('intro.lines.multi_select', { selected: selected, other1: other }) + ' ' +
      helpHtml(`intro.lines.add_to_selection_${textID}`, { selected: selected, other2: other });

    curtain.reveal({
      revealExtent: deleteLinesExtent,
      tipHtml: string
    });

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

    const textID = context.lastPointerType() === 'mouse' ? 'rightclick' : 'edit_menu_touch';
    const rightClickString = helpHtml('intro.lines.multi_select_success') + helpHtml(`intro.lines.multi_${textID}`);

    curtain.reveal({
      revealExtent: deleteLinesExtent,
      tipHtml: rightClickString
    });

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
    history.on('change.intro', null);
    context.on('enter.intro', null);
    container.select('.inspector-wrap').on('wheel.intro', null);
    container.select('.preset-list-button').on('click.intro', null);
  };


  chapter.restart = () => {
    chapter.exit();
    chapter.enter();
  };


  return utilRebind(chapter, dispatch, 'on');
}
