import { vecInterp } from '@rapid-sdk/math';

import { osmNode, osmRelation, osmWay } from '../osm/index.js';


function findConnectionPoint(graph, newNode, targetWay, nodeA, nodeB) {
    // Find the place to newNode on targetWay between nodeA and nodeB if it does
    // not alter the existing segment's angle much. There may be other nodes
    // between A and B from user edit or other automatic connections.

    var sortByLon = Math.abs(nodeA.loc[0] - nodeB.loc[0]) > Math.abs(nodeA.loc[1] - nodeB.loc[1]);
    var sortFunc = sortByLon
        ? function(n1, n2) {
            return nodeA.loc[0] < nodeB.loc[0]
                ? n1.loc[0] - n2.loc[0]
                : n2.loc[0] - n1.loc[0];
        }
        : function(n1, n2) {
            return nodeA.loc[1] < nodeB.loc[1]
                ? n1.loc[1] - n2.loc[1]
                : n2.loc[1] - n1.loc[1];
        };

    var nidList = targetWay.nodes;
    var idxA = nidList.indexOf(nodeA.id);
    var idxB = nidList.indexOf(nodeB.id);

    // Invariants for finding the insert index below: A and B must be in the
    // node list, in order, and the sort function must also order A before B
    if (idxA === -1 || idxB === -1 || idxA >= idxB || sortFunc(nodeA, nodeB) >= 0) {
        return null;
    }

    var insertIdx = idxA + 1;  // index to insert immediately before
    while (insertIdx < idxB && sortFunc(newNode, graph.entity(nidList[insertIdx])) > 0) {
        insertIdx++;
    }

    // Find the interpolated point on the segment where insertion will not
    // alter the segment's angle.
    var locA = graph.entity(nidList[insertIdx - 1]).loc;
    var locB = graph.entity(nidList[insertIdx]).loc;
    var locN = newNode.loc;
    var coeff = Math.abs(locA[0] - locB[0]) > Math.abs(locA[1] - locB[1])
        ? (locN[0] - locA[0]) / (locB[0] - locA[0])
        : (locN[1] - locA[1]) / (locB[1] - locA[1]);
    var interpLoc = vecInterp(locA, locB, coeff);

    return {
        insertIdx: insertIdx,
        interpLoc: interpLoc,
    };
}


function locationChanged(loc1, loc2) {
    return Math.abs(loc1[0] - loc2[0]) > 2e-5
        || Math.abs(loc1[1] - loc2[1]) > 2e-5;
}


function removeMetadata(entity) {
    delete entity.__fbid__;
    delete entity.__origid__;    // old
    delete entity.__service__;
    delete entity.__datasetid__;
    delete entity.tags.conn;
    delete entity.tags.dupe;
}


export function actionRapidAcceptFeature(entityID, extGraph) {
    return function(graph) {
        var seenRelations = {};    // keep track of seen relations to avoid infinite recursion
        var extEntity = extGraph.entity(entityID);

        if (extEntity.type === 'node') {
            acceptNode(extEntity);
        } else if (extEntity.type === 'way') {
            acceptWay(extEntity);
        } else if (extEntity.type === 'relation') {
            acceptRelation(extEntity);
        }

        return graph;


        // These functions each accept the external entities, returning the replacement
        // NOTE - these functions will update `graph` closure variable

        function acceptNode(extNode) {
            // copy node before modifying
            var node = osmNode(extNode);
            node.tags = Object.assign({}, node.tags);
            removeMetadata(node);

            graph = graph.replace(node);
            return node;
        }


        function acceptWay(extWay) {
            // copy way before modifying
            var way = osmWay(extWay);
            way.nodes = extWay.nodes.slice();
            way.tags = Object.assign({}, way.tags);
            removeMetadata(way);

            var nodes = way.nodes.map(function(nodeId) {
                // copy node before modifying
                var node = osmNode(extGraph.entity(nodeId));
                node.tags = Object.assign({}, node.tags);

                var conn = node.tags.conn && node.tags.conn.split(',');
                var dupeId = node.tags.dupe;
                removeMetadata(node);

                if (dupeId && graph.hasEntity(dupeId) && !locationChanged(graph.entity(dupeId).loc, node.loc)) {
                    node = graph.entity(dupeId);           // keep original node with dupeId
                } else if (graph.hasEntity(node.id) && locationChanged(graph.entity(node.id).loc, node.loc)) {
                    node = osmNode({ loc: node.loc });     // replace (unnecessary copy of node?)
                }

                if (conn && graph.hasEntity(conn[0])) {
                    //conn=w316746574,n3229071295,n3229071273
                    var targetWay = graph.hasEntity(conn[0]);
                    var nodeA = graph.hasEntity(conn[1]);
                    var nodeB = graph.hasEntity(conn[2]);

                    if (targetWay && nodeA && nodeB) {
                        var result = findConnectionPoint(graph, node, targetWay, nodeA, nodeB);
                        if (result && !locationChanged(result.interpLoc, node.loc)) {
                            node.loc = result.interpLoc;
                            graph = graph.replace(targetWay.addNode(node.id, result.insertIdx));
                        }
                    }
                }

                graph = graph.replace(node);
                return node.id;
            });

            way = way.update({ nodes: nodes });
            graph = graph.replace(way);
            return way;
        }


        function acceptRelation(extRelation) {
            var seen = seenRelations[extRelation.id];
            if (seen) return seen;

            // copy relation before modifying
            var relation = osmRelation(extRelation);
            relation.members = extRelation.members.slice();
            relation.tags = Object.assign({}, extRelation.tags);
            removeMetadata(relation);

            var members = relation.members.map(function(member) {
                var extEntity = extGraph.entity(member.id);
                var replacement;

                if (extEntity.type === 'node') {
                    replacement = acceptNode(extEntity);
                } else if (extEntity.type === 'way') {
                    replacement = acceptWay(extEntity);
                } else if (extEntity.type === 'relation') {
                    replacement = acceptRelation(extEntity);
                }

                return Object.assign(member, { id: replacement.id });
            });

            relation = relation.update({ members: members });
            graph = graph.replace(relation);
            seenRelations[extRelation.id] = relation;
            return relation;
        }

    };
}
