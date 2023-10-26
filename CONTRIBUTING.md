# Contributing to Rapid

## Pull Requests
We actively welcome your pull requests.

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. If you haven't already, complete the Contributor License Agreement ("CLA").

### Forking, cloning and running Rapid
- Make sure to use the latest `node` with something like  `nvm install node`
- Run `npm run all`
- Run `npm run quickstart` to start the server

### Debugging and testing
- In VSCode go to Run>Add Configuration... and select Launch Chrome
- Examples of breakpoints
- Conditional breakpoints
- Some interesting files to break (init, etc)

#### Code walkthrough

Top-level Rapid Directories: 
`css`: pretty self-explanatory, just contains our .css for styling things like the sidebars, top bars, buttons, etc. Side note: there is no .css 'inside' the map istelf- that's all styled using webGL. 
`data`: static data files that define things like the imagery, data formats, language resources, and walkthrough data. 
`dist`: the folder that all the built artifacts get served from. 
`docs`: This folder gets filled whenever you run `npm run doc`. ( <@637767012415963173> -> For your doc writing endeavors!)
`modules`: Where most of the real code lives. 
`svg`: where all the svg icons live- anytime you see an icon in the map, or in the sidebars/UI- it comes from here!

Now, diving into `modules` : This is where most of our chat took place. Module subdirectories are: 
`actions`: Discrete modifications to the map state- changing tags, moving a node, rotating a shape, scaling a polygon, these are all 'actions'.  Actions are only fired when the user changes the map. 
`behaviors`: reusable bits of functionality that can apply to different modes (more on modes in a second). Behaviors include Drag, Draw, Hover, Nudging, Select, and Paste.
`core`: You probably won't have to modify `core` much- but it's where a lot of our `Systems` live. Systems are fundamental building blocks of Rapid, and they're a whole other topic. For example, the EditSystem is where all the edits to the map are handled and kept track of, and the UrlHashSystem keeps track of any changes/updates to the URL in the url bar, and the MapSystem is what sets up the Map and starts the webGL 
renderer going. 
`geo`: geospatial / geometric code used for transforming map entities. Most of this code now lives in an SDK called the `rapid-sdk`, which you will see referenced throughout. Need to calculate the center of a bunch of geometric points? the rapid-sdk has code for that. 
`modes`: These describe what the user is doing at the moment- they may be browsing, selecting, drawing a polygon, saving, or dragging a node.
`operations` are for discrete edits the map- using a hotkey to flip a polygon upside down, or right-clicking a square entity and selecting 'circularize' are two different operations. Right clicking an entity on the map will show you many operations that are appropriate for that entity. 
`osm`: This is where the osm data model is defined: ways, nodes, tags, etc. Any time your code is dealing with node or way information, it's using the code from thos folder.

### Updating API documentation
- run `npm run docs`

## Contributor License Agreement ("CLA")
In order to accept your pull request, we need you to submit a CLA. You only need
to do this once to work on any of Facebook's open source projects.

Complete your CLA here: <https://code.facebook.com/cla>

## Issues
We use GitHub issues to track bugs and feature requests. In case of bug reports, please ensure your description is clear and has sufficient instructions for reproducing the bugs.

## License
By contributing to Rapid, you agree that your contributions will be licensed under the [LICENSE file](LICENSE.md).