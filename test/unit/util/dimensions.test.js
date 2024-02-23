import {describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('utilGetDimensions', () => {
    it('returns the dimensions of the selection', () => {
        // Create a mock selection
        const selection = {
            node: () => ({ getBoundingClientRect: () => ({ width: 100, height: 200 }) }),
            property: (name, value) => {
                if (value !== undefined) {
                    selection[name] = value;
                }
                return selection[name];
            },
            empty: () => false  // Add this line
        };

        const dimensions = Rapid.utilGetDimensions(selection);

        assert.deepStrictEqual(dimensions, [100, 200]);
    });
});


describe('utilSetDimensions', () => {
    it('sets the dimensions of the selection', () => {
        // Create a mock node
        const node = { attributes: {} };

        // Create a mock selection
        const selection = {
            node: () => node,
            property: (name, value) => {
                if (value !== undefined) {
                    selection[name] = value;
                }
                return selection;
            },
            attr: (name, value) => {
                if (value !== undefined) {
                    node.attributes[name] = value;
                }
                return selection;
            },
            empty: () => false
        };

        Rapid.utilSetDimensions(selection, [300, 400]);

        assert.deepStrictEqual(selection.__dimensions__, [300, 400]);
        assert.strictEqual(node.attributes.width, 300);
        assert.strictEqual(node.attributes.height, 400);
    });
});