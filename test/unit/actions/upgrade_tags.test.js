import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionUpgradeTags', () => {
  it('upgrades a tag', () => {
    const oldTags = { amenity: 'swimming_pool' };
    const newTags = { leisure: 'swimming_pool' };
    const entity = Rapid.osmEntity({ tags: { amenity: 'swimming_pool', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { leisure: 'swimming_pool', name: 'Foo' });
  });

  it('upgrades a tag combination', () => {
    const oldTags = { amenity: 'vending_machine', vending: 'news_papers' };
    const newTags = { amenity: 'vending_machine', vending: 'newspapers' };
    const entity = Rapid.osmEntity({ tags: { amenity: 'vending_machine', vending: 'news_papers', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { amenity: 'vending_machine', vending: 'newspapers', name: 'Foo' });
  });


  it('upgrades a tag with multiple replacement tags', () => {
    const oldTags = { natural: 'marsh' };
    const newTags = { natural: 'wetland', wetland: 'marsh' };
    const entity = Rapid.osmEntity({ tags: { natural: 'marsh', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { natural: 'wetland', wetland: 'marsh', name: 'Foo' });
  });


  it('upgrades a tag and overrides an existing value', () => {
    const oldTags = { landuse: 'wood' };
    const newTags = { natural: 'wood' };
    const entity = Rapid.osmEntity({ tags: { landuse: 'wood', natural: 'wetland', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { natural: 'wood', name: 'Foo' });
  });


  it('upgrades a tag with no replacement tags', () => {
    const oldTags = { highway: 'no' };
    const newTags = {};
    const entity = Rapid.osmEntity({ tags: { highway: 'no', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { name: 'Foo' });
  });


  it('upgrades a wildcard tag and moves the value', () => {
    const oldTags = { color: '*' };
    const newTags = { colour: '$1' };
    const entity = Rapid.osmEntity({ tags: { color: 'red', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { colour: 'red', name: 'Foo' });
  });


  it('upgrades a tag with a wildcard replacement and adds a default value', () => {
    const oldTags = { amenity: 'shop' };
    const newTags = { shop: '*' };
    const entity = Rapid.osmEntity({ tags: { amenity: 'shop', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { shop: 'yes', name: 'Foo' });
  });


  it('upgrades a tag with a wildcard replacement and maintains the existing value', () => {
    const oldTags = { amenity: 'shop' };
    const newTags = { shop: '*' };
    const entity = Rapid.osmEntity({ tags: { amenity: 'shop', shop: 'supermarket', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { shop: 'supermarket', name: 'Foo' });
  });


  it('upgrades a tag with a wildcard replacement and replaces the existing "no" value', () => {
    const oldTags = { amenity: 'shop' };
    const newTags = { shop: '*' };
    const entity = Rapid.osmEntity({ tags: { amenity: 'shop', shop: 'no', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { shop: 'yes', name: 'Foo' });
  });


  it('upgrades a tag from a semicolon-delimited list that has one other value', () => {
    const oldTags = { cuisine: 'vegan' };
    const newTags = { 'diet:vegan': 'yes' };
    const entity = Rapid.osmEntity({ tags: { cuisine: 'italian;vegan', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { cuisine: 'italian', 'diet:vegan': 'yes', name: 'Foo' });
  });


  it('upgrades a tag from a semicolon-delimited list that has many other values', () => {
    const oldTags = { cuisine: 'vegan' };
    const newTags = { 'diet:vegan': 'yes' };
    const entity = Rapid.osmEntity({ tags: { cuisine: 'italian;vegan;regional;american', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { cuisine: 'italian;regional;american', 'diet:vegan': 'yes', name: 'Foo' });
  });


  it('upgrades a tag within a semicolon-delimited list without changing other values', () => {
    const oldTags = { leisure: 'ice_rink', sport: 'hockey' };
    const newTags = { leisure: 'ice_rink', sport: 'ice_hockey' };
    const entity = Rapid.osmEntity({ tags: { leisure: 'ice_rink', sport: 'curling;hockey;multi', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { leisure: 'ice_rink', name: 'Foo', sport: 'curling;ice_hockey;multi' });
  });


  it('upgrades an entire semicolon-delimited tag value', () => {
    const oldTags = { vending: 'parcel_mail_in;parcel_pickup' };
    const newTags = { vending: 'parcel_pickup;parcel_mail_in' };
    const entity = Rapid.osmEntity({ tags: { vending: 'parcel_mail_in;parcel_pickup', name: 'Foo' } });
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, { vending: 'parcel_pickup;parcel_mail_in', name: 'Foo' });
  });
});
