describe('iD.pixiMapUILayer', function () {
    var context, content, map;


    beforeEach(function() {
        content = d3.select('body').append('div');
        context = iD.coreContext().assetPath('../dist/').init().container(content);
        map = context.map();
        content.call(map);
    });

    afterEach(() => { });

    describe('#exists', function () {
        it('is part of the pixi layers store', function () {
            expect(map.layers().getLayer('pixiMapUI')).not.to.be.an('undefined');
        });


        it('is not enabled by default', function () {
            expect(map.layers().getLayer('pixiMapUI').enabled).not.to.be.true;
        });


        it('has the highest z-index of any other layer', function () {
            let zIndex = map.layers().getLayer('pixiMapUI').zIndex;
            expect(map.layers().getLayers().every(layer => layer.zIndex <= zIndex)).to.be.true;
        });
    });
});