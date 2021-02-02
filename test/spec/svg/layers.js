describe('iD.svgLayers', function () {
    var context, container;
    var projection = d3.geoProjection(function(x, y) { return [x, -y]; })
        .translate([0, 0])
        .scale(iD.geoZoomToScale(17))
        .clipExtent([[0, 0], [Infinity, Infinity]]);

    beforeEach(function () {
        context = iD.coreContext().init();
        container = d3.select(document.createElement('div'));
    });


    it('creates a single svg surface', function () {
        container.call(iD.svgLayers(projection, context));
        var nodes = container.selectAll('svg.surface').nodes();
        expect(nodes.length).to.eql(1);
    });

    it('creates a single defs', function () {
        container.call(iD.svgLayers(projection, context));
        var nodes = container.selectAll('svg.surface > defs.surface-defs').nodes();
        expect(nodes.length).to.eql(1);
    });

    it('creates default data layers', function () {
        container.call(iD.svgLayers(projection, context));
        var nodes = container.selectAll('svg .data-layer').nodes();
        expect(nodes.length).to.eql(16);
        expect(d3.select(nodes[0]).classed('ai-features')).to.be.true;
        expect(d3.select(nodes[1]).classed('osm')).to.be.true;
        expect(d3.select(nodes[2]).classed('notes')).to.be.true;
        expect(d3.select(nodes[3]).classed('data')).to.be.true;
        expect(d3.select(nodes[4]).classed('keepRight')).to.be.true;
        expect(d3.select(nodes[5]).classed('improveOSM')).to.be.true;
        expect(d3.select(nodes[6]).classed('osmose')).to.be.true;
        expect(d3.select(nodes[7]).classed('streetside')).to.be.true;
        expect(d3.select(nodes[8]).classed('mapillary')).to.be.true;
        expect(d3.select(nodes[9]).classed('mapillary-position')).to.be.true;
        expect(d3.select(nodes[10]).classed('mapillary-map-features')).to.be.true;
        expect(d3.select(nodes[11]).classed('mapillary-signs')).to.be.true;
        expect(d3.select(nodes[12]).classed('openstreetcam')).to.be.true;
        expect(d3.select(nodes[13]).classed('debug')).to.be.true;
        expect(d3.select(nodes[14]).classed('geolocate')).to.be.true;
        expect(d3.select(nodes[15]).classed('touch')).to.be.true;
    });

});