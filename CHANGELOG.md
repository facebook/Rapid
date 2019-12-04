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
