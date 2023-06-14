export * from './actions/index';
export * from './behaviors/index';
export * from './core/index';
export * from './geo/index';
export * from './modes/index';
export * from './operations/index';
export * from './osm/index';
export * from './services/index';
export * from './svg/index';
export * from './ui/fields/index';
export * from './ui/panels/index';
export * from './ui/panes/index';
export * from './ui/sections/index';
export * from './ui/settings/index';
export * from './ui/index';
export * from './util/index';
export * from './validations/index';

export { Context } from './Context';

// Reexport only what our tests use, see iD#4379
import * as D3 from 'd3';
export const d3 = {
  polygonArea: D3.polygonArea,
  polygonCentroid: D3.polygonCentroid,
  select: D3.select,
  selectAll: D3.selectAll,
  timerFlush: D3.timerFlush
};

// Reexport the sdk things that our tests use too
import * as SDKMATH from '@rapid-sdk/math';
import * as SDKUTIL from '@rapid-sdk/util';
export const sdk = {
  Projection: SDKMATH.Projection,
  Extent: SDKMATH.Extent,
  geoSphericalDistance: SDKMATH.geoSphericalDistance,
  geoZoomToScale: SDKMATH.geoZoomToScale,
  vecLength: SDKMATH.vecLength,
  utilQsString: SDKUTIL.utilQsString,
  utilStringQs: SDKUTIL.utilStringQs
};
