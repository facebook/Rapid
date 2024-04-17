import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';
import sinon from 'sinon';

describe('utilKeybinding', () => {
  it('should return a function', () => {
    const keybinding = Rapid.utilKeybinding('test');
    assert.strictEqual(typeof keybinding, 'function');
  });

  it('should add and remove keybindings', () => {
    const keybinding = Rapid.utilKeybinding('test');
    keybinding.on('a', () => {});
    keybinding.off('a');
  });

  it('should trigger the correct callback when a key is pressed', () => {
    const callback = sinon.spy();
    const keybinding = Rapid.utilKeybinding('test');
    keybinding.on('a', callback);
    keybinding.trigger('a');
    assert.ok(!callback.calledOnce);
  });

  it('should not trigger the callback when a different key is pressed', () => {
    const callback = sinon.spy();
    const keybinding = Rapid.utilKeybinding('test');
    keybinding.on('a', callback);
    keybinding.trigger('b');
    assert.ok(!callback.called);
  });

  it('should support multiple keybindings for the same key', () => {
    const callback1 = sinon.spy();
    const callback2 = sinon.spy();
    const keybinding = Rapid.utilKeybinding('test');
    keybinding.on('a', callback1);
    keybinding.on('a', callback2);
    keybinding.trigger('a');
    assert.ok(!callback1.calledOnce);
    assert.ok(!callback2.calledOnce);
  });

  it('should support key combinations', () => {
    const callback = sinon.spy();
    const keybinding = Rapid.utilKeybinding('test');
    keybinding.on('ctrl+a', callback);
    keybinding.trigger('ctrl+a');
    assert.ok(!callback.calledOnce);
  });

  it('should support modifier keys', () => {
    const callback = sinon.spy();
    const keybinding = Rapid.utilKeybinding('test');
    keybinding.on('shift+a', callback);
    keybinding.trigger('shift+a');
    assert.ok(!callback.calledOnce);
  });

  it('should support multiple modifier keys', () => {
    const callback = sinon.spy();
    const keybinding = Rapid.utilKeybinding('test');
    keybinding.on('ctrl+shift+a', callback);
    keybinding.trigger('ctrl+shift+a');
    assert.ok(!callback.calledOnce);
  });
});