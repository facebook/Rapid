import { vecEqual } from '@rapid-sdk/math';
import { utilArrayUnion, utilArrayUniq } from '@rapid-sdk/util';
import deepEqual from 'fast-deep-equal';
import { diff3Merge } from 'node-diff3';

import { actionDeleteMultiple } from './delete_multiple.js';
import { osmEntity } from '../osm/entity.js';


export function actionMergeRemoteChanges(id, options = {}) {
  const localGraph = options.localGraph;
  const remoteGraph = options.remoteGraph;
  const discardTags = options.discardTags ?? {};
  const formatUser = options.formatUser ?? (d => d);
  const localize = options.localize ?? (d => d);
  const strategy = options.strategy ?? 'safe';   // 'safe', 'force_local', 'force_remote'

  let _conflicts = [];


  function mergeLocation(remote, target) {
    const EPSILON = 1e-6;
    if (strategy === 'force_local' || vecEqual(target.loc, remote.loc, EPSILON)) {
      return target;
    }
    if (strategy === 'force_remote') {
      return target.update({ loc: remote.loc });
    }

    _conflicts.push(
      localize('merge_remote_changes.conflict.location', { user: formatUser(remote.user) })
    );
    return target;
  }


  function mergeNodes(base, remote, target) {
    if (strategy === 'force_local' || deepEqual(target.nodes, remote.nodes)) {
      return target;
    }
    if (strategy === 'force_remote') {
      return target.update({ nodes: remote.nodes });
    }

    const origLength = _conflicts.length;
    const o = base.nodes || [];
    const a = target.nodes || [];
    const b = remote.nodes || [];
    const hunks = diff3Merge(a, o, b, { excludeFalseConflicts: true });
    let nodes = [];

    for (const hunk of hunks) {
      if (hunk.ok) {
        nodes.push.apply(nodes, hunk.ok);
      } else {
        // for all conflicts, we can assume c.a !== c.b
        // because `diff3Merge` called with `true` option to exclude false conflicts..
        const c = hunk.conflict;
        if (deepEqual(c.o, c.a)) {  // only changed remotely
          nodes.push.apply(nodes, c.b);
        } else if (deepEqual(c.o, c.b)) {  // only changed locally
          nodes.push.apply(nodes, c.a);
        } else {       // changed both locally and remotely
          _conflicts.push(
            localize('merge_remote_changes.conflict.nodelist', { user: formatUser(remote.user) })
          );
          break;
        }
      }
    }

    return (_conflicts.length === origLength) ? target.update({ nodes: nodes }) : target;
  }


  function mergeChildren(targetWay, children, updates, graph) {
    function isUsed(node, targetWay) {
      const hasInterestingParent = graph.parentWays(node).some(way => way.id !== targetWay.id);
      return node.hasInterestingTags() || hasInterestingParent || graph.parentRelations(node).length > 0;
    }

    const origLength = _conflicts.length;

    for (const id of children) {
      const node = graph.hasEntity(id);

      // remove unused childNodes..
      if (targetWay.nodes.indexOf(id) === -1) {
        if (node && !isUsed(node, targetWay)) {
          updates.removeIDs.push(id);
        }
        continue;
      }

      // restore used childNodes..
      const local = localGraph.hasEntity(id);
      const remote = remoteGraph.hasEntity(id);
      let target;

      if (strategy === 'force_remote' && remote && remote.visible) {
        updates.replacements.push(remote);

      } else if (strategy === 'force_local' && local) {
        target = osmEntity(local);
        if (remote) {
          target = target.update({ version: remote.version });
        }
        updates.replacements.push(target);

      } else if (strategy === 'safe' && local && remote && local.version !== remote.version) {
        target = osmEntity(local, { version: remote.version });
        if (remote.visible) {
          target = mergeLocation(remote, target);
        } else {
          _conflicts.push(
            localize('merge_remote_changes.conflict.deleted', { user: formatUser(remote.user) })
          );
        }

        if (_conflicts.length !== origLength) break;
        updates.replacements.push(target);
      }
    }

    return targetWay;
  }


  function updateChildren(updates, graph) {
    for (const entity of updates.replacements) {
      graph = graph.replace(entity);
    }
    if (updates.removeIDs.length) {
      graph = actionDeleteMultiple(updates.removeIDs)(graph);
    }
    return graph;
  }


  function mergeMembers(remote, target) {
    if (strategy === 'force_local' || deepEqual(target.members, remote.members)) {
      return target;
    }
    if (strategy === 'force_remote') {
      return target.update({ members: remote.members });
    }

    _conflicts.push(
      localize('merge_remote_changes.conflict.memberlist', { user: formatUser(remote.user) })
    );
    return target;
  }


  function mergeTags(base, remote, target) {
    if (strategy === 'force_local' || deepEqual(target.tags, remote.tags)) {
      return target;
    }
    if (strategy === 'force_remote') {
      return target.update({tags: remote.tags});
    }

    const origLength = _conflicts.length;
    const o = base.tags ?? {};
    const a = target.tags ?? {};
    const b = remote.tags ?? {};
    const keys = utilArrayUnion(utilArrayUnion(Object.keys(o), Object.keys(a)), Object.keys(b))
        .filter(function(k) { return !discardTags[k]; });
    let tags = Object.assign({}, a);   // shallow copy
    let changed = false;

    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];

      if (o[k] !== b[k] && a[k] !== b[k]) {    // changed remotely..
        if (o[k] !== a[k]) {      // changed locally..
          _conflicts.push(
            localize('merge_remote_changes.conflict.tags', {
              tag: k, local: a[k], remote: b[k], user: formatUser(remote.user)
            })
          );

        } else {                  // unchanged locally, accept remote change..
          if (b.hasOwnProperty(k)) {
            tags[k] = b[k];
          } else {
            delete tags[k];
          }
          changed = true;
        }
      }
    }

    return (changed && _conflicts.length === origLength) ? target.update({ tags: tags }) : target;
  }


  //  `graph.base()` is the common ancestor of the two graphs.
  //  `localGraph` contains user's edits up to saving
  //  `remoteGraph` contains remote edits to modified nodes
  //  `graph` must be a descendant of `localGraph` and may include
  //      some conflict resolution actions performed on it.
  //
  //                  --- ... --- `localGraph` -- ... -- `graph`
  //                 /
  //  `graph.base()` --- ... --- `remoteGraph`
  //
  let action = function(graph) {
    const updates = { replacements: [], removeIDs: [] };
    const base = graph.base.entities.get(id);
    const local = localGraph.entity(id);
    const remote = remoteGraph.entity(id);
    let target = osmEntity(local, { version: remote.version });

    // delete/undelete
    if (!remote.visible) {
      if (strategy === 'force_remote') {
        return actionDeleteMultiple([id])(graph);

      } else if (strategy === 'force_local') {
        if (target.type === 'way') {
          target = mergeChildren(target, utilArrayUniq(local.nodes), updates, graph);
          graph = updateChildren(updates, graph);
        }
        return graph.replace(target);

      } else {
        _conflicts.push(
          localize('merge_remote_changes.conflict.deleted', { user: formatUser(remote.user) })
        );
        return graph;  // do nothing
      }
    }

    // merge
    if (target.type === 'node') {
      target = mergeLocation(remote, target);

    } else if (target.type === 'way') {
      // pull in any child nodes that may not be present locally..
      graph.rebase(remoteGraph.childNodes(remote), [graph], false);
      target = mergeNodes(base, remote, target);
      target = mergeChildren(target, utilArrayUnion(local.nodes, remote.nodes), updates, graph);

    } else if (target.type === 'relation') {
      target = mergeMembers(remote, target);
    }

    target = mergeTags(base, remote, target);

    if (!_conflicts.length) {
      graph = updateChildren(updates, graph).replace(target);
    }

    return graph;
  };


  action.conflicts = function() {
    return _conflicts;
  };


  return action;
}
