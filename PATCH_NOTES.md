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
