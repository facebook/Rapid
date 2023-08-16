export * from './lib/index';

import { AbstractSystem } from './AbstractSystem';
import { DataLoaderSystem } from './DataLoaderSystem';
import { EditSystem } from './EditSystem';
import { FilterSystem } from './FilterSystem';
import { ImagerySystem } from './ImagerySystem';
import { LocalizationSystem } from './LocalizationSystem';
import { LocationSystem } from './LocationSystem';
import { MapSystem } from './MapSystem';
import { Map3dSystem } from './Map3dSystem';
import { PhotoSystem } from './PhotoSystem';
import { PresetSystem } from './PresetSystem';
import { RapidSystem } from './RapidSystem';
import { StorageSystem } from './StorageSystem';
import { UiSystem } from './UiSystem';
import { UploaderSystem } from './UploaderSystem';
import { UrlHashSystem } from './UrlHashSystem';
import { ValidationSystem } from './ValidationSystem';

export {
  AbstractSystem,
  DataLoaderSystem,
  EditSystem,
  FilterSystem,
  ImagerySystem,
  LocalizationSystem,
  LocationSystem,
  MapSystem,
  Map3dSystem,
  PhotoSystem,
  PresetSystem,
  RapidSystem,
  StorageSystem,
  UiSystem,
  UploaderSystem,
  UrlHashSystem,
  ValidationSystem
};

// At init time, we will instantiate any that are in the 'available' collection.
export const systems = {
  available: new Map()   // Map (id -> System constructor)
};

systems.available.set('data', DataLoaderSystem);
systems.available.set('edits', EditSystem);
systems.available.set('filters', FilterSystem);
systems.available.set('imagery', ImagerySystem);
systems.available.set('l10n', LocalizationSystem);
systems.available.set('locations', LocationSystem);
systems.available.set('map', MapSystem);
systems.available.set('map3d', Map3dSystem);
systems.available.set('photos', PhotoSystem);
systems.available.set('presets', PresetSystem);
systems.available.set('rapid', RapidSystem);
systems.available.set('storage', StorageSystem);
systems.available.set('ui', UiSystem);
systems.available.set('uploader', UploaderSystem);
systems.available.set('urlhash', UrlHashSystem);
systems.available.set('validator', ValidationSystem);
