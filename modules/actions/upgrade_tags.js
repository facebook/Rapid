
/**
 * actionUpgradeTags
 * This action works specifically to perform tag upgrades as directed by
 *  rules found in the id-tagging-schema `deprecated.json` file.
 * see: https://github.com/openstreetmap/id-tagging-schema/blob/main/data/deprecated.json
 *
 * Some of the types of replacement rules found in the file:
 *
 *  - a basic replacement:
 *  {
 *    "old":     { "building": "home" },
 *    "replace": { "building": "house" }
 *  }
 *
 *  - a '*' replacement:
 *  {
 *    "old":     { "building": "entrance" },
 *    "replace": { "entrance": "*" }
 *  }
 *
 *  - a '$1' token replacement - these are called 'transfer values' in the code below
 *   {
 *     "old":     { "building:min_height": "*" },
 *     "replace": { "min_height": "$1" }
 *   }
 *
 */
export function actionUpgradeTags(entityID, oldTags, replaceTags) {

  return function(graph) {
    const entity = graph.entity(entityID);
    const tags = Object.assign({}, entity.tags);      // shallow copy
    let transferValue;
    let semiIndex;

    for (const [k, v] of Object.entries(oldTags)) {
      if (!(k in tags)) continue;

      if (v === '*') {             // wildcard match
        transferValue = tags[k];   // note the value since we might need to transfer it
        delete tags[k];
      } else if (v === tags[k]) {   // exact match
        delete tags[k];
      } else {    // look for match in semicolon-delimited values
        const vals = tags[k].split(';').filter(Boolean);
        const oldIndex = vals.indexOf(v);
        if (vals.length === 1 || oldIndex === -1) {
          delete tags[k];
        } else {
          if (replaceTags && replaceTags[k]) {
            semiIndex = oldIndex;   // replacing a value within a semicolon-delimited value, note the index
          }
          vals.splice(oldIndex, 1);
          tags[k] = vals.join(';');
        }
      }
    }

    if (replaceTags) {
      for (const [k, v] of Object.entries(replaceTags)) {
        if (v === '*') {
          if (tags[k] && tags[k] !== 'no') {  // allow any pre-existing value except `no` (troll tag)
            continue;
          } else {   // otherwise assume `yes` is okay
            tags[k] = 'yes';
          }
        } else if (v === '$1') {      // replace with transferred value
          tags[k] = transferValue;
        } else {
          if (tags[k] && oldTags[k] && semiIndex !== undefined) {  // replace within semicolon list
            const vals = tags[k].split(';').filter(Boolean);
            if (vals.indexOf(v) === -1) {
              vals.splice(semiIndex, 0, v);
              tags[k] = vals.join(';');
            }
          } else {
            tags[k] = v;
          }
        }
      }
    }

    graph = graph.replace(entity.update({ tags: tags }));
    return graph;
  };
}
