describe('validations.mismatched_geometry', function () {
    var context, _savedAreaKeys;

    beforeEach(function() {
        _savedAreaKeys = Rapid.osmAreaKeys;
        context = Rapid.coreContext()
            .assetPath('../dist/')
            .init();
    });

    afterEach(function() {
        Rapid.osmSetAreaKeys(_savedAreaKeys);
    });


    function createPoint(tags) {
        var n1 = Rapid.osmNode({id: 'n-1', loc: [4,4], tags: tags});
        context.perform(
            Rapid.actionAddEntity(n1)
        );
    }

    function createOpenWay(tags) {
        var n1 = Rapid.osmNode({id: 'n-1', loc: [4,4]});
        var n2 = Rapid.osmNode({id: 'n-2', loc: [4,5]});
        var n3 = Rapid.osmNode({id: 'n-3', loc: [5,5]});
        var w = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2', 'n-3'], tags: tags});

        context.perform(
            Rapid.actionAddEntity(n1),
            Rapid.actionAddEntity(n2),
            Rapid.actionAddEntity(n3),
            Rapid.actionAddEntity(w)
        );
    }

    function createClosedWay(tags) {
        var n1 = Rapid.osmNode({id: 'n-1', loc: [4,4]});
        var n2 = Rapid.osmNode({id: 'n-2', loc: [4,5]});
        var n3 = Rapid.osmNode({id: 'n-3', loc: [5,5]});
        var w = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2', 'n-3', 'n-1'], tags: tags});

        context.perform(
            Rapid.actionAddEntity(n1),
            Rapid.actionAddEntity(n2),
            Rapid.actionAddEntity(n3),
            Rapid.actionAddEntity(w)
        );
    }

    function validate() {
        var validator = Rapid.validationMismatchedGeometry(context);
        var changes = context.history().changes();
        var entities = changes.modified.concat(changes.created);
        var issues = [];
        entities.forEach(function(entity) {
            issues = issues.concat(validator(entity, context.graph()));
        });
        return issues;
    }


    it('has no errors on init', function() {
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('ignores points', function() {
        createPoint({ building: 'yes' });
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('ignores open way without area tag', function() {
        createOpenWay({});
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('ignores closed way with area tag', function() {
        createClosedWay({ building: 'yes' });
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('ignores open way with tag that allows both lines and areas', function() {
        createOpenWay({ man_made: 'yes' });
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('flags open way with area tag', function() {
        Rapid.osmSetAreaKeys({ building: {} });
        createOpenWay({ building: 'yes' });
        var issues = validate();
        expect(issues).to.have.lengthOf(1);
        var issue = issues[0];
        expect(issue.type).to.eql('mismatched_geometry');
        expect(issue.subtype).to.eql('area_as_line');
        expect(issue.severity).to.eql('warning');
        expect(issue.entityIds).to.have.lengthOf(1);
        expect(issue.entityIds[0]).to.eql('w-1');
    });

    it('flags open way with both area and line tags', function() {
        createOpenWay({ area: 'yes', barrier: 'fence' });
        var issues = validate();
        expect(issues).to.have.lengthOf(1);
        var issue = issues[0];
        expect(issue.type).to.eql('mismatched_geometry');
        expect(issue.subtype).to.eql('area_as_line');
        expect(issue.severity).to.eql('warning');
        expect(issue.entityIds).to.have.lengthOf(1);
        expect(issue.entityIds[0]).to.eql('w-1');
    });

});
