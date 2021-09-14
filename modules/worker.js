import workerpool from 'workerpool';
import { workerFunctions } from './core/locations.js';

workerpool.worker(workerFunctions);
