# [1.1.1](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.1.1)
#### 2021-Jan-15th
#### :bug: Bugfixes:
#195, #196, and #197.
#### :trumpet:
This is a 'refresh' release, based off iD version 2.19.5.

# [1.1.0](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.1.0)
#### 2020-Dec-7th
#### :trumpet: New Features!
This release brings the new [Esri ArcGIS data sets](https://openstreetmap.maps.arcgis.com/home/group.html?id=bdf6c800b3ae453b9db239e03d7c1727#overview) to RapiD!

Read the [FAQ] (https://github.com/facebookmicrosites/Open-Mapping-At-Facebook/wiki/Esri-ArcGIS-FAQ) and our engineering [blog post] (https://tech.fb.com/osm-ready-data-sets/).

This release is based off of iD version 2.18.3.
#### :trumpet: Updates
This release fixes issue #168, which prevented users from editing certain types of ways.

# [1.0.12](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.12)
#### 2020-Sept-11th
#### :trumpet: Updates
This release fixes issue #168, which prevented users from editing certain types of ways.

# [1.0.11](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.11)
#### 2020-Aug-24th
#### :trumpet: Updates
This release fixes issue #158, which prevented saves from occurring. Other fixes: #163 and #164.

# [1.0.10](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.10)
#### 2020-Aug-07th
#### :trumpet: Updates
This brings the RapiD code up-to-date with v2.18.4 (issue #139), which adds a lot of new stuff. Also add a one-time dialog for the rapid-esri collaboration. Finally, fix issue #144.

# [1.0.9](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.9)
#### 2020-Jun-09th
#### :trumpet: Updates
This removes the FB-Maxar imagery layer. We recommend using the the Maxar Premium (Beta) layer instead.

# [1.0.8](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.8)
#### 2020-Mar-30th
#### :trumpet: Updates
This eliminates RapiD's need to contact the facebook.com domain and instead contacts the mapwith.ai domain. This should mean fewer configuration issues for folks using Firefox or similar.

# [1.0.7](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.7)
##### 2020-Feb-18

#### :trumpet: Updates
This brings the RapiD code up-to-date with v2.17.2, which re-introduces Maxar Imagery.


# [1.0.6](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.6)
##### 2020-Jan-31

#### :trumpet: Updates
This brings the RapiD code up-to-date with v2.17.1. This also fixes issue #105.

# [1.0.5](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.5)
##### 2019-Dec-12

#### :trumpet: Updates
This brings the RapiD code up-to-date with v2.17. This fixes issue #92.

# [1.0.4](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.4)
##### 2019-Dec-12

#### :bug: Bugfixes
Fixed issue #84: https://github.com/facebookincubator/RapiD/issues/84 - With this fix, no more than 50 AI roads or buildings can be added to the map in a single save.

#### :tada: New Features
Merged with [iD v2.16](https://github.com/openstreetmap/iD/blob/develop/CHANGELOG.md#2160) including support for objects detected in Mapillary images & a visual diff hotkey!


# [1.0.3](https://github.com/facebookincubator/RapiD/releases/tag/rapid-v1.0.3)
##### 2019-Nov-25

#### :tada: New Features
This release includes the buildings layer from Microsoft as an enabled feature layer! Read more about it here:
https://blogs.bing.com/maps/2019-09/microsoft-releases-18M-building-footprints-in-uganda-and-tanzania-to-enable-ai-assisted-mapping

For up-to-date availability of roads and buildings, check our continually-updated GeoJSON link here: https://github.com/facebookmicrosites/Open-Mapping-At-Facebook/blob/develop/data/rapid_releases.geojson


#### :sparkles: Usability
The RapiD button is no longer an AI-roads toggle- instead, a dialog opens allowing you to enable Facebook's road layer, Microsoft's building layer, or nothing at all.

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