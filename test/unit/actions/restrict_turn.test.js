import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionRestrictTurn', () => {
  it('adds a via node restriction to an unrestricted turn', () => {
    //
    // u === * --- w
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'u' }),
      Rapid.osmNode({ id: '*' }),
      Rapid.osmNode({ id: 'w' }),
      Rapid.osmWay({ id: '=', nodes: ['u', '*'] }),
      Rapid.osmWay({ id: '-', nodes: ['*', 'w'] })
    ]);

    const turn = {
      from: { node: 'u', way: '=' },
      via: { node: '*' },
      to: { node: 'w', way: '-' }
    };

    const action = Rapid.actionRestrictTurn(turn, 'no_straight_on', 'r');
    const result = action(graph);
    assert.ok(result instanceof Rapid.Graph);

    const r = result.entity('r');
    assert.deepEqual(r.tags, { type: 'restriction', restriction: 'no_straight_on' });

    const f = r.memberByRole('from');
    assert.equal(f.id, '=');
    assert.equal(f.type, 'way');

    const v = r.memberByRole('via');
    assert.equal(v.id, '*');
    assert.equal(v.type, 'node');

    const t = r.memberByRole('to');
    assert.equal(t.id, '-');
    assert.equal(t.type, 'way');
  });


  it('adds a via way restriction to an unrestricted turn', () => {
    //
    // u === v1
    //       |
    // w --- v2
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'u' }),
      Rapid.osmNode({ id: 'v1' }),
      Rapid.osmNode({ id: 'v2' }),
      Rapid.osmNode({ id: 'w' }),
      Rapid.osmWay({ id: '=', nodes: ['u', 'v1'] }),
      Rapid.osmWay({ id: '|', nodes: ['v1', 'v2'] }),
      Rapid.osmWay({ id: '-', nodes: ['v2', 'w'] })
    ]);

    const turn = {
      from: { node: 'u', way: '=' },
      via: { ways: ['|'] },
      to: { node: 'w', way: '-' }
    };

    const action = Rapid.actionRestrictTurn(turn, 'no_u_turn', 'r');
    const result = action(graph);
    assert.ok(result instanceof Rapid.Graph);

    const r = result.entity('r');
    assert.deepEqual(r.tags, { type: 'restriction', restriction: 'no_u_turn' });

    const f = r.memberByRole('from');
    assert.equal(f.id, '=');
    assert.equal(f.type, 'way');

    const v = r.memberByRole('via');
    assert.equal(v.id, '|');
    assert.equal(v.type, 'way');

    const t = r.memberByRole('to');
    assert.equal(t.id, '-');
    assert.equal(t.type, 'way');
  });
});
