These folders contain example code to help you learn how to integrate Rapid editor into your project.

### `latest/`

This example demonstrates how to load the latest published-to-npm release of Rapid from the JSDelivr CDN. <br/>
See JSDelivr docs:  https://www.jsdelivr.com/documentation

This method can allow your project to always run the latest Rapid code without needing to install updates! <br/>
Copy this file to your own HTTP server, or use the code below as the basis for embedding Rapid in your project. <br/>

Live link: http://rapideditor.org/canary/examples/latest/latest.html <br/>
Or `npm run start` then run locally: http://127.0.0.1:8080/dist/examples/latest/latest.html <br/>


### `iframe/`

This example demonstrates how to load and interact with Rapid in an `iframe`.<br/>
https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe <br/>
https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy <br/>

Because of browser's Same Origin policy, the parent and child files should be served from the same server. <br/>
The child page *can* fetch the latest published Rapid bundle from a CDN, like demonstrated in `latest` example above. <br/>

The parent and child will each have their own `window` and `document`. <br/>

Once the Rapid script has been loaded in the child, and a Rapid context created,
the Rapid Context should be saved somewhere that the parent code can find it.

For example: <br/>
in child `script.onload`:   `window.rapidContext = context;` <br/>
in parent `iframe.onload`:  `window.rapidContext = iframe.contentWindow.rapidContext;` <br/>

This example demonstrates:
* accessing Rapid context in a child iframe
* accessing Rapid subsystems, to read properties and call functions
* listenting to events emitted from Rapid systems
* parent and child url hashes being kept in sync

Live link: http://rapideditor.org/canary/examples/iframe/parent.html <br/>
Or `npm run start` then run locally:  http://127.0.0.1:8080/dist/examples/iframe/parent.html <br/>
