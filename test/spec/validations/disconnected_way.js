describe('validations.disconnected_way', function () {
    var context;

    beforeEach(function() {
        context = Rapid.coreContext().assetPath('../dist/').init();
    });

    function createWay(tags) {
        var n1 = Rapid.osmNode({id: 'n-1', loc: [4,4]});
        var n2 = Rapid.osmNode({id: 'n-2', loc: [4,5]});
        var w = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2'], tags: tags});

        context.perform(
            Rapid.actionAddEntity(n1),
            Rapid.actionAddEntity(n2),
            Rapid.actionAddEntity(w)
        );
    }

    function createConnectingWays(tags1, tags2) {
        var n1 = Rapid.osmNode({id: 'n-1', loc: [4,4]});
        var n2 = Rapid.osmNode({id: 'n-2', loc: [4,5]});
        var n3 = Rapid.osmNode({id: 'n-3', loc: [5,5]});
        var w = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2'], tags: tags1});
        var w2 = Rapid.osmWay({id: 'w-2', nodes: ['n-1', 'n-3'], tags: tags2});

        context.perform(
            Rapid.actionAddEntity(n1),
            Rapid.actionAddEntity(n2),
            Rapid.actionAddEntity(n3),
            Rapid.actionAddEntity(w),
            Rapid.actionAddEntity(w2)
        );
    }

    function validate() {
        var validator = Rapid.validationDisconnectedWay(context);
        var changes = context.editSystem().changes();
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

    it('flags disconnected highway', function() {
        createWay({'highway': 'unclassified'});
        var issues = validate();
        expect(issues).to.have.lengthOf(1);
        var issue = issues[0];
        expect(issue.type).to.eql('disconnected_way');
        expect(issue.subtype).to.eql('highway');
        expect(issue.severity).to.eql('warning');
        expect(issue.entityIds).to.have.lengthOf(1);
        expect(issue.entityIds[0]).to.eql('w-1');
    });

    it('flags highway connected only to service area', function() {
        createConnectingWays({'highway': 'unclassified'}, {'highway': 'services'});
        var issues = validate();
        expect(issues).to.have.lengthOf(1);
        var issue = issues[0];
        expect(issue.type).to.eql('disconnected_way');
        expect(issue.subtype).to.eql('highway');
        expect(issue.severity).to.eql('warning');
        expect(issue.entityIds).to.have.lengthOf(1);
        expect(issue.entityIds[0]).to.eql('w-1');
    });

    it('ignores highway with connected entrance vertex', function() {

        var n1 = Rapid.osmNode({id: 'n-1', loc: [4,4], tags: {'entrance': 'yes'}});
        var n2 = Rapid.osmNode({id: 'n-2', loc: [4,5]});
        var n3 = Rapid.osmNode({id: 'n-3', loc: [5,5]});
        var w = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2'], tags: {'highway': 'unclassified'}});
        var w2 = Rapid.osmWay({id: 'w-2', nodes: ['n-1', 'n-3']});

        context.perform(
            Rapid.actionAddEntity(n1),
            Rapid.actionAddEntity(n2),
            Rapid.actionAddEntity(n3),
            Rapid.actionAddEntity(w),
            Rapid.actionAddEntity(w2)
        );

        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

});
