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
##### 2020-Dec-7
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