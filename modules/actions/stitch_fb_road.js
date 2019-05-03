import { geoVecInterp } from '../geo/vector';
import { osmEntity } from '../osm';


function connectFbNodeToOSMWay(graph, fbNode, osmWid, nidA, nidB) {
    // Try to insert fbNode on target osmWid between nidA and nidB if it does
    // not alter the existing segment's angle much. There may be other nodes
    // between A and B from user edit or other automatic connections.

    var targetWay = graph.entities[osmWid];
    var nodeA = graph.entities[nidA];
    var nodeB = graph.entities[nidB];

    // target entities must exist
    if (!targetWay || !nodeA || !nodeB) { return graph; }

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
    var idxA = nidList.indexOf(nidA);
    var idxB = nidList.indexOf(nidB);

    // Invariants for finding the insert index below: A and B must be in the
    // node list, in order, and the sort function must also order A before B
    if (idxA === -1 || idxB === -1 || idxA >= idxB || sortFunc(nodeA, nodeB) >= 0) {
        return graph;
    }

    var insertIdx = idxA + 1;  // index to insert immediately before
    while (insertIdx < idxB && sortFunc(fbNode, graph.entity(nidList[insertIdx])) > 0) {
        insertIdx++;
    }

    // Ensure insertion will not much alter segment angle by comparing distance
    // from an interpolated point on the segment.
    var locA = graph.entity(nidList[insertIdx - 1]).loc;
    var locB = graph.entity(nidList[insertIdx]).loc;
    var locN = fbNode.loc;
    var coeff = Math.abs(locA[0] - locB[0]) > Math.abs(locA[1] - locB[1])
        ? (locN[0] - locA[0]) / (locB[0] - locA[0])
        : (locN[1] - locA[1]) / (locB[1] - locA[1]);
    var interpLoc = geoVecInterp(locA, locB, coeff);
    if (Math.abs(locN[0] - interpLoc[0]) > 1e-5 ||
        Math.abs(locN[1] - interpLoc[1]) > 1e-5) {
        return graph;
    }

    graph = graph.replace(targetWay.addNode(fbNode.id, insertIdx));
    return graph;
}


export function actionStitchFbRoad(wayId, fbGraph) {
    return function(graph) {
        // copy way before modifying
        var fbWay = osmEntity(fbGraph.entity(wayId));
        fbWay.nodes = fbWay.nodes.slice();

        delete fbWay.__fbid__;

        fbWay.nodes.forEach(function(nodeId, idx) {
            // copy node before modifying
            var fbNode = osmEntity(fbGraph.entity(nodeId));
            fbNode.tags = Object.assign({}, fbNode.tags);

            var conn = fbNode.tags.conn && fbNode.tags.conn.split(',');
            var dupeId = fbNode.tags.dupe;

            delete fbNode.__fbid__;
            delete fbNode.__origid__;
            delete fbNode.tags.conn;
            delete fbNode.tags.dupe;

            if (dupeId && graph.hasEntity(dupeId)) {
                fbWay.nodes[idx] = dupeId;
            } else if (conn && graph.hasEntity(conn[0])) {
                // conn=w316746574,n3229071295,n3229071273
                var osmWid = conn[0];
                var nidA = conn[1];
                var nidB = conn[2];
                graph = connectFbNodeToOSMWay(graph, fbNode, osmWid, nidA, nidB);
                graph = graph.replace(fbNode);
            } else {
                graph = graph.replace(fbNode);
            }
        });

        graph = graph.replace(fbWay);
        return graph;
    };
}
