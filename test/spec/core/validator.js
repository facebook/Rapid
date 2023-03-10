describe('coreValidator', function () {
    var context;

    beforeEach(function() {
        context = Rapid.coreContext().assetPath('../dist/').init();
    });

    function createInvalidWay() {
        var n1 = Rapid.osmNode({id: 'n-1', loc: [4,4]});
        var n2 = Rapid.osmNode({id: 'n-2', loc: [4,5]});
        var w = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2']});

        context.perform(
            Rapid.actionAddEntity(n1),
            Rapid.actionAddEntity(n2),
            Rapid.actionAddEntity(w)
        );
    }

    it('has no issues on init', function() {
        var validator = new Rapid.coreValidator(context);
        validator.init();
        var issues = validator.getIssues();
        expect(issues).to.have.lengthOf(0);
    });

    it('validate returns a promise, fulfilled when the validation has completed', function(done) {
        createInvalidWay();
        var validator = new Rapid.coreValidator(context);
        validator.init();
        var issues = validator.getIssues();
        expect(issues).to.have.lengthOf(0);

        var prom = validator.validate();
        prom
            .then(function() {
                issues = validator.getIssues();
                expect(issues).to.have.lengthOf(1);
                var issue = issues[0];
                expect(issue.type).to.eql('missing_tag');
                expect(issue.entityIds).to.have.lengthOf(1);
                expect(issue.entityIds[0]).to.eql('w-1');
                done();
            })
            .catch(function(err) {
                done(err);
            });

        window.setTimeout(function() {}, 20); // async - to let the promise settle in phantomjs
    });

});
