import { expose } from 'threads/worker';
import { workerFunctions } from './core/locations_worker.js';

expose(workerFunctions);
