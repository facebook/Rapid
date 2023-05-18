describe('ValidationSystem', () => {
  let _context;

  beforeEach(() => {
    _context = Rapid.coreContext().assetPath('../dist/').init();
  });


  function createInvalidWay() {
    const n1 = Rapid.osmNode({ id: 'n-1', loc: [4, 4] });
    const n2 = Rapid.osmNode({ id: 'n-2', loc: [4, 5] });
    const w1 = Rapid.osmWay({ id: 'w-1', nodes: ['n-1', 'n-2'] });

    _context.perform(
      Rapid.actionAddEntity(n1),
      Rapid.actionAddEntity(n2),
      Rapid.actionAddEntity(w1)
    );
  }

  it('has no issues on init', () => {
    const validator = new Rapid.ValidationSystem(_context);
    validator.init();
    const issues = validator.getIssues();
    expect(issues).to.have.lengthOf(0);
  });


  it('validateAsync returns a Promise, fulfilled when the validation has completed', () => {
    createInvalidWay();
    const validator = new Rapid.ValidationSystem(_context);
    validator.init();

    const prom = validator.validateAsync();
    expect(prom).to.be.a('promise');

    return prom
      .then(() => {
        const issues = validator.getIssues();
        expect(issues).to.have.lengthOf(1);
        const issue = issues[0];
        expect(issue.type).to.eql('missing_tag');
        expect(issue.entityIds).to.have.lengthOf(1);
        expect(issue.entityIds[0]).to.eql('w-1');
      });
  });

});
