# Contributing to Rapid

## Pull Requests
We actively welcome your pull requests.

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. If you haven't already, complete the Contributor License Agreement ("CLA").

## Forking, cloning, and running Rapid
This section suggests a toolset and method to start contributing to Rapid. However, you are welcome to use your own tools for the job. Here's what you could use:

| Tool | Suggestion | Alternatives |
|---|---|---|
| 🟩 Node version manager | [nvm](https://github.com/nvm-sh/nvm) | [fish](https://github.com/jorgebucaran/nvm.fish), [n](https://github.com/tj/n), [volta](https://github.com/volta-cli/volta) |
| 📝 Text editor | [VSCode](https://code.visualstudio.com/) | [Sublime](https://www.sublimetext.com/), [Vim](https://www.vim.org/), [Emacs](https://www.gnu.org/software/emacs/) |
| 🧑‍💻 POSIX-compliant CLI | [Bash for Linux](https://www.gnu.org/software/bash/) | [WSL for Windows](https://learn.microsoft.com/en-us/windows/wsl/install), [Zsh the OSX default](https://www.zsh.org/) |
| 🌐 Web browser | [Chrome](https://www.google.com/chrome/) | [Safari](https://www.apple.com/safari/), [Firefox](https://www.mozilla.org/en-US/firefox/new/), [Opera](https://www.opera.com/) |

### Setting up Rapid locally
1. [Fork](https://docs.github.com/en/get-started/quickstart/fork-a-repo) the repository from [facebook/Rapid](https://github.com/facebook/Rapid) to your own GitHub account.
2. [Clone the repo](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) with `git clone https://github.com/YOUR-GITHUB-USERNAME/Rapid.git`.
3. From the CLI, open your freshly cloned Rapid directory by running the command `code Rapid`
4. Once in VSCode, type **Ctrl+Shift+`** to open a terminal. Alternatively, use the **Terminal>New Terminal** menu option.
5. Make sure you are using [the latest `node`](https://nodejs.org/en/download) by running `node --version`. If not, then running `nvm install node` will set it up for you.
6. Install all required dependencies with `npm install`
7. Then run `npm run all` to set up Rapid.
8. Finally, run `npm run quickstart` to start the server on port 8080.

Congrats! 🎉 You should now be able to use rapid by navigating to [http://127.0.0.1:8080/](http://localhost:8080/) on Chrome.

### Setting up the VSCode debugger
VSCode provides a debugging mode using Chrome. To use it, follow these steps:

1. Go to **Run>Add Configuration** and select `{} Chrome: Launch`
2. This will create `launch.json`.
3. Make sure to add the `/dist/` path to `webRoot` and change `localhost` to `127.0.0.1` on `url`, so that the file looks like this:
```json
{
    // Use IntelliSense to learn about possible attributes.
    // Hover to view descriptions of existing attributes.
    // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
    "version": "0.2.0",
    "configurations": [
        {
            "type": "chrome",
            "request": "launch",
            "name": "Launch Chrome against localhost",
            "url": "http://127.0.0.1:8080",
            "webRoot": "${workspaceFolder}/dist/"
        }
    ]
}
```

Great! You should now be able to run the Rapid server with `npm run quickstart` and then the debugger by either pressing **F5** on your keyboard, or clicking on **Run>Start Debugging**.

This will launch Chrome on whatever address you provided to `url` on `launch.json`, allowing you to use Rapid as well as entering debugging mode on VSCode.

> **Note:** Again, you are welcome to try your own debugging method, such as [Chrome DevTools](https://developer.chrome.com/docs/devtools/javascript/breakpoints/).

### Debugging example

When coding Rapid, it will be useful to watch the code execute line-by-line. To do this, you can set up inline breakpoints. You can learn all about it in [the official documentation](https://code.visualstudio.com/docs/editor/debugging).

A good place to start is the `/index.html` file. Set a breakpoint on the `context.initAsync();` call from it's last few lines:

```javascript
...
          window.context = context;  // for debugging
          context.initAsync();
        }
      }
    </script>
  </body>
</html>
```
Then run `npm run quickstart` and press **F5** to launch Chrome along with the VSCode debugger.

This will freeze execution right at the moment of Rapid initialization. Click on the **Step in** :arrow_down: button on the debugger controls (the arrow pointing down into a point) to enter the `context.initAsync()` function. Then click on **Step over** :arrow_heading_down: repeatedly to watch the code execute line-by-line.

This will be a good primer on what's going on under the hood of Rapid. You can set up breakpoints anywhere in the code to figure out the call stack, live changes in variable values, or any other detail you may need.

Please see [the official documentation](https://code.visualstudio.com/docs/editor/debugging) to learn all the details debugging can show you.

## Directory structure

Now that you know how to set up, run and debug Rapid, you will probably want a tour of the directory structure. This should help you know where to add any new features, or where to spot a particular bug in need of fixing.

Here are the relevant parts of the directory tree along with short descriptions of each directory:

- `css`: It contains the `.css` for styling things like the sidebars, top bars, buttons, etc. Note that there is no `.css` 'inside' the map itself - That's all styled using WebGL.
- `data`: Static data files that define the imagery, data formats, language resources, and walkthrough data. 
- `dist`: Where all the built artifacts get served from. 
- `docs`: The 'docs' directory is populated each time you execute 'npm run doc,' making it a valuable resource for documentation-related tasks.
- `modules`: The 'modules' directory is the heart of our codebase, housing the majority of the substantial code. Module subdirectories are: 
    - `actions`: Discrete modifications to the map state - Changing tags, moving a node, rotating a shape, scaling a polygon, these are all 'actions'.  Actions are only fired when the user changes the map. 
    - `behaviors`: Bundles of event handlers that can apply to different modes (see `modes` below). Behaviors include **Drag**, **Draw**, **Hover**, **Select**, and **Paste**.
    - `core`:  It's where a lot of our `Systems` live. Systems are fundamental building blocks of Rapid. For example, the **EditSystem** is where all the edits to the map are handled and kept track of, the **UrlHashSystem** keeps track of any changes/updates to the URL in the url bar, and the **MapSystem** is what sets up the Map and starts the WebGL renderer going. 
    - `geo`: Geospatial/Geometric code used for transforming map entities. Most of this code now lives in an SDK called the `rapid-sdk`, which you will see referenced throughout. Need to calculate the center of a bunch of geometric points? the `rapid-sdk` has code for that. 
    - `modes`: These describe what the user is doing at the moment - They may be browsing, selecting, drawing a polygon, saving, or dragging a node.
    - `operations`: Operation are for discrete edits on the map - Using a hotkey to flip a polygon upside down, or right-clicking a square entity and selecting 'circularize' are two different operations. Right-clicking an entity on the map will show you many operations that are appropriate for that entity. 
    - `osm`: This is where the [OpenStreetMap](https://www.openstreetmap.org/) data model is defined: ways, nodes, tags, etc. Any time your code is dealing with a node or way information, it's using the code from this folder.
    - `pixi`: Contains all the [Pixi](https://pixijs.download/dev/docs/index.html) renderer code. 
    - `services`: Where we fetch data from other places - OSM data is loaded via the OSM Service. There are many services for different types of imagery/data.
    - `ui`: Where all the UI code is kept. There is code for the sidebars, top bars, Rapid button, color pickers, and a lot lot more.
    - `util`: Assorted utility functions. A bit of a random grab-bag. Almost every codebase seems to have one of these. 🙂 
    - `validations`: As the mapper makes edits, this folder contains the code that runs automated validations on their changes and flags any issues. It's kind of like a code linter, but for map data.
- `svg`: Where all the SVG icons live - Anytime you see an icon in the map, or in the sidebars/UI, it comes from here!

## Contributor License Agreement ("CLA")
In order to accept your pull request, we need you to submit a CLA. You only need
to do this once to work on any of Facebook's open source projects.

Complete your CLA here: <https://code.facebook.com/cla>

## Submit a Pull Request

To push your changes you will have to [submit a PR from your Fork](https://docs.github.com/en/github-ae@latest/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork).

> **⚠️ A Note of Caution**: Rapid is a live code base! Please remember to continuously [sync your fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork) and [synchronize those changes from VSCode](https://code.visualstudio.com/docs/sourcecontrol/overview#:~:text=There%20is%20a%20Synchronize%20Changes,commits%20to%20the%20upstream%20branch.) as you work in your local environment. You may also [rebase your main branch](https://github.blog/changelog/2022-02-03-more-ways-to-keep-your-pull-request-branch-up-to-date/) as you push commits to your PR.

## Issues
We use GitHub issues to track bugs and feature requests. In case of bug reports, please ensure your description is clear and has sufficient instructions for reproducing the bugs.

## License
By contributing to Rapid, you agree that your contributions will be licensed under the [LICENSE file](LICENSE.md).
