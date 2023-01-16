import { Extent } from '@id-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';

import { presetManager } from '../../presets';
import { t } from '../../core/localizer';
import { geoSphericalDistance } from '@id-sdk/geo';
import { modeSelect } from '../../modes/select';
import { utilRebind } from '../../util/rebind';
import { delayAsync, eventCancel, helpHtml, icon, transitionTime } from './helper';


export function uiIntroLine(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.lines.title' };
  const editMenu = context.ui().editMenu();
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

  let _chapterCancelled = false;
  let _rejectStep = null;
  let _washingtonSegmentID = null;
  let _lineID = null;


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
  function _hasWoodStreetParts() {
    return context.hasEntity(woodStreetID) &&
      context.hasEntity(woodStreetEndID);
  }

  // Helper function to make sure Wood Street is selected
  function _isWoodStreetSelected() {
    if (context.mode().id !== 'select') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === woodStreetID;
  }

  // Helper function to ensure that the 12th Avenue parts exist in the graph
  function _has12thAvenueParts() {
    return context.hasEntity(washingtonStreetID) &&
      context.hasEntity(twelfthAvenueID) &&
      context.hasEntity(eleventhAvenueEndID);
  }

  // Helper function to ensure that the road segments exist in the graph
  function _hasWashingtonSegment() {
    return _washingtonSegmentID && context.hasEntity(_washingtonSegmentID);
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

  function runAsync(currStep) {
    if (_chapterCancelled) return Promise.reject();
    if (typeof currStep !== 'function') return Promise.resolve();  // guess we're done

    return currStep()
      .then(nextStep => runAsync(nextStep))   // recurse and advance
      .catch(e => {
        if (e instanceof Error) console.error(e);  // eslint-disable-line no-console
        return runAsync(currStep);   // recurse and retry
      });
  }


  /* DRAW TULIP ROAD */

  // "Lines are used to represent features such as roads, railroads, and rivers."
  // Click "Add Line" button to advance
  function addLineAsync() {
    context.enter('browse');
    history.reset('initial');
    _lineID = null;

    const loc = tulipRoadStartExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setCenterZoomAsync(loc, 18.5, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        const tooltip = curtain.reveal({
          revealSelector: 'button.draw-line',
          tipHtml: helpHtml('intro.lines.add_line')
        });

        tooltip.selectAll('.popover-inner')
          .insert('svg', 'span')
          .attr('class', 'tooltip-illustration')
          .append('use')
          .attr('xlink:href', '#iD-graphic-lines');

        context.on('enter.intro', () => resolve(startLineAsync));
      }))
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // "Here is a road that is missing. Let's add it!"
  // Place the first point to advance
  function startLineAsync() {
    if (context.mode().id !== 'draw-line') return Promise.resolve(addLineAsync);
    _lineID = null;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

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
            resolve(drawLineAsync);
          }
        }
      });

      context.on('enter.intro', reject);   // disallow mode change
    })
    .finally(() => {
      history.on('change.intro', null);
      context.on('enter.intro', null);
    });
  }


  // "Continue drawing the line by placing more nodes along the road."
  // "Place an intersection node on {name} to connect the two lines."
  function drawLineAsync() {
    if (!_doesLineExist() || context.mode().id !== 'draw-line') return Promise.resolve(addLineAsync);

    const loc = tulipRoadMidExtent.center();
    const msec = transitionTime(loc, map.center());

    return map
      .setCenterZoomAsync(loc, 18.5, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        curtain.reveal({
          revealExtent: tulipRoadMidExtent,
          tipHtml: helpHtml('intro.lines.intersect', { name: t('intro.graph.name.flower-street') })
        });

        history.on('change.intro', () => {
          if (_isLineConnected()) resolve(finishLineAsync);
        });
        context.on('enter.intro', () => resolve(retryIntersectAsync));
      }))
      .finally(() => {
        history.on('change.intro', null);
        context.on('enter.intro', null);
      });
  }


  // "The road needs to intersect Flower Street. Let's try again!"
  // This step just returns back to beginning after a short delay
  function retryIntersectAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealExtent: new Extent(tulipRoadIntersection).padByMeters(15),
        tipHtml: helpHtml('intro.lines.retry_intersect', { name: t('intro.graph.name.flower-street') }),
        buttonText: t.html('intro.ok'),
        buttonCallback: () => resolve(addLineAsync)
      });
    });
  }


  // "Continue drawing the line for the new road. Remember that you can drag and zoom the map if needed."
  // "When you're finished, click the last node again or press return."
  // Finish the road to advance
  function finishLineAsync() {
    if (!_doesLineExist() || context.mode().id !== 'draw-line') return Promise.resolve(addLineAsync);

    const loc = tulipRoadMidExtent.center();
    const msec = transitionTime(loc, map.center());

    return map
      .setCenterZoomAsync(loc, 18.5, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        const textID = (context.lastPointerType() === 'mouse') ? 'click' : 'tap';
        const continueLineText = helpHtml('intro.lines.continue_line') + '{br}' +
          helpHtml(`intro.lines.finish_line_${textID}`) + helpHtml('intro.lines.finish_road');

        curtain.reveal({
          revealSelector: '.main-map',
          tipHtml: continueLineText
        });

        context.on('enter.intro', () => resolve(chooseCategoryRoadAsync));
      }))
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // "Select Minor Roads from the list."
  // Open the Minor Roads category to advance
  function chooseCategoryRoadAsync() {
    if (!_doesLineExist()) return Promise.resolve(addLineAsync);
    if (!_isLineSelected()) context.enter(modeSelect(context, [_lineID]));

    let categoryButton;

    return delayAsync()  // after presets visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;

        _showPresetList();
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        categoryButton = container.select('.preset-category-road_minor .preset-list-button');
        if (categoryButton.empty()) {
          reject(new Error('no minor roads category?'));
          return;
        }
        if (categoryButton.classed('expanded')) {
          resolve(choosePresetResidentialAsync);  // advance - already expanded
          return;
        }

        curtain.reveal({
          revealNode: categoryButton.node(),
          revealPadding: 5,
          tipHtml: helpHtml('intro.lines.choose_category_road', { category: roadCategory.name() })
        });

        categoryButton.on('click.intro', () => resolve(choosePresetResidentialAsync));
        context.on('enter.intro', reject);   // disallow mode change
      }))
      .finally(() => {
        if (categoryButton) categoryButton.on('click.intro', null);
        container.select('.inspector-wrap').on('wheel.intro', null);
        context.on('enter.intro', null);
      });
  }


  // "There are many different types of roads, but this one is a Residential Road..."
  // Select a preset to advance
  function choosePresetResidentialAsync() {
    if (!_doesLineExist()) return Promise.resolve(addLineAsync);
    if (!_isLineSelected()) context.enter(modeSelect(context, [_lineID]));

    return delayAsync()  // after presets visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;

        _showPresetList();
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        const categoryButton = container.select('.preset-category-road_minor .preset-list-button');
        if (categoryButton.empty()) {
          reject(new Error('no minor roads category?'));
          return;
        }
        if (!categoryButton.classed('expanded')) {
          resolve(chooseCategoryRoadAsync);   // category not expanded - go back
          return;
        }
        // reveal all choices - at this point in the tutorial we are giving the user more freedom
        const subgrid = container.select('.preset-category-road_minor .subgrid');
        if (subgrid.empty()) {
          reject(new Error('no minor roads presets?'));
          return;
        }

        curtain.reveal({
          revealNode: subgrid.node(),
          revealPadding: 5,
          tipSelector: '.preset-highway-residential .preset-list-button',
          tipHtml: helpHtml('intro.lines.choose_preset_residential', { preset: residentialPreset.name() })
        });

        history.on('change.intro', difference => {
          if (!difference) return;
          const modified = difference.modified();
          if (modified.length === 1) {
            if (presetManager.match(modified[0], context.graph()) === residentialPreset) {
              resolve(nameRoadAsync);
            } else {
              resolve(retryPresetResidentialAsync);  // didn't pick residential, retry
            }
          }
        });

        context.on('enter.intro', reject);   // disallow mode change
      }))
      .finally(() => {
        history.on('change.intro', null);
        context.on('enter.intro', null);
        container.select('.inspector-wrap').on('wheel.intro', null);
      });
  }


  // "You didn't select the Residential type."
  // Click the preset button to advance
  function retryPresetResidentialAsync() {
    if (!_doesLineExist()) return Promise.resolve(addLineAsync);
    if (!_isLineSelected()) context.enter(modeSelect(context, [_lineID]));

    return delayAsync()  // after presets visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;

        _showPresetList();
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        const categoryButton = container.select('.preset-category-road_minor .preset-list-button');
        if (categoryButton.empty()) {
          reject(new Error('no minor roads category?'));
          return;
        }
        if (!categoryButton.classed('expanded')) {
          resolve(chooseCategoryRoadAsync);   // category not expanded - go back
          return;
        }
        // reveal just the button we want them to click
        const presetButton = container.select('.preset-highway-residential .preset-list-button');
        if (presetButton.empty()) {
          reject(new Error('no residential road preset?'));
          return;
        }

        curtain.reveal({
          revealNode: presetButton.node(),
          revealPadding: 5,
          tipHtml: helpHtml('intro.lines.retry_preset_residential', { preset: residentialPreset.name() })
        });

        history.on('change.intro', difference => {
          if (!difference) return;
          const modified = difference.modified();
          if (modified.length === 1) {
            if (presetManager.match(modified[0], context.graph()) === residentialPreset) {
              resolve(nameRoadAsync);
            } else {
              resolve(chooseCategoryRoadAsync);  // didn't pick residential, retry
            }
          }
        });

        context.on('enter.intro', reject);   // disallow mode change
      }))
      .finally(() => {
        history.on('change.intro', null);
        context.on('enter.intro', null);
        container.select('.inspector-wrap').on('wheel.intro', null);
      });
  }


  // "Give this road a name, then press the X button or Esc to close the feature editor."
  // Close entity editor / leave select mode to advance
  function nameRoadAsync() {
    if (!_doesLineExist()) return Promise.resolve(addLineAsync);
    if (!_isLineSelected()) context.enter(modeSelect(context, [_lineID]));

    return delayAsync()  // after presets visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        _showEntityEditor();

        curtain.reveal({
          revealSelector: '.entity-editor-pane',
          tipHtml: helpHtml('intro.lines.name_road', { button: icon('#iD-icon-close', 'inline') }),
          tooltipClass: 'intro-lines-name_road'
        });

        context.on('enter.intro', () => resolve(didNameRoadAsync));
      }))
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // "Looks good! Next we will learn how to update the shape of a line."
  // Click Ok to advance
  function didNameRoadAsync() {
    if (!_doesLineExist()) return Promise.resolve(addLineAsync);
    history.checkpoint('doneAddLine');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: '.main-map',
        tipHtml: helpHtml('intro.lines.did_name_road'),
        buttonText: t.html('intro.ok'),
        buttonCallback: () => resolve(updateLineAsync)
      });
    });
  }


  /* REALIGN WOOD STREET */

  // "Sometimes you will need to change the shape of an existing line. Here is a road that doesn't look quite right."
  // Click Ok to advance
  function updateLineAsync() {
    context.enter('browse');
    history.reset('doneAddLine');

    // It's remotely possible that in an earlier step,
    // the user scrolled over here and deleted some stuff we need.
    if (!_hasWoodStreetParts()) history.reset('initial');

    const loc = woodStreetExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setCenterZoomAsync(loc, 19, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        curtain.reveal({
          revealExtent: woodStreetExtent,
          tipHtml: helpHtml('intro.lines.update_line'),
          buttonText: t.html('intro.ok'),
          buttonCallback: () => resolve(addNodeAsync)
        });
      }));
  }


  // "We can add some nodes to this line to improve its shape."
  // "One way to add a node is to double-click the line where you want to add a node."
  // Create a node on Wood Street to advance
  function addNodeAsync() {
    context.enter('browse');
    if (!_hasWoodStreetParts()) return Promise.resolve(updateLineAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = (context.lastPointerType() === 'mouse') ? '' : '_touch';
      curtain.reveal({
        revealExtent: new Extent(woodStreetAddNode).padByMeters(15),
        tipHtml: helpHtml(`intro.lines.add_node${textID}`)
      });

      history.on('change.intro', difference => {
        if (difference && difference.created().length === 1) {   // expect to create 1 node
          resolve(startDragEndpointAsync);
        } else {
          reject();
        }
      });

      context.on('enter.intro', mode => {
        if (mode.id !== 'browse' && mode.id !== 'select') reject();
      });
    })
    .finally(() => {
      history.on('change.intro', null);
      context.on('enter.intro', null);
    });
  }


  // "When a line is selected, you can adjust any of its nodes by clicking and holding down the left mouse button while you drag."
  // Drag the endpoint of Wood Street to the expected location to advance
  function startDragEndpointAsync() {
    if (!_hasWoodStreetParts()) return Promise.resolve(updateLineAsync);
    // if (!_isWoodStreetSelected()) context.enter(modeSelect(context, [woodStreetID]));

    let checkDrag;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = context.lastPointerType() === 'mouse' ? '' : '_touch';
      const startDragString = helpHtml(`intro.lines.start_drag_endpoint${textID}`) +
        helpHtml('intro.lines.drag_to_intersection');

      curtain.reveal({
        revealExtent: new Extent(woodStreetDragEndpoint).padByMeters(20),
        tipHtml: startDragString
      });

      checkDrag = () => {
        if (!_hasWoodStreetParts()) {
          reject();
        } else {
          const entity = context.entity(woodStreetEndID);
          if (geoSphericalDistance(entity.loc, woodStreetDragEndpoint) <= 4) {   // point is close enough
            resolve(finishDragEndpointAsync);   // advance to next step
          }
        }
      };
      context.behaviors.get('drag').on('move', checkDrag);
    })
    .finally(() => {
      if (checkDrag) context.behaviors.get('drag').off('move', checkDrag);
    });
  }


  // "This spot looks good. Release the mouse button to finish dragging..."
  // Leave drag mode to advance
  function finishDragEndpointAsync() {
    if (!_hasWoodStreetParts()) return Promise.resolve(updateLineAsync);

    let checkDrag;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = context.lastPointerType() === 'mouse' ? '' : '_touch';
      const finishDragString = helpHtml('intro.lines.spot_looks_good') +
        helpHtml(`intro.lines.finish_drag_endpoint${textID}`);

      curtain.reveal({
        revealExtent: new Extent(woodStreetDragEndpoint).padByMeters(20),
        tipHtml: finishDragString
      });

      context.on('enter.intro', () => resolve(startDragMidpointAsync));

      checkDrag = () => {
        if (!_hasWoodStreetParts()) {
          reject();
        } else {
          const entity = context.entity(woodStreetEndID);
          if (geoSphericalDistance(entity.loc, woodStreetDragEndpoint) > 4) {   // point is too far
            resolve(startDragEndpointAsync);   // back to previous step
          }
        }
      };
      context.behaviors.get('drag').on('move', checkDrag);
    })
    .finally(() => {
      context.on('enter.intro', null);
      if (checkDrag) context.behaviors.get('drag').off('move', checkDrag);
    });
  }


  // "Small triangles are drawn at the *midpoints* between nodes."
  // "Another way to create a new node is to drag a midpoint to a new location."
  // Create a node on Wood Street to advance
  function startDragMidpointAsync() {
    if (!_hasWoodStreetParts()) return Promise.resolve(updateLineAsync);
    if (!_isWoodStreetSelected()) context.enter(modeSelect(context, [woodStreetID]));

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      curtain.reveal({
        revealExtent: new Extent(woodStreetDragMidpoint).padByMeters(20),
        tipHtml: helpHtml('intro.lines.start_drag_midpoint')
      });

      history.on('change.intro', difference => {
        if (difference && difference.created().length === 1) {
          resolve(continueDragMidpointAsync);
        }
      });

      context.on('enter.intro', reject);   // disallow mode change
    })
    .finally(() => {
      history.on('change.intro', null);
      context.on('enter.intro', null);
    });
  }


  // "This line is looking much better! Continue to adjust this line until the curve matches the road shape."
  // "When you're happy with how the line looks, press Ok"
  // Click Ok to advance
  function continueDragMidpointAsync() {
    if (!_hasWoodStreetParts()) return Promise.resolve(updateLineAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      curtain.reveal({
        revealExtent: woodStreetExtent,
        tipHtml: helpHtml('intro.lines.continue_drag_midpoint'),
        buttonText: t.html('intro.ok'),
        buttonCallback: () => {
          history.checkpoint('doneUpdateLine');
          resolve(deleteLinesAsync);
        }
      });
    });
  }


  /* MULTISELECT AND DELETE 12TH AVE */

  // "It's OK to delete lines for roads that don't exist in the real world..
  // Click Ok to advance
  function deleteLinesAsync() {
    context.enter('browse');
    history.reset('doneUpdateLine');

    // It's remotely possible that in an earlier step,
    // the user scrolled over here and deleted some stuff we need.
    if (!_has12thAvenueParts()) history.reset('initial');

    const loc = deleteLinesExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setCenterZoomAsync(loc, 18, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        curtain.reveal({
          revealExtent: deleteLinesExtent,
          tipHtml: helpHtml('intro.lines.delete_lines', { street: t('intro.graph.name.12th-avenue') }),
          buttonText: t.html('intro.ok'),
          buttonCallback: () => resolve(rightClickIntersectionAsync)
        });
      }));
  }


  // "We will split Washington Street at this intersection and remove everything above it."
  // Select point with edit menu open to advance
  function rightClickIntersectionAsync() {
    context.enter('browse');
    if (!_has12thAvenueParts()) return Promise.resolve(deleteLinesAsync);
    _washingtonSegmentID = null;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = (context.lastPointerType() === 'mouse') ? 'rightclick_intersection' : 'edit_menu_intersection_touch';
      const rightClickString = helpHtml('intro.lines.split_street', {
        street1: t('intro.graph.name.11th-avenue'),
        street2: t('intro.graph.name.washington-street')
      }) + helpHtml(`intro.lines.${textID}`);

      curtain.reveal({
        revealExtent: new Extent(eleventhAvenueEnd).padByMeters(10),
        tipHtml: rightClickString
      });

      editMenu.on('toggled.intro', open => {
        if (open) resolve(splitIntersectionAsync);
      });

      history.on('change.intro', reject);  // disallow doing anything else
    })
    .finally(() => {
      editMenu.on('toggled.intro', null);
      history.on('change.intro', null);
    });
  }


  // "Press the Split button to divide Washington Street"
  // Split Washington Street to advance
  function splitIntersectionAsync() {
    if (!_has12thAvenueParts()) return Promise.resolve(deleteLinesAsync);

    const buttonNode = container.select('.edit-menu-item-split').node();
    if (!buttonNode) return Promise.resolve(rightClickIntersectionAsync);   // no Split button, try again

    let revealEditMenu;
    _washingtonSegmentID = null;

    return delayAsync()  // after edit menu fully visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;

        revealEditMenu = (duration = 0) => {
          const menuNode = container.select('.edit-menu').node();
          if (!menuNode) reject();   // menu has gone away - user scrolled it offscreen?
          curtain.reveal({
            duration: duration,
            revealNode: menuNode,
            revealPadding: 50,
            tipHtml: helpHtml('intro.lines.split_intersection', { street: t('intro.graph.name.washington-street') })
          });
        };

        revealEditMenu(250);             // first time revealing menu, transition curtain to the menu
        map.on('move', revealEditMenu);  // on map moves, have the curtain follow the menu immediately

        history.on('change.intro', difference => {
          map.off('move', revealEditMenu);
          history.on('change.intro', null);
          if (difference && difference.created()) {
            _washingtonSegmentID = difference.created()[0].id;
            resolve();
          } else {
            reject();
          }
        });

        context.on('enter.intro', reject);   // disallow mode change
      }))
      .then(delayAsync)   // wait for any transtion to complete
      .then(() => {       // then check undo annotation to see what the user did
        if (history.undoAnnotation() === t('operations.split.annotation.line', { n: 1 })) {
          return didSplitAsync;
        } else {
          return retrySplitAsync;
        }
      })
      .finally(() => {
        history.on('change.intro', null);
        context.on('enter.intro', null);
        if (revealEditMenu) map.off('move', revealEditMenu);
      });
  }


  // "You didn't press the Split button. Try again."
  // Click Ok to advance
  function retrySplitAsync() {
    context.enter('browse');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealExtent: deleteLinesExtent,
        tipHtml: helpHtml('intro.lines.retry_split'),
        buttonText: t.html('intro.ok'),
        buttonCallback: () => resolve(rightClickIntersectionAsync)
      });
    });
  }



  // "Good job! Washington Street is now split into two pieces."
  // "The top part can be removed. Select the top part of Washington Street"
  // Select Washington Street top segment to advance
  function didSplitAsync() {
    if (!_has12thAvenueParts()) return Promise.resolve(deleteLinesAsync);
    if (!_hasWashingtonSegment()) return Promise.resolve(rightClickIntersectionAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const ids = context.selectedIDs();
      const string = 'intro.lines.did_split_' + (ids.length > 1 ? 'multi' : 'single');
      const street = t('intro.graph.name.washington-street');

      curtain.reveal({
        revealExtent: deleteLinesExtent,
        tipHtml: helpHtml(string, { street1: street, street2: street })
      });

      context.on('enter.intro', () => resolve(multiSelectAsync));
      history.on('change.intro', reject);  // disallow doing anything else
    })
    .finally(() => {
      context.on('enter.intro', null);
      history.on('change.intro', null);
    });
  }


  // "Washington Street is now selected. Let's also select 12th Avenue."
  // "You can hold Shift while clicking to select multiple things."
  // Multiselect both Washington Street top segment and 12th Avenue to advance
  function multiSelectAsync() {
    if (!_has12thAvenueParts()) return Promise.resolve(deleteLinesAsync);
    if (!_hasWashingtonSegment()) return Promise.resolve(rightClickIntersectionAsync);

    // This step is for when one thing is selected and we are trying to
    // teach the user to shift-click to select a second thing.
    const ids = context.selectedIDs();
    const hasWashington = ids.indexOf(_washingtonSegmentID) !== -1;
    const hasTwelfth = ids.indexOf(twelfthAvenueID) !== -1;

    if (hasWashington && hasTwelfth) {
      return Promise.resolve(multiRightClickAsync);  // both roads selected - go forward
    } else if (!hasWashington && !hasTwelfth) {
      return Promise.resolve(didSplitAsync);         // neither selected - go back
    }

    let selected, other;
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

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      context.on('enter.intro', reject);   // reject will retry this step, which is what we want
      history.on('change.intro', reject);  // disallow doing anything else
    })
    .finally(() => {
      context.on('enter.intro', null);
      history.on('change.intro', null);
    });
  }


  // "Good! Both lines to delete are now selected."
  // "Right-click on one of the lines to show the edit menu."
  // Open edit menu with both lines multiselected to advance
  function multiRightClickAsync() {
    if (!_has12thAvenueParts()) return Promise.resolve(deleteLinesAsync);
    if (!_hasWashingtonSegment()) return Promise.resolve(rightClickIntersectionAsync);

    const ids = context.selectedIDs();
    const selectedWashington = ids.indexOf(_washingtonSegmentID) !== -1;
    const selectedTwelfth = ids.indexOf(twelfthAvenueID) !== -1;
    if (!selectedWashington || !selectedTwelfth) {
      return Promise.resolve(multiSelectAsync);   // both need to be selected - go back
    }

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = context.lastPointerType() === 'mouse' ? 'rightclick' : 'edit_menu_touch';
      const rightClickString = helpHtml('intro.lines.multi_select_success') + helpHtml(`intro.lines.multi_${textID}`);

      curtain.reveal({
        revealExtent: deleteLinesExtent,
        tipHtml: rightClickString
      });

      editMenu.on('toggled.intro', open => {
        if (open) resolve(multiDeleteAsync);
      });

      history.on('change.intro', reject);  // disallow doing anything else
    })
    .finally(() => {
      editMenu.on('toggled.intro', null);
      history.on('change.intro', null);
    });
  }


  // "Press the Delete button to remove the extra lines."
  // Both lines should be deleted to advance
  function multiDeleteAsync() {
    if (!_has12thAvenueParts()) return Promise.resolve(deleteLinesAsync);
    if (!_hasWashingtonSegment()) return Promise.resolve(rightClickIntersectionAsync);

    const ids = context.selectedIDs();
    const selectedWashington = ids.indexOf(_washingtonSegmentID) !== -1;
    const selectedTwelfth = ids.indexOf(twelfthAvenueID) !== -1;
    if (!selectedWashington || !selectedTwelfth) {
      return Promise.resolve(multiSelectAsync);   // both need to be selected - go back
    }

    const buttonNode = container.select('.edit-menu-item-delete').node();
    if (!buttonNode) return Promise.resolve(rightClickIntersectionAsync);   // no Delete button, try again

    let revealEditMenu;

    return delayAsync()  // after edit menu fully visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;

        revealEditMenu = (duration = 0) => {
          const menuNode = container.select('.edit-menu').node();
          if (!menuNode) reject();   // menu has gone away - user scrolled it offscreen?
          curtain.reveal({
            duration: duration,
            revealNode: menuNode,
            revealPadding: 50,
            tipHtml: helpHtml('intro.lines.multi_delete')
          });
        };

        revealEditMenu(250);             // first time revealing menu, transition curtain to the menu
        map.on('move', revealEditMenu);  // on map moves, have the curtain follow the menu immediately

        history.on('change.intro', () => {
          if (context.hasEntity(_washingtonSegmentID) || context.hasEntity(twelfthAvenueID)) {
            resolve(retryDeleteAsync);   // changed something but roads still exist
          } else {
            resolve(playAsync);
          }
        });

        context.on('enter.intro', reject);   // disallow mode change
      }))
      .finally(() => {
        history.on('change.intro', null);
        context.on('enter.intro', null);
        if (revealEditMenu) map.off('move', revealEditMenu);
      });
  }


  // "You didn't press the Delete button. Try again."
  // Click Ok to advance
  function retryDeleteAsync() {
    context.enter('browse');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealExtent: deleteLinesExtent,
        tipHtml: helpHtml('intro.lines.retry_delete'),
        buttonText: t.html('intro.ok'),
        buttonCallback: () => resolve(multiSelectAsync)
      });
    });
  }


  // Free play
  // Click on Lines (or another) chapter to advance
  function playAsync() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-building',
      tipHtml: helpHtml('intro.lines.play', { next: t('intro.buildings.title') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
    return Promise.resolve();
  }


  chapter.enter = () => {
    _chapterCancelled = false;
    _rejectStep = null;

    runAsync(addLineAsync)
      .catch(e => { if (e instanceof Error) console.error(e); });  // eslint-disable-line no-console
  };


  chapter.exit = () => {
    _chapterCancelled = true;

    if (_rejectStep) {   // bail out of whatever step we are in
      _rejectStep();
      _rejectStep = null;
    }
  };


  chapter.restart = () => {
    chapter.exit();
    chapter.enter();
  };


  return utilRebind(chapter, dispatch, 'on');
}
