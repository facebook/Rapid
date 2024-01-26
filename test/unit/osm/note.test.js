import { describe, it} from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('osmNote', () => {
    it('returns a note', () => {
        var note = Rapid.osmNote();
        assert.ok(note instanceof Rapid.osmNote);
        assert.equal(note.type, 'note');
    });


    describe('#extent', function() {
        it('returns a note extent', function() {
            var note = Rapid.osmNote({loc: [5, 10]});
            var extent = note.extent();
            assert.deepEqual(extent, new Rapid.sdk.Extent([5, 10], [5, 10]));
        });
    });


    describe('#update', function() {
        it('returns an updated note', function() {
            // TODO: Add test case for update method
        });
    });


    describe('#isNew', function() {
        it('returns true if a note is new', function() {
            var note = Rapid.osmNote({
                id: -1,
                loc: [5, 10]
            });
            assert.strictEqual(note.isNew(), true);
        });


        it('returns false if a note is not new', function() {
            var note = Rapid.osmNote({
                id: 1,
                loc: [5, 10]
            });
            assert.strictEqual(note.isNew(), false);
        });
    });


    describe('#move', function() {
        it('returns an moved note', function() {
            var note = Rapid.osmNote({
                id: 1,
                loc: [5, 5]
            });
            note = note.move([10, 10]);
            assert.deepEqual(note.loc, [10, 10]);
        });
    });
});
