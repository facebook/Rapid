# Color-Style System Documentation

## Rapid Colors

### Initial Color Approach
As at [Rapid v2.2.5](https://github.com/facebook/Rapid/releases/tag/rapid-v2.2.5), there were four (4) classes of color definition: 
1. Colors defined under a name in `StyleSystem.js`
2. Colors defined by direct HEX value in `StyleSystem.js`
3. Colors defined by direct HEX value in `RapidSystem.js`
4. Colors rendered from the map satellite imagery

Ideally, there would be a central definition of each color which is the same across the Rapid application. 
Before diving into the proposed solution to this problem, each class of color definition will be described to provide suitable context.

#### 1. Named Color Definition
These are the colors defined as parts of key-value pairs in `this.STYLE_DECLATATIONS` object in `/modules/core/StyleSystem.js`, where the key is a named color e.g. 'red', 'blue', 'green' (see the code block below).

```JS
red: {
    fill: { color: 0xe06e5f, alpha: 0.3 }   // rgb(224, 110, 95)
}
```

There are **12** defined "colors", which are referenced **63** times in total by `this.STYLE_SELECTORS`; this property of the `StyleSystem` class maps feature tags to style declarations (see the code block below).

```JS
building: {
    '*': 'red'
}
```

An issue with this particular definition system is that this color definition includes more than just the `color` property (see the first code block in this section). It is also specifies an `alpha` value and is encased in an object which specifies the `fill` property of a map feature. 

#### 2. Direct HEX Color Definition
These colors are also defined as parts of key-value pairs in `this.STYLE_DECLATATIONS` object in `/modules/core/StyleSystem.js`. The difference comes in the nonuse of named colors as keys; rather [OSM tags](https://wiki.openstreetmap.org/wiki/Tags) are used (see the code block below).

```JS
primary: {
    casing: { width: 10, color: 0x70372f },
    stroke: { width: 8, color: 0xf99806 }
}
```

There are **30** distinct HEX codes, which are referenced **75** times in total by `this.STYLE_DECLARATIONS` AND the `styleMatch()` function. Usage in `this.STYLE_DECLARATIONS`, as seen in the code block above, is the 

With this color definition system, only the `color` property has anything to do with a color definition; thus, it does not have the same problem definition type #1 has of combining other style definition into color definition. However, there are two issues with the use of direct HEX code usage:
* Due to the repitition of very specific strings, it is error-prone and inefficient for refactoring.
* There are overlaps in the explicitly-defined HEX codes and `color` property values which have already been specified in named color definitions. For instance, the `green.fill.color` is assigned to `0x8cd05f` but this HEX code is also explicitly repeated in five (5) `this.STYLE_DECLARATION` objects such as `amenity: fountain` and `natural: water`.

#### 3. Rapid Color Definition
The two defintions above cover the colors of *most* of [OpenStreetMap](https://en.wikipedia.org/wiki/OpenStreetMap)'s features - Points, Lines and Areas - which are rendered with [Pixi.js](https://pixijs.com/). Rapid colors are used when rendering Rapid features; these are the AI-generated OpenStreetMap features based on [Facebook Roads](https://github.com/facebookmicrosites/Open-Mapping-At-Facebook) and [Microsoft Buildings](https://github.com/microsoft/GlobalMLBuildingFootprints).

Rapid colors are strings containing HEX codes which are elements in an array called `RAPID_COLORS`. An issue identified with this particular system is its redundancy; there are **10** Rapid colors but one of them is assigned to a constant again outside the array (specifically, the default Rapid color, `RAPID_MAGENTA`). This will be addressed in the "Future Works" section, as the proposed color system does NOT cover these colors due to the fact that they are already user-defined.

#### 4. Map Colors
These are the colors which show in the satellite imagery rendered by WebGL which forms the basis of the map. These colors are NOT within the control of Rapid developers but are important to consider when thinking about topics like color vision deficiencies.


### Current Color Approach
#### System Aims
1. Centralize all color definitions used within the Rapid codebase
2. Enable efficient and error-resistant HEX code editing
3. Clearly separate color and style definition

***NOTE**: This color system only takes care of the first two types of colors in Rapid only: named colors and directly-defined colors.*

#### System Organization
* The colors are grouped by well-known color names such as 'red', 'green'
* There are **11** color groups; these color groups are arranged in ROYGBIV order followed by neutral tones: `brown`, `tan`, `white`, `black` and `grey`
* A color is defined in the format `<color-group>-<number>` e.g. `red-3`, `blue-4`
  * If a color's number is `0`, that means that it is the only one in its group e.g. `white-0`, `black-0`
  * For numbers `1` and above, the lower the number, the brighter/paler the color is

#### (Proposed) Color System
<table style="width:100%; max-width: 600px; min-width:400px">
<tr>
<td>

![#e06e5f](https://placehold.co/20x20/e06e5f/e06e5f.png) `red-1` <br>
![#e06d5f](https://placehold.co/15x15/e06d5f/e06d5f.png) `red-2` <br>
![#dd2f22](https://placehold.co/15x15/dd2f22/dd2f22.png) `red-3` <br>
![#70372f](https://placehold.co/15x15/70372f/70372f.png) `red-4` <br>
![#d6881a](https://placehold.co/15x15/d6881a/d6881a.png) `orange-1` <br>
![#f99806](https://placehold.co/15x15/f99806/f99806.png) `orange-2` <br>
![#fc6c14](https://placehold.co/15x15/fc6c14/fc6c14.png) `orange-3` <br>
![#fff9b3](https://placehold.co/15x15/fff9b3/fff9b3.png) `yellow-1` <br>
![#ffff94](https://placehold.co/15x15/ffff94/ffff94.png) `yellow-2` <br>
![#ffff00](https://placehold.co/15x15/ffff00/ffff00.png) `yellow-3` <br>
![#f3f312](https://placehold.co/15x15/f3f312/f3f312.png) `yellow-4` <br>
![#c4be19](https://placehold.co/15x15/c4be19/c4be19.png) `yellow-5` <br>
![#99e1aa](https://placehold.co/15x15/99e1aa/99e1aa.png) `green-1` <br>

</td>

<td>

![#b0e298](https://placehold.co/15x15/b0e298/b0e298.png) `green-2` <br>
![#8cd05f](https://placehold.co/15x15/8cd05f/8cd05f.png) `green-3` <br>
![#81d25c](https://placehold.co/15x15/81d25c/81d25c.png) `green-4` <br>
![#bee83f](https://placehold.co/15x15/bee83f/bee83f.png) `green-5` <br>
![#77dddd](https://placehold.co/15x15/77dddd/77dddd.png) `blue-1` <br>
![#77d4de](https://placehold.co/15x15/77d4de/77d4de.png) `blue-2` <br>
![#82b5fe](https://placehold.co/15x15/82b5fe/82b5fe.png) `blue-3` <br>
![#58a9ed](https://placehold.co/15x15/58a9ed/58a9ed.png) `blue-4` <br>
![#e3a4f5](https://placehold.co/15x15/e3a4f5/e3a4f5.png) `pink-1` <br>
![#cf2081](https://placehold.co/15x15/cf2081/cf2081.png) `pink-2` <br>
![#998888](https://placehold.co/15x15/998888/998888.png) `brown-1` <br>
![#776a6a](https://placehold.co/15x15/776a6a/776a6a.png) `brown-2` <br>
![#746f6f](https://placehold.co/15x15/746f6f/746f6f.png) `brown-3` <br>

</td>

<td>


![#4c4444](https://placehold.co/15x15/4c4444/4c4444.png) `brown-4` <br>
![#f5dcba](https://placehold.co/15x15/f5dcba/f5dcba.png) `tan-1` <br>
![#ddccaa](https://placehold.co/15x15/ddccaa/ddccaa.png) `tan-2` <br>
![#c5b59f](https://placehold.co/15x15/c5b59f/c5b59f.png) `tan-3` <br>
![#ffffff](https://placehold.co/15x15/ffffff/ffffff.png) `white-0` <br>
![#000000](https://placehold.co/15x15/000000/000000.png) `black-0` <br>
![#eeeeee](https://placehold.co/15x15/eeeeee/eeeeee.png) `gray-1` <br>
![#dddddd](https://placehold.co/15x15/dddddd/dddddd.png) `gray-2` <br>
![#cccccc](https://placehold.co/15x15/cccccc/cccccc.png) `gray-3` <br>
![#aaaaaa](https://placehold.co/15x15/aaaaaa/aaaaaa.png) `gray-4` <br>
![#8c8c8c](https://placehold.co/15x15/8c8c8c/8c8c8c.png) `gray-5` <br>
![#555555](https://placehold.co/15x15/555555/555555.png) `gray-6` <br>
![#444444](https://placehold.co/15x15/444444/444444.png) `gray-7` <br>

</td>

</tr>
</table>

#### Relevant Refactoring
To accomodate for the changes to the application, certain things were changed:
1. The `/data/color_schemes.json` file was minified and added to the file system of Rapid in `/scripts/build_data.js` and `/modules/core/DataLoaderSystem.js`, respectively
2. `DataLoaderSystem` is added as a dependency of `StyleSystem`
3. Variables to hold the default color scheme, current color scheme and all color schemes were created and added the the constructor of `StyleSystem`
4. In the `startAsync()` function, `DataLoaderSystem` is used to fetch the color schemes from the `/data/` folder
5. A helper function called `getHexColorCode()` was added to `StyleSystem` to get the HEX color code based on the current color scheme selected. This function is used severally in the `styleMatch()` function
6. All references to colors through named and directly-defined colors in `this.STYLE_DECLARATIONS` were renamed to match the new system

### Adding New Color Schemes
There are several situations in which a developer may want to change the specific colors used to render features on the map e.g. to ensure colorblind accessibility. The proposed system also takes into consideration the ease with which developers can add a new color scheme. 

1. Identify the specific colors you want to redefine
   
2. Identify the new HEX codes you want to assign to each new color
   
3. Navigate to `/data/color_schemes.json`
   
4. Add a key-value pair for the new color scheme to the document object in the following format:
   ```
   "<new_color_scheme_name>": {}
   ```
    ***NOTE**: The convention for this system is to use [snake_case](https://developer.mozilla.org/en-US/docs/Glossary/Snake_case#:~:text=Snake%20case%20is%20a%20way,the%20reader%20of%20its%20appearance.) when naming your new color scheme.*
   
5. Add the colors with new definitions (along with said definitions) in key-value pairs to the newly created object in the following format:
   ```
   "<color>": "<new_HEX_code>"
   ```

6. Navigate to `/data/core.yaml`
   
7. In the `en` > `preferences` > `color_selection` section, add the name of the color scheme you've just created as well as how you want the color scheme to be named in the Preferences pane dropdown in the following format
    ```
   <new_color_scheme_name>: <dropdown_name>
   ```
    * Ensure that the name you specified in `/data/color_schemes.json` matches the name you refer to it with here
    * Ensure that neither `<new_color_scheme_name>` and `<dropdown_name>` are NOT surrounded in quotation marks
    * `<dropdown_name>`remember that  is case-sensitive
   
8.  Run `npm run all` jn the terminal to re-build the application with the new color scheme you've just added
   
9.  Run `npm run quickstart` in the terminal to start the application and look at your new color scheme in action!


Here is an example of 
```JSON
{
    "colorblind_ibm": {
        "red-3":    "0x648fff",
        "red-4":    "0x785ef0",
        "orange-1": "0xfe6100",
        "yellow-2": "0xffb000"
    }
}
```

***NOTE**: You will need to rerun `npm run all` anytime you make changes to any file in the `/data/` folder to see the changes in the live application.*
   

## Rapid Styling
