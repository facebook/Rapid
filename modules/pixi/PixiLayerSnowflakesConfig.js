export const snowflakesConfig = {
    'lifetime': {
        'min': 4,
        'max': 4
    },
    'ease': [
        {
            's': 0,
            'cp': 0.379,
            'e': 0.548
        },
        {
            's': 0.548,
            'cp': 0.717,
            'e': 0.676
        },
        {
            's': 0.676,
            'cp': 0.635,
            'e': 1
        }
    ],
    'frequency': 0.004,
    'emitterLifetime': 0,
    'maxParticles': 1000,
    'addAtBack': false,
    'pos': {
        'x': 0,
        'y': 0
    },
    'behaviors': [
        {
            'type': 'alpha',
            'config': {
                'alpha': {
                    'list': [
                        {
                            'time': 0,
                            'value': 0.73
                        },
                        {
                            'time': 1,
                            'value': 0.46
                        }
                    ]
                }
            }
        },
        {
            'type': 'moveSpeedStatic',
            'config': {
                'min': 200,
                'max': 200
            }
        },
        {
            'type': 'scale',
            'config': {
                'scale': {
                    'list': [
                        {
                            'time': 0,
                            'value': 0.15
                        },
                        {
                            'time': 1,
                            'value': 0.2
                        }
                    ]
                },
                'minMult': 0.5
            }
        },
        {
            'type': 'rotation',
            'config': {
                'accel': 0,
                'minSpeed': 0,
                'maxSpeed': 200,
                'minStart': 50,
                'maxStart': 70
            }
        },
        {
            'type': 'textureRandom',
            'config': {
                'textures': [
                    'img/icons/snowflake.png'
                ]
            }
        },
        {
            'type': 'spawnShape',
            'config': {
                'type': 'rect',
                'data': {
                    'x': -500,
                    'y': -300,
                    'w': 900,
                    'h': 20
                }
            }
        }
    ]
};
