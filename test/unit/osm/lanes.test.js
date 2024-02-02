import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('lanes', () => {

  describe('default lane tags', () => {
    it('implies lane count for highway=motorway', () => {
      const w1 = Rapid.osmWay({ tags: { highway: 'motorway' } });
      assert.equal(w1.lanes().metadata.count, 2);
      const w2 = Rapid.osmWay({ tags: { highway: 'motorway', oneway: 'no' } });  // weird, but test anyway
      assert.equal(w2.lanes().metadata.count, 4);
      const w3 = Rapid.osmWay({ tags: { highway: 'motorway', oneway: 'yes' } });
      assert.equal(w3.lanes().metadata.count, 2);
    });

    it('implies lane count for highway=trunk', () => {
      const w1 = Rapid.osmWay({ tags: { highway: 'trunk' } });
      assert.equal(w1.lanes().metadata.count, 4);
      const w2 = Rapid.osmWay({ tags: { highway: 'trunk', oneway: 'no' } });
      assert.equal(w2.lanes().metadata.count, 4);
      const w3 = Rapid.osmWay({ tags: { highway: 'trunk', oneway: 'yes' } });
      assert.equal(w3.lanes().metadata.count, 2);
    });

    // all others, assume oneway is 1 lane, bidirectional is 2 lane..
    const tags = [
      'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
      'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
      'service', 'road', 'track', 'busway', 'bus_guideway', 'path'
    ];

    for (const tag of tags) {
      it(`implies lane count for highway=${tag}`, () => {
        const w1 = Rapid.osmWay({ tags: { highway: tag } });
        assert.equal(w1.lanes().metadata.count, 2);
        const w2 = Rapid.osmWay({ tags: { highway: tag, oneway: 'no' } });
        assert.equal(w2.lanes().metadata.count, 2);
        const w3 = Rapid.osmWay({ tags: { highway: tag, oneway: 'yes' } });
        assert.equal(w3.lanes().metadata.count, 1);
      });
    }
  });


  describe('oneway tags', () => {
    it('returns correctly oneway when tagged as oneway', () => {
      const w1 = Rapid.osmWay({ tags: { highway: 'residential', oneway: 'no' } });
      assert.equal(w1.lanes().metadata.oneway, false);
      const w2 = Rapid.osmWay({ tags: { highway: 'residential', oneway: 'yes' } });
      assert.equal(w2.lanes().metadata.oneway, true);
    });
  });


  describe('lane direction', () => {

    it('returns correctly the `lane:forward` and `lane:backward` counts', () => {
      const w = Rapid.osmWay({ tags: { highway: 'residential', lanes: 2, 'lanes:forward': 1, 'lanes:backward': 1 } });
      const m = w.lanes().metadata;
      assert.equal(m.count, 2);
      assert.equal(m.oneway, false);
      assert.equal(m.forward, 1);
      assert.equal(m.backward, 1);
      assert.equal(m.bothways, 0);
    });

    it('returns correctly the count if erroneous values are supplied', () => {
      const w = Rapid.osmWay({ tags: { highway: 'trunk', lanes: 2, 'lanes:forward': 3 } });
      const m = w.lanes().metadata;
      assert.equal(m.count, 2);
      assert.equal(m.oneway, false);
      assert.equal(m.forward, 2);
      assert.equal(m.backward, 0);
      assert.equal(m.bothways, 0);
    });

    it('includes all lanes in forward count when `oneway=yes`', () => {
      const w = Rapid.osmWay({ tags: { highway: 'trunk', lanes: 2, oneway: 'yes' } });
      const m = w.lanes().metadata;
      assert.equal(m.count, 2);
      assert.equal(m.oneway, true);
      assert.equal(m.forward, 2);
      assert.equal(m.backward, 0);
      assert.equal(m.bothways, 0);
    });

    it('includes all lanes in backward count when `oneway=-1`', () => {
      const w = Rapid.osmWay({ tags: { highway: 'primary', lanes: 4, oneway: '-1' } });
      const m = w.lanes().metadata;
      assert.equal(m.count, 4);
      assert.equal(m.oneway, true);
      assert.equal(m.forward, 0);
      assert.equal(m.backward, 4);
      assert.equal(m.bothways, 0);
    });

    it('disregards `lanes:forward` value when `oneway=yes`', () => {
      const w = Rapid.osmWay({ tags: { highway: 'trunk', lanes: 2, oneway: 'yes', 'lanes:forward': 1 } });
      const m = w.lanes().metadata;
      assert.equal(m.count, 2);
      assert.equal(m.oneway, true);
      assert.equal(m.forward, 2);
      assert.equal(m.backward, 0);
      assert.equal(m.bothways, 0);
    });

    it('disregards `lanes:backward` value when `oneway=yes`', () => {
      const w = Rapid.osmWay({ tags: { highway: 'trunk', lanes: 2, oneway: 'yes', 'lanes:backward': 1 } });
      const m = w.lanes().metadata;
      assert.equal(m.count, 2);
      assert.equal(m.oneway, true);
      assert.equal(m.forward, 2);
      assert.equal(m.backward, 0);
      assert.equal(m.bothways, 0);
    });

    it('infers forward count from `lanes` and `lanes:backward`', () => {
      const w = Rapid.osmWay({ tags: { highway: 'residential', lanes: 3, 'lanes:backward': 1 } });
      const m = w.lanes().metadata;
      assert.equal(m.count, 3);
      assert.equal(m.oneway, false);
      assert.equal(m.forward, 2);
      assert.equal(m.backward, 1);
      assert.equal(m.bothways, 0);
    });

    it('infers backward count from `lanes` and `lanes:forward`', () => {
      const w = Rapid.osmWay({ tags: { highway: 'residential', lanes: 3, 'lanes:forward': 1 } });
      const m = w.lanes().metadata;
      assert.equal(m.count, 3);
      assert.equal(m.oneway, false);
      assert.equal(m.forward, 1);
      assert.equal(m.backward, 2);
      assert.equal(m.bothways, 0);
    });

    it('infers forward count from `lanes`, `lanes:backward`, and `lanes:both_ways', () => {
      const w = Rapid.osmWay({ tags: { highway: 'residential', lanes: 3, 'lanes:backward': 1, 'lanes:both_ways': 1 } });
      const m = w.lanes().metadata;
      assert.equal(m.count, 3);
      assert.equal(m.oneway, false);
      assert.equal(m.forward, 1);
      assert.equal(m.backward, 1);
      assert.equal(m.bothways, 1);
    });

    it('infers backward count from `lanes`, `lanes:forward`, and `lanes:both_ways', () => {
      const w = Rapid.osmWay({ tags: { highway: 'residential', lanes: 3, 'lanes:forward': 1, 'lanes:both_ways': 1 } });
      const m = w.lanes().metadata;
      assert.equal(m.count, 3);
      assert.equal(m.oneway, false);
      assert.equal(m.forward, 1);
      assert.equal(m.backward, 1);
      assert.equal(m.bothways, 1);
    });

    it('infer bothways count of 1 when `lane:both_ways>1`', () => {
      const w = Rapid.osmWay({ tags: { highway: 'residential', lanes: 5, 'lanes:forward': 2, 'lanes:both_ways': 2, 'lanes:backward': 2 } });
      const m = w.lanes().metadata;
      assert.equal(m.count, 5);
      assert.equal(m.oneway, false);
      assert.equal(m.forward, 2);
      assert.equal(m.backward, 2);
      assert.equal(m.bothways, 1);
    });

    it('infer 0 for any non-numeric number', () => {
      const w = Rapid.osmWay({ tags: { highway: 'residential', lanes: 2, 'lanes:forward': 1, 'lanes:both_ways': 'none' } });
      const m = w.lanes().metadata;
      assert.equal(m.count, 2);
      assert.equal(m.oneway, false);
      assert.equal(m.forward, 1);
      assert.equal(m.backward, 1);
      assert.equal(m.bothways, 0);
    });
  });


  // very incomplete
  describe('lanes Object', () => {
    it('should have correct number of direction elements', () => {
      const w = Rapid.osmWay({ tags: { highway: 'residential', lanes: 5, 'lanes:forward': 2, 'lanes:both_ways': 0, 'lanes:backward': 3 } });
      const l = w.lanes().lanes;
      assert.ok(l.forward instanceof Array);
      assert.ok(l.backward instanceof Array);
      assert.ok(l.unspecified instanceof Array);
    });
  });


  describe('turn lanes', () => {
    it('gathers turn lanes when `oneway=yes`', () => {
      const w = Rapid.osmWay({ tags: { highway: 'trunk', oneway: 'yes', 'turn:lanes': 'none|slight_right' } });
      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.unspecified, [ ['none'], ['slight_right'] ]);
    });

    it('gathers turn lanes when `oneway=yes` and `lanes=2`', () => {
      const w = Rapid.osmWay({ tags: { highway: 'tertiary', oneway: 'yes', lanes: 2, 'turn:lanes': 'none|slight_right' } });
      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.unspecified, [ ['none'], ['slight_right'] ]);
    });

    it('gathers forward/backward turn lanes from `turn:lanes:forward` and `turn:lanes:backward` tags', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 5,
          'lanes:forward': 1,
          'lanes:both_ways': 1,
          'turn:lanes:forward': 'slight_left',
          'turn:lanes:backward': 'none|through|through;slight_right',
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.forward, [['slight_left']]);
      assert.deepEqual(m.turnLanes.backward, [['none'], ['through'], ['through', 'slight_right'] ]);
    });

    it('gathers turn lanes with multiple values present in a lane and `oneway=yes`', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 5,
          oneway: 'yes',
          'turn:lanes': 'slight_left;reverse;left|slight_left;left;through|through|none|through;right',
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.unspecified, [
        ['slight_left', 'reverse', 'left'],
        ['slight_left', 'left', 'through'],
        ['through'],
        ['none'],
        ['through', 'right']
      ]);
    });

    it('gathers turn lanes with multiple values present in a lane and `oneway=no`', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 5,
          oneway: 'no',
          'lanes:forward': 3,
          'lanes:backward': 2,
          'turn:lanes:forward': 'slight_left;reverse;left|slight_left;left;through|through',
          'turn:lanes:backward': 'none|through;left'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.forward, [
        ['slight_left', 'reverse', 'left'],
        ['slight_left', 'left', 'through'],
        ['through']
      ]);
      assert.deepEqual(m.turnLanes.backward, [
        ['none'],
        ['through', 'left']
      ]);
    });


    it('returns unknown for every invalid value in `turn:lanes`', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 3,
          oneway: 'yes',
          'turn:lanes': '||straight;NO_LEFT',
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.unspecified, [
        ['none'],
        ['none'],
        ['unknown', 'unknown']
      ]);
    });

    it('returns unknown for every invalid value in `turn:lanes:forward` & `turn:lanes:backward`', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 5,
          'lanes:forward': 1,
          'lanes:both_ways': 1,
          'turn:lanes:forward': 'sligh_left',
          'turn:lanes:backward': 'none|through|though;slight_right',
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.forward, [
        ['unknown']
      ]);
      assert.deepEqual(m.turnLanes.backward, [
        ['none'],
        ['through'],
        ['unknown', 'slight_right']
      ]);
    });

//    it.skip('fills with [\'unknown\'] when given turn:lanes are less than lanes count', () => {
//      var metadata = Rapid.osmWay({
//        tags: {
//          highway: 'tertiary',
//          lanes: 5,
//          oneway: 'yes',
//          'turn:lanes': 'slight_left|',
//        }
//      }).lanes().metadata;
//
//      expect(metadata.turnLanes.unspecified)
//        .to.deep.equal([
//          ['slight_left'],
//          ['none']
//        ]);
//    });
//
//    it.skip('fills with [\'unknown\'] when given turn:lanes:forward are less than lanes forward count', () => {
//      var metadata = Rapid.osmWay({
//        tags: {
//          highway: 'tertiary',
//          lanes: 5,
//          oneway: 'no',
//          'lanes:forward': 3,
//          'turn:lanes:forward': 'slight_left',
//          'turn:lanes:backward': 'through',
//        }
//      }).lanes().metadata;
//
//      expect(metadata.turnLanes.forward)
//        .to.deep.equal([
//          ['slight_left'],
//          ['unknown'],
//          ['unknown']
//        ]);
//      expect(metadata.turnLanes.backward)
//        .to.deep.equal([
//          ['through'],
//          ['unknown']
//        ]);
//    });
//
//    it.skip('clips when turn lane information is more than lane count', () => {
//      var metadata = Rapid.osmWay({
//        tags: {
//          highway: 'tertiary',
//          lanes: 2,
//          oneway: 'yes',
//          'turn:lanes': 'through|through;slight_right|slight_right',
//        }
//      }).lanes().metadata;
//
//      expect(metadata.turnLanes)
//        .to.deep.equal([
//          ['through'],
//          ['through', 'slight_right']
//        ]);
//    });

    it('turnLanes data is `undefined` when not present', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 2,
          oneway: 'yes'
        }
      });

      const m = w.lanes().metadata;
      assert.equal(m.turnLanes.unspecified, undefined);
      assert.equal(m.turnLanes.forward, undefined);
      assert.equal(m.turnLanes.backward, undefined);
    });


    it('turnLanes.forward and turnLanes.backward are both undefined when both are not provided', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 2,
          oneway: 'yes',
          'turn:lanes': 'through|through;slight_right',
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.unspecified, [['through'], ['through', 'slight_right']]);
      assert.equal(m.turnLanes.forward, undefined);
      assert.equal(m.turnLanes.backward, undefined);
    });

    it('parses turnLane correctly when `lanes:both_ways=1` is present', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 5,
          oneway: 'no',
          'lanes:forward': 3,
          'lanes:both_ways': 1,
          'lanes:backward': 1,
          'turn:lanes:backward': 'slight_right',
          'turn:lanes:forward': 'slight_left||',
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.backward, [['slight_right']]);
      assert.deepEqual(m.turnLanes.forward, [['slight_left'], ['none'], ['none']]);
    });

    it('parses turnLane correctly when `lanes:both_ways=1` & `lanes:forward` < `lanes:backward`', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 5,
          oneway: 'no',
          'lanes:forward': 1,
          'lanes:both_ways': 1,
          'lanes:backward': 3,
          'turn:lanes:forward': 'through',
          'turn:lanes:backward': 'slight_left||',
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.forward, [['through'] ]);
      assert.deepEqual(m.turnLanes.backward, [['slight_left'], ['none'], ['none']]);
    });

    it('parses correctly when `turn:lanes= ||x`', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 3,
          oneway: 'yes',
          'turn:lanes': '||through;slight_right',
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.unspecified, [ ['none'], ['none'], ['through', 'slight_right'] ]);
    });

    it('parses correctly when `turn:lanes= |x|`', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 5,
          'turn:lanes': '|through|',
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.unspecified, [ ['none'], ['through'], ['none'] ]);
    });

    it('parses correctly when `turn:lanes:forward= ||x`', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 4,
          oneway: 'no',
          'lanes:forward': 3,
          'lanes:backward': 1,
          'turn:lanes:forward': '||through;slight_right',
          'turn:lanes:backward': 'none',
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.forward, [ ['none'], ['none'], ['through', 'slight_right'] ]);
      assert.deepEqual(m.turnLanes.backward, [ ['none'] ]);
    });

    it('parses correctly when `turn:lanes:backward= |`', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 5,
          oneway: 'no',
          'lanes:forward': 3,
          'lanes:backward': 2,
          'turn:lanes:backward': '|',
          'turn:lanes:forward': 'slight_left||',
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.turnLanes.forward, [ ['slight_left'], ['none'], ['none'] ]);
      assert.deepEqual(m.turnLanes.backward, [ ['none'], ['none'] ]);
    });

    it('fills `lanes.unspecified` with key \'turnLane\' correctly', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 5,
          oneway: 'yes',
          'turn:lanes': 'slight_left||through|through;slight_right|slight_right'
        }
      });

      const l = w.lanes().lanes;
      const unspecifiedTurnLanes = l.unspecified.map(lane => lane.turnLane);
      assert.deepEqual(unspecifiedTurnLanes, [
        ['slight_left'],
        ['none'],
        ['through'],
        ['through', 'slight_right'],
        ['slight_right']
      ]);
      assert.deepEqual(l.forward, []);
      assert.deepEqual(l.backward, []);
    });

    it('fills `lanes.forward` & `lanes.backward` with key \'turnLane\' correctly', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'tertiary',
          lanes: 5,
          'lanes:forward': 3,
          'lanes:backward': 2,
          'turn:lanes:backward': 'none|slight_right',
          'turn:lanes:forward': 'slight_left||',
        }
      });

      const l = w.lanes().lanes;
      assert.deepEqual(l.unspecified, []);
      const forwardTurnLanes = l.forward.map(lane => lane.turnLane);
      const backwardTurnLanes = l.backward.map(lane => lane.turnLane);
      assert.deepEqual(forwardTurnLanes, [ ['slight_left'], ['none'], ['none'] ]);
      assert.deepEqual(backwardTurnLanes, [ ['none'], ['slight_right'] ]);
    });
  });


  describe('maxspeed', () => {
    it('should parse maxspeed without any units correctly', () => {
      const w = Rapid.osmWay({tags: {highway: 'primary', lanes: 5, 'maxspeed': '70' }});
      const m = w.lanes().metadata;
      assert.equal(m.maxspeed, 70);
    });

    it('should parse maxspeed with km/h correctly', () => {
      const w = Rapid.osmWay({tags: {highway: 'primary', lanes: 5, 'maxspeed': '70 km/h' }});
      const m = w.lanes().metadata;
      assert.equal(m.maxspeed, 70);
    });

    it('should parse maxspeed with kmh correctly', () => {
      const w = Rapid.osmWay({tags: {highway: 'primary', lanes: 5, 'maxspeed': '70 kmh' }});
      const m = w.lanes().metadata;
      assert.equal(m.maxspeed, 70);
    });

    it('should parse maxspeed with kph correctly', () => {
      const w = Rapid.osmWay({tags: {highway: 'primary', lanes: 5, 'maxspeed': '70 kph' }});
      const m = w.lanes().metadata;
      assert.equal(m.maxspeed, 70);
    });

    it('should parse maxspeed with mph correctly', () => {
      const w = Rapid.osmWay({tags: {highway: 'primary', lanes: 5, 'maxspeed': '70mph' }});
      const m = w.lanes().metadata;
      assert.equal(m.maxspeed, 70);
    });

    it('should parse maxspeed with knots correctly', () => {
      const w = Rapid.osmWay({tags: {highway: 'primary', lanes: 5, 'maxspeed': '50knots' }});
      const m = w.lanes().metadata;
      assert.equal(m.maxspeed, 50);
    });

    it('should return undefined when incorrect maxspeed unit provided ', () => {
      const w = Rapid.osmWay({tags: {highway: 'primary', lanes: 5, 'maxspeed': '50 km' }});
      const m = w.lanes().metadata;
      assert.equal(m.maxspeed, undefined);
    });

    it('should return undefined when incorrect maxspeed value provided ', () => {
      const w = Rapid.osmWay({tags: {highway: 'primary', lanes: 5, 'maxspeed': 'a70kph' }});
      const m = w.lanes().metadata;
      assert.equal(m.maxspeed, undefined);
    });

    it('should return undefined when maxspeed not provided ', () => {
      const w = Rapid.osmWay({tags: {highway: 'primary', lanes: 5 }});
      const m = w.lanes().metadata;
      assert.equal(m.maxspeed, undefined);
    });
  });


  describe('maxspeed:lanes', () => {

    it('should parse correctly', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 5,
          'maxspeed:lanes': '30|40|40|40|40'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.maxspeedLanes.unspecified, [30, 40, 40, 40, 40]);
    });

    it('should parse `maxspeed:lanes:forward/backward` correctly', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 5,
          maxspeed: 30,
          'lanes:forward': 4,
          'lanes:backward': 1,
          'maxspeed:lanes:forward': '30|40|40|40',
          'maxspeed:lanes:backward': '30'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.maxspeedLanes.forward, [null, 40, 40, 40]);
      assert.deepEqual(m.maxspeedLanes.backward, [null]);
    });

    it('should parse correctly when some values `maxspeed:lanes` are implied by `x||y` notation', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 4,
          maxspeed: '40kmh',
          'maxspeed:lanes': '30|||40'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.maxspeedLanes.unspecified, [30, null, null, null]);
    });

    it('should parse correctly when some values `maxspeed:lanes` are implied by `x|||` notation', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 5,
          'lanes:forward': 1,
          'lanes:both_ways': 1,
          'turn:lanes:forward': 'slight_left',
          'turn:lanes:backward': 'none|through|through;slight_right',
          maxspeed: '60kmh',
          'maxspeed:lanes': '30|||'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.maxspeedLanes.unspecified, [30, null, null, null]);
    });

    it('should return `null` for each `maxspeed:lanes` which equals maxspeed', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 5,
          maxspeed: '40kmh',
          'maxspeed:lanes': '30|40|40|40|40'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.maxspeedLanes.unspecified, [30, null, null, null, null]);
    });

    it('should return `unknown` for every invalid `maxspeed:lane` value', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 5,
          maxspeed: '30kmh',
          'maxspeed:lanes': '30|40|forty|40|random'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.maxspeedLanes.unspecified, [null, 40, 'unknown', 40, 'unknown']);
    });

    it('should support valid value `none`', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 5,
          'maxspeed:lanes': '30|40|none|40|40'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.maxspeedLanes.unspecified, [30, 40, 'none', 40, 40]);
    });
  });


  describe('bicycle lanes', () => {
    it('should parse `bicycle:lanes` correctly', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 3,
          'lanes:bicycleway': 2,
          'bicycleway:lanes': 'no|yes|no|designated|no',
          maxspeed: '30kmh',
          'turn:lanes': 'left|||through|right'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.bicyclewayLanes.unspecified, ['no', 'yes', 'no', 'designated', 'no']);
    });

    it('should parse `bicycle:lanes:forward/backward` correctly', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          'lanes:forward': 4,
          'lanes:backward': 3,
          'turn:lanes:forward': 'left;through|left;through|through|right;through|right',
          'bicycleway:lanes:forward': 'lane|no|no|no|no',
          'bicycleway:lanes:backward': 'lane|no|no|no'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.bicyclewayLanes.forward, ['lane', 'no', 'no', 'no', 'no']);
      assert.deepEqual(m.bicyclewayLanes.backward, ['lane', 'no', 'no', 'no']);
    });

    it('should replace any invalid value with unknown', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 3,
          maxspeed: '30kmh',
          'bicycleway:lanes': 'no|share|no|designated|no',
          'turn:lanes': 'left|||through|right'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.bicyclewayLanes.unspecified, ['no', 'unknown', 'no', 'designated', 'no']);
    });
  });


  describe('miscellaneous lanes', () => {
    it('should parse `psv:lanes` correctly', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 5,
          maxspeed: '30kmh',
          'psv:lanes': 'yes|no||no|no'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.psvLanes.unspecified, ['yes', 'no', 'no', 'no', 'no']);
    });

    it('should parse `psv:lanes:forward/backward` correctly', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 5,
          maxspeed: '30kmh',
          'psv:lanes:forward': 'no|no|',
          'psv:lanes:backward': 'yes|designated',
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.psvLanes.forward, ['no', 'no', 'no']);
      assert.deepEqual(m.psvLanes.backward, ['yes', 'designated']);
    });

    it('should replace any invalid value with unknown', () => {
      const w = Rapid.osmWay({
        tags: {
          highway: 'residential',
          lanes: 3,
          maxspeed: '30kmh',
          'psv:lanes': 'yes|no|garbage'
        }
      });

      const m = w.lanes().metadata;
      assert.deepEqual(m.psvLanes.unspecified, ['yes', 'no', 'unknown']);
    });

  });
});
