This file documents efforts toward establishing a public API for Rapid.

## URL parameters

##### Rapid Standalone

Rapid supports several URL parameters. When constructing a URL to a standalone instance
of Rapid (e.g. `https://mapwith.ai/rapid`), the following parameters are available
**in the hash portion of the URL**:

* __`background`__ - The value of the `id` property of the source in Rapid's
  [imagery list](https://github.com/facebook/rapid/blob/main/data/imagery.json),
  or a custom tile URL. A custom URL is specified in the format `custom:<url>`,
  where the URL can contain the standard tile URL placeholders `{x}`, `{y}` and
  `{z}`/`{zoom}`, `{ty}` for flipped TMS-style Y coordinates, and `{switch:a,b,c}` for
  DNS multiplexing.<br/>
  _Example:_ `background=custom:https://{switch:a,b,c}.tile.openstreetmap.org/{zoom}/{x}/{y}.png`
* __`comment`__ - Prefills the changeset comment. Pass a url encoded string.<br/>
  _Example:_ `comment=CAR%20crisis%2C%20refugee%20areas%20in%20Cameroon`
* __`datasets`__ - A comma-separated list of dataset IDs to enable<br/>
  _Example:_ `datasets=fbRoads,msBuildings,e75b56f13b404d7d8b47ef8be1c619ec`
* __`disable_features`__ - Disables features in the list.<br/>
  _Example:_ `disable_features=water,service_roads,points,paths,boundaries`<br/>
  _Available features:_ `points`, `traffic_roads`, `service_roads`, `paths`, `buildings`, `building_parts`, `indoor`, `landuse`,
  `boundaries`, `water`, `rail`, `pistes`, `aerialways`, `power`, `past_future`, `others`
* __`gpx`__ - A custom URL for loading a gpx track.  Specifying a `gpx` parameter will
  automatically enable the gpx layer for display.<br/>
  _Example:_ `gpx=https://tasks.hotosm.org/project/592/task/16.gpx`
* __`hashtags`__ - Prefills the changeset hashtags.  Pass a url encoded list of event
  hashtags separated by commas, semicolons, or spaces.  Leading '#' symbols are
  optional and will be added automatically. (Note that hashtag-like strings are
  automatically detected in the `comment`).<br/>
  _Example:_ `hashtags=%23hotosm-task-592,%23MissingMaps`
* __`id`__ - The character 'n', 'w', or 'r', followed by the OSM ID of a node, way or relation, respectively. Selects the specified entity, and, unless a `map` parameter is also provided, centers the map on it.<br/>
  _Example:_ `id=n1207480649`
* __`locale`__ - A code specifying the localization to use, affecting the language, layout, and keyboard shortcuts. Multiple codes may be specified in order of preference. The first valid code will be the locale, while the rest will be used as fallbacks if certain text hasn't been translated. The default locale preferences are set by the browser.<br/>
  _Example:_ `locale=ja`, `locale=pt-BR`, `locale=nl,fr,de`<br/>
  _Available values:_ Any of the [supported locales](https://github.com/facebook/rapid/tree/main/dist/locales).
* __`map`__ - A slash-separated `zoom/latitude/longitude`.<br/>
  _Example:_ `map=20.00/38.90085/-77.02271`
* __`offset`__ - Background imagery alignment offset in meters, formatted as `east,north`.<br/>
  _Example:_ `offset=-10,5`
* __`photo_overlay`__ - The street-level photo overlay layers to enable.<br/>
  _Example:_ `photo_overlay=streetside,mapillary,kartaview`<br/>
  _Available values:_ `streetside` (Microsoft Bing), `mapillary`, `mapillary-signs`, `mapillary-map-features`, `kartaview`
* __`photo_dates`__ - The range of capture dates by which to filter street-level photos. Dates are given in YYYY-MM-DD format and separated by `_`. One-sided ranges are supported.<br/>
  _Example:_ `photo_dates=2019-01-01_2020-12-31`, `photo_dates=2019-01-01_`, `photo_dates=_2020-12-31`<br/>
* __`photo_username`__ - The Mapillary or KartaView username by which to filter street-level photos. Multiple comma-separated usernames are supported.<br/>
  _Example:_ `photo_user=quincylvania`, `photo_user=quincylvania,chrisbeddow`<br/>
* __`photo`__ - The service and ID of the street-level photo to show.<br/>
  _Example:_ `photo=streetside/718514589`<br/>
  _Available prefixes:_ `streetside/`, `mapillary/`, `kartaview/`
* __`presets`__ - A comma-separated list of preset IDs. These will be the only presets the user may select.<br/>
  _Example:_ `presets=building,highway/residential,highway/unclassified`
* __`rtl=true`__ - Force Rapid into right-to-left mode (useful for testing).
* __`source`__ - Prefills the changeset source. Pass a url encoded string.<br/>
  _Example:_ `source=Bing%3BMapillary`
* __`validationDisable`__ - The issues identified by these types/subtypes will be disabled (i.e. Issues will not be shown at all). Each parameter value should contain a urlencoded, comma-separated list of type/subtype match rules.  An asterisk `*` may be used as a wildcard.<br/>
  _Example:_ `validationDisable=crossing_ways/highway*,crossing_ways/tunnel*`
* __`validationWarning`__ - The issues identified by these types/subtypes will be treated as warnings (i.e. Issues will be surfaced to the user but not block changeset upload). Each parameter value should contain a urlencoded, comma-separated list of type/subtype match rules.  An asterisk `*` may be used as a wildcard.<br/>
  _Example:_ `validationWarning=crossing_ways/highway*,crossing_ways/tunnel*`
* __`validationError`__ - The issues identified by these types/subtypes will be treated as errors (i.e. Issues will be surfaced to the user but will block changeset upload). Each parameter value should contain a urlencoded, comma-separated list of type/subtype match rules.  An asterisk `*` may be used as a wildcard.<br/>
  _Example:_ `validationError=crossing_ways/highway*,crossing_ways/tunnel*`
* __`walkthrough=true`__ - Start the walkthrough automatically


## Customized Deployments

Rapid may be used to edit maps in a non-OpenStreetMap environment.  This requires
certain parts of the Rapid code to be replaced at runtime by custom code or data.

Rapid is written in a modular style and bundled with [rollup.js](http://rollupjs.org/),
which makes hot code replacement tricky.  (ES6 module exports are
[immutable live bindings](http://www.2ality.com/2015/07/es6-module-exports.html)).
Because of this, the parts of Rapid which are designed for customization are exported
as live bound objects that can be overridden at runtime _before initializing the Rapid context_.

### Services

The `Rapid.services` object includes code that talks to other web services.

To replace the OSM service with a custom service that exactly mimics the default OSM service:
```js
Rapid.services.osm = serviceMyOSM;
```

Some services may be removed entirely.  For example, to remove the Mapillary service:
```js
Rapid.services.mapillary = undefined;
// or
delete Rapid.services.mapillary;
```


### Background Imagery

Rapid's background imagery database is stored in the `Rapid.fileFetcher.cache().imagery` array and can be
overridden or modified prior to creating the Rapid context.

Note that the "None" and "Custom" options will always be shown in the list.

To remove all imagery from Rapid:
```js
Rapid.fileFetcher.cache().imagery = [];
```

To replace all imagery with a single source:
```js
Rapid.fileFetcher.cache().imagery = [{
    "id": "ExampleImagery",
    "name": "My Imagery",
    "type": "tms",
    "template": "http://{switch:a,b,c}.tiles.example.com/{z}/{x}/{y}.png"
}];
```

Each imagery source should have the following properties:
* `id` - Unique identifier for this source (also used as a url parameter)
* `name` - Display name for the source
* `type` - Source type, currently only `tms` is supported
* `template` - Url template, valid replacement tokens include:
  * `{z}`, `{x}`, `{y}` - for Z/X/Y scheme
  * `{-y}` or `{ty}` - for flipped Y
  * `{u}` - for quadtile scheme
  * `{switch:a,b,c}` - for parts of the url that can be cycled for connection parallelization

Optional properties:
* `description` - A longer source description which, if included, will be displayed in a popup when viewing the background imagery list
* `overlay` - If `true`, this is an overlay layer (a transparent layer rendered above base imagery layer). Defaults to `false`
* `zoomExtent` - Allowable min and max zoom levels, defaults to `[0, 22]`
* `polygon` - Array of coordinate rings within which imagery is valid.  If omitted, imagery is assumed to be valid worldwide
* `overzoom` - Can this imagery be scaled up when zooming in beyond the max zoom?  Defaults to `true`
* `terms_url` - Url to link to when displaying the imagery terms
* `terms_html` - Html content to display in the imagery terms
* `terms_text` - Text content to display in the imagery terms
* `best` - If set to `true`, this imagery is considered "better than Bing" and may be chosen by default when Rapid starts.  Will display with a star in the background imagery list.  Defaults to `false`

For more details about the `Rapid.fileFetcher.cache().imagery` structure, see
[`update_imagery.js`](https://github.com/facebook/rapid/blob/main/scripts/update_imagery.js).


### Presets

Rapid supports presets that conform to the [iD tagging schema](https://github.com/openstreetmap/id-tagging-schema).

Rapid's preset database is stored in the `Rapid.fileFetcher.cache().presets` object and can be overridden
or modified prior to creating the Rapid context.

To add a new preset to Rapid's existing preset database.
```js
Rapid.fileFetcher.cache().presets.presets["aerialway/zipline"] = {
    geometry: ["line"],
    fields: ["incline"],
    tags: { "aerialway": "zip_line" },
    name: "Zipline"
};
```

To completely replace Rapid's default presets with your own:
```js
Rapid.fileFetcher.cache().presets = myPresets;
```

To run Rapid with the minimal set of presets that only match basic geometry types:
```js
Rapid.fileFetcher.cache().presets = {
    presets: {
        "area": {
            "name": "Area",
            "tags": {},
            "geometry": ["area"]
        },
        "line": {
            "name": "Line",
            "tags": {},
            "geometry": ["line"]
        },
        "point": {
            "name": "Point",
            "tags": {},
            "geometry": ["point"]
        },
        "vertex": {
            "name": "Vertex",
            "tags": {},
            "geometry": ["vertex"]
        },
        "relation": {
            "name": "Relation",
            "tags": {},
            "geometry": ["relation"]
        }
    }
};
```


### Custom Presets

Rapid supports deployments which use a custom set of presets. You can supply presets via
the `presets` accessor:

```js
var id = Rapid.coreContext().presets({
    presets: { ... },
    fields: { ... },
    defaults: { ... },
    categories: { ... }
});
```

All four parts (presets, fields, defaults, and categories) must be supplied. In addition,
several base presets and fields must be included.

Basic geometric presets must be included so that every feature matches at least one preset.
For example:

```js
"area": {
    "name": "Area",
    "tags": {},
    "geometry": ["area"],
    "matchScore": 0.1
},
"line": {
    "name": "Line",
    "tags": {},
    "geometry": ["line"],
    "matchScore": 0.1
},
"point": {
    "name": "Point",
    "tags": {},
    "geometry": ["point", "vertex"],
    "matchScore": 0.1
},
"relation": {
    "name": "Relation",
    "tags": {},
    "geometry": ["relation"],
    "matchScore": 0.1
}
```

A "name" field must be included:

```js
"name": {
    "key": "name",
    "type": "localized",
    "label": "Name",
    "placeholder": "Common name (if any)"
}
```