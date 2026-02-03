# What's New

Thanks to all our contributors, users, and the many people that make Rapid possible! ❤️

The Rapid map editor is an open source project. You can submit bug reports, help out,
or learn more by visiting our project page on GitHub:  :octocat: https://github.com/facebook/Rapid

If you love Rapid, please star our project on GitHub to show your support! ⭐️

_Breaking developer changes, which may affect downstream projects or sites that embed Rapid, are marked with a_ ⚠️

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
#### :compass: MapRoulette
#### :white_check_mark: Validation
#### :bug: Bugfixes
#### :earth_asia: Localization
#### :hammer: Development
#### :hourglass: Performance
#### :mortar_board: Walkthrough / Help
#### :rocket: Presets
#### :popcorn: OSM
###### New Presets
###### Changed Presets
###### New and Changed Fields

[#xxxx]: https://github.com/facebook/Rapid/issues/xxxx
[rapid-sdk#xxx]: https://github.com/rapideditor/rapid-sdk/issues/xxx
[iD#xxxxx]: https://github.com/openstreetmap/iD/issues/xxxxx
[id-tagging-schema#xxxx]: https://github.com/openstreetmap/id-tagging-schema/issues/xxxx
[@xxxx]: https://github.com/xxxx
-->
# [2.5.6](https://github.com/facebook/Rapid/releases/tag/rapid-2.5.6)
#### 2026-Feb-03

#### :bug: XSS Vulnerability fixes
* Sanitizes HTML before rendering to mitigate XSS vulnerabilities.
* Dependency updates.


# [2.5.5](https://github.com/facebook/Rapid/releases/tag/rapid-2.5.5)
#### 2025-Jul-07

#### :bug: Bugfixes
* [#1722] Osm auth should now work once again

[#1722]: https://github.com/facebook/Rapid/issues/1722
# [2.5.4](https://github.com/facebook/Rapid/releases/tag/rapid-2.5.4)
#### 2025-Jul-07

#### :bug: Bugfixes
* [#1719] Fix: Issue with html rendering that should have been simple text

[#1719]: https://github.com/facebook/Rapid/issues/1719

# [2.5.3](https://github.com/facebook/Rapid/releases/tag/rapid-2.5.3)
#### 2025-Mar-07
#### :tada: New Features
* [#1689] Fixes and Improvements to maproulette (thanks [@Tordans]!)

#### :bug: Bugfixes
* [#1679] Fix: successfully display custom data on startup

[#1689]: https://github.com/facebook/Rapid/issues/1689
[#1679]: https://github.com/facebook/Rapid/issues/1679
[@Tordans]: https://github.com/Tordans

# [2.5.2](https://github.com/facebook/Rapid/releases/tag/rapid-v2.5.2)
#### 2025-Jan-17

#### :bug: Bugfixes
* [#1577] Fix: Issues with build script when run on Windows
* [#1674] Fix: Avoid flipping the hole in the walkthrough curtain
* [#1675] Fix: Broken triangle shape of walkthrough curtain on Firefox

[#1577]: https://github.com/facebook/Rapid/issues/1577
[#1674]: https://github.com/facebook/Rapid/issues/1674
[#1675]: https://github.com/facebook/Rapid/issues/1675


# [2.5.1](https://github.com/facebook/Rapid/releases/tag/rapid-v2.5.1)
#### 2025-Jan-15

#### :sparkles: Usability & Accessibility
* [#1650] Improve quality and sharpness of textures by removing the half-pixel correction distortion
* [#1664] Remove rendering artifacts from edges of BitmapText labels

#### :bug: Bugfixes
* [#1489] Fix: Crash when restoring a backup with a temporary way that was added and later deleted - "Entity not found"
* [#1654], [#1671] Fix: Crash when adding curbs if there is no connected sidewalk - "`this.tags` is null"
* [#1655], [#1670] Fix: Save osmChange file not working - raises `msSaveBlob` error
* [#1657] Fix: Don't suggest curb nodes when they are already mapped with `kerb=no`
* [#1658] Fix: Allow Rapid to recover from a lost WebGL context
* [#1659] Fix: Issue preventing copying text from the Location Panel
* [#1660] Fix: Hard to snap a way to another way or area
* [#1666] Fix: Missing "Show Tiles" debug tile grid
* [#1672] Fix: Unspecified curb should be `kerb=yes`, not `kerb=unspecified`

[#1489]: https://github.com/facebook/Rapid/issues/1489
[#1650]: https://github.com/facebook/Rapid/issues/1650
[#1654]: https://github.com/facebook/Rapid/issues/1654
[#1655]: https://github.com/facebook/Rapid/issues/1655
[#1657]: https://github.com/facebook/Rapid/issues/1657
[#1658]: https://github.com/facebook/Rapid/issues/1658
[#1659]: https://github.com/facebook/Rapid/issues/1659
[#1660]: https://github.com/facebook/Rapid/issues/1660
[#1664]: https://github.com/facebook/Rapid/issues/1664
[#1666]: https://github.com/facebook/Rapid/issues/1666
[#1670]: https://github.com/facebook/Rapid/issues/1670
[#1671]: https://github.com/facebook/Rapid/issues/1671
[#1672]: https://github.com/facebook/Rapid/issues/1672


# [2.5.0](https://github.com/facebook/Rapid/releases/tag/rapid-v2.5.0)
#### 2024-Dec-23

#### :tada: New Features
* [#1595], [#1644] New Dataset: Add [Overture Places](https://docs.overturemaps.org/guides/places/) as a readonly dataset
* [#1608] New Dataset: Add [Open Map Data Footways](https://github.com/facebookmicrosites/Open-Mapping-At-Facebook/wiki/Footways-FAQ) - open footway data provided by state and city level departments
* [#1642] Refreshed dataset catalog, now allows users to search for both Esri and non-Esri data in the same place
* [#1422] Add URL paremeter for MapRoulette settings: `&maproulette=true` or `&maproulette=challengeIDs`
* [#1630] Add URL parameter for OSM Notes: `&note=true` or `&note=noteID`

#### :hourglass: Performance
* [#1189], [#1495] Upgrade renderer to Pixi v8, also includes various performance improvements
* [#1145], [#1554] Performance improvements related to ANGLE WebGL backend

#### :white_check_mark: Validation
* [#1623] Add support for lower severity level 'suggestions'
* [#1460], [#1583], [#1619], [#1622] Add a new 'Curb Nodes' suggestion to suggest and add curb nodes
* [#1597], [#1599] Fix: Don't suggest converting a crossing endpoint into a crossing node
* [iD#10522], [iD#10523] Fix: Don't show wrong error message for 'mismatched geometry' when no matching preset is found
* [iD#10459] Fix: Don't show unsolvable 'mismatched geometry' error when matching a preset scoped to a different location

#### :sparkles: Usability & Accessibility
* [#1562] Don't expand sidebar automatically when selecting an OSM feature
* [#1593] Don't allow side panes to cover information panels
* [#1336] Allow keyboard shortcuts to accept, ignore, move, rotate Rapid features to work when hovering over a Rapid feature
* [#1578], [#1592], [#1594], [#1606] New Keyboard shortcuts for toggling layers
* [#1629], [#1637] Checkboxes in indeterminite state should look more like unchecked than checked
* [#1378], [#1233] Remove confusing list item styling for the previously used background imagery
* [iD#9013], [iD#5634] Don't show directional viewcones along ways which are not routable
* [iD#10554] Show thin scrollbars in Firefox
* [iD#10507], [iD#10508] Improve the code to prevent password managers from autofilling

#### :compass: MapRoulette
* [#1613], [#1618] Add checkbox option when closing a MapRoulette task to jump to the next task
* [#1430], [#1638] Add a right-click menu for MapRoulette tasks

#### :camera: Street-Level
* [#1582] Mapillary: Show "original" positions of image markers instead of "corrected" positions

#### :bug: Bugfixes
* [#1403], [#1580] Fix: Razed railways remain visible when historical objects are hidden
* [#1493] Fix: When selecting multiple features, show 'multiple values' in the tag editor if not all features have the tag
* [#1636] Workaround: Avoid crash in Pixi MeshPipe code when changing a polygon with mesh size around 200 vertices
* [#1643] Fix: Click-drag in input text field should not affect background imagery offset
* [iD#10573], [iD#10581] Fix: Unclickable Keyboard Shortcuts button when on last page of help content

#### :earth_asia: Localization
* [#1488] Display mirrored Rapid logo in right-to-left locales

#### :hammer: Development
* [#1581] Add SpectorJS WebGL debugging tool, available in debug builds

[#1145]: https://github.com/facebook/Rapid/issues/1145
[#1189]: https://github.com/facebook/Rapid/issues/1189
[#1233]: https://github.com/facebook/Rapid/issues/1233
[#1336]: https://github.com/facebook/Rapid/issues/1336
[#1378]: https://github.com/facebook/Rapid/issues/1378
[#1403]: https://github.com/facebook/Rapid/issues/1403
[#1422]: https://github.com/facebook/Rapid/issues/1422
[#1430]: https://github.com/facebook/Rapid/issues/1430
[#1460]: https://github.com/facebook/Rapid/issues/1460
[#1488]: https://github.com/facebook/Rapid/issues/1488
[#1493]: https://github.com/facebook/Rapid/issues/1493
[#1495]: https://github.com/facebook/Rapid/issues/1495
[#1554]: https://github.com/facebook/Rapid/issues/1554
[#1562]: https://github.com/facebook/Rapid/issues/1562
[#1578]: https://github.com/facebook/Rapid/issues/1578
[#1580]: https://github.com/facebook/Rapid/issues/1580
[#1581]: https://github.com/facebook/Rapid/issues/1581
[#1582]: https://github.com/facebook/Rapid/issues/1582
[#1583]: https://github.com/facebook/Rapid/issues/1583
[#1592]: https://github.com/facebook/Rapid/issues/1592
[#1593]: https://github.com/facebook/Rapid/issues/1593
[#1594]: https://github.com/facebook/Rapid/issues/1594
[#1595]: https://github.com/facebook/Rapid/issues/1595
[#1597]: https://github.com/facebook/Rapid/issues/1597
[#1599]: https://github.com/facebook/Rapid/issues/1599
[#1606]: https://github.com/facebook/Rapid/issues/1606
[#1608]: https://github.com/facebook/Rapid/issues/1608
[#1613]: https://github.com/facebook/Rapid/issues/1613
[#1618]: https://github.com/facebook/Rapid/issues/1618
[#1619]: https://github.com/facebook/Rapid/issues/1619
[#1622]: https://github.com/facebook/Rapid/issues/1622
[#1623]: https://github.com/facebook/Rapid/issues/1623
[#1629]: https://github.com/facebook/Rapid/issues/1629
[#1630]: https://github.com/facebook/Rapid/issues/1630
[#1636]: https://github.com/facebook/Rapid/issues/1636
[#1637]: https://github.com/facebook/Rapid/issues/1637
[#1638]: https://github.com/facebook/Rapid/issues/1638
[#1642]: https://github.com/facebook/Rapid/issues/1642
[#1643]: https://github.com/facebook/Rapid/issues/1643
[#1644]: https://github.com/facebook/Rapid/issues/1644

[iD#5634]: https://github.com/openstreetmap/iD/issues/5634
[iD#9013]: https://github.com/openstreetmap/iD/issues/9013
[iD#10459]: https://github.com/openstreetmap/iD/issues/10459
[iD#10507]: https://github.com/openstreetmap/iD/issues/10507
[iD#10508]: https://github.com/openstreetmap/iD/issues/10508
[iD#10522]: https://github.com/openstreetmap/iD/issues/10522
[iD#10523]: https://github.com/openstreetmap/iD/issues/10523
[iD#10554]: https://github.com/openstreetmap/iD/issues/10554
[iD#10573]: https://github.com/openstreetmap/iD/issues/10573
[iD#10581]: https://github.com/openstreetmap/iD/issues/10581


# [2.4.3](https://github.com/facebook/Rapid/releases/tag/rapid-v2.4.3)
#### 2024-Oct-28

#### :bug: Bugfixes
* [#1566] Reset the sidebar to "search features" when entering browse mode
* [#1567] Constrain the width of the pane, sidebar doesn't overflow

[#1566]: https://github.com/facebook/Rapid/issues/1566
[#1567]: https://github.com/facebook/Rapid/issues/1567


# [2.4.2](https://github.com/facebook/Rapid/releases/tag/rapid-v2.4.2)
#### 2024-Sep-16

#### :hammer: Development
* [#1561] Reduce package size for JSDelivr CDN: exclude `/dist/data/modules`


# [2.4.1](https://github.com/facebook/Rapid/releases/tag/rapid-v2.4.1)
#### 2024-Sep-14

#### :hammer: Development
* [#1561] Reduce package size for JSDelivr CDN: only publish the `/dist` folder to npm

[#1561]: https://github.com/facebook/Rapid/issues/1561


# [2.4.0](https://github.com/facebook/Rapid/releases/tag/rapid-v2.4.0)
#### 2024-Sep-13

:mega: Shout out to [Major League Hacking](https://mlh.io/) fellow [@cubeydice] for building a Rapid DevTool extension for Chrome!
You can check it out here: https://github.com/rapideditor/rapid-devtools .

#### :camera: Street-Level
* [#1526] Streetview Imagery bug-bash:
  * [#1509] KartaView imagery was not working
  * [#1510] Support KartaView 360° photos
  * [#1511] Mapillary sequence lines were missing
  * [#1512] Always show the selected photo, even if filtering rules would hide it
  * [#1513] Some Mapillary data missing if multiple layers were selected (photos, signs, objects)
  * [#1514] Highlight photos that show a Mapillary detection, improve choice of photo and map positioning
  * [#1515] Allow Mapillary signs and detections to be selected via the URL hash
  * [#1516], [#1538] Avoid Mapillary detections from overlapping
  * [#1517] Allow Mapillary signs and detections to be selected by clicking on them, show detail in sidebar
  * [#1518] Show placeholder icons for Mapillary signs and detections not in known list
  * [#1521] Add "high resolution" toggle for KartaView photos
  * [#1502] Restore Mapillary segmentation display in viewer, include text and highlighting

#### :bug: Bugfixes
* [#1486] Fix: When changing a feature from line to area or vice versa, preset list not updated
* [#1503] Fix: When adding a new note, allow user to drag the note to where it belongs
* [#1505] Fix: Icons briefly not visible when drawn the first time
* [#1525] Fix: Mapbox Imagery access tokens
* [#1527], [#1408] Fix: Issues where Extent is not revealed correctly in walkthrough
* [#1533], [rapid-sdk#281] Fix: Tile coverage calculation on rotated viewports
* [iD#10323], [iD#10333] Fix: Name field hidden even if localized name tags exist

#### :sparkles: Usability & Accessibility
* [#1472] MapRoulette Improvements:
  * [#1419] Support curly-brace "mustache" templates in challenge instructions
  * [#1423] Support form field templating in challenge instructions
* [#1400] New shortcuts for toggling layers:
  * <kbd>Shift</kbd>+<kbd>O</kbd> Toggle OSM Data
  * <kbd>Shift</kbd>+<kbd>N</kbd> Toggle OSM Notes
  * <kbd>Shift</kbd>+<kbd>R</kbd> Toggle Rapid Data
* [#1468] Fix viewpoint jumpiness after resizing the sidebar
* [#1479] Remember user's preference for sidebar width
* [#1497] Add a larger sidebar resize handle (click will toggle), remove "Inspect" toggle sidebar button
* [#1500] When shrinking buttons on narrow screens, shrink the Rapid button too

#### :earth_asia: Localization
* [#206], [#1490] Get translation working again
* [iD#10291], [iD#10332] Add Thailand Address format

#### :hammer: Development
* [#1437] Add experimental support for Rapid datasets to render a coverage heatmap at low zooms
* [#1404], [#1439] Create example page for Rapid embedded in iframe
* [#1482] Allow Rapid to work in Sandbox (no CDN)
* [#1471], [#1477] Add option to change the image transparency
* [#1478], [#1483] Remove ImproveOSM, service has been shut down
* [#1481], [#1496] Allow customizible zoom range for imagary sources

#### :mortar_board: Walkthrough / Help
* [#1558] In Help text, mention that Notes Layer is not enabled by default

#### :popcorn: OSM:
* [iD#10278], [id-tagging-schema#1263] Add support for `railway=ventilation_shaft`
* [iD#10283], Add support for `waterway=flowline`

[#206]: https://github.com/facebook/Rapid/issues/206
[#1400]: https://github.com/facebook/Rapid/issues/1400
[#1404]: https://github.com/facebook/Rapid/issues/1404
[#1408]: https://github.com/facebook/Rapid/issues/1408
[#1419]: https://github.com/facebook/Rapid/issues/1419
[#1423]: https://github.com/facebook/Rapid/issues/1423
[#1437]: https://github.com/facebook/Rapid/issues/1437
[#1439]: https://github.com/facebook/Rapid/issues/1439
[#1468]: https://github.com/facebook/Rapid/issues/1468
[#1471]: https://github.com/facebook/Rapid/issues/1471
[#1472]: https://github.com/facebook/Rapid/issues/1472
[#1477]: https://github.com/facebook/Rapid/issues/1477
[#1478]: https://github.com/facebook/Rapid/issues/1478
[#1479]: https://github.com/facebook/Rapid/issues/1479
[#1481]: https://github.com/facebook/Rapid/issues/1481
[#1482]: https://github.com/facebook/Rapid/issues/1482
[#1483]: https://github.com/facebook/Rapid/issues/1483
[#1486]: https://github.com/facebook/Rapid/issues/1486
[#1490]: https://github.com/facebook/Rapid/issues/1490
[#1496]: https://github.com/facebook/Rapid/issues/1496
[#1497]: https://github.com/facebook/Rapid/issues/1497
[#1500]: https://github.com/facebook/Rapid/issues/1500
[#1502]: https://github.com/facebook/Rapid/issues/1502
[#1503]: https://github.com/facebook/Rapid/issues/1503
[#1505]: https://github.com/facebook/Rapid/issues/1505
[#1509]: https://github.com/facebook/Rapid/issues/1509
[#1510]: https://github.com/facebook/Rapid/issues/1510
[#1511]: https://github.com/facebook/Rapid/issues/1511
[#1512]: https://github.com/facebook/Rapid/issues/1512
[#1513]: https://github.com/facebook/Rapid/issues/1513
[#1514]: https://github.com/facebook/Rapid/issues/1514
[#1515]: https://github.com/facebook/Rapid/issues/1515
[#1516]: https://github.com/facebook/Rapid/issues/1516
[#1517]: https://github.com/facebook/Rapid/issues/1517
[#1518]: https://github.com/facebook/Rapid/issues/1518
[#1521]: https://github.com/facebook/Rapid/issues/1521
[#1525]: https://github.com/facebook/Rapid/issues/1525
[#1526]: https://github.com/facebook/Rapid/issues/1526
[#1527]: https://github.com/facebook/Rapid/issues/1527
[#1533]: https://github.com/facebook/Rapid/issues/1533
[#1538]: https://github.com/facebook/Rapid/issues/1538
[#1558]: https://github.com/facebook/Rapid/issues/1558
[iD#10323]: https://github.com/openstreetmap/iD/issues/10323
[iD#10333]: https://github.com/openstreetmap/iD/issues/10333
[iD#10291]: https://github.com/openstreetmap/iD/issues/10291
[iD#10332]: https://github.com/openstreetmap/iD/issues/10332
[iD#10278]: https://github.com/openstreetmap/iD/issues/10278
[iD#10283]: https://github.com/openstreetmap/iD/issues/10283
[id-tagging-schema#1263]: https://github.com/openstreetmap/id-tagging-schema/issues/1263
[rapid-sdk#281]: https://github.com/rapideditor/rapid-sdk/issues/281
[@cubeydice]: https://github.com/cubeydice


# [2.3.2](https://github.com/facebook/Rapid/releases/tag/rapid-v2.3.2)
#### 2024-Jul-16

#### :sparkles: Usability & Accessibility
* [#1434] Allow toggling Rapid features from the Map Data panel
* [#893], [#1353], [#1457] Improve pinch zooming on mobile browsers

#### :bug: Bugfixes:
* [#1427], [#1428] Check for valid MapRoulette API token
* [#1436], [#1446] Allow viewing hidden challenges if MapRoulette challenge ID is provided
* [#1441] Enabling 3D Map moves the map to Null Island
* [#1071], [#1137], [#1440]  Don't cancel multiselection when <kbd>Shift</kbd>-clicking on an empty part of the map
* [#1431] Don't allow Context to init twice
* [#1445] Loading Esri Wayback config file from S3 is blocked in some regions

[#893]: https://github.com/facebook/Rapid/issues/893
[#1071]: https://github.com/facebook/Rapid/issues/1071
[#1137]: https://github.com/facebook/Rapid/issues/1137
[#1353]: https://github.com/facebook/Rapid/issues/1353
[#1427]: https://github.com/facebook/Rapid/issues/1427
[#1428]: https://github.com/facebook/Rapid/issues/1428
[#1431]: https://github.com/facebook/Rapid/issues/1431
[#1434]: https://github.com/facebook/Rapid/issues/1434
[#1436]: https://github.com/facebook/Rapid/issues/1436
[#1440]: https://github.com/facebook/Rapid/issues/1440
[#1441]: https://github.com/facebook/Rapid/issues/1441
[#1445]: https://github.com/facebook/Rapid/issues/1445
[#1446]: https://github.com/facebook/Rapid/issues/1446
[#1457]: https://github.com/facebook/Rapid/issues/1457


# [2.3.1](https://github.com/facebook/Rapid/releases/tag/rapid-v2.3.1)
#### 2024-May-12

#### :bug: Bugfixes:
* Various issues with MapRoulette integration:
  * [#1412] Network activity causing performance issues
  * [#1413] Some Maproulette tasks showing up as missing
  * [#1415] `#maproulette` hashtag being applied even when no MapRoulette tasks completed
  * [#1418] Should not show markers for tasks/challenges not-yet-enabled
  * [#1420] Comments shouldn't be required, also should use default comment and sources attached to the challenge

[#1412]: https://github.com/facebook/Rapid/issues/1412
[#1413]: https://github.com/facebook/Rapid/issues/1413
[#1415]: https://github.com/facebook/Rapid/issues/1415
[#1418]: https://github.com/facebook/Rapid/issues/1418
[#1420]: https://github.com/facebook/Rapid/issues/1420


# [2.3.0](https://github.com/facebook/Rapid/releases/tag/rapid-v2.3.0)
#### 2024-May-08

#### :tada: New Features
* [#1386], [#1387] Add support for [WKT geometry](https://en.wikipedia.org/wiki/Well-known_text_representation_of_geometry) in `data=` url parameter
* [#1372], [#1373] Add initial support for viewing [GeoScribble annotations](https://wiki.openstreetmap.org/wiki/GeoScribble)
  * GeoScribble is a new service that allows mappers to take field notes while surveying with the EveryDoor mobile app.
  * Open the "Map Data" pane to enable this new data layer.
* [#1209], [#1351], [#1388] Add support for [Esri Wayback Imagery](https://livingatlas.arcgis.com/wayback/)
  * We added a new background layer called "Esri Wayback" to view historical releases of the Esri World Imagery layer.
  * This background source also has a date picker to help you pick from dates likely to include changes in the current map view.
  * Open the "Background" pane to explore this new feature.
* [#1150], [#1221], [#1369] Add initial integration with [MapRoulette](https://maproulette.org/) challenges
  * You can view active MapRoulette tasks in the current map view, or filter the results by challenge id.
  * After making your edits, select the task and click "I fixed it!", "Can't Complete", "Already Fixed", and "Not an Issue".
  * Remember to save your edits.  Your changeset will automatically include a description about any MapRoulette tasks that you've completed.
  * Open the "Map Data" pane and click "MapRoulette Tasks" to try it out!
* [iD#4954], [#1363] Map Rotation now supported!
  * Use <kbd>Option</kbd>+ click-and-drag or <kbd>Shift</kbd>+Left/Right arrow keys.
  * The `map=` url param now supports a bearing like: `#map=zoom/lat/lng/bearing` (in degrees)
  * There is a new bearing control above the existing zoom buttons that displays a North arrow. You can click this button to return the map back to North-up.
  * We also improved the map navigation content in the walkthrough, built-in help, and keyboard shortcuts screen.

#### :sparkles: Usability & Accessibility
* [#485] Dragging in minimap keeps the view rectangle centered, allowing user to recenter the map easily
* [#920] Treat Control-click on MacOS as a right click
* [#1368] Improve map "nudging" behavior when drawing near the edge of the map
* [iD#7618], [iD#10062] Search OSM Notes by their note ID
* [iD#10000] Prevent paste when OSM Data layer is hidden
* [iD#10127], [iD#10144] Adjust combobox display style

#### :camera: Street-Level
* [#1337], [iD#10135], [iD#10141] Restore Mapillary viewer username and link to viewed image

#### :mortar_board: Walkthrough / Help
* [#1329] Walkthrough should not show any issues about "outdated tags"
* [#1364] Fix walkthrough step to ensure that the user can find the playground description field
* [iD#10215] Remove white background from walkthrough tooltip images

#### :bug: Bugfixes:
* [#1334] Double clicking a line to create a midpoint should not alter the line shape
* [#1405] Photo overlay (Mapillary, Bing, Kartaview) checkboxes not checked when Rapid starts
* [iD#5144], [iD#10066] Fix rounding errors and improve parsing of degree-minute-second search coords
* [iD#9502], [iD#9788], [iD#10089] Allow merging lines when parent relations are ordered differently
* [iD#10065], [iD#10165] Properly encode Wikipedia links containing '?' symbol

#### :earth_asia: Localization
* [iD#9501] Improve localization in Nominatim queries
* [iD#10121] Improve localization of Login popup
* [iD#10123] Add adddress format for New Zealand

#### :hammer: Development
* [#1328] Add more test coverage for core classes
* [#1370] Fix login credentials for OpenStreetMap development environment

#### :popcorn: OSM:
* [id-tagging-schema#1114] Allow `amenity=bicycle_parking` to render as area without `area=yes`


[#485]: https://github.com/facebook/Rapid/issues/485
[#920]: https://github.com/facebook/Rapid/issues/920
[#1150]: https://github.com/facebook/Rapid/issues/1150
[#1209]: https://github.com/facebook/Rapid/issues/1209
[#1221]: https://github.com/facebook/Rapid/issues/1221
[#1328]: https://github.com/facebook/Rapid/issues/1328
[#1329]: https://github.com/facebook/Rapid/issues/1329
[#1334]: https://github.com/facebook/Rapid/issues/1334
[#1337]: https://github.com/facebook/Rapid/issues/1337
[#1351]: https://github.com/facebook/Rapid/issues/1351
[#1363]: https://github.com/facebook/Rapid/issues/1363
[#1364]: https://github.com/facebook/Rapid/issues/1364
[#1368]: https://github.com/facebook/Rapid/issues/1368
[#1369]: https://github.com/facebook/Rapid/issues/1369
[#1370]: https://github.com/facebook/Rapid/issues/1370
[#1372]: https://github.com/facebook/Rapid/issues/1372
[#1373]: https://github.com/facebook/Rapid/issues/1373
[#1386]: https://github.com/facebook/Rapid/issues/1386
[#1387]: https://github.com/facebook/Rapid/issues/1387
[#1388]: https://github.com/facebook/Rapid/issues/1388
[#1405]: https://github.com/facebook/Rapid/issues/1405
[iD#4954]: https://github.com/openstreetmap/iD/issues/4954
[iD#5144]: https://github.com/openstreetmap/iD/issues/5144
[iD#7618]: https://github.com/openstreetmap/iD/issues/7618
[iD#9501]: https://github.com/openstreetmap/iD/pull/9501
[iD#9502]: https://github.com/openstreetmap/iD/issues/9502
[iD#9788]: https://github.com/openstreetmap/iD/issues/9788
[iD#10000]: https://github.com/openstreetmap/iD/pull/10000
[iD#10062]: https://github.com/openstreetmap/iD/pull/10062
[iD#10065]: https://github.com/openstreetmap/iD/issues/10065
[iD#10066]: https://github.com/openstreetmap/iD/pull/10066
[iD#10089]: https://github.com/openstreetmap/iD/pull/10089
[iD#10121]: https://github.com/openstreetmap/iD/pull/10121
[iD#10123]: https://github.com/openstreetmap/iD/pull/10123
[iD#10127]: https://github.com/openstreetmap/iD/pull/10127
[iD#10135]: https://github.com/openstreetmap/iD/issues/10135
[iD#10141]: https://github.com/openstreetmap/iD/pull/10141
[iD#10144]: https://github.com/openstreetmap/iD/pull/10144
[iD#10165]: https://github.com/openstreetmap/iD/pull/10165
[iD#10215]: https://github.com/openstreetmap/iD/pull/10215
[id-tagging-schema#1114]: https://github.com/openstreetmap/id-tagging-schema/issues/1114


# [2.2.5](https://github.com/facebook/Rapid/releases/tag/rapid-v2.2.5)
#### 2024-Feb-09

#### :tada: New Features
* [#1300], [#1309] Add support for Google Open Buildings provided by Esri
* [#1301] Google Open Buildings should not trigger the 'proprietary data' validation

#### :camera: Street-Level
* [#1305], [#928], [iD#10100] Restored Bing Streetside images and data, thanks [@dankarran]!

#### :sparkles: Usability & Accessibility
* [#525] When features are selected, pressing the arrow keys should move the features, not pan the map

#### :hammer: Development
* [#1306] Collect code coverage stats and use Node's built-in test runner for tests that don't need to be run in a browser

#### :bug: Bugfixes:
* [#1321] Overzoom of imagery tiles was generateing unnecessary tile requests
* [#1314] When hovering a relation in the sidebar, apply the highlighting to its members
* [#1312] Fix styling for `highway` combined with `railway=abandoned`
* [#1311] Fix: Right click menu, preset picker, not updated after searching for an entity and jumping to a different part of the map
* [#1304] Fix status display in situations when OSM API is unavailable or rate limited
* [#1303] Fix: "Ignore This Issue" option does nothing
* [#1302], [#1326] Fix impossible oneway validator - Road flagged as unreachable, but it is reachable
* [#1298] Fix ambiguous crossing issue involving inferring the crossing type when tags conflict
* [#1296] Fix: Style regression, water features with `intermittant` tag were displaying as grey, not blue
* [#1128] Restored ability to debug Rapid with a custom conflation server
* [#1120] Fix: "You have made too many edits" warning did not disappear on save

[#525]: https://github.com/facebook/Rapid/issues/525
[#928]: https://github.com/facebook/Rapid/issues/928
[#1120]: https://github.com/facebook/Rapid/issues/1120
[#1128]: https://github.com/facebook/Rapid/issues/1128
[#1296]: https://github.com/facebook/Rapid/issues/1296
[#1298]: https://github.com/facebook/Rapid/issues/1298
[#1300]: https://github.com/facebook/Rapid/issues/1300
[#1301]: https://github.com/facebook/Rapid/issues/1301
[#1302]: https://github.com/facebook/Rapid/issues/1302
[#1303]: https://github.com/facebook/Rapid/issues/1303
[#1304]: https://github.com/facebook/Rapid/issues/1304
[#1305]: https://github.com/facebook/Rapid/issues/1305
[#1306]: https://github.com/facebook/Rapid/issues/1306
[#1309]: https://github.com/facebook/Rapid/issues/1309
[#1311]: https://github.com/facebook/Rapid/issues/1311
[#1312]: https://github.com/facebook/Rapid/issues/1312
[#1314]: https://github.com/facebook/Rapid/issues/1314
[#1321]: https://github.com/facebook/Rapid/issues/1321
[#1326]: https://github.com/facebook/Rapid/issues/1326
[iD#10100]: https://github.com/openstreetmap/iD/pull/10100
[@dankarran]: https://github.com/dankarran


# [2.2.4](https://github.com/facebook/Rapid/releases/tag/rapid-v2.2.4)
#### 2024-Jan-11

#### :bug: Bugfixes:
* [#1287], [#1288] Fix bug: Adding a detected road feature can cause nearby other features to vanish
* [#1292] Fix incorrect tagging after choosing a crossing validation fix where multiple nodes exist along a way

[#1287]: https://github.com/facebook/Rapid/issues/1287
[#1288]: https://github.com/facebook/Rapid/issues/1288
[#1292]: https://github.com/facebook/Rapid/issues/1292


# [2.2.3](https://github.com/facebook/Rapid/releases/tag/rapid-v2.2.3)
#### 2024-Jan-05

#### :bug: Bugfixes:
* [#1265] Autofocus preset search if the user clicked to open the preset pane
* [#1283] Fix display of community index text on post save screen
* [#1284] Marked crossing presets should avoid setting `crossing=yes` if a better tag can be used
* [#1286] Reset scroll of sidebar content when changing selection

[#1265]: https://github.com/facebook/Rapid/issues/1265
[#1283]: https://github.com/facebook/Rapid/issues/1283
[#1284]: https://github.com/facebook/Rapid/issues/1284
[#1286]: https://github.com/facebook/Rapid/issues/1286


# [2.2.2](https://github.com/facebook/Rapid/releases/tag/rapid-v2.2.2)
#### 2024-Jan-02

#### :sparkles: Usability & Accessibility
* [#1259] Add custom icons for marked crossing presets
* [#1269] Restore `surface` main field for crossing presets

#### :bug: Bugfixes:
* [#1270] Don't suggest removing crossing marked as standalone node
* [#1271] Run `actionSyncCrossingTags` after creating a crossing junction
* [#1272] Fix key shortcut display issues in tooltips, also fix issue where '+' key shortcut to zoom in was not working
* [#1273], [#1282] Fix 3D map toggle checkbox

[#1259]: https://github.com/facebook/Rapid/issues/1259
[#1269]: https://github.com/facebook/Rapid/issues/1269
[#1270]: https://github.com/facebook/Rapid/issues/1270
[#1271]: https://github.com/facebook/Rapid/issues/1271
[#1272]: https://github.com/facebook/Rapid/issues/1272
[#1273]: https://github.com/facebook/Rapid/issues/1273
[#1282]: https://github.com/facebook/Rapid/issues/1282


# [2.2.1](https://github.com/facebook/Rapid/releases/tag/rapid-v2.2.1)
#### 2023-Dec-22

#### :sparkles: Usability & Accessibility
* [#1255], [#1261]  Always display the text for keyboard modifier symbols, e.g. "⌘ Cmd", not "⌘"

#### :bug: Bugfixes:
* [#1265], [#1266], [#1267]  Fix bug causing the preset pane to block keyboard shortcuts from being used
* [#1268]  Fix bug causing the `crossing` tags to be overwritten when modifying a connected non-crossing node

[#1255]: https://github.com/facebook/Rapid/issues/1255
[#1261]: https://github.com/facebook/Rapid/issues/1261
[#1265]: https://github.com/facebook/Rapid/issues/1265
[#1266]: https://github.com/facebook/Rapid/issues/1266
[#1267]: https://github.com/facebook/Rapid/issues/1267
[#1268]: https://github.com/facebook/Rapid/issues/1268


# [2.2.0](https://github.com/facebook/Rapid/releases/tag/rapid-v2.2.0)
#### 2023-Dec-20

This release was made possible in part by three hackers from [Major League Hacking](https://mlh.io/): [@RitaDee], [@voscarmv], and [@lauble].
Also, welcome to the dev team [@tannerwuster]!

#### :tada: New Features
* [#1141], [#1260] Added new validation, presets, and code to clean up ambiguous/missing pedestrian crossing way and node data.
* [#1146], [#1182], [#1197] Several new presets added for trees, crossings, and curbs
* [#1154] The Cycle Highway Tags (shift-C) operation now also works with crossing ways (Credit: [@RitaDee])
* [#1068] 3D Map open/closed state is now saved in a `3dmap` url parameter (Credit: [@voscarmv])
* [#iD9998] Show wikidata errors from Osmose
* [#iD9650] Offer to connect sidewalk to minor service roads / driveways without adding `crossing` tags
* [#iD9891] :roller_coaster: Add rendering and presets for `roller_coaster=track`, `roller_coaster=support`, `roller_coaster=station`
* [#iD9633] :bus: Add rendering and presets for `highway=busway`

##### :camera:  Streetview Imagery Improvements:
* [#1149] Mapillary image viewer now displays the compass bearing angle indicator.
* [#551] Streetview imagery is now navigable with keyboard arrow keys.
* [#508] :compass: Panoramic Streetview image pins should now display a bearing viewfield indicator on the map.
* [#1148] :sparkles: Mapillary viewfield angle now narrows/widens as the user zooms in / out.
* [#1139] Updated the KartaView imagery APIs to rely on the new v2 API, eliminating the 404's/ blank images that the layer was displaying

#### :bug: Bugfixes:
* [#858] Undo/Redo now supported while in draw modes
* [#1063] Connecting a crosswalk to an existing highway now creates a crossing node that doesn't need tag upgrading
* [#1103] Fixed a bug that mistakenly removed the most recently created relation from the edit history
* [#1115] Crosswalks that are joined to the map will now receive up-to-date tags
* [#1108] On page load, Rapid should now correctly zoom to the object specified in the URL `id` param
* [#1110] Photo imagery used should now be properly referenced in the changeset tags
* [#1116], [#1112] Validation system should now fire correctly when the user edits, pans, and zooms
* [#1058], [#1121] Changeset comment should now be remembered and reused next time
* [#1124] OSM username isn't escaped properly (Credit: [@RitaDee])
* [#1125], [iD#8758] Connectivity warnings now update as users cause or fix connectivity issues
* [#1126] Clicking 'reload my changes' very quickly should no longer cause a crash/stack trace
* [#1129] The commit message text field should now properly receive focus when the user clicks 'save'
* [#1155] Clicking on a third-party website URL should now work properly
* [#1169], [#1201] Fixed the incorrect Microsoft Building license link
* [#1171] Restored some 'way over waterway' validations
* [#1241] Fix Stamen terrain basemaps imagery layer
* [#1252] Fix styling of railways that include a `service` tag
* [#iD10003] Prevent degenerate ways caused by deleting a corner of a triangle

#### :sparkles: Usability & Accessibility
* [#1240] Support poweruser autofix for "Two points are very close together"
* [#1249], [#1250] Restore custom cursors for hovering and selecting OSM data
* [#iD10007] Sanitize Amazon CloudFront 'signature' values in `imagery_used` changeset tag
* [#iD9995] Fix backspace not working as a keyboard shortcut
* [#iD9912], [#iD9911] Hide unnecessary horizontal scrollbars in hover mode for fields and upload dialog
* [#iD9424] Show route relation colors in lists and comboboxes
* [#iD9817] Don't suggest discardable tags (e.g. `created_by`) in the raw tag editor dropdowns
* [#iD9422] Don't suggest alternate tags (e.g. `alt_name_1`) in the raw tag editor dropdowns

#### :earth_asia: Localization
* [#iD9928] Added address format for Mexico
* [#iD9927] Added address format for South Korea
* [#iD9925] Added address format for Indonesia
* [#iD9685], [#iD9630] Added address format for Phillipines
* [#iD9667] Added address format for Latvia

#### :hammer: Development / Code Improvements
* [#iD9997] Update domain names used to connect to ImproveOSM service
* [#iD9692] Show colors in console when running GitHub actions
* [#1123] Switched clipper to polyclip-ts.
* [#1130] Openstreetmap api switched from `www.openstreetmap.org` to `api.openstreetmap.org`
* [#1156] Modernized the edit system with an extremely large refactor
* [#1162] The Bug template now prompts the submitter to include screenshots / videos. (Credit: [@RitaDee])
* [#1177] The README.md has undergone some formatting improvements (Credit: [@lauble])
* [#1179] The CONTRIBUTING.md has also received extensive edits (Credit: [@voscarmv])

[#508]: https://github.com/facebook/Rapid/issues/508
[#551]: https://github.com/facebook/Rapid/issues/551
[#858]: https://github.com/facebook/Rapid/issues/858
[#1058]: https://github.com/facebook/Rapid/issues/1058
[#1063]: https://github.com/facebook/Rapid/issues/1063
[#1068]: https://github.com/facebook/Rapid/issues/1068
[#1103]: https://github.com/facebook/Rapid/issues/1103
[#1108]: https://github.com/facebook/Rapid/issues/1108
[#1110]: https://github.com/facebook/Rapid/issues/1110
[#1112]: https://github.com/facebook/Rapid/issues/1112
[#1116]: https://github.com/facebook/Rapid/issues/1116
[#1115]: https://github.com/facebook/Rapid/issues/1115
[#1121]: https://github.com/facebook/Rapid/issues/1121
[#1123]: https://github.com/facebook/Rapid/issues/1123
[#1124]: https://github.com/facebook/Rapid/issues/1124
[#1125]: https://github.com/facebook/Rapid/issues/1125
[#1126]: https://github.com/facebook/Rapid/issues/1126
[#1129]: https://github.com/facebook/Rapid/issues/1129
[#1130]: https://github.com/facebook/Rapid/issues/1130
[#1139]: https://github.com/facebook/Rapid/issues/1139
[#1141]: https://github.com/facebook/Rapid/issues/1141
[#1146]: https://github.com/facebook/Rapid/issues/1146
[#1148]: https://github.com/facebook/Rapid/issues/1148
[#1149]: https://github.com/facebook/Rapid/issues/1149
[#1154]: https://github.com/facebook/Rapid/issues/1154
[#1155]: https://github.com/facebook/Rapid/issues/1155
[#1156]: https://github.com/facebook/Rapid/issues/1156
[#1162]: https://github.com/facebook/Rapid/issues/1162
[#1169]: https://github.com/facebook/Rapid/issues/1169
[#1171]: https://github.com/facebook/Rapid/issues/1171
[#1177]: https://github.com/facebook/Rapid/issues/1177
[#1179]: https://github.com/facebook/Rapid/issues/1179
[#1182]: https://github.com/facebook/Rapid/issues/1182
[#1197]: https://github.com/facebook/Rapid/issues/1197
[#1201]: https://github.com/facebook/Rapid/issues/1201
[#1240]: https://github.com/facebook/Rapid/issues/1240
[#1241]: https://github.com/facebook/Rapid/issues/1241
[#1249]: https://github.com/facebook/Rapid/issues/1249
[#1250]: https://github.com/facebook/Rapid/issues/1250
[#1252]: https://github.com/facebook/Rapid/issues/1252
[#1260]: https://github.com/facebook/Rapid/issues/1260
[#iD10007]: https://github.com/openstreetmap/iD/pull/10007
[#iD10003]: https://github.com/openstreetmap/iD/pull/10003
[#iD9998]: https://github.com/openstreetmap/iD/pull/9998
[#iD9997]: https://github.com/openstreetmap/iD/pull/9997
[#iD9995]: https://github.com/openstreetmap/iD/pull/9995
[#iD9928]: https://github.com/openstreetmap/iD/pull/9928
[#iD9927]: https://github.com/openstreetmap/iD/pull/9927
[#iD9925]: https://github.com/openstreetmap/iD/pull/9925
[#iD9912]: https://github.com/openstreetmap/iD/pull/9912
[#iD9911]: https://github.com/openstreetmap/iD/pull/9911
[#iD9891]: https://github.com/openstreetmap/iD/pull/9891
[#iD9817]: https://github.com/openstreetmap/iD/pull/9817
[#iD9692]: https://github.com/openstreetmap/iD/pull/9692
[#iD9685]: https://github.com/openstreetmap/iD/pull/9685
[#iD9667]: https://github.com/openstreetmap/iD/pull/9667
[#iD9650]: https://github.com/openstreetmap/iD/pull/9650
[#iD9633]: https://github.com/openstreetmap/iD/pull/9633
[#iD9630]: https://github.com/openstreetmap/iD/pull/9630
[#iD9424]: https://github.com/openstreetmap/iD/pull/9424
[#iD9422]: https://github.com/openstreetmap/iD/issues/9422
[#iD8758]: https://github.com/openstreetmap/iD/issues/8758

[@RitaDee]: https://github.com/RitaDee
[@lauble]: https://github.com/lauble
[@tannerwuster]: https://github.com/tannerwuster
[@voscarmv]: https://github.com/voscarmv


# [2.1.1](https://github.com/facebook/Rapid/releases/tag/rapid-v2.1.1)
#### 2023-Sep-01

#### :bug: Bugfixes:
* [#1060] Fixed an issue that prevented the 'change count' from restarting at 0 after saving changes.
* [#1062] Added the ability to 'hide' building part borders in the 3D Map.
* [#1067] Fixed an crash bug that allowed large area relations to be considered by the 3D map renderer.
* [#1069] Fixed an issue that caused increment/decrement values in the inspector to be 'NaN'.
* [#1070] Fixed an issue preventing catalog data from being returned while running from inside a HOT task.
* [#1084] Fixed issue with data loss when using entity editor after reset / user saves changes
* [#1085] Prevent password managers from autofilling the fields in the entity editor

[#1060]: https://github.com/facebook/Rapid/issues/1060
[#1062]: https://github.com/facebook/Rapid/issues/1062
[#1067]: https://github.com/facebook/Rapid/issues/1067
[#1069]: https://github.com/facebook/Rapid/issues/1069
[#1070]: https://github.com/facebook/Rapid/issues/1070
[#1084]: https://github.com/facebook/Rapid/issues/1084
[#1085]: https://github.com/facebook/Rapid/issues/1085


# [2.1.0](https://github.com/facebook/Rapid/releases/tag/rapid-v2.1.0)
#### 2023-Aug-28

#### :tada: New Features

New 3D inset Map!
* [#988], [#991], [#994] Added a [MapLibre](https://maplibre.org/)-powered 3D inset map! :office: :bank:

Support vector tiled custom data in [PMTiles](https://protomaps.com/docs/pmtiles) format
* [#1016] Add support for `.pmtiles` vector tiles custom data sources

#### :bug: Bugfixes:
* [#1006], [#1007] Places search has been fixed.
* [#939] Added relation highlighting back!
* [#955] Mapillary imagery pin date/type filters should work once again.
* [#983], [#1004] Wireframe-mode polygons should be interactive once again.
* [#970] Removed the Maxar premium imagery layer.
* [#971] It is no longer possible to draw a degenerate (single-node) way.
* [#972] Nodes in ways that were added to relations should now be clickable once again.
* [#984] Fixed the stitching of streetside image sequences.
* [#987] Fixed the note inspector header icon (cosmetic issue only)
* [#997], [#1014] 'Find my location' should no longer clear the sidebar more than once.
* [#1009] Ways on different layers will no longer be flagged as :warning:s in the validator
* [#1012] Default location for map is out-of-bounds
* [#1018] Waterways should no longer warn about connectivity and completeness
* [#1020] Reinstated dashed-line borders for certain features (barriers, walls, fences, etc)
* [#1025] Overlay imagery now settable in the urlhash
* [#1036] Reinstated Cutting & Embankment styles
* [#1038] Fix missing gesture icons on keyboard shortcuts screen
* [#1050] Fix issue involving saved changes caused by missing original copies of modified ways

#### :hammer: Development / Code Improvements
* [#1053] Include the Rapid favicon in the distribution
* [#964] Add a `rapid:poweruser` changeset tag if the user has been in "poweruser" mode
* [#961] Core refactor:
  * Renamed many 'core' classes to be Systems adopting a 'ThingCategory' (not 'CategoryThing') naming convention:
    * coreContext :fast_forward: Context
    * localizer :fast_forward: LocalizationSystem
    * fileFetcher :fast_forward: DataLoaderSystem
    * rendererFeatures :fast_forward: FilterSystem
    * rendererImagery :fast_forward: ImagerySystem
    * coreHistory :fast_forward: EditSystem
    * coreUploader :fast_forward: UploaderSystem
    * coreRapidContext :fast_forward: RapidSystem
    * rendererPhotos :fast_forward: PhotoSystem
    * urlhash :fast_forward: UrlHashSystem
    * rendererMap :fast_forward: MapSystem
    * 3dMap :fast_forward: Map3dSystem
    * etc...
  * All services have been renamed with 'Service' prefix- e.g. improveOSM :fast_forward: ServiceImproveOsm
  * Core classes and Services now use promises for ensuring dependencies have already started.
  * Converted several more classes/files to ES6 Syntax.
  * Converted use of xhr and d3_fetch helpers to instead use fetch proper for data downloads
  * Refactored tests to keep up with the classes, eventing, download API, and service/systems redo.
  * Fixed several dozen other bugs we discovered as we refactored all the above

[#939]: https://github.com/facebook/Rapid/issues/939
[#955]: https://github.com/facebook/Rapid/issues/955
[#961]: https://github.com/facebook/Rapid/issues/961
[#964]: https://github.com/facebook/Rapid/issues/964
[#970]: https://github.com/facebook/Rapid/issues/970
[#971]: https://github.com/facebook/Rapid/issues/971
[#972]: https://github.com/facebook/Rapid/issues/972
[#983]: https://github.com/facebook/Rapid/issues/983
[#984]: https://github.com/facebook/Rapid/issues/984
[#987]: https://github.com/facebook/Rapid/issues/987
[#988]: https://github.com/facebook/Rapid/issues/988
[#991]: https://github.com/facebook/Rapid/issues/991
[#994]: https://github.com/facebook/Rapid/issues/994
[#997]: https://github.com/facebook/Rapid/issues/997
[#1004]: https://github.com/facebook/Rapid/issues/1004
[#1006]: https://github.com/facebook/Rapid/issues/1006
[#1007]: https://github.com/facebook/Rapid/issues/1007
[#1009]: https://github.com/facebook/Rapid/issues/1009
[#1012]: https://github.com/facebook/Rapid/issues/1012
[#1014]: https://github.com/facebook/Rapid/issues/1014
[#1016]: https://github.com/facebook/Rapid/issues/1016
[#1018]: https://github.com/facebook/Rapid/issues/1018
[#1020]: https://github.com/facebook/Rapid/issues/1020
[#1025]: https://github.com/facebook/Rapid/issues/1025
[#1036]: https://github.com/facebook/Rapid/issues/1036
[#1038]: https://github.com/facebook/Rapid/issues/1038
[#1050]: https://github.com/facebook/Rapid/issues/1050
[#1053]: https://github.com/facebook/Rapid/issues/1053


# [2.0.3](https://github.com/facebook/Rapid/releases/tag/rapid-v2.0.3)
#### 2023-May-01

#### :sparkles: Usability & Accessibility
* [#846] Support Röntgen icons found in id-tagging-schema presets

#### :hammer: Development
* [#925] Change how texture atlases are managed, avoid double fetching icons
* Update Maxar imagery token, bundle latest imagery file

### Bugfixes:
* [#926] Fix issue when changing number of viewfields on a point
* [#921] Fix issue when extracting nodes from lines

[#846]: https://github.com/facebook/Rapid/issues/846
[#921]: https://github.com/facebook/Rapid/issues/921
[#925]: https://github.com/facebook/Rapid/issues/925
[#926]: https://github.com/facebook/Rapid/issues/926


# [2.0.2](https://github.com/facebook/Rapid/releases/tag/rapid-v2.0.2)
#### 2023-Apr-13

#### :sparkles: Usability & Accessibility
* [#792] Improve area filling appearance around sharp angles
* [#866] Make "zoom to selection" work for any selection, not just OSM features
* [#910] Show virtual pins for unlabeled polygons with interesting OSM tags
* Improve bitmapped label appearance

### Bugfixes:
* [#568] Fix texture atlas issues when operating with a WebGL1 context
* [#768] Re-implement the task grid that can be used alongside task manager boundary
* [#863] Fix line snapping / Upgrade to letest version of Pixi and set `eventMode` properties
* [#876] Fix bug causing footer to not appear until the user interacted with the map
* [#913] Fix `numGridSplits` references to use it as a property, not a function
* [#915] Don't draw the scale bar until the map has actually drawn
* [#916] Fix bug in `operationStraighten` when a Relation is used in a multiselection

#### :hammer: Development
* [#500] Remove unused CSS leftover from the SVG renderer

[#500]: https://github.com/facebook/Rapid/issues/500
[#568]: https://github.com/facebook/Rapid/issues/568
[#768]: https://github.com/facebook/Rapid/issues/768
[#792]: https://github.com/facebook/Rapid/issues/792
[#863]: https://github.com/facebook/Rapid/issues/863
[#866]: https://github.com/facebook/Rapid/issues/866
[#876]: https://github.com/facebook/Rapid/issues/876
[#910]: https://github.com/facebook/Rapid/issues/910
[#913]: https://github.com/facebook/Rapid/issues/913
[#915]: https://github.com/facebook/Rapid/issues/915
[#916]: https://github.com/facebook/Rapid/issues/916


# [2.0.1](https://github.com/facebook/Rapid/releases/tag/rapid-v2.0.1)
#### 2023-Apr-04

### Bugfixes:
* [#879] Fix issue where dragging the map cancels drawing mode

[#879]: https://github.com/facebook/Rapid/issues/879



# [2.0.0](https://github.com/facebook/Rapid/releases/tag/rapid-v2.0.0)
#### 2023-Apr-05

#### :tada: Rapid v2.0 Released!

We hope you enjoy the new WebGL-based Rapid!  We've rewritten the rendering code to be 10x faster for most tasks, especially in places that are mapped in a lot of detail. You'll see more features and better labels than before.

Happy Mapping!


# 2.0.0-beta.2
#### 2023-Mar-30

### Bugfixes:
* [#873] Handle duplicate buildings present in Microsoft Buildings dataset
* [#874] Fix for "renderedFeatureIDs not iterable" crash

[#873]: https://github.com/facebook/Rapid/issues/873
[#874]: https://github.com/facebook/Rapid/issues/874


# 2.0.0-beta.1
#### 2023-Mar-29

#### :tada: Beta home stretch
We've been working hard at finishing up the code for the general v2.0 release.

You'll also notice that Rapid has a new logo!

#### :hammer: Development
* [#846] Upgrade presets to id-tagging-schema v6
* Update imagery and update the Mapbox imagery key
* [#853] Create a legacy build for Task Manager compatability

### Bugfixes:
* [#567] Fix Bing Streetside URLs
* [#696] Improvements to the Cycle Highway Tag operation
* [#711] Unable to select "Connect the Features" for lines in Issues dialogue box
* [#719] Avoid snapping lines to the filled edge of a polygon
* [#728] Update all modes to handle undo/redo without crashing
* [#758] Fix various issues when snapping and drawing
* [#771], [#760] Fix reselection of way after dragging a child vertex
* [#772] Put user in move mode when pasting features
* [#776] Handle versioning of Mapillary sequences as more data loads from adjacent tiles
* [#789] Fix surprise hashchanges when entering walkthrough
* [#795] Add feature versioning to ways and polygons in custom data
* [#797] Can't start a line from the most recently drawn line
* [#800] Cleanups in osmose/improveosm/keepright icons, strings, sidebar
* [#807] Line endpoint snapping results in two 'very close nodes' that need to be merged
* [#808], [#763] Improve the code for determining which vertices to show
* [#810] Restore green line styling for ridges
* [#811] Restore distinctive styling for `highway=path` vs `highway=footway`
* [#824] Fix crash in Mapillary Photos Layer - lineStrings.length undefined
* [#827], [#726] Various Improvements to the drawing modes
* [#838] Add a selection behavior when clicking on Mapillary detected objects and signs
* [#840] When points are hidden, also hide "virtual" points for POI polygons
* [#842] Fix missing vertex when hidden features are involved
* [#844] Vertexes where a way connects to itself should be considered a shared node
* [#850] Fix jumpy midpoint dragging
* [#856], [#841], [#680] Allow user to adjust mousewheel behavior, and default to zooming on Windows
* [#880] Avoid showing vertices / midpoints when a line or polygon is too small or simplified
* [iD#9315] Validate crossing aeroways
* [iD#9436] Fix wrong variable used to access tags
* [iD#9454] Bump recent presets from 4 to 6
* [iD#9470] Add India address and phone format
* [iD#9492] Add 4 tags which imply oneway=yes
* [iD#9493] Render sided arrows for features with lifecycle prefixes
* [iD#9499] Send 'Accept-Language' header on Nominatim API calls

[#567]: https://github.com/facebook/Rapid/issues/567
[#680]: https://github.com/facebook/Rapid/issues/680
[#696]: https://github.com/facebook/Rapid/issues/696
[#711]: https://github.com/facebook/Rapid/issues/711
[#719]: https://github.com/facebook/Rapid/issues/719
[#726]: https://github.com/facebook/Rapid/issues/726
[#728]: https://github.com/facebook/Rapid/issues/728
[#758]: https://github.com/facebook/Rapid/issues/758
[#760]: https://github.com/facebook/Rapid/issues/760
[#763]: https://github.com/facebook/Rapid/issues/763
[#771]: https://github.com/facebook/Rapid/issues/771
[#772]: https://github.com/facebook/Rapid/issues/772
[#776]: https://github.com/facebook/Rapid/issues/776
[#789]: https://github.com/facebook/Rapid/issues/789
[#795]: https://github.com/facebook/Rapid/issues/795
[#797]: https://github.com/facebook/Rapid/issues/797
[#800]: https://github.com/facebook/Rapid/issues/800
[#807]: https://github.com/facebook/Rapid/issues/807
[#808]: https://github.com/facebook/Rapid/issues/808
[#810]: https://github.com/facebook/Rapid/issues/810
[#811]: https://github.com/facebook/Rapid/issues/811
[#824]: https://github.com/facebook/Rapid/issues/824
[#827]: https://github.com/facebook/Rapid/issues/827
[#838]: https://github.com/facebook/Rapid/issues/838
[#840]: https://github.com/facebook/Rapid/issues/840
[#841]: https://github.com/facebook/Rapid/issues/841
[#842]: https://github.com/facebook/Rapid/issues/842
[#844]: https://github.com/facebook/Rapid/issues/844
[#846]: https://github.com/facebook/Rapid/issues/846
[#850]: https://github.com/facebook/Rapid/issues/850
[#853]: https://github.com/facebook/Rapid/issues/853
[#856]: https://github.com/facebook/Rapid/issues/856
[#880]: https://github.com/facebook/Rapid/issues/880
[iD#9315]: https://github.com/openstreetmap/iD/issues/9315
[iD#9436]: https://github.com/openstreetmap/iD/issues/9436
[iD#9454]: https://github.com/openstreetmap/iD/issues/9454
[iD#9470]: https://github.com/openstreetmap/iD/issues/9470
[iD#9492]: https://github.com/openstreetmap/iD/issues/9492
[iD#9493]: https://github.com/openstreetmap/iD/issues/9493
[iD#9499]: https://github.com/openstreetmap/iD/issues/9499


# 2.0.0-beta.0
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

[#539]: https://github.com/facebook/Rapid/issues/539
[#679]: https://github.com/facebook/Rapid/issues/679
[#749]: https://github.com/facebook/Rapid/issues/749
[#795]: https://github.com/facebook/Rapid/issues/795


# 2.0.0-alpha3.3
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

[#619]: https://github.com/facebook/Rapid/issues/619
[#635]: https://github.com/facebook/Rapid/issues/635
[#664]: https://github.com/facebook/Rapid/issues/664
[#689]: https://github.com/facebook/Rapid/issues/689
[#691]: https://github.com/facebook/Rapid/issues/691
[#702]: https://github.com/facebook/Rapid/issues/702
[#703]: https://github.com/facebook/Rapid/issues/703
[#704]: https://github.com/facebook/Rapid/issues/704
[#705]: https://github.com/facebook/Rapid/issues/705
[#706]: https://github.com/facebook/Rapid/issues/706
[#707]: https://github.com/facebook/Rapid/issues/707
[#708]: https://github.com/facebook/Rapid/issues/708
[#709]: https://github.com/facebook/Rapid/issues/709
[#717]: https://github.com/facebook/Rapid/issues/717
[#718]: https://github.com/facebook/Rapid/issues/718
[#720]: https://github.com/facebook/Rapid/issues/720


# 2.0.0-alpha3.2

#### 2022-Dec-08

#### :tada: Square, Circularize, and related fixes

We've been hot on the trail of fixing issues with many different edit operations- our renderer wasn't picking them up properly and was therefore displaying the wrong shapes under certain conditions. Rotation, Move, Circularize, and Square operations were all affected. They should be working fine now.

### Bugfixes:
* [#682], [#683] and [#693] Square operation should be working correctly now.
* [#665] Ghost ways should no longer appear.

[#665]: https://github.com/facebook/Rapid/issues/665
[#682]: https://github.com/facebook/Rapid/issues/682
[#683]: https://github.com/facebook/Rapid/issues/683
[#693]: https://github.com/facebook/Rapid/issues/693


# 2.0.0-alpha3.1

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

[#685]: https://github.com/facebook/Rapid/issues/685
[#684]: https://github.com/facebook/Rapid/issues/684
[#699]: https://github.com/facebook/Rapid/issues/699
[#695]: https://github.com/facebook/Rapid/issues/695
[#681]: https://github.com/facebook/Rapid/issues/681
[#687]: https://github.com/facebook/Rapid/issues/687


# 2.0.0-alpha3
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

[#497]: https://github.com/facebook/Rapid/issues/497
[#584]: https://github.com/facebook/Rapid/issues/584
[#492]: https://github.com/facebook/Rapid/issues/492
[#632]: https://github.com/facebook/Rapid/issues/632
[#617]: https://github.com/facebook/Rapid/issues/617
[#502]: https://github.com/facebook/Rapid/issues/502
[#499]: https://github.com/facebook/Rapid/issues/499
[#531]: https://github.com/facebook/Rapid/issues/531
[#538]: https://github.com/facebook/Rapid/issues/538
[#652]: https://github.com/facebook/Rapid/issues/652
[#493]: https://github.com/facebook/Rapid/issues/493
[#495]: https://github.com/facebook/Rapid/issues/495
[#518]: https://github.com/facebook/Rapid/issues/518
[#519]: https://github.com/facebook/Rapid/issues/519
[#521]: https://github.com/facebook/Rapid/issues/521
[#524]: https://github.com/facebook/Rapid/issues/524
[#529]: https://github.com/facebook/Rapid/issues/529
[#554]: https://github.com/facebook/Rapid/issues/554
[#555]: https://github.com/facebook/Rapid/issues/555
[#556]: https://github.com/facebook/Rapid/issues/556
[#558]: https://github.com/facebook/Rapid/issues/558
[#561]: https://github.com/facebook/Rapid/issues/561
[#562]: https://github.com/facebook/Rapid/issues/562
[#563]: https://github.com/facebook/Rapid/issues/563
[#565]: https://github.com/facebook/Rapid/issues/565
[#566]: https://github.com/facebook/Rapid/issues/566
[#569]: https://github.com/facebook/Rapid/issues/569
[#571]: https://github.com/facebook/Rapid/issues/571
[#572]: https://github.com/facebook/Rapid/issues/572
[#580]: https://github.com/facebook/Rapid/issues/580
[#581]: https://github.com/facebook/Rapid/issues/581
[#582]: https://github.com/facebook/Rapid/issues/582
[#586]: https://github.com/facebook/Rapid/issues/586
[#608]: https://github.com/facebook/Rapid/issues/608
[#609]: https://github.com/facebook/Rapid/issues/609
[#620]: https://github.com/facebook/Rapid/issues/620
[#627]: https://github.com/facebook/Rapid/issues/627
[#629]: https://github.com/facebook/Rapid/issues/629
[#630]: https://github.com/facebook/Rapid/issues/630
[#637]: https://github.com/facebook/Rapid/issues/637
[#639]: https://github.com/facebook/Rapid/issues/639
[#646]: https://github.com/facebook/Rapid/issues/646
[#648]: https://github.com/facebook/Rapid/issues/648
[#654]: https://github.com/facebook/Rapid/issues/654
[#660]: https://github.com/facebook/Rapid/issues/660
[#661]: https://github.com/facebook/Rapid/issues/661
[#670]: https://github.com/facebook/Rapid/issues/670


# [1.1.9](https://github.com/facebook/Rapid/releases/tag/rapid-v1.1.9)
##### 2022-May-05

#### :newspaper: News
* We've restricted the use of Rapid and MapWithAI around Ukraine per [request of the OSM Ukrainian Community](https://wiki.openstreetmap.org/wiki/Russian%E2%80%93Ukrainian_war).

#### :tada: New Features
* Use OAuth2 for authentication with OSM API ([#458])

#### :bug: Bugfixes
* Fix selectors in Rapid section of walkthrough
* Fix keyboard shortcuts screen layout ([#456])
* Fix missing data from Esri feature layers when exceeding the max records limit ([#404],[#469])
* Add extra css specificity for lines in Rapid (for use in HOT Task Manager) ([#435])
* Ignore Memorial stolpersteins in close node validation ([iD#9089])
* Consider lifecycle prefixes in tag and preset matching ([iD#8881])
* Improve Background imagery list styling ([iD#8975])
* Replace deprecated `String.prototype.substr()` ([iD#8988])
* Fix Note icon alignment in sidebar ([iD#9019])
* Fix comments in notes overflowing upon hovering ([iD#9074])
* Fix Wikidata field displays `[object Object]` ([iD#9080])
* Fix deferred promise cleanup in validator ([iD#9021])

[#404]: https://github.com/facebook/Rapid/issues/404
[#435]: https://github.com/facebook/Rapid/issues/435
[#456]: https://github.com/facebook/Rapid/issues/456
[#458]: https://github.com/facebook/Rapid/issues/458
[#469]: https://github.com/facebook/Rapid/issues/469
[iD#8881]: https://github.com/openstreetmap/iD/issues/8881
[iD#8975]: https://github.com/openstreetmap/iD/issues/8975
[iD#8988]: https://github.com/openstreetmap/iD/issues/8988
[iD#9019]: https://github.com/openstreetmap/iD/issues/9019
[iD#9021]: https://github.com/openstreetmap/iD/issues/9021
[iD#9074]: https://github.com/openstreetmap/iD/issues/9074
[iD#9080]: https://github.com/openstreetmap/iD/issues/9080
[iD#9089]: https://github.com/openstreetmap/iD/issues/9089


# [1.1.8](https://github.com/facebook/Rapid/releases/tag/rapid-v1.1.8)
##### 2021-Oct-25

#### :tada: New Features
* Add `datasets=` url parameter to specify which Rapid datasets are enabled ([#335])

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

[#322]: https://github.com/facebook/Rapid/issues/322
[#328]: https://github.com/facebook/Rapid/issues/328
[#335]: https://github.com/facebook/Rapid/issues/335
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


# [1.1.7](https://github.com/facebook/Rapid/releases/tag/rapid-v1.1.7)
##### 2021-Aug-30

#### :sparkles: Usability & Accessibility
* Add link button next to website field ([iD#8650])

#### :bug: Bugfixes
* Various fixes for validator involving stale state and detections ([iD#8663], [iD#8655], [#300])
* Fix issue involving shift-clicking and lasso-selecting features ([#299], [#301])
* Fix issue involving copy-paste ([#311])

[#299]: https://github.com/facebook/Rapid/issues/299
[#300]: https://github.com/facebook/Rapid/issues/300
[#301]: https://github.com/facebook/Rapid/issues/301
[#311]: https://github.com/facebook/Rapid/issues/311
[iD#8650]: https://github.com/openstreetmap/iD/issues/8650
[iD#8655]: https://github.com/openstreetmap/iD/issues/8655
[iD#8663]: https://github.com/openstreetmap/iD/issues/8663


# [1.1.6](https://github.com/facebook/Rapid/releases/tag/rapid-v1.1.6)
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


# [1.1.5](https://github.com/facebook/Rapid/releases/tag/rapid-v1.1.5)
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

[#220]: https://github.com/facebook/Rapid/issues/220
[#233]: https://github.com/facebook/Rapid/issues/233
[#234]: https://github.com/facebook/Rapid/issues/234
[#236]: https://github.com/facebook/Rapid/issues/236
[#246]: https://github.com/facebook/Rapid/issues/246
[#257]: https://github.com/facebook/Rapid/issues/257
[#265]: https://github.com/facebook/Rapid/issues/265
[iD#8570]: https://github.com/openstreetmap/iD/issues/8570
[iD#bfb36d5]: https://github.com/openstreetmap/iD/pull/8305/commits/bfb36d572d35271f1a77227d776ebddc7f232ac3


# [1.1.4](https://github.com/facebook/Rapid/releases/tag/rapid-v1.1.4)
##### 2021-May-14
#### :tada: Updates
* Improved search/filtering panel for Esri datasets ([#146], [#216])
* osm-community-index v4 ([iD#8483])

#### :bug: Bugfixes
* Fix bug when adding custom layers ([#204])
* Restore missing icons for Rapid keyboard shortcuts ([#138])
* CrossEditableZoom event firing fix ([iD#8473])
* Fix fallback to English language for Rapid strings ([OMaF#19])

[OMaF#19]: https://github.com/facebookmicrosites/Open-Mapping-At-Facebook/issues/19
[iD#8473]: https://github.com/openstreetmap/iD/issues/8473
[iD#8483]: https://github.com/openstreetmap/iD/issues/8483
[#138]: https://github.com/facebook/Rapid/issues/138
[#146]: https://github.com/facebook/Rapid/issues/146
[#204]: https://github.com/facebook/Rapid/issues/204
[#216]: https://github.com/facebook/Rapid/issues/216


# [1.1.3](https://github.com/facebook/Rapid/releases/tag/rapid-v1.1.3)
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
[#80]: https://github.com/facebook/Rapid/issues/80


# [1.1.2](https://github.com/facebook/Rapid/releases/tag/rapid-v1.1.2)
##### 2021-Mar-09
#### :trumpet: Updates
* This is a 'refresh' release, based off iD version 2.19.6.


# [1.1.1](https://github.com/facebook/Rapid/releases/tag/rapid-v1.1.1)
##### 2021-Jan-15
#### :bug: Bugfixes:
* #195, #196, and #197.

#### :trumpet: Updates
* This is a 'refresh' release, based off iD version 2.19.5.


# [1.1.0](https://github.com/facebook/Rapid/releases/tag/rapid-v1.1.0)
##### 2020-Dec-07
#### :trumpet: New Features!
* This release brings the new [Esri ArcGIS data sets](https://openstreetmap.maps.arcgis.com/home/group.html?id=bdf6c800b3ae453b9db239e03d7c1727#overview) to Rapid!

Read the [FAQ](https://github.com/facebookmicrosites/Open-Mapping-At-Facebook/wiki/Esri-ArcGIS-FAQ) and our engineering [blog post](https://tech.fb.com/osm-ready-data-sets/).

#### :trumpet: Updates
* This release is based off of iD version 2.18.3.
* This release fixes issue #168, which prevented users from editing certain types of ways.


# [1.0.12](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.12)
##### 2020-Sept-11
#### :trumpet: Updates
* This release fixes issue #168, which prevented users from editing certain types of ways.


# [1.0.11](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.11)
##### 2020-Aug-24
#### :trumpet: Updates
* This release fixes issue #158, which prevented some saves from occurring.
* Other fixes: #163, #164.


# [1.0.10](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.10)
##### 2020-Aug-07
#### :trumpet: Updates
* This brings the Rapid code up-to-date with v2.18.4 (issue #139), which adds a lot of new stuff.
* Also add a one-time dialog for the rapid-esri collaboration.
* Finally, fix issue #144.


# [1.0.9](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.9)
##### 2020-Jun-09
#### :trumpet: Updates
* This removes the FB-Maxar imagery layer. We recommend using the the Maxar Premium (Beta) layer instead.


# [1.0.8](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.8)
##### 2020-Mar-30
#### :trumpet: Updates
* This eliminates Rapid's need to contact the facebook.com domain and instead contacts the mapwith.ai domain. This should mean fewer configuration issues for folks using Firefox or similar.


# [1.0.7](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.7)
##### 2020-Feb-18

#### :trumpet: Updates
* This brings the Rapid code up-to-date with v2.17.2, which re-introduces Maxar Imagery.


# [1.0.6](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.6)
##### 2020-Jan-31
#### :trumpet: Updates
* This brings the Rapid code up-to-date with v2.17.1. This also fixes issue #105.


# [1.0.5](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.5)
##### 2019-Dec-12
#### :trumpet: Updates
* This brings the Rapid code up-to-date with v2.17. This fixes issue #92.


# [1.0.4](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.4)
##### 2019-Dec-12

#### :bug: Bugfixes
* Fixed issue #84: https://github.com/facebook/Rapid/issues/84 - With this fix, no more than 50 AI roads or buildings can be added to the map in a single save.

#### :tada: New Features
* Merged with [iD v2.16](https://github.com/openstreetmap/iD/blob/develop/CHANGELOG.md#2160) including support for objects detected in Mapillary images & a visual diff hotkey!


# [1.0.3](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.3)
##### 2019-Nov-25

#### :tada: New Features
This release includes the buildings layer from Microsoft as an enabled feature layer! Read more about it here:
https://blogs.bing.com/maps/2019-09/microsoft-releases-18M-building-footprints-in-uganda-and-tanzania-to-enable-ai-assisted-mapping

For up-to-date availability of roads and buildings, check our continually-updated GeoJSON link here: https://github.com/facebookmicrosites/Open-Mapping-At-Facebook/blob/develop/data/rapid_releases.geojson

#### :sparkles: Usability
* The Rapid button is no longer an AI-roads toggle- instead, a dialog opens allowing you to enable Facebook's road layer, Microsoft's building layer, or nothing at all.


# [1.0.2](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.2)
##### 2019-Oct-14

#### :tada: New Features
* Merged with [iD v2.15.5](https://github.com/openstreetmap/iD/blob/develop/CHANGELOG.md#2155).
* Added a framework for enabling custom features on Rapid.
* Added a custom feature for a halo effect on AI roads that have been added to the map during editing time.

#### :sparkles: Usability
* Added options for drawing 2x2, 3x3, 4x4, 5x5, or 6x6 grids within the task area when working on a TM task with a rectangular shape.


# [1.0.1](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.1)
##### 2019-Jul-31

#### :bug: Bugfixes
* Added hostname to changeset tags.
* Fixed lint errors when running with node 8 and 10.


# [1.0.0](https://github.com/facebook/Rapid/releases/tag/rapid-v1.0.0)
##### 2019-Jul-22

#### :tada: New Features
* Merged with iD v2.15.3. Updated hotkey for hiding OSM data layer to **OPT + W** to stay consistent with iD.
* Added walk-through for working with the **Rapid** button and AI-generated roads.
* Added limit for adding up to 50 AI-generated roads in each mapping session under non-TM mode.

#### :sparkles: Usability
* Added Rapid icon callouts to Rapid hotkeys in the help modal.
* Added automatic tagging of **surface=unpaved** when **highway=track** is set through the **SHIFT + C** hotkey.
* Added differentiation between tag changes and geometry changes when highlighting edited features.

#### :white_check_mark: Validation
* Adjusted validation for Y-shaped connection to flag issues on the excessive nodes around connections.

#### :bug: Bugfixes
* Updated bug report button to point to https://github.com/facebook/Rapid/issues.


# 0.9.0
##### 2019-May-29

#### :tada: New Features
* Added functionalities for working with AI-generated roads from Facebook ML road service.
* Added Facebook Maxar imagery layer.
* Added link to license for using Facebook Map With AI service.
* Added logic for cropping AI-generated roads on task boundaries when working on TM tasks.

#### :sparkles: Usability
* Added Rapid-specific hotkeys:
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
