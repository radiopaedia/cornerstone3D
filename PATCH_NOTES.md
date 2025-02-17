Workers cannot be turned off, but comlink does have a node.js support using built-in worker_threads.

https://github.com/GoogleChromeLabs/comlink/blob/main/src/node-adapter.ts
https://github.com/GoogleChromeLabs/comlink/blob/main/docs/examples/06-node-example/main.mjs
https://github.com/GoogleChromeLabs/comlink/blob/main/docs/examples/06-node-example/worker.mjs

Cornerstone doesn't use this, which means patching of Cornerstone is still needed in a couple places but is doable in general. 

https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/core/src/webWorkerManager/webWorkerManager.js
https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/dicomImageLoader/src/decodeImageFrameWorker.js

Comlink also appears here:
https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/tools/src/workers/polySegConverters.js
https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/tools/examples/webWorker/heavyTask.js

GPU is not required, CPU fallback is still available:

https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/tools/examples/localCPU/index.ts

setUseCPURendering

"It sets the useCPURenderingOnlyForDebugOrTests variable to the status value. This only should be used for debugging or tests."

`canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl")`
Throws: Error: Not implemented: webgl2

`gl instanceof WebGLRenderingContext || gl instanceof WebGL2RenderingContext`
also throws


the netlify-cli dependency in the latest cornerstone3D contains a bug that prevents dependency installation from completing, but it can be patched out after which yarn && yarn build completes without a problem

https://github.com/netlify/cli/issues/6444

By default esbuild does not respect "worker" boundaries and will compile the worker into the bundle, this causes the worker code to run on the main thread, making the decoder code that expects to run in a worker break.

It looks like a no-worker bundle is now actually being built, it is simply not exposed:
cornerstone3D/packages/dicomImageLoader/dist/cornerstoneDICOMImageLoaderNoWebWorkers.bundle.min.js

Patching the package.json the no-worker bundle can be manually exposed.

That file doesn't seem to export an "init" method, though.
Nevermind, that was an old file, the new build does not produce it.

importing node:worker_threads breaks the build for buildBrowserDicomRender (understandably, it complains)

It can be split out by specifying an entrypoint, then we have to make sure the files are placed in the same directory despite being at separate paths.

Fixing canvas/webgl:

Object.defineProperty(globalThis, "WebGLRenderingContext", { get() { return function(){} }})
Object.defineProperty(globalThis, "WebGL2RenderingContext", { get() { return function(){} }})

The Worker object is not present on the global scope automatically, it must be imported in dicomImageLoader init:
import { Worker } from "node:worker_threads";

In node, `new Worker` also doesn't take a "type" in its second argument, this breaks build unless removed.

openjpegwasm_decode.js aborts with the error:

    error: Error [RuntimeError]: Aborted(Error: ENOENT: no such file or directory, open '/home/flaki/work/rp/Radiopaedia/app/javascript/dicom-render/build/@cornerstonejs/codec-openjpeg/decodewasm'). Build with -sASSERTIONS for more info.

`@cornerstonejs/codec-openjpeg/decodewasm` is a valid import from the codec-openjpeg package pointing to the wasm file, so the issue seems that the package import gets prepended the output build dir somewhere down the line.

Patching the "new URL(...)" bit to a proper import of the decodewasm in the codec wrappers fixes the bundling/loading issues (and the code is in there already, just commented out)

Dicom-render (and fauxdom) doesn't do any sizing or layout so `getBoundingClientRect()` is not supported. Instead of hacking in a shim it's probably easier & cleaner just patching it out.

Packaging turned out to be a bit more annoying as expected, turns out we import the zipped package from a GitHub release, created a package.sh script to generate the gzipped tars. Eventually figured out it's not enough to use `tar`, but should use `yarn pack` to package up a module into a `.tgz` file to be correctly loaded

Some event listeners were keeping the node.js process from terminating so `dicom-render.js` now explicitly exits after rendering with `process.exit(0)`.

The worker threads did not receive the patched `console.*` functions so were logging debugging info to the console output. This meant that console output from included modules was showing up on the `stdout`. This was breaking the tests (though arguably only for the deprecated "json" output). ESBuild has a `drop: ['console']` output that removes console calls from the produced output. Unfortunately Emscripten (used by some of the codecs)     generates JS glue code that stores the console logging calls to be passed into Wasm functions, along the lines of `callback = foo || console.log.bind(console)`, when the console bind was replaced by ESBuild (with `undefined`) the Wasm codecs started breaking. Since this is not in cornerstone core but in the separate [codecs](https://github.com/cornerstonejs/codecs) repo patching is not practical, looking into ESBuild patching the source at build time.

This would manifest as a cryptic `Error [TypeError]: (intermediate value)(intermediate value)(intermediate value) is not a function` error, it would happen inside the worker so very little debugging options available and the backtrace is also missing crucial information.
Added another ESBuild plugin that takes care of patching this out in every wasm decoder module that is touched during build.

Turns out process.exit() will [not wait for stdout output to be written](https://github.com/nodejs/node/issues/12921#issuecomment-300733885), which was breaking standardout (Ruby would only receive 64K worth of `stdout` output). Again, this was only breaking the `json` output but was pointing at forcing `process.exit` not being a good solution here. Workers in node can be [`unref`-d](https://nodejs.org/api/worker_threads.html#workerunref) which should make running workers not block script completion. Fixed this in the patched cornerstone build using unref on worker instances and that indeed fixed the script termination issue.

Down to 3 failing DICOM tests. The `pixelData` on the `AB IV CON 1.5 / 0000 test image` comes back differently (pixel values between -1024 and 1578 instead of 0-2602). Min/max and smallest/largest pixel values differ while in the reference JSON they are the same (positive values only). The rendered image output seems unaffected.
This is a result of the ["always prescale" change](https://www.cornerstonejs.org/docs/migration-guides/2x/dicom-image-loader#always-prescale), `intercept` and `slope` is pre-applied. `slope` is 1 so no change, but intercept is `-1024` which gets applied to the initial pixel data. Will store a dicom-render specific JSON for this test case.

[As before](https://github.com/radiopaedia/cornerstone3D/commit/e32d13b34fdf92de68a8a641bb978cedd27f3f76#diff-19e7f96430cf5f9c401a6d469fb0ea07e2a93773b68eb5f68b3b29e15eaf534a), Cornerstone's optimization where they use the browser-native Image decoder for some files proves a problem in Node.js (which has no native Image support/loader). To make things more confusing, Cornerstone still has support for a non-worker `decodeImageFrame` which is used in `createImage.ts`, incidentally something used by `wadouri.loadImage()` which is precisely what `dicom-render` uses to load images (in `loadImageBlob`). This means that we again need to patch out the use of the native code and instead pass the image for decoding to Wasm. This works well, however there seems to be a color issue on the YBR_FULL test image that didn't manifest in the 1.x branch. It's not missing or swapped channels (black shows up as green, white displays as pink), but something else entirely: white ends up rgb(255,121,255), black turns rgb(0,135,0) however grays seems unaffected.

Dumping the Wasm decoder buffer shows that the decoded image data is correct. The decoded output is correct RGB, but maybe Cornerstone things the YBR input needs a color transform? Yeah that's it it's getting color-converted in `createImage`. I think the issue is we only get 3 components back, not 4 (RGB, not RGBA). If 4 components came back the color conversion would be skipped. Modified the wasm decoder to expand the 3-component RGB to RGBA before returning it (will need to check how or why this worked in pre-2.0 dicom-render).
