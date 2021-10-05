// shims for Node stuff used by Avro
export const process = { env: {} };
import { Buffer as BufferPolyfill } from 'buffer/';
self.Buffer = BufferPolyfill;
export const Buffer = BufferPolyfill;
