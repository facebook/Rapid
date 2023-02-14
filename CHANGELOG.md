# What's New

Thanks to all our contributors, users, and the many people that make RapiD possible! ❤️

The RapiD map editor is an open source project. You can submit bug reports, help out,
or learn more by visiting our project page on GitHub:  :octocat: https://github.com/facebookincubator/RapiD

If you love RapiD, please star our project on GitHub to show your support! ⭐️

_Breaking developer changes, which may affect downstream projects or sites that embed RapiD, are marked with a_ ⚠️

<!--
# A.B.C
##### YYYY-MMM-DD

#### :newspaper: News
#### :mega: Release Highlights
#### :boom: Breaking Changes
#### :tada: New Features
#### :sparkles: Usability & Accessibility
#### :scissors: Operations
#### :camera: Street-Level
#### :white_check_mark: Validation
#### :bug: Bugfixes
#### :earth_asia: Localization
#### :hourglass: Performance
#### :mortar_board: Walkthrough / Help
#### :rocket: Presets
###### New Presets
###### Changed Presets
###### New and Changed Fields
#### :hammer: Development
* ([#])

[iD#xxxx]: https://github.com/openstreetmap/iD/issues/xxxx
[#xxxx]: https://github.com/facebookincubator/RapiD/issues/xxxx
[@xxxx]: https://github.com/xxxx
-->
# [2.0.0-beta.0]

#### 2023-Jan-26

#### :tada: Beta test kickoff!


The Walkthrough has been retooled extensively- it should be much more resilient to going 'off-script' and it is easier for developers to extend and rework.

Mobile interactivity should be much improved now as compared to the earlier Alpha releases of Rapid v2.

Streetside imagery should now work much more cleanly (and without leaving stale imagery in the photo viewer).


### Bugfixes:
* [#539] Streetview image points with 360 degree imagery will no longer render as map pins, just circles.
* [#679] Fixed stack trace errors that occurred while panning inside the minimap.
* [#749] Fixed crashes/freezes while panning on mobile. Mobile users should also now be able to draw features.
* [#572] Custom data: tile server functionality has been restored. Load those .pbfs like a boss!
* [#795] Further custom data fixes that help performance on large datasets, eliminate black screen/crashes.

[#539]: https://github.com/facebook/RapiD/issues/539
[#679]: https://github.com/facebook/RapiD/issues/679
[#749]: https://github.com/facebook/RapiD/issues/749
[#795]: https://github.com/facebook/RapiD/issues/795
# [2.0.0-alpha3.3]

#### 2022-Dec-14

#### :tada: Numerous drawing/node-snapping fixes

We've ironed out a bunch of kinks in your way (ha!) that were preventing snapping, causing excess flickering, and just generally making it weird to interact with shapes on the map.

### Bugfixes:
* [#689] Fixed snapping during the 'add point' operation.
* [#635] Multi-select should now properly draw selection halos around EVERY selected item, not just the first.
* [#664] Hovering over a way should now show its vertices, not just the endpoint/interesting ones.
* [#718] Area drawing can now correctly snap the drawing area's points into existing ways.
* [#702] Rejoice, for you can now drag nodes in a way on top of each other to make them disappear!
* [#691] Adding nodes at the end of a line should now allow you to snap to existing lines and areas.

* [#703], [#704], [#705], [#706], and [#707] were all fixed by last week's [#682] fix.
* [#709] Removed the keyboard shortcut help text for the 'scale' and 'nudge' operations, as those have been removed.
* [#717] Restored the tooltip text for the area drawing mode- it incorrectly said 'not implemented'.
* [#720] Selecting an area should now display midpoints that are draggable.

[#689]: https://github.com/facebook/RapiD/issues/689
[#635]: https://github.com/facebook/RapiD/issues/635
[#664]: https://github.com/facebook/RapiD/issues/664
[#718]: https://github.com/facebook/RapiD/issues/718
[#702]: https://github.com/facebook/RapiD/issues/702
[#619]: https://github.com/facebook/RapiD/issues/619
[#703]: https://github.com/facebook/RapiD/issues/703
[#704]: https://github.com/facebook/RapiD/issues/704
[#705]: https://github.com/facebook/RapiD/issues/705
[#706]: https://github.com/facebook/RapiD/issues/706
[#707]: https://github.com/facebook/RapiD/issues/707
[#708]: https://github.com/facebook/RapiD/issues/708
[#709]: https://github.com/facebook/RapiD/issues/709
[#717]: https://github.com/facebook/RapiD/issues/717
[#720]: https://github.com/facebook/RapiD/issues/720
# [2.0.0-alpha3.2]

#### 2022-Dec-08

#### :tada: Square, Circularize, and related fixes

We've been hot on the trail of fixing issues with many different edit operations- our renderer wasn't picking them up properly and was therefore displaying the wrong shapes under certain conditions. Rotation, Move, Circularize, and Square operations were all affected. They should be working fine now.

### Bugfixes:
* [#682], [#683] and [#693] Square operation should be working correctly now.
* [#665] Ghost ways should no longer appear.

# [2.0.0-alpha3.1]
[#682]: https://github.com/facebook/RapiD/issues/682
[#683]: https://github.com/facebook/RapiD/issues/683
[#693]: https://github.com/facebook/RapiD/issues/693

#### 2022-Dec-07
This is a small refresher release to address a few issues reported by internal testers. Keep those bugs coming!

#### :tada: New code- Graph and history rewrite optimization

This version of the alpha has rewritten substantial portions of our core code. This rewrite was to help solve issues like #665 where 'ghost' nodes or ways are present on the map. This fix is still in flight and not complete yet.
### Bugfixes:
* [#685] Fixed the color for mapillary image pins.
* [#684] Quickly left-then-right clicking a way should now bring up the context menu, NOT add a point to the way.
* [#699] Privacy Policy link and text have been updated from iD to Map with AI.
* [#695] Cmd-V to paste features should now work once again.
* [#681] Area Drawing mode should now render all vertices of the area during the draw.
* [#687] The map can now be nudged (skootched?) during draw gestures by moving the pointer near the side of the map.

[#685]: https://github.com/facebook/RapiD/issues/685
[#684]: https://github.com/facebook/RapiD/issues/684
[#699]: https://github.com/facebook/RapiD/issues/699
[#695]: https://github.com/facebook/RapiD/issues/695
[#681]: https://github.com/facebook/RapiD/issues/681
[#687]: https://github.com/facebook/RapiD/issues/687
[#665]: https://github.com/facebook/RapiD/issues/665
# [2.0.0-alpha3]

#### 2022-Nov-21

#### :tada: New Features, Updates, and Improvements
We have some new area labelling to show off! Areas now get an icon/label associated with them drawn at the 'pole of inaccessibility'.

We have completely rewritten the code that associates an OSM shape with its constituent renderable pixi shapes- allowing us to detect hovers over an area's border, fill, etc. This improves snapping, hovering, and map interactions in general.

All drawing modes are now available and should work well (We do expect some bugs at this point still).

Wireframe mode (w) is back [#497], as well as the feature filtering [#584] for OSM features!

We've substantially reduced the bundle size by rebuilding some dependent projects with pixi v7 [#492], [#632]
* [#617] Code is now based off Pixi.v7.
* [#502] The walkthrough has been restored!
* [#499] All draw modes should now be working & available. Hooray!
* [#531] Lasso drawing to select OSM Nodes is back!
* [#538] Way midpoints now render and are interactive (double click, click-to-drag)
* [#652] double-clicking on a way (or at a midpoint) should now add a node to the way.


### Bugfixes:
* [#493] We've set webGL2 as the preferred method of starting up and haven't seen this issue since.
* [#495] Not a bug, actually- this was just an 'area-fill' issue before we had partials.
* [#518] Double-clicking to finish a way no longer zooms the map.
* [#519] Area drawing mode should work once again.
* [#521] The 'Notes' layer, hotkeys, and editing should work once again.
* [#524] Fixed a bug with way moving causing exceptions in rare cases.
* [#529] Right-clicking an empty part of the map should correctly show the 'paste' option.
* [#554] Continuing a line should work once again ('a' hotkey)
* [#555] No more auto-zoom after drawing a feature.
* [#556], [#569] Fixed a bug that caused keyboard/mouse events to get eaten after exiting a drawing mode.
* [#558] Fixed a bug with history / state annotations causing too many undo states during line drawing.
* [#561], [#660] Lines should now be closeable when drawing.
* [#562] Copy and Paste should now work correctly.
* [#563] Adding nodes to existing lines should work again in all browsers.
* [#565] Verified that Black-screen problems during data validation no longer occur.
* [#566] users should now be able to add nodes to the lines and area features.
* [#571] Fix a bug that was preventing ESRI buildings from conflating properly.
* [#572] Snapping to ways that are already on the map should be back to normal.
* [#580], [#581], and [#582] Added new templates for bug submissions!
* [#586] Area add button is now available, the mode is implemented!
* [#608] The preset picker dialog in the sidebar now correctly opens when the user adds a new untagged feature to the map.
* [#609] Various history fixes have been made to the line and area drawing modes, undo/redo should do the correct things to the change stack now.
* [#620] Fixed the 'destroy' calls for pixi v7 and bitmap text labels, freeing up more memory.
* [#627] Loading notes no longer causes a stack trace
* [#629] Fixed resource loading of textures during tests, also sped up resource loads of spritesheets by making the load promises parallel.
* [#630] Fixed many, many unit tests to go along with all these fixes/changes.
* [#637] Adding notes should now work.
* [#639] Fix the 'a' hotkey for adding to a line.
* [#646] FIxed a bug where clicking to snap to an area while hovering the fill caused a stack trace.
* [#648] Fixed a hover/snapping bug that prevented features from attaching to other features mid-draw.
* [#654] Fixed a bug with right-clicking on multiselections
* [#661] Cursors should properly update when transitioning in & out of modes.
* [#670] Double-clicking on a pre-existing node during way-drawing should leave the history in the correct state (with no 'extra' states to undo)

[#497]: https://github.com/facebook/RapiD/issues/497
[#584]: https://github.com/facebook/RapiD/issues/584
[#492]: https://github.com/facebook/RapiD/issues/492
[#632]: https://github.com/facebook/RapiD/issues/632

[#617]: https://github.com/facebook/RapiD/issues/617
[#502]: https://github.com/facebook/RapiD/issues/502
[#499]: https://github.com/facebook/RapiD/issues/499
[#531]: https://github.com/facebook/RapiD/issues/531
[#538]: https://github.com/facebook/RapiD/issues/538
[#652]: https://github.com/facebook/RapiD/issues/652
[#493]: https://github.com/facebook/RapiD/issues/493
[#495]: https://github.com/facebook/RapiD/issues/495
[#518]: https://github.com/facebook/RapiD/issues/518
[#519]: https://github.com/facebook/RapiD/issues/519
[#521]: https://github.com/facebook/RapiD/issues/521
[#524]: https://github.com/facebook/RapiD/issues/524
[#529]: https://github.com/facebook/RapiD/issues/529
[#554]: https://github.com/facebook/RapiD/issues/554
[#555]: https://github.com/facebook/RapiD/issues/555
[#556]: https://github.com/facebook/RapiD/issues/556
[#558]: https://github.com/facebook/RapiD/issues/558
[#561]: https://github.com/facebook/RapiD/issues/561
[#562]: https://github.com/facebook/RapiD/issues/562
[#563]: https://github.com/facebook/RapiD/issues/563
[#565]: https://github.com/facebook/RapiD/issues/565
[#566]: https://github.com/facebook/RapiD/issues/566
[#571]: https://github.com/facebook/RapiD/issues/571
[#572]: https://github.com/facebook/RapiD/issues/572
[#580]: https://github.com/facebook/RapiD/issues/580
[#581]: https://github.com/facebook/RapiD/issues/581
[#582]: https://github.com/facebook/RapiD/issues/582
[#586]: https://github.com/facebook/RapiD/issues/586
[#608]: https://github.com/facebook/RapiD/issues/608
[#609]: https://github.com/facebook/RapiD/issues/609
[#620]: https://github.com/facebook/RapiD/issues/620
[#627]: https://github.com/facebook/RapiD/issues/627
[#629]: https://github.com/facebook/RapiD/issues/629
[#630]: https://github.com/facebook/RapiD/issues/630
[#637]: https://github.com/facebook/RapiD/issues/637
[#639]: https://github.com/facebook/RapiD/issues/639
[#646]: https://github.com/facebook/RapiD/issues/646
[#648]: https://github.com/facebook/RapiD/issues/648
[#654]: https://github.com/facebook/RapiD/issues/654
[#661]: https://github.com/facebook/RapiD/issues/661
[#670]: https://github.com/facebook/RapiD/issues/670

# [2.0.1-alpha]

#### 2022-Aug-30


### Bugfixes:

[#571]
[#569]
[#555]

# [1.1.9](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.1.9)
##### 2022-May-05

#### :newspaper: News
* We've restricted the use of RapiD and MapWithAI around Ukraine per [request of the OSM Ukrainian Community](https://wiki.openstreetmap.org/wiki/Russian%E2%80%93Ukrainian_war).

#### :tada: New Features
* Use OAuth2 for authentication with OSM API ([#458])

#### :bug: Bugfixes
* Fix selectors in RapiD section of walkthrough
* Fix keyboard shortcuts screen layout ([#456])
* Fix missing data from Esri feature layers when exceeding the max records limit ([#404],[#469])
* Add extra css specificity for lines in RapiD (for use in HOT Task Manager) ([#435])
* Ignore Memorial stolpersteins in close node validation ([iD#9089])
* Consider lifecycle prefixes in tag and preset matching ([iD#8881])
* Improve Background imagery list styling ([iD#8975])
* Replace deprecated `String.prototype.substr()` ([iD#8988])
* Fix Note icon alignment in sidebar ([iD#9019])
* Fix comments in notes overflowing upon hovering ([iD#9074])
* Fix Wikidata field displays `[object Object]` ([iD#9080])
* Fix deferred promise cleanup in validator ([iD#9021])

[#404]: https://github.com/facebookincubator/RapiD/issues/404
[#435]: https://github.com/facebookincubator/RapiD/issues/435
[#456]: https://github.com/facebookincubator/RapiD/issues/456
[#458]: https://github.com/facebookincubator/RapiD/issues/458
[#469]: https://github.com/facebookincubator/RapiD/issues/469
[iD#8881]: https://github.com/openstreetmap/iD/issues/8881
[iD#8975]: https://github.com/openstreetmap/iD/issues/8975
[iD#8988]: https://github.com/openstreetmap/iD/issues/8988
[iD#9019]: https://github.com/openstreetmap/iD/issues/9019
[iD#9021]: https://github.com/openstreetmap/iD/issues/9021
[iD#9074]: https://github.com/openstreetmap/iD/issues/9074
[iD#9080]: https://github.com/openstreetmap/iD/issues/9080
[iD#9089]: https://github.com/openstreetmap/iD/issues/9089



# [1.1.8](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.1.8)
##### 2021-Oct-25

#### :tada: New Features
* Add `datasets=` url parameter to specify which RapiD datasets are enabled ([#335])

#### :sparkles: Usability & Accessibility
* Show an error if localStorage is full ([iD#8727])
* Keep the oldest way when merging ([iD#8708])
* Show ref in the name of route relations ([iD#8707])
* Improve Map Control scrolling on small devices ([iD#8685])

#### :bug: Bugfixes
* Fix issue causing some road labels to be missing
* Some Esri Datasets were missing from the list ([#328])
* Fix Extent calculation for Esri datasets ([#322])

#### :scissors: Operations
* Disable merge operation when it would damage relations ([iD#8675])

#### :white_check_mark: Validation
* Add warning for some commercial mapservice in China ([iD#8701])

#### :earth_asia: Localization
* Turn off RTL text patch on Chromium >=96 ([iD#8741])

#### :hourglass: Performance
* Improve preset matching performance ([iD#8768], [iD#8761], [iD#8612])
* Decomission Maxar Standard legacy imagery layer ([iD#8689])
* Debounce input events in the preset list ([iD#8288])

[#322]: https://github.com/facebookincubator/RapiD/issues/322
[#328]: https://github.com/facebookincubator/RapiD/issues/328
[#335]: https://github.com/facebookincubator/RapiD/issues/335
[iD#8288]: https://github.com/openstreetmap/iD/issues/8288
[iD#8612]: https://github.com/openstreetmap/iD/issues/8612
[iD#8675]: https://github.com/openstreetmap/iD/issues/8675
[iD#8685]: https://github.com/openstreetmap/iD/issues/8685
[iD#8689]: https://github.com/openstreetmap/iD/issues/8689
[iD#8701]: https://github.com/openstreetmap/iD/issues/8701
[iD#8707]: https://github.com/openstreetmap/iD/issues/8707
[iD#8708]: https://github.com/openstreetmap/iD/issues/8708
[iD#8727]: https://github.com/openstreetmap/iD/issues/8727
[iD#8741]: https://github.com/openstreetmap/iD/issues/8741
[iD#8761]: https://github.com/openstreetmap/iD/issues/8761
[iD#8768]: https://github.com/openstreetmap/iD/issues/8768



# [1.1.7](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.1.7)
##### 2021-Aug-30

#### :sparkles: Usability & Accessibility
* Add link button next to website field ([iD#8650])

#### :bug: Bugfixes
* Various fixes for validator involving stale state and detections ([iD#8663], [iD#8655], [#300])
* Fix issue involving shift-clicking and lasso-selecting features ([#299], [#301])
* Fix issue involving copy-paste ([#311])

[#299]: https://github.com/facebookincubator/RapiD/issues/299
[#300]: https://github.com/facebookincubator/RapiD/issues/300
[#301]: https://github.com/facebookincubator/RapiD/issues/301
[#311]: https://github.com/facebookincubator/RapiD/issues/311
[iD#8650]: https://github.com/openstreetmap/iD/issues/8650
[iD#8655]: https://github.com/openstreetmap/iD/issues/8655
[iD#8663]: https://github.com/openstreetmap/iD/issues/8663


# [1.1.6](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.1.6)
##### 2021-Aug-19

#### :tada: Updates
* Select parent/child keystroke improvement ([iD#8298], [iD#8577])
* Fix jittery renders caused by redrawing while transformed ([iD#8638])
* Validator improvements and performance ([iD#8626], [iD#8637])
  * Add a validator fix option to tag as `not:` a matched item ([iD#8628])
  * Crossing_ways - improve code for repurposing crossing nodes ([iD#8625])
  * General performance issues ([iD#8612])
  * Improve crossing_ways validation (user should need to move the road more to make a new issue)
  * Better counting of "issues caused by user" ([iD#8632])
  * Improve code for focusing a validation issue on a relation
  * Issues viewed are being counted towards issues ignored ([iD#8613])
  * Fixme issues shouldn't count towards ignored issues ([iD#8603])
* Name-suggestion-index related improvements and bugfixes ([iD#8618])
  * Treat route_master relations like route relations for matching to NSI ([iD#8627], [NSI#5184])
  * Don't overwrite "toplevel" tag like `internet_access` ([iD#8615])
  * Don't consider `old_name` as a name for matching ([iD#8617])

#### :hammer: Development
* Many improvements to the testing system ([iD#8642])
* Update the Maxar Premium imagery url ([iD#8623])

[iD#8298]: https://github.com/openstreetmap/iD/issues/8298
[iD#8577]: https://github.com/openstreetmap/iD/issues/8577
[iD#8603]: https://github.com/openstreetmap/iD/issues/8603
[iD#8612]: https://github.com/openstreetmap/iD/issues/8612
[iD#8613]: https://github.com/openstreetmap/iD/issues/8613
[iD#8615]: https://github.com/openstreetmap/iD/issues/8615
[iD#8617]: https://github.com/openstreetmap/iD/issues/8617
[iD#8618]: https://github.com/openstreetmap/iD/issues/8618
[iD#8623]: https://github.com/openstreetmap/iD/issues/8623
[iD#8625]: https://github.com/openstreetmap/iD/issues/8625
[iD#8626]: https://github.com/openstreetmap/iD/issues/8626
[iD#8627]: https://github.com/openstreetmap/iD/issues/8627
[iD#8628]: https://github.com/openstreetmap/iD/issues/8628
[iD#8632]: https://github.com/openstreetmap/iD/issues/8632
[iD#8637]: https://github.com/openstreetmap/iD/issues/8637
[iD#8638]: https://github.com/openstreetmap/iD/issues/8638
[iD#8642]: https://github.com/openstreetmap/iD/issues/8642
[NSI#5184]: https://github.com/osmlab/name-suggestion-index/issues/5184


# [1.1.5](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.1.5)
##### 2021-Jul-13
#### :tada: Updates
* Name Suggestion Index v6.0
* OSM Community Index v5.1
* D3.js v7.0
* Mapillary API and Mapillary-JS Viewer v4.0 ([#233], [#236])
* Add new duplicate way validation ([#220])

#### :hammer: Development
* Replace rollup with esbuild for much faster project builds ([#246])

#### :bug: Bugfixes
* Remove artificial limit of 100 on Esri Datasets ([#257], [#265])
* Ensure freshness of Bing Imagery ([iD#8570])
* If locationSet is missing include, default to worldwide include ([iD#bfb36d5])
* Fix bug in walkthrough ([#234])

[#220]: https://github.com/facebookincubator/RapiD/issues/220
[#233]: https://github.com/facebookincubator/RapiD/issues/233
[#234]: https://github.com/facebookincubator/RapiD/issues/234
[#236]: https://github.com/facebookincubator/RapiD/issues/236
[#246]: https://github.com/facebookincubator/RapiD/issues/246
[#257]: https://github.com/facebookincubator/RapiD/issues/257
[#265]: https://github.com/facebookincubator/RapiD/issues/265
[iD#8570]: https://github.com/openstreetmap/iD/issues/8570
[iD#bfb36d5]: https://github.com/openstreetmap/iD/pull/8305/commits/bfb36d572d35271f1a77227d776ebddc7f232ac3


# [1.1.4](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.1.4)
##### 2021-May-14
#### :tada: Updates
* Improved search/filtering panel for Esri datasets ([#146], [#216])
* osm-community-index v4 ([iD#8483])

#### :bug: Bugfixes
* Fix bug when adding custom layers ([#204])
* Restore missing icons for RapiD keyboard shortcuts ([#138])
* CrossEditableZoom event firing fix ([iD#8473])
* Fix fallback to English language for RapiD strings ([OMaF#19])

[OMaF#19]: https://github.com/facebookmicrosites/Open-Mapping-At-Facebook/issues/19
[iD#8473]: https://github.com/openstreetmap/iD/issues/8473
[iD#8483]: https://github.com/openstreetmap/iD/issues/8483
[#138]: https://github.com/facebookincubator/RapiD/issues/138
[#146]: https://github.com/facebookincubator/RapiD/issues/146
[#204]: https://github.com/facebookincubator/RapiD/issues/204
[#216]: https://github.com/facebookincubator/RapiD/issues/216


# [1.1.3](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.1.3)
##### 2021-Apr-22
#### :tada: Updates
* Use Mapillary Vector Tile API ([iD#8372])
* Name Suggestion Index v5 ([iD#8305])
* Allow validation severity to be overridden with url params ([iD#8243])
* Update all dependencies (numerous here, but it includes refreshes to things like [osm-community-index](https://github.com/osmlab/osm-community-index/), [temaki](https://github.com/ideditor/temaki), Rollup)
* Use `addr:` tags as a fallback name ([iD#8440])

#### :bug: Bugfixes
* Fix centroid calculation in measurement panel ([iD#8341])
* Bugfix for move/rotate cancel ([iD#8442] / [#80])

[iD#8243]: https://github.com/openstreetmap/iD/issues/8243
[iD#8305]: https://github.com/openstreetmap/iD/issues/8305
[iD#8341]: https://github.com/openstreetmap/iD/issues/8341
[iD#8372]: https://github.com/openstreetmap/iD/issues/8372
[iD#8440]: https://github.com/openstreetmap/iD/issues/8440
[iD#8442]: https://github.com/openstreetmap/iD/issues/8442
[#80]: https://github.com/facebookincubator/RapiD/issues/80


# [1.1.2](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.1.2)
##### 2021-Mar-09
#### :trumpet: Updates
* This is a 'refresh' release, based off iD version 2.19.6.


# [1.1.1](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.1.1)
##### 2021-Jan-15
#### :bug: Bugfixes:
* #195, #196, and #197.

#### :trumpet: Updates
* This is a 'refresh' release, based off iD version 2.19.5.


# [1.1.0](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.1.0)
##### 2020-Dec-07
#### :trumpet: New Features!
* This release brings the new [Esri ArcGIS data sets](https://openstreetmap.maps.arcgis.com/home/group.html?id=bdf6c800b3ae453b9db239e03d7c1727#overview) to RapiD!

Read the [FAQ](https://github.com/facebookmicrosites/Open-Mapping-At-Facebook/wiki/Esri-ArcGIS-FAQ) and our engineering [blog post](https://tech.fb.com/osm-ready-data-sets/).

#### :trumpet: Updates
* This release is based off of iD version 2.18.3.
* This release fixes issue #168, which prevented users from editing certain types of ways.


# [1.0.12](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.12)
##### 2020-Sept-11
#### :trumpet: Updates
* This release fixes issue #168, which prevented users from editing certain types of ways.


# [1.0.11](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.11)
##### 2020-Aug-24
#### :trumpet: Updates
* This release fixes issue #158, which prevented some saves from occurring.
* Other fixes: #163, #164.


# [1.0.10](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.10)
##### 2020-Aug-07
#### :trumpet: Updates
* This brings the RapiD code up-to-date with v2.18.4 (issue #139), which adds a lot of new stuff.
* Also add a one-time dialog for the rapid-esri collaboration.
* Finally, fix issue #144.


# [1.0.9](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.9)
##### 2020-Jun-09
#### :trumpet: Updates
* This removes the FB-Maxar imagery layer. We recommend using the the Maxar Premium (Beta) layer instead.


# [1.0.8](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.8)
##### 2020-Mar-30
#### :trumpet: Updates
* This eliminates RapiD's need to contact the facebook.com domain and instead contacts the mapwith.ai domain. This should mean fewer configuration issues for folks using Firefox or similar.


# [1.0.7](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.7)
##### 2020-Feb-18

#### :trumpet: Updates
* This brings the RapiD code up-to-date with v2.17.2, which re-introduces Maxar Imagery.


# [1.0.6](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.6)
##### 2020-Jan-31
#### :trumpet: Updates
* This brings the RapiD code up-to-date with v2.17.1. This also fixes issue #105.


# [1.0.5](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.5)
##### 2019-Dec-12
#### :trumpet: Updates
* This brings the RapiD code up-to-date with v2.17. This fixes issue #92.


# [1.0.4](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.4)
##### 2019-Dec-12

#### :bug: Bugfixes
* Fixed issue #84: https://github.com/facebookincubator/RapiD/issues/84 - With this fix, no more than 50 AI roads or buildings can be added to the map in a single save.

#### :tada: New Features
* Merged with [iD v2.16](https://github.com/openstreetmap/iD/blob/develop/CHANGELOG.md#2160) including support for objects detected in Mapillary images & a visual diff hotkey!


# [1.0.3](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.3)
##### 2019-Nov-25

#### :tada: New Features
This release includes the buildings layer from Microsoft as an enabled feature layer! Read more about it here:
https://blogs.bing.com/maps/2019-09/microsoft-releases-18M-building-footprints-in-uganda-and-tanzania-to-enable-ai-assisted-mapping

For up-to-date availability of roads and buildings, check our continually-updated GeoJSON link here: https://github.com/facebookmicrosites/Open-Mapping-At-Facebook/blob/develop/data/rapid_releases.geojson

#### :sparkles: Usability
* The RapiD button is no longer an AI-roads toggle- instead, a dialog opens allowing you to enable Facebook's road layer, Microsoft's building layer, or nothing at all.


# [1.0.2](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.2)
##### 2019-Oct-14

#### :tada: New Features
* Merged with [iD v2.15.5](https://github.com/openstreetmap/iD/blob/develop/CHANGELOG.md#2155).
* Added a framework for enabling custom features on RapiD.
* Added a custom feature for a halo effect on AI roads that have been added to the map during editing time.

#### :sparkles: Usability
* Added options for drawing 2x2, 3x3, 4x4, 5x5, or 6x6 grids within the task area when working on a TM task with a rectangular shape.


# [1.0.1](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.1)
##### 2019-Jul-31

#### :bug: Bugfixes
* Added hostname to changeset tags.
* Fixed lint errors when running with node 8 and 10.


# [1.0.0](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.0)
##### 2019-Jul-22

#### :tada: New Features
* Merged with iD v2.15.3. Updated hotkey for hiding OSM data layer to **OPT + W** to stay consistent with iD.
* Added walk-through for working with the **RapiD** button and AI-generated roads.
* Added limit for adding up to 50 AI-generated roads in each mapping session under non-TM mode.

#### :sparkles: Usability
* Added RapiD icon callouts to RapiD hotkeys in the help modal.
* Added automatic tagging of **surface=unpaved** when **highway=track** is set through the **SHIFT + C** hotkey.
* Added differentiation between tag changes and geometry changes when highlighting edited features.

#### :white_check_mark: Validation
* Adjusted validation for Y-shaped connection to flag issues on the excessive nodes around connections.

#### :bug: Bugfixes
* Updated bug report button to point to https://github.com/facebookincubator/RapiD/issues.


# 0.9.0
##### 2019-May-29

#### :tada: New Features
* Added functionalities for working with AI-generated roads from Facebook ML road service.
* Added Facebook Maxar imagery layer.
* Added link to license for using Facebook Map With AI service.
* Added logic for cropping AI-generated roads on task boundaries when working on TM tasks.

#### :sparkles: Usability
* Added RapiD-specific hotkeys:
  * **G** for highlighting way edits in current session
  * **U** for toggling OSM data layer
  * **SHIFT + R** for toggling Map With AI feature layer
  * **A** for adding a selected Map With AI feature
  * **D** for removing a selected Map With AI feature
  * **SHIFT + C** for changing the type of a road added from the Map With AI layer

#### :white_check_mark: Validation
* Added validation check for short roads.
* Added validation check for very close nodes on roads.
* Added validation check for Y-shaped connections.
* Extended validation check for disconnected roads to detect islands of disconnected roads.