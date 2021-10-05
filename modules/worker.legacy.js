// Polyfills for IE11/PhantomJS for things not included in core-js
import 'fast-text-encoding';
import 'whatwg-fetch';
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';

import { expose } from 'threads/worker';
import { workerFunctions } from './core/locations_worker.js';

expose(workerFunctions);
