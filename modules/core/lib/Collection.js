import { utilArrayUniq, utilEditDistance } from '@rapid-sdk/util';

const MAXRESULTS = 50;


/**
 * Collection
 * Collection is a wrapper around an `Array` of presets
 * and decorated with some extra methods for searching and matching geometry
 */
export class Collection {

  /**
   * @constructor
   * @param  context   Global shared application context
   * @param  arr       An Array
   */
  constructor(context, arr) {
    this.context = context;
    this.array = arr;
    this._memo = new Map();  // Map(id -> item)
  }


  item(id) {
    let found = this._memo.get(id);
    if (found) return found;

    found = this.array.find(d => d.id === id);
    if (found) this._memo.set(id, found);
    return found;
  }

  index(id) {
    return this.array.findIndex(d => d.id === id);
  }

  matchGeometry(geometry) {
    const result = this.array.filter(d => d.matchGeometry(geometry));
    return new Collection(this.context, result);
  }

  matchAllGeometry(geometries) {
    const result = this.array.filter(d => d && d.matchAllGeometry(geometries));
    return new Collection(this.context, result);
  }

  fallback(geometry) {
    let id = geometry;
    if (id === 'vertex') id = 'point';
    return this.item(id);
  }

  search(value, geometry, loc) {
    if (!value) return this;

    // don't remove diacritical characters since we're assuming the user is being intentional
    value = value.toLowerCase().trim();

    // match at name beginning or just after a space (e.g. "office" -> match "Law Office")
    function leading(a) {
      const index = a.indexOf(value);
      return index === 0 || a[index - 1] === ' ';
    }

    // match at name beginning only
    function leadingStrict(a) {
      const index = a.indexOf(value);
      return index === 0;
    }

    function sortPresets(nameProp) {
      return function sortNames(a, b) {
        let aCompare = a[nameProp]();
        let bCompare = b[nameProp]();

        // priority if search string matches preset name exactly - #4325
        if (value === aCompare) return -1;
        if (value === bCompare) return 1;

        // priority for higher matchScore
        let i = b.orig.matchScore - a.orig.matchScore;
        if (i !== 0) return i;

        // priority if search string appears earlier in preset name
        i = aCompare.indexOf(value) - bCompare.indexOf(value);
        if (i !== 0) return i;

        // priority for shorter preset names
        return aCompare.length - bCompare.length;
      };
    }

    let pool = this.array.filter(a => a.matchGeometry(geometry));
    if (Array.isArray(loc)) {
      const locations = this.context.systems.locations;
      const validHere = locations.locationSetsAt(loc);
      pool = pool.filter(a => !a.locationSetID || validHere[a.locationSetID]);
    }

    const searchable = pool.filter(a => a.searchable !== false && a.suggestion !== true);
    const suggestions = pool.filter(a => a.suggestion === true);

    // matches value to preset.name
    const leadingNames = searchable
      .filter(a => leading(a.searchName()))
      .sort(sortPresets('searchName'));

    // matches value to preset suggestion name
    const leadingSuggestions = suggestions
      .filter(a => leadingStrict(a.searchName()))
      .sort(sortPresets('searchName'));

    const leadingNamesStripped = searchable
      .filter(a => leading(a.searchNameStripped()))
      .sort(sortPresets('searchNameStripped'));

    const leadingSuggestionsStripped = suggestions
      .filter(a => leadingStrict(a.searchNameStripped()))
      .sort(sortPresets('searchNameStripped'));

    // matches value to preset.terms values
    const leadingTerms = searchable
      .filter(a => (a.terms() || []).some(leading));

    const leadingSuggestionTerms = suggestions
      .filter(a => (a.terms() || []).some(leading));

    // matches value to preset.tags values
    const leadingTagValues = searchable
      .filter(a => Object.values(a.tags || {}).filter(val => val !== '*').some(leading));

    // finds close matches to value in preset.name
    const similarName = searchable
      .map(a => ({ preset: a, dist: utilEditDistance(value, a.searchName()) }))
      .filter(a => a.dist + Math.min(value.length - a.preset.searchName().length, 0) < 3)
      .sort((a, b) => a.dist - b.dist)
      .map(a => a.preset);

    // finds close matches to value to preset suggestion name
    const similarSuggestions = suggestions
      .map(a => ({ preset: a, dist: utilEditDistance(value, a.searchName()) }))
      .filter(a => a.dist + Math.min(value.length - a.preset.searchName().length, 0) < 1)
      .sort((a, b) => a.dist - b.dist)
      .map(a => a.preset);

    // finds close matches to value in preset.terms
    const similarTerms = searchable
      .filter(a => {
        return (a.terms() || []).some(b => {
          return utilEditDistance(value, b) + Math.min(value.length - b.length, 0) < 3;
        });
      });

    let results = leadingNames.concat(
      leadingSuggestions,
      leadingNamesStripped,
      leadingSuggestionsStripped,
      leadingTerms,
      leadingSuggestionTerms,
      leadingTagValues,
      similarName,
      similarSuggestions,
      similarTerms
    ).slice(0, MAXRESULTS - 1);

    if (typeof geometry === 'string') {
      const fallback = this.fallback(geometry);
      if (fallback) {
        results.push(fallback);
      }
    }

    return new Collection(this.context, utilArrayUniq(results));
  }

}
