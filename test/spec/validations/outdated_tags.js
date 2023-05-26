describe('validations.outdated_tags', function () {
    var context;

    beforeEach(function() {
        context = Rapid.coreContext()
            .assetPath('../dist/')
            .init();
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

    function createRelation(wayTags, relationTags) {
        var n1 = Rapid.osmNode({id: 'n-1', loc: [4,4]});
        var n2 = Rapid.osmNode({id: 'n-2', loc: [4,5]});
        var n3 = Rapid.osmNode({id: 'n-3', loc: [5,5]});
        var w = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2', 'n-3', 'n-1'], tags: wayTags});
        var r = Rapid.osmRelation({id: 'r-1', members: [{id: 'w-1'}], tags: relationTags});

        context.perform(
            Rapid.actionAddEntity(n1),
            Rapid.actionAddEntity(n2),
            Rapid.actionAddEntity(n3),
            Rapid.actionAddEntity(w),
            Rapid.actionAddEntity(r)
        );
    }

    function validate(validator) {
        var changes = context.history().changes();
        var entities = changes.modified.concat(changes.created);
        var issues = [];
        entities.forEach(function(entity) {
            issues = issues.concat(validator(entity, context.graph()));
        });
        return issues;
    }

    it('has no errors on init', function(done) {
        var validator = Rapid.validationOutdatedTags(context);
        window.setTimeout(function() {   // async, so data will be available
            var issues = validate(validator);
            expect(issues).to.have.lengthOf(0);
            done();
        }, 20);
    });

    it('has no errors on good tags', function(done) {
        createWay({'highway': 'unclassified'});
        var validator = Rapid.validationOutdatedTags(context);
        window.setTimeout(function() {   // async, so data will be available
            var issues = validate(validator);
            expect(issues).to.have.lengthOf(0);
            done();
        }, 20);
    });

    it('flags deprecated tag with replacement', function(done) {
        createWay({'highway': 'ford'});
        var validator = Rapid.validationOutdatedTags(context);
        window.setTimeout(function() {   // async, so data will be available
            var issues = validate(validator);
            expect(issues).to.have.lengthOf(1);
            var issue = issues[0];
            expect(issue.type).to.eql('outdated_tags');
            expect(issue.subtype).to.eql('deprecated_tags');
            expect(issue.severity).to.eql('warning');
            expect(issue.entityIds).to.have.lengthOf(1);
            expect(issue.entityIds[0]).to.eql('w-1');
            done();
        }, 20);
    });

    it('flags deprecated tag with no replacement', function(done) {
        createWay({'highway': 'no'});
        var validator = Rapid.validationOutdatedTags(context);
        window.setTimeout(function() {   // async, so data will be available
            var issues = validate(validator);
            expect(issues).to.have.lengthOf(1);
            var issue = issues[0];
            expect(issue.type).to.eql('outdated_tags');
            expect(issue.subtype).to.eql('deprecated_tags');
            expect(issue.severity).to.eql('warning');
            expect(issue.entityIds).to.have.lengthOf(1);
            expect(issue.entityIds[0]).to.eql('w-1');
            done();
        }, 20);
    });

    it('ignores way with no relations', function(done) {
        createWay({});
        var validator = Rapid.validationOutdatedTags(context);
        window.setTimeout(function() {   // async, so data will be available
            var issues = validate(validator);
            expect(issues).to.have.lengthOf(0);
            done();
        }, 20);
    });

    it('ignores multipolygon tagged on the relation', function(done) {
        createRelation({}, { type: 'multipolygon', building: 'yes' });
        var validator = Rapid.validationOutdatedTags(context);
        window.setTimeout(function() {   // async, so data will be available
            var issues = validate(validator);
            expect(issues).to.have.lengthOf(0);
            done();
        }, 20);
    });

    it('flags multipolygon tagged on the outer way', function(done) {
        createRelation({ building: 'yes' }, { type: 'multipolygon' });
        var validator = Rapid.validationOutdatedTags(context);
        window.setTimeout(function() {   // async, so data will be available
            var issues = validate(validator);
            expect(issues).to.not.have.lengthOf(0);
            var issue = issues[0];
            expect(issue.type).to.eql('outdated_tags');
            expect(issue.subtype).to.eql('old_multipolygon');
            expect(issue.entityIds).to.have.lengthOf(2);
            expect(issue.entityIds[0]).to.eql('w-1');
            expect(issue.entityIds[1]).to.eql('r-1');
            done();
        }, 20);
    });

});
