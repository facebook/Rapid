export * from './check.js';
export * from './combo.js';
export * from './input.js';
export * from './access.js';
export * from './address.js';
export * from './cycleway.js';
export * from './lanes.js';
export * from './localized.js';
export * from './roadspeed.js';
export * from './radio.js';
export * from './restrictions.js';
export * from './textarea.js';
export * from './wikidata.js';
export * from './wikipedia.js';

import {
    uiFieldCheck,
    uiFieldDefaultCheck,
    uiFieldOnewayCheck
} from './check.js';

import {
    uiFieldCombo,
    uiFieldManyCombo,
    uiFieldMultiCombo,
    uiFieldNetworkCombo,
    uiFieldSemiCombo,
    uiFieldTypeCombo
} from './combo.js';

import {
    uiFieldEmail,
    uiFieldIdentifier,
    uiFieldNumber,
    uiFieldTel,
    uiFieldText,
    uiFieldUrl
} from './input.js';

import {
    uiFieldRadio,
    uiFieldStructureRadio
} from './radio.js';

import { uiFieldAccess } from './access.js';
import { uiFieldAddress } from './address.js';
import { uiFieldCycleway } from './cycleway.js';
import { uiFieldLanes } from './lanes.js';
import { uiFieldLocalized } from './localized.js';
import { uiFieldRoadspeed } from './roadspeed.js';
// import { uiFieldRestrictions } from './restrictions.js';
import { uiFieldTextarea } from './textarea.js';
import { uiFieldWikidata } from './wikidata.js';
import { uiFieldWikipedia } from './wikipedia.js';

export var uiFields = {
    access: uiFieldAccess,
    address: uiFieldAddress,
    check: uiFieldCheck,
    combo: uiFieldCombo,
    cycleway: uiFieldCycleway,
    defaultCheck: uiFieldDefaultCheck,
    email: uiFieldEmail,
    identifier: uiFieldIdentifier,
    lanes: uiFieldLanes,
    localized: uiFieldLocalized,
    roadspeed: uiFieldRoadspeed,
    roadheight: uiFieldText,
    manyCombo: uiFieldManyCombo,
    multiCombo: uiFieldMultiCombo,
    networkCombo: uiFieldNetworkCombo,
    number: uiFieldNumber,
    onewayCheck: uiFieldOnewayCheck,
    radio: uiFieldRadio,
    // restrictions: uiFieldRestrictions,
    semiCombo: uiFieldSemiCombo,
    structureRadio: uiFieldStructureRadio,
    tel: uiFieldTel,
    text: uiFieldText,
    textarea: uiFieldTextarea,
    typeCombo: uiFieldTypeCombo,
    url: uiFieldUrl,
    wikidata: uiFieldWikidata,
    wikipedia: uiFieldWikipedia
};
