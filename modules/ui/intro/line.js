import { Extent, geoSphericalDistance } from '@rapid-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';

import { utilRebind } from '../../util/rebind.js';
import { delayAsync, eventCancel, helpHtml, icon, transitionTime } from './helper.js';


export function uiIntroLine(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.lines.title' };
  const container = context.container();
  const dragBehavior = context.behaviors.drag;
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const presets = context.systems.presets;
  const ui = context.systems.ui;
  const editMenu = ui.editMenu;

  const flowerStreetID = 'w646';
  const tulipRoadStartExtent = new Extent([-85.63016, 41.95749], [-85.62937, 41.95843]);
  const tulipRoadMidExtent = new Extent([-85.63044, 41.95686], [-85.62900, 41.95843]);
  const tulipRoadIntersection = [-85.629745, 41.95742];
  const roadCategory = presets.item('category-road_minor');
  const residentialPreset = presets.item('highway/residential');

  const woodStreetID = 'w525';
  const woodStreetEndID = 'n2862';
  const woodStreetExtent = new Extent([-85.62457, 41.95381], [-85.62326, 41.9548]);
  const woodStreetAddNode = [-85.62390, 41.95397];
  const woodStreetDragEndpoint = [-85.62387, 41.95467];
  const woodStreetDragMidpoint = [-85.62386, 41.95430];

  const washingtonStreetID = 'w522';
  const twelfthAvenueID = 'w1';
  const eleventhAvenueEndID = 'n3550';
  const deleteLinesExtent = new Extent([-85.62304, 41.95084], [-85.62087, 41.95336]);
  const eleventhAvenueEnd = [-85.622758, 41.951884];

  let _chapterCancelled = false;
  let _rejectStep = null;
  let _onMapMove = null;
  let _onModeChange = null;
  let _onStagingChange = null;
  let _washingtonSegmentID = null;
  let _lineID = null;


  // Helper functions
  function _doesLineExist() {
    const graph = editor.staging.graph;
    return _lineID && graph.hasEntity(_lineID);
  }

  function _isLineSelected() {
    if (context.mode?.id !== 'select-osm') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === _lineID;
  }

  function _isLineConnected() {
    const graph = editor.staging.graph;
    const tulipRoad = _lineID && graph.hasEntity(_lineID);
    const flowerStreet = flowerStreetID && graph.hasEntity(flowerStreetID);
    if (!tulipRoad || !flowerStreet) return false;

    const drawNodes = graph.childNodes(tulipRoad);
    return drawNodes.some(node => {
      return graph.parentWays(node).some(parent => parent.id === flowerStreetID);
    });
  }

  function _hasWoodStreetParts() {
    const graph = editor.staging.graph;
    return graph.hasEntity(woodStreetID) && graph.hasEntity(woodStreetEndID);
  }

  function _isWoodStreetSelected() {
    if (context.mode?.id !== 'select-osm') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === woodStreetID;
  }

  function _has12thAvenueParts() {
    const graph = editor.staging.graph;
    return graph.hasEntity(washingtonStreetID) && graph.hasEntity(twelfthAvenueID) && graph.hasEntity(eleventhAvenueEndID);
  }

  function _hasWashingtonSegment() {
    const graph = editor.staging.graph;
    return _washingtonSegmentID && graph.hasEntity(_washingtonSegmentID);
  }

  function _is11thAveEndSelected() {
    if (context.mode?.id !== 'select-osm') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === eleventhAvenueEndID;
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
    editor.restoreCheckpoint('initial');
    _lineID = null;

    const loc = tulipRoadStartExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setMapParamsAsync(loc, 18.5, 0, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        _onModeChange = () => resolve(startLineAsync);

        const tooltip = curtain.reveal({
          revealSelector: 'button.draw-line',
          tipHtml: helpHtml(context, 'intro.lines.add_line')
        });

        tooltip.selectAll('.popover-inner')
          .insert('svg', 'span')
          .attr('class', 'tooltip-illustration')
          .append('use')
          .attr('xlink:href', '#rapid-graphic-lines');
      }))
      .finally(() => {
        _onModeChange = null;
      });
  }


  // "Here is a road that is missing. Let's add it!"
  // Place the first point to advance
  function startLineAsync() {
    if (context.mode?.id !== 'draw-line') return Promise.resolve(addLineAsync);
    _lineID = null;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = reject;   // disallow mode change
      _onStagingChange = (difference) => {
        for (const entity of difference.created()) {  // created a node and a way
          if (entity.type === 'way') {
            _lineID = entity.id;
            resolve(drawLineAsync);
          }
        }
      };

      const textID = context.lastPointerType === 'mouse' ? 'start_line' : 'start_line_tap';
      const startLineString = helpHtml(context, 'intro.lines.missing_road') + '{br}' +
        helpHtml(context, 'intro.lines.line_draw_info') + helpHtml(context, `intro.lines.${textID}`);

      curtain.reveal({
        revealExtent: tulipRoadStartExtent,
        tipHtml: startLineString
      });
    })
    .finally(() => {
      _onModeChange = null;
      _onStagingChange = null;
    });
  }


  // "Continue drawing the line by placing more nodes along the road."
  // "Place an intersection node on {name} to connect the two lines."
  function drawLineAsync() {
    const loc = tulipRoadMidExtent.center();
    const msec = transitionTime(loc, map.center());

    return map
      .setMapParamsAsync(loc, 18.5, 0, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesLineExist() || context.mode?.id !== 'draw-line') { resolve(addLineAsync); return; }

        _onModeChange = () => resolve(retryIntersectAsync);
        _onStagingChange = () => {
          if (_isLineConnected()) resolve(finishLineAsync);
        };

        curtain.reveal({
          revealExtent: tulipRoadMidExtent,
          tipHtml: helpHtml(context, 'intro.lines.intersect', { name: l10n.t('intro.graph.name.flower-street') })
        });
      }))
      .finally(() => {
        _onModeChange = null;
        _onStagingChange = null;
      });
  }


  // "The road needs to intersect Flower Street. Let's try again!"
  // Click Ok to advance
  function retryIntersectAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealExtent: new Extent(tulipRoadIntersection).padByMeters(15),
        tipHtml: helpHtml(context, 'intro.lines.retry_intersect', { name: l10n.t('intro.graph.name.flower-street') }),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => resolve(addLineAsync)
      });
    });
  }


  // "Continue drawing the line for the new road. Remember that you can drag and zoom the map if needed."
  // "When you're finished, click the last node again or press return."
  // Finish the road to advance
  function finishLineAsync() {
    const loc = tulipRoadMidExtent.center();
    const msec = transitionTime(loc, map.center());

    return map
      .setMapParamsAsync(loc, 18.5, 0, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesLineExist() || context.mode?.id !== 'draw-line') { resolve(addLineAsync); return; }

        _onModeChange = () => resolve(chooseCategoryRoadAsync);

        const textID = (context.lastPointerType === 'mouse') ? 'click' : 'tap';
        const continueLineText = helpHtml(context, 'intro.lines.continue_line') + '{br}' +
          helpHtml(context, `intro.lines.finish_line_${textID}`) + helpHtml(context, 'intro.lines.finish_road');

        curtain.reveal({
          revealSelector: '.main-map',
          tipHtml: continueLineText
        });
      }))
      .finally(() => {
        _onModeChange = null;
      });
  }


  // "Select Minor Roads from the list."
  // Open the Minor Roads category to advance
  function chooseCategoryRoadAsync() {
    let categoryButton;

    return delayAsync()  // after presets visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesLineExist()) { resolve(addLineAsync); return; }
        if (!_isLineSelected()) context.enter('select-osm', { selection: { osm: [_lineID] }} );

        _onModeChange = reject;   // disallow mode change

        // ui.sidebar.showPresetList(); // calling this again causes issue
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        categoryButton = container.select('.preset-category_road_minor .preset-list-button');
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
          tipHtml: helpHtml(context, 'intro.lines.choose_category_road', { category: roadCategory.name() })
        });

        categoryButton.on('click.intro', () => resolve(choosePresetResidentialAsync));
      }))
      .finally(() => {
        _onModeChange = null;
        if (categoryButton) categoryButton.on('click.intro', null);
        container.select('.inspector-wrap').on('wheel.intro', null);
      });
  }


  // "There are many different types of roads, but this one is a Residential Road..."
  // Select a preset to advance
  function choosePresetResidentialAsync() {
    return delayAsync()  // after presets visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesLineExist()) { resolve(addLineAsync); return; }
        if (!_isLineSelected()) context.enter('select-osm', { selection: { osm: [_lineID] }} );

        // ui.sidebar.showPresetList(); // calling this again causes issue
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        const categoryButton = container.select('.preset-category_road_minor .preset-list-button');
        if (categoryButton.empty()) {
          reject(new Error('no minor roads category?'));
          return;
        }
        if (!categoryButton.classed('expanded')) {
          resolve(chooseCategoryRoadAsync);   // category not expanded - go back
          return;
        }
        // reveal all choices - at this point in the tutorial we are giving the user more freedom
        const subgrid = container.select('.preset-category_road_minor .subgrid');
        if (subgrid.empty()) {
          reject(new Error('no minor roads presets?'));
          return;
        }

        _onModeChange = reject;   // disallow mode change

        _onStagingChange = (difference) => {
          const modified = difference.modified();
          if (modified.length === 1) {
            const graph = editor.staging.graph;
            if (presets.match(modified[0], graph) === residentialPreset) {
              resolve(nameRoadAsync);
            } else {
              resolve(retryPresetResidentialAsync);  // didn't pick residential, retry
            }
          }
        };

        curtain.reveal({
          revealNode: subgrid.node(),
          revealPadding: 5,
          tipSelector: '.preset-highway_residential .preset-list-button',
          tipHtml: helpHtml(context, 'intro.lines.choose_preset_residential', { preset: residentialPreset.name() })
        });
      }))
      .finally(() => {
        _onModeChange = null;
        _onStagingChange = null;
        container.select('.inspector-wrap').on('wheel.intro', null);
      });
  }


  // "You didn't select the Residential type."
  // Click the preset button to advance
  function retryPresetResidentialAsync() {
    return delayAsync()  // after presets visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesLineExist()) { resolve(addLineAsync); return; }
        if (!_isLineSelected()) context.enter('select-osm', { selection: { osm: [_lineID] }} );

        ui.sidebar.showPresetList();
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        const categoryButton = container.select('.preset-category_road_minor .preset-list-button');
        if (categoryButton.empty()) {
          reject(new Error('no minor roads category?'));
          return;
        }
        if (!categoryButton.classed('expanded')) {
          resolve(chooseCategoryRoadAsync);   // category not expanded - go back
          return;
        }
        // reveal just the button we want them to click
        const presetButton = container.select('.preset-highway_residential .preset-list-button');
        if (presetButton.empty()) {
          reject(new Error('no residential road preset?'));
          return;
        }

        _onModeChange = reject;   // disallow mode change
        _onStagingChange = (difference) => {
          const modified = difference.modified();
          if (modified.length === 1) {
            const graph = editor.staging.graph;
            if (presets.match(modified[0], graph) === residentialPreset) {
              resolve(nameRoadAsync);
            } else {
              resolve(chooseCategoryRoadAsync);  // didn't pick residential, retry
            }
          }
        };

        curtain.reveal({
          revealNode: presetButton.node(),
          revealPadding: 5,
          tipHtml: helpHtml(context, 'intro.lines.retry_preset_residential', { preset: residentialPreset.name() })
        });
      }))
      .finally(() => {
        _onModeChange = null;
        _onStagingChange = null;
        container.select('.inspector-wrap').on('wheel.intro', null);
      });
  }


  // "Give this road a name, then press the X button or Esc to close the feature editor."
  // Close entity editor / leave select mode to advance
  function nameRoadAsync() {
    return delayAsync()  // after presets visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesLineExist()) { resolve(addLineAsync); return; }
        if (!_isLineSelected()) context.enter('select-osm', { selection: { osm: [_lineID] }} );

        _onModeChange = () => resolve(didNameRoadAsync);

        ui.sidebar.showEntityEditor();

        curtain.reveal({
          revealSelector: '.entity-editor-pane',
          tipHtml: helpHtml(context, 'intro.lines.name_road', { button: icon('#rapid-icon-close', 'inline') }),
          tooltipClass: 'intro-lines-name_road'
        });
      }))
      .finally(() => {
        _onModeChange = null;
      });
  }


  // "Looks good! Next we will learn how to update the shape of a line."
  // Click Ok to advance
  function didNameRoadAsync() {
    if (!_doesLineExist()) return Promise.resolve(addLineAsync);
    editor.setCheckpoint('doneAddLine');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: '.main-map',
        tipHtml: helpHtml(context, 'intro.lines.did_name_road'),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => resolve(updateLineAsync)
      });
    });
  }


  /* REALIGN WOOD STREET */

  // "Sometimes you will need to change the shape of an existing line. Here is a road that doesn't look quite right."
  // Click Ok to advance
  function updateLineAsync() {
    context.enter('browse');
    editor.restoreCheckpoint('doneAddLine');

    // It's remotely possible that in an earlier step,
    // the user scrolled over here and deleted some stuff we need.
    if (!_hasWoodStreetParts()) editor.restoreCheckpoint('initial');

    const loc = woodStreetExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setMapParamsAsync(loc, 19, 0, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        curtain.reveal({
          revealExtent: woodStreetExtent,
          tipHtml: helpHtml(context, 'intro.lines.update_line'),
          buttonText: l10n.t('intro.ok'),
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

      _onModeChange = (mode) => {
        if (!['browse', 'select-osm'].includes(mode.id)) reject();
      };
      _onStagingChange = (difference) => {
        if (difference && difference.created().length === 1) {   // expect to create 1 node
          resolve(startDragEndpointAsync);
        } else {
          reject();
        }
      };

      const textID = (context.lastPointerType === 'mouse') ? '' : '_touch';
      curtain.reveal({
        revealExtent: new Extent(woodStreetAddNode).padByMeters(15),
        tipHtml: helpHtml(context, `intro.lines.add_node${textID}`)
      });
    })
    .finally(() => {
      _onModeChange = null;
      _onStagingChange = null;
    });
  }


  // "When a line is selected, you can adjust any of its nodes by clicking and holding down the left mouse button while you drag."
  // Drag the endpoint of Wood Street to the expected location to advance
  function startDragEndpointAsync() {
    if (!_hasWoodStreetParts()) return Promise.resolve(updateLineAsync);

    let checkDrag;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = context.lastPointerType === 'mouse' ? '' : '_touch';
      const startDragString = helpHtml(context, `intro.lines.start_drag_endpoint${textID}`) +
        helpHtml(context, 'intro.lines.drag_to_intersection');

      curtain.reveal({
        revealExtent: new Extent(woodStreetDragEndpoint).padByMeters(20),
        tipHtml: startDragString
      });

      checkDrag = () => {
        if (!_hasWoodStreetParts()) {
          reject();
        } else {
          const graph = editor.staging.graph;
          const entity = graph.entity(woodStreetEndID);
          if (geoSphericalDistance(entity.loc, woodStreetDragEndpoint) <= 4) {   // point is close enough
            resolve(finishDragEndpointAsync);   // advance to next step
          }
        }
      };
      dragBehavior.on('move', checkDrag);
    })
    .finally(() => {
      if (checkDrag) dragBehavior.off('move', checkDrag);
    });
  }


  // "This spot looks good. Release the mouse button to finish dragging..."
  // Leave drag mode to advance
  function finishDragEndpointAsync() {
    if (!_hasWoodStreetParts()) return Promise.resolve(updateLineAsync);

    let checkDrag;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = () => resolve(startDragMidpointAsync);

      const textID = context.lastPointerType === 'mouse' ? '' : '_touch';
      const finishDragString = helpHtml(context, 'intro.lines.spot_looks_good') +
        helpHtml(context, `intro.lines.finish_drag_endpoint${textID}`);

      curtain.reveal({
        revealExtent: new Extent(woodStreetDragEndpoint).padByMeters(20),
        tipHtml: finishDragString
      });

      checkDrag = () => {
        if (!_hasWoodStreetParts()) {
          reject();
        } else {
          const graph = editor.staging.graph;
          const entity = graph.entity(woodStreetEndID);
          if (geoSphericalDistance(entity.loc, woodStreetDragEndpoint) > 4) {   // point is too far
            resolve(startDragEndpointAsync);   // back to previous step
          }
        }
      };
      dragBehavior.on('move', checkDrag);
    })
    .finally(() => {
      _onModeChange = null;
      if (checkDrag) dragBehavior.off('move', checkDrag);
    });
  }


  // "Small triangles are drawn at the *midpoints* between nodes."
  // "Another way to create a new node is to drag a midpoint to a new location."
  // Create a node on Wood Street to advance
  function startDragMidpointAsync() {
    if (!_hasWoodStreetParts()) return Promise.resolve(updateLineAsync);
    if (!_isWoodStreetSelected()) context.enter('select-osm', { selection: { osm: [woodStreetID] }} );

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = reject;   // disallow mode change
      _onStagingChange = (difference) => {
        if (difference && difference.created().length === 1) {
          resolve(continueDragMidpointAsync);
        }
      };

      curtain.reveal({
        revealExtent: new Extent(woodStreetDragMidpoint).padByMeters(20),
        tipHtml: helpHtml(context, 'intro.lines.start_drag_midpoint')
      });
    })
    .finally(() => {
      _onModeChange = null;
      _onStagingChange = null;
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
        tipHtml: helpHtml(context, 'intro.lines.continue_drag_midpoint'),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => {
          editor.setCheckpoint('doneUpdateLine');
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
    editor.restoreCheckpoint('doneUpdateLine');

    // It's remotely possible that in an earlier step,
    // the user scrolled over here and deleted some stuff we need.
    if (!_has12thAvenueParts()) editor.restoreCheckpoint('initial');

    const loc = deleteLinesExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setMapParamsAsync(loc, 18, 0, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        curtain.reveal({
          revealExtent: deleteLinesExtent,
          tipHtml: helpHtml(context, 'intro.lines.delete_lines', { street: l10n.t('intro.graph.name.12th-avenue') }),
          buttonText: l10n.t('intro.ok'),
          buttonCallback: () => resolve(rightClickIntersectionAsync)
        });
      }));
  }


  // "We will split Washington Street at this intersection and remove everything above it."
  // Select point with edit menu open to advance
  function rightClickIntersectionAsync() {
    context.enter('browse');
    editor.restoreCheckpoint('doneUpdateLine');

    // It's remotely possible that in an earlier step,
    // the user scrolled over here and deleted some stuff we need.
    if (!_has12thAvenueParts()) editor.restoreCheckpoint('initial');

    _washingtonSegmentID = null;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onStagingChange = reject;  // disallow doing anything else

      const textID = (context.lastPointerType === 'mouse') ? 'rightclick_intersection' : 'edit_menu_intersection_touch';
      const rightClickString = helpHtml(context, 'intro.lines.split_street', {
        street1: l10n.t('intro.graph.name.11th-avenue'),
        street2: l10n.t('intro.graph.name.washington-street')
      }) + helpHtml(context, `intro.lines.${textID}`);

      curtain.reveal({
        revealExtent: new Extent(eleventhAvenueEnd).padByMeters(10),
        tipHtml: rightClickString
      });

      editMenu.on('toggled.intro', open => {
        if (open) resolve(splitIntersectionAsync);
      });
    })
    .finally(() => {
      _onStagingChange = null;
      editMenu.on('toggled.intro', null);
    });
  }


  // "Press the Split button to divide Washington Street"
  // Split Washington Street to advance
  function splitIntersectionAsync() {
    const buttonNode = container.select('.edit-menu-item-split').node();
    if (!buttonNode) return Promise.resolve(rightClickIntersectionAsync);   // no Split button, try again

    _washingtonSegmentID = null;

    return delayAsync()  // after edit menu fully visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_has12thAvenueParts()) { resolve(deleteLinesAsync); return; }
        if (!_is11thAveEndSelected()) context.enter('select-osm', { selection: { osm: [eleventhAvenueEndID] }} );

        const revealEditMenu = (duration = 0) => {
          const menuNode = container.select('.edit-menu').node();
          if (menuNode) {
            curtain.reveal({
              duration: duration,
              revealNode: menuNode,
              revealPadding: 50,
              tipHtml: helpHtml(context, 'intro.lines.split_intersection', { street: l10n.t('intro.graph.name.washington-street') })
            });
          } else {
            reject();   // menu has gone away - user scrolled it offscreen?
          }
        };

        _onModeChange = reject;   // disallow mode change

        _onStagingChange = (difference) => {
          _onMapMove = null;
          _onStagingChange = null;
          if (difference && difference.created()) {
            _washingtonSegmentID = difference.created()[0].id;
            resolve();
          } else {
            reject();
          }
        };

        _onMapMove = revealEditMenu;  // on map moves, have the curtain follow the menu immediately
        revealEditMenu(250);          // first time revealing menu, transition curtain to the menu
      }))
      .then(delayAsync)   // wait for any transtion to complete
      .then(() => {       // then check undo annotation to see what the user did
        if (editor.getUndoAnnotation() === l10n.t('operations.split.annotation.line', { n: 1 })) {
          return didSplitAsync;
        } else {
          return retrySplitAsync;
        }
      })
      .finally(() => {
        _onModeChange = null;
        _onStagingChange = null;
        _onMapMove = null;
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
        tipHtml: helpHtml(context, 'intro.lines.retry_split'),
        buttonText: l10n.t('intro.ok'),
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
      _onModeChange = () => resolve(multiSelectAsync);
      _onStagingChange = reject;  // disallow doing anything else

      const ids = context.selectedIDs();
      const string = 'intro.lines.did_split_' + (ids.length > 1 ? 'multi' : 'single');
      const street = l10n.t('intro.graph.name.washington-street');

      curtain.reveal({
        revealExtent: deleteLinesExtent,
        tipHtml: helpHtml(context, string, { street1: street, street2: street })
      });
   })
    .finally(() => {
      _onModeChange = null;
      _onStagingChange = null;
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
      selected = l10n.t('intro.graph.name.washington-street');
      other = l10n.t('intro.graph.name.12th-avenue');
    } else {
      selected = l10n.t('intro.graph.name.12th-avenue');
      other = l10n.t('intro.graph.name.washington-street');
    }

    const textID = (context.lastPointerType === 'mouse') ? 'click' : 'touch';
    const string =
      helpHtml(context, 'intro.lines.multi_select', { selected: selected, other1: other }) + ' ' +
      helpHtml(context, `intro.lines.add_to_selection_${textID}`, { selected: selected, other2: other });

    curtain.reveal({
      revealExtent: deleteLinesExtent,
      tipHtml: string
    });

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = reject;  // reject will retry this step, which is what we want
      _onStagingChange = reject;  // disallow doing anything else
    })
    .finally(() => {
      _onModeChange = null;
      _onStagingChange = null;
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
      _onModeChange = reject;   // disallow mode change
      _onStagingChange = reject;   // disallow doing anything else

      const textID = context.lastPointerType === 'mouse' ? 'rightclick' : 'edit_menu_touch';
      const rightClickString = helpHtml(context, 'intro.lines.multi_select_success') + helpHtml(context, `intro.lines.multi_${textID}`);

      curtain.reveal({
        revealExtent: deleteLinesExtent,
        tipHtml: rightClickString
      });

      editMenu.on('toggled.intro', open => {
        if (open) resolve(multiDeleteAsync);
      });
    })
    .finally(() => {
      _onModeChange = null;
      _onStagingChange = null;
      editMenu.on('toggled.intro', null);
    });
  }


  // "Press the Delete button to remove the extra lines."
  // Both lines should be deleted to advance
  function multiDeleteAsync() {
    const buttonNode = container.select('.edit-menu-item-delete').node();
    if (!buttonNode) return Promise.resolve(multiSelectAsync);   // no Delete button, try again

    return delayAsync()  // after edit menu fully visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_has12thAvenueParts()) { resolve(deleteLinesAsync); return; }
        if (!_hasWashingtonSegment()) { resolve(rightClickIntersectionAsync); return; }

        const ids = context.selectedIDs();
        const selectedWashington = ids.indexOf(_washingtonSegmentID) !== -1;
        const selectedTwelfth = ids.indexOf(twelfthAvenueID) !== -1;
        if (!selectedWashington || !selectedTwelfth) {
          resolve(multiSelectAsync);   // both need to be selected - go back
          return;
        }

        const revealEditMenu = (duration = 0) => {
          const menuNode = container.select('.edit-menu').node();
          if (menuNode) {
            curtain.reveal({
              duration: duration,
              revealNode: menuNode,
              revealPadding: 50,
              tipHtml: helpHtml(context, 'intro.lines.multi_delete')
            });
          } else {
            reject();   // menu has gone away - user scrolled it offscreen?
          }
        };

        // In most cases we receive the edit change event before the mode change event..
        // In this case, we might get them the other way around, because the legacy modeSelect listens for
        // edit change and will switch to browse mode if the previously selected features go away.
        // To fix this, we'll listen to both events to see whether the road segments have been deleted.

        _onModeChange = (mode) => {
          const graph = editor.staging.graph;
          if (mode.id === 'browse' && !graph.hasEntity(_washingtonSegmentID) && !graph.hasEntity(twelfthAvenueID)) {
            resolve(playAsync);
          } else {
            resolve(multiSelectAsync);   // lost select mode - go back
          }
        };

        _onStagingChange = () => {
          _onStagingChange = null;
          _onModeChange = null;
          const graph = editor.staging.graph;
          if (!graph.hasEntity(_washingtonSegmentID) && !graph.hasEntity(twelfthAvenueID)) {
            resolve(playAsync);
          } else {
            resolve(retryDeleteAsync);   // changed something but roads still exist - go back
          }
        };

        _onMapMove = revealEditMenu;   // on map moves, have the curtain follow the menu immediately
        revealEditMenu(250);           // first time revealing menu, transition curtain to the menu

      }))
      .finally(() => {
        _onModeChange = null;
        _onStagingChange = null;
        _onMapMove = null;
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
        tipHtml: helpHtml(context, 'intro.lines.retry_delete'),
        buttonText: l10n.t('intro.ok'),
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
      tipHtml: helpHtml(context, 'intro.lines.play', { next: l10n.t('intro.buildings.title') }),
      buttonText: l10n.t('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
    return Promise.resolve();
  }


  chapter.enter = () => {
    _chapterCancelled = false;
    _rejectStep = null;
    _onMapMove = null;
    _onModeChange = null;
    _onStagingChange = null;

    context.on('modechange', _modeChangeListener);
    map.on('move', _mapMoveListener);
    editor.on('stagingchange', _stagingChangeListener);

    runAsync(addLineAsync)
      .catch(e => { if (e instanceof Error) console.error(e); })   // eslint-disable-line no-console
      .finally(() => {
        context.off('modechange', _modeChangeListener);
        map.off('move', _mapMoveListener);
        editor.off('stagingchange', _stagingChangeListener);
      });

    function _mapMoveListener(...args) {
      if (typeof _onMapMove === 'function') _onMapMove(...args);
    }
    function _modeChangeListener(...args) {
      if (typeof _onModeChange === 'function') _onModeChange(...args);
    }
    function _stagingChangeListener(...args) {
      if (typeof _onStagingChange === 'function') _onStagingChange(...args);
    }
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
