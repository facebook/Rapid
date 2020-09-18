import { rapidPowerUserFeaturesStorage } from '../ui/rapid_poweruser_features_storage';


export function actionAddEntity(way) {
    var powerUserSettings = rapidPowerUserFeaturesStorage();

    return function(graph) {
        if (way.type === 'way' && way.tags.highway && powerUserSettings.featureEnabled('tagSources')) {
            way.tags.source = 'maxar';
        }
        return graph.replace(way);
    };
}
