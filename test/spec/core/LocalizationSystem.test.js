describe('LocalizationSystem', () => {
  let _l10n;

  class MockContext {
    constructor() {}
  }

  const context = new MockContext();


  beforeEach(() => {
    _l10n = new Rapid.LocalizationSystem(context);
    _l10n._cache = {
      general: {
        en: {
          inspector: {
            display_name: {
              network_ref_name: '{network} {ref}: {name}',
              ref_name: '{ref}: {name}',
              direction: '{direction}',
              network: '{network}',
              from_to: 'from {from} to {to}',
              from_to_via: 'from {from} to {to} via {via}',
              network_direction: '{network} {direction}',
              network_from_to: '{network} from {from} to {to}',
              network_from_to_via: '{network} from {from} to {to} via {via}',
              ref: '{ref}',
              ref_direction: '{ref} {direction}',
              ref_from_to: '{ref} from {from} to {to}',
              ref_from_to_via: '{ref} from {from} to {to} via {via}',
              network_ref: '{network} {ref}',
              network_ref_direction: '{network} {ref} {direction}',
              network_ref_from_to: '{network} {ref} from {from} to {to}',
              network_ref_from_to_via: '{network} {ref} from {from} to {to} via {via}'
            }
          }
        }
      }
    };
  });


  describe('#displayName', () => {
    it('returns the name if tagged with a name', () => {
      const entity = { tags: { name: 'East Coast Greenway' }};
      expect(_l10n.displayName(entity)).to.eql('East Coast Greenway');
    });

    it('returns just the name for non-routes', () => {
      const entity = { tags: { name: 'Abyssinian Room', ref: '260-115' }};
      expect(_l10n.displayName(entity)).to.eql('Abyssinian Room');
    });

    it('returns the name and the ref for routes', () => {
      const entity1 = { tags: { name: 'Lynfield Express', ref: '25L', route: 'bus' }};
      expect(_l10n.displayName(entity1)).to.eql('25L: Lynfield Express');
      const entity2 = { tags: { name: 'Kāpiti Expressway', ref: 'SH1', route: 'road' }};
      expect(_l10n.displayName(entity2)).to.eql('SH1: Kāpiti Expressway');
    });

    it('returns the name, ref, and network for routes', () => {
      const entity = { tags: { name: 'Lynfield Express', ref: '25L', network: 'AT', route: 'bus' }};
      expect(_l10n.displayName(entity)).to.eql('AT 25L: Lynfield Express');
    });

    it('does not use the network tag if the hideNetwork argument is true', () => {
      const entity1 = { tags: { name: 'Lynfield Express', ref: '25L', network: 'AT', route: 'bus' }};
      expect(_l10n.displayName(entity1, true)).to.eql('25L: Lynfield Express');
      const entity2 = { tags: { network: 'SORTA', ref: '3X' }};
      expect(_l10n.displayName(entity2, true)).to.eql('3X');
    });

    it('distinguishes unnamed features by ref', () => {
      const entity = { tags: { ref: '66' }};
      expect(_l10n.displayName(entity)).to.eql('66');
    });

    it('distinguishes unnamed features by network or cycle_network', () => {
      const entity1 = { tags: { network: 'SORTA', ref: '3X' }};
      expect(_l10n.displayName(entity1)).to.eql('SORTA 3X');
      const entity2 = { tags: { network: 'ncn', cycle_network: 'US:US', ref: '76' }};
      expect(_l10n.displayName(entity2)).to.eql('US:US 76');
    });

    it('distinguishes unnamed routes by direction', () => {
      const entity1 = { tags: { network: 'US:US', ref: '66', direction: 'west', route: 'road' }};
      expect(_l10n.displayName(entity1)).to.eql('US:US 66 west');
      const entity2 = { tags: { network: 'Marguerite', ref: 'X', direction: 'anticlockwise', route: 'bus' }};
      expect(_l10n.displayName(entity2)).to.eql('Marguerite X anticlockwise');
    });

    it('distinguishes unnamed routes by waypoints', () => {
      const entity1 = { tags: { network: 'SORTA', ref: '3X', from: 'Downtown', route: 'bus' }};
      expect(_l10n.displayName(entity1)).to.eql('SORTA 3X');
      const entity2 = { tags: { network: 'SORTA', ref: '3X', to: 'Kings Island', route: 'bus' }};
      expect(_l10n.displayName(entity2)).to.eql('SORTA 3X');
      const entity3 = { tags: {network: 'SORTA', ref: '3X', via: 'Montgomery', route: 'bus' }};
      expect(_l10n.displayName(entity3)).to.eql('SORTA 3X');

      // Green Line: Old Ironsides => Winchester
      const entity4 = { tags: { network: 'VTA', ref: 'Green', from: 'Old Ironsides', to: 'Winchester', route: 'bus' }};
      expect(_l10n.displayName(entity4)).to.eql('VTA Green from Old Ironsides to Winchester');

      // BART Yellow Line: Antioch => Pittsburg/Bay Point => SFO Airport => Millbrae
      const entity5 = { tags: { network: 'BART', ref: 'Yellow', from: 'Antioch', to: 'Millbrae', via: 'Pittsburg/Bay Point;San Francisco International Airport', route: 'subway' }};
      expect(_l10n.displayName(entity5)).to.eql('BART Yellow from Antioch to Millbrae via Pittsburg/Bay Point;San Francisco International Airport');
    });
  });
});
