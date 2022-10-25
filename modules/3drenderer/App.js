import React from 'react';
import { Map } from './Map';

export class App extends React.Component {

    constructor(props) {
        super(props);
        this.state = { active: false,
            features: []
        };

        this.setState = this.setState.bind(this);
        this.toggle = this.toggle.bind(this);
    }

    featuresToGeoJSON() {
        var context = this.props.context;
        var map = context.map();
        var entities = context.history().intersects(map.extent()).filter(ent => Object.keys(ent.tags).includes('building'));
        var features = [];
        for (var id in entities) {
//            try {
                var gj = entities[id].asGeoJSON(context.graph());
                if (gj.type !== 'Polygon') continue;
                if (entities[id].tags.building !== 'yes') continue;
                features.push({
                    type: 'Feature',
                    properties: {
                        extrude: true,
                        min_height: entities[id].tags.min_height ? parseFloat(entities[id].tags.min_height) : 0,
                        height: parseFloat(entities[id].tags.height)
                    },
                    geometry: gj
                });
//            } catch (e) {
//                console.error(e);
//            }
        }
        this.setState({
        geojson: {
                type: 'FeatureCollection',
                features: features
        }
        });
    }


        componentDidMount() {
            this.setState({
                bounds: [
                    this.props.context.map().extent().min,
                    this.props.context.map().extent().max
                ]
            });
            this.props.context.on('enter.idupwards', (e) => {
                this.featuresToGeoJSON();
            });
            this.props.context.history().on('change.idupwards', (e) => {
                this.featuresToGeoJSON();
            });
            this.props.context.map().on('move', () => {
                this.setState({
                    bounds: [
                        this.props.context.map().extent().min,
                        this.props.context.map().extent().max
                    ]
                });
            });
        }


        toggle () {
            this.setState({
                active: !this.state.active
            });
        }

        render () {
            var state = this.state;
            return <div className='map-control'>
                {state.active ?
                    <div style={{ zIndex: -1,
                        position: 'absolute',
                        width: '300px',
                        height: '300px',
                        right: 0,
                        bottom: 0
                    }} className='content'>
                        <Map bounds={this.state.bounds} geojson={this.state.geojson} />
                    </div> : null}
                <button tabIndex='-1' style={{color:'white'}} onClick={this.toggle}>
                    3D
                </button>
                </div>;
        }
}