import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


if (!global.window) {  // mock window for Node
  global.window = {
    devicePixelRatio: 1
  }
}

class MockLocalizationSystem {
  constructor() { }
  initAsync()   { return Promise.resolve(); }
  t(id)         { return id; }
  tHtml(id)     { return id; }
}

class MockContext {
  constructor()  {
    this.systems = {
      l10n:  new MockLocalizationSystem(this)
    };
  }
}

function closeTo(a, b, epsilon = 1e-3) {
  return Math.abs(a - b) < epsilon;
}


describe('ImagerySource', () => {
  const context = new MockContext();

  it('does not error with blank template', () => {
    const source = new Rapid.ImagerySource(context, { template: '', id:'anyid' });
    assert.equal(source.url([0,1,2]), '');
  });

  it('supports tms replacement tokens', () => {
    const source = new Rapid.ImagerySource(context, {
      id: 'anyid',
      type: 'tms',
      template: '{z}/{x}/{y}'
    });
    assert.equal(source.url([0,1,2]), '2/0/1');
  });

  it('supports wms replacement tokens', () => {
    const source = new Rapid.ImagerySource(context, {
      id:'anyid',
      type: 'wms',
      projection: 'EPSG:3857',
      template: 'SRS={proj}&imageSR={wkid}&bboxSR={wkid}&FORMAT=image/jpeg&WIDTH={width}&HEIGHT={height}&BBOX={bbox}'
    });

    const result = Rapid.sdk.utilStringQs(source.url([0,1,2]));
    assert.equal(result.SRS, 'EPSG:3857');
    assert.equal(result.imageSR, '3857');
    assert.equal(result.bboxSR, '3857');
    assert.equal(result.FORMAT, 'image/jpeg');
    assert.equal(result.WIDTH, '256');
    assert.equal(result.HEIGHT, '256');

    const bbox = result.BBOX.split(',');
    assert.ok(closeTo(+bbox[0], -20037508.34));
    assert.ok(closeTo(+bbox[1], 0));
    assert.ok(closeTo(+bbox[2], -10018754.17));
    assert.ok(closeTo(+bbox[3], 10018754.17));
  });

  it('supports subdomains', () => {
    const source = new Rapid.ImagerySource(context, { id:'anyid', template: '{switch:a,b}/{z}/{x}/{y}'});
    assert.equal(source.url([0,1,2]), 'b/2/0/1');
  });

  it('distributes requests between subdomains', () => {
    const source = new Rapid.ImagerySource(context, { id:'anyid', template: '{switch:a,b}/{z}/{x}/{y}' });
    assert.equal(source.url([0,1,1]), 'b/1/0/1');
    assert.equal(source.url([0,2,1]), 'a/1/0/2');
  });

  it('correctly displays an overlay with no overzoom specified', () => {
    const source = new Rapid.ImagerySource(context, { id:'anyid', zoomExtent: [6,16] });
    assert.equal(source.validZoom(10), true);
    assert.equal(source.validZoom(3), false);
    assert.equal(source.validZoom(17), true);
  });

  it('correctly displays an overlay with an invalid overzoom', () => {
    const source = new Rapid.ImagerySource(context, { id:'anyid', zoomExtent: [6,16], overzoom: 'gibberish'});
    assert.equal(source.validZoom(10), true);
    assert.equal(source.validZoom(3), false);
    assert.equal(source.validZoom(17), true);
  });

  it('correctly displays an overlay with overzoom:true', () => {
    const source = new Rapid.ImagerySource(context, { id:'anyid', zoomExtent: [6,16], overzoom: true});
    assert.equal(source.validZoom(10), true);
    assert.equal(source.validZoom(3), false);
    assert.equal(source.validZoom(17), true);
  });

  it('correctly displays an overlay with overzoom:false', () => {
    const source = new Rapid.ImagerySource(context, { id:'anyid', zoomExtent: [6,16], overzoom: false});
    assert.equal(source.validZoom(10), true);
    assert.equal(source.validZoom(3), false);
    assert.equal(source.validZoom(17), false);
  });
});

describe('ImagerySourceCustom', () => {
  const context = new MockContext();

  describe('imageryUsed', () => {
    it('returns an imagery_used string', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com');
      assert.equal(source.imageryUsed, 'Custom (http://example.com )');  // note ' )' space
    });
    it('sanitizes `access_token`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com?access_token=MYTOKEN');
      assert.equal(source.imageryUsed, 'Custom (http://example.com?access_token={apikey} )');
    });
    it('sanitizes `connectId`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com?connectId=MYTOKEN');
      assert.equal(source.imageryUsed, 'Custom (http://example.com?connectId={apikey} )');
    });
    it('sanitizes `token`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com?token=MYTOKEN');
      assert.equal(source.imageryUsed, 'Custom (http://example.com?token={apikey} )');
    });
    it('sanitizes `key`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com?key=MYTOKEN');
      assert.equal(source.imageryUsed, 'Custom (http://example.com?key={apikey} )');
    });
    it('sanitizes `Signature` for CloudFront', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'https://example.com/?Key-Pair-Id=foo&Policy=bar&Signature=MYTOKEN');
      assert.equal(source.imageryUsed, 'Custom (https://example.com/?Key-Pair-Id=foo&Policy=bar&Signature={apikey} )');
    });
    it('sanitizes wms path `token`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com/wms/v1/token/MYTOKEN/1.0.0/layer');
      assert.equal(source.imageryUsed, 'Custom (http://example.com/wms/v1/token/{apikey}/1.0.0/layer )');
    });
    it('sanitizes `key` in the URL path', function() {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com/services;key=MYTOKEN/layer');
      assert.equal(source.imageryUsed, 'Custom (http://example.com/services;key={apikey}/layer )');
    });
  });
});
