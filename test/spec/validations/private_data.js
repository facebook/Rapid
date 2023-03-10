describe('validations.private_data', function () {
    var context;

    beforeEach(function() {
        context = Rapid.coreContext().assetPath('../dist/').init();
    });

    function createWay(tags) {
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

    function validate() {
        var validator = Rapid.validationPrivateData(context);
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

    it('ignores way with no tags', function() {
        createWay({});
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('ignores way with phone tag', function() {
        createWay({ phone: '123-456-7890' });
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('ignores generic building with phone tag', function() {
        createWay({ building: 'yes', phone: '123-456-7890' });
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('ignores guest house with phone tag', function() {
        createWay({ building: 'house', phone: '123-456-7890', tourism: 'guest_house' });
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('flags house with phone tag', function() {
        createWay({ building: 'house', phone: '123-456-7890' });
        var issues = validate();
        expect(issues).to.have.lengthOf(1);
        var issue = issues[0];
        expect(issue.type).to.eql('private_data');
        expect(issue.entityIds).to.have.lengthOf(1);
        expect(issue.entityIds[0]).to.eql('w-1');
    });

});
