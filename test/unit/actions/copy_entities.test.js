import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

const it = function() {};  // remove
const expect = function() {};  // remove

test.todo('actionCopyEntities', async t => {
    it('copies a node', function () {
        var a = Rapid.osmNode({id: 'a'});
        var base = new Rapid.Graph([a]);
        var head = Rapid.actionCopyEntities(['a'], base)(base);
        var diff = new Rapid.Difference(base, head);
        var created = diff.created();

        expect(head.hasEntity('a')).to.be.ok;
        expect(created).to.have.length(1);
    });

    it('copies a way', function () {
        var a = Rapid.osmNode({id: 'a'});
        var b = Rapid.osmNode({id: 'b'});
        var w = Rapid.osmWay({id: 'w', nodes: ['a', 'b']});
        var base = new Rapid.Graph([a, b, w]);
        var action = Rapid.actionCopyEntities(['w'], base);
        var head = action(base);
        var diff = new Rapid.Difference(base, head);
        var created = diff.created();

        expect(head.hasEntity('w')).to.be.ok;
        expect(created).to.have.length(3);
    });

    it('copies multiple nodes', function () {
        var base = new Rapid.Graph([
            Rapid.osmNode({id: 'a'}),
            Rapid.osmNode({id: 'b'})
        ]);
        var action = Rapid.actionCopyEntities(['a', 'b'], base);
        var head = action(base);
        var diff = new Rapid.Difference(base, head);
        var created = diff.created();

        expect(head.hasEntity('a')).to.be.ok;
        expect(head.hasEntity('b')).to.be.ok;
        expect(created).to.have.length(2);
    });

    it('copies multiple ways, keeping the same connections', function () {
        var base = new Rapid.Graph([
            Rapid.osmNode({id: 'a'}),
            Rapid.osmNode({id: 'b'}),
            Rapid.osmNode({id: 'c'}),
            Rapid.osmWay({id: 'w1', nodes: ['a', 'b']}),
            Rapid.osmWay({id: 'w2', nodes: ['b', 'c']})
        ]);
        var action = Rapid.actionCopyEntities(['w1', 'w2'], base);
        var head = action(base);
        var diff = new Rapid.Difference(base, head);
        var created = diff.created();

        expect(created).to.have.length(5);
        expect(action.copies().w1.nodes[1]).to.eql(action.copies().w2.nodes[0]);
    });

    it('obtains source entities from an alternate graph', function () {
        var a = Rapid.osmNode({id: 'a'});
        var old = new Rapid.Graph([a]);
        var base = new Rapid.Graph();
        var action = Rapid.actionCopyEntities(['a'], old);
        var head = action(base);

        expect(head.hasEntity('a')).not.to.be.ok;
        expect(Object.keys(action.copies())).to.have.length(1);
    });
});
