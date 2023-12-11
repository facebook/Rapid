import { uiTooltip } from '../tooltip';
import { uiSection } from '../section';
import { uiCombobox } from '../combobox';
import { utilNoAuto } from '../../util';

export function uiSectionWaybackImagery(context) {
    const l10n = context.systems.l10n;
    const imagery = context.systems.imagery;

    const section = uiSection(context, 'waybackImagery-list')
        .label(l10n.tHtml('background.wayback_imagery.title'))
        .disclosureContent(renderDisclosureContent);

    let _waybackSelectedId = null;

    // let _checkboxState = false;

    // Create a uiCombobox instance
    const waybackCombo = uiCombobox(context);

    function renderDisclosureContent(selection) {
        // enter
        // You could give this selection statement ANY class name, just make sure it agrees with the
        // .attr call below
        let privacyOptionsListEnter = selection.selectAll('.background-waybackImagery-list')
            .data([0])
            .enter()
            .append('ul')
            .attr('class', 'layer-list background-waybackImagery-list');

        let thirdPartyIconsEnter = privacyOptionsListEnter
            .append('li')
            .attr('class', 'background-wayback-item')
            .append('label')
            .call(uiTooltip(context)
                .title(l10n.tHtml('background.wayback_imagery.tooltip'))
                .placement('bottom')
            );

        // Render the individual (single) item.
        thirdPartyIconsEnter
            .append('span')
            .html(l10n.tHtml('background.wayback_imagery.example_item_text'))
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .style('vertical-align', 'middle');

        let pickerCombo = privacyOptionsListEnter.append('div');

        pickerCombo.append('input')
            .attr('class', 'wayback-vintage-select')
            .attr('placeholder', l10n.t('background.wayback_imagery.placeholder'))
            .style('vertical-align', 'middle')
            .style('margin-left', '12px')
            .style('border', 'none')
            .call(utilNoAuto)
            .call(waybackCombo)
            .on('blur change', (d3_event) => {
                const element = d3_event.currentTarget;
                const val = (element && element.value) || '';
                const data = waybackCombo.data();
                const item = data.find(item => item.value === val);

                if (item) {  // only allow picking values from the list
                    _waybackSelectedId = val;
                    const waybackSource = imagery.getWaybackSource(item.title);
                    imagery.baseLayerSource(waybackSource);
                } else {
                    d3_event.currentTarget.value = '';
                    _waybackSelectedId = null;
                }
            });

        const comboData = [
            {
                title: '2036ae13b70b4b9ea8f892e765297395',
                value: '2018-05-16'
            },
            {
                title: '2ae3908a772546828a1436025c4b14a2',
                value: '2018-06-27'
            },
            {
                title: '474c65ab3e1941468511785495eb8987',
                'value': '2018-06-06'
            },
            {
                title: 'cd21e40a815549a69bb54d575777d973',
                value: '2018-04-25'
            },
            {
                title: '060a9a68c1774b78bd7cb5ec2332b969',
                value: '2016-11-16'
            },
            {
                title: '098c68a0edc24be9a4e9ea5697320887',
                value: '2018-03-28'
            },
            {
                title: '0b3dd18105544e7bbaea33d9ebdf1154',
                value: '2014-12-30'
            },
            {
                title: '121123062bf0421199e5cec9556a61a2',
                value: '2017-02-08'
            },
            {
                title: '129198abd5fe49008e05aeea8fbfc2b8',
                value: '2014-06-25'
            },
            {
                title: '142407ec40104d678072fc4347aeacd2',
                value: '2017-10-25'
            },
            {
                title: '1beb71b206d7451c9525b23731abbe4d',
                value: '2016-12-07'
            },
            {
                title: '20c760aa5cec450a9b32d72340f4959e',
                value: '2017-08-30'
            },
            {
                title: '21a29eb19b724d2390d71d78fa1ec25c',
                value: '2015-03-18'
            },
            {
                title: '2f2d18a67a93482cadc696f28001e386',
                value: '2018-01-18'
            },
            {
                title: '2f33c09b5e9d42d2a159a87591619cd2',
                value: '2016-03-02'
            },
            {
                title: '2f582e04e33042a586c20ecdf2ee9536',
                value: '2015-10-28'
            },
            {
                title: '325a81849a9340be87e6cf5d5996caea',
                value: '2015-02-18'
            },
            {
                title: '333683359d8742da9a25ad9c5a34df15',
                value: '2014-11-12'
            },
            {
                title: '3518b50b7fb74542914227ea97980262',
                value: '2016-10-25'
            },
            {
                title: '356aa26c2e5a49b3a78395a16500794d',
                value: '2015-10-14'
            },
            {
                title: '361822e658734dd7aa419d9f9bc0491e',
                value: '2017-08-10'
            },
            {
                title: '408d5b24fc4e4650bc7799dd1e1e606f',
                value: '2014-12-03'
            },
            {
                title: '4257d2eaac99403dba1850dbab4c9368',
                value: '2016-01-13'
            },
            {
                title: '44aa7f0251684e8b94718486f2be2441',
                value: '2017-03-29'
            },
            {
                title: '4658a63f59764dceaaa5d5dc68428d57',
                value: '2016-12-20'
            },
            {
                title: '4781716956284d2ea7831b2c9837b52d',
                value: '2015-01-21'
            },
            {
                title: '47f87eb35b024b09ab646c1d3b8d0c22',
                value: '2016-10-12'
            },
            {
                title: '4b8dd6deefd142dbada1bb1f8c1547d9',
                value: '2016-04-28'
            },
            {
                title: '4ee9e8f78a3749f38d47e7ab6a68ccef',
                value: '2016-05-11'
            },
            {
                title: '51feb5bbab904450a410109df97daab3',
                value: '2017-04-19'
            },
            {
                title: '520249a818984ead8f72194f3505b442',
                value: '2015-12-16'
            },
            {
                title: '56bef461913a4c3b90f08ed8e4429d13',
                value: '2017-03-15'
            },
            {
                title: '593966cdb3a24fc5b74feb1d1b498d3e',
                value: '2015-04-30'
            },
            {
                title: '5a02e65986c64b6991959639dbec042d',
                value: '2016-02-17'
            },
            {
                title: '5a39021bb07b47ff8a7f3b7c1f51a575',
                value: '2015-09-02'
            },
            {
                title: '5e923c4065824360957da6fca901efa5',
                value: '2016-02-04'
            },
            {
                title: '676422c53ca6422d9d6849666b9f2552',
                value: '2014-12-18'
            },
            {
                title: '6c4bca28818244a2a9759311a4981c44',
                value: '2018-03-14'
            },
            {
                title: '74a4e853abae4b7498899248c148b8ea',
                value: '2014-07-30'
            },
            {
                title: '7b06f2c7497746e9964c99437ede0aa9',
                value: '2015-06-24'
            },
            {
                title: '7c15c3ea11fa4f2c958bee6339ae9657',
                value: '2016-03-16'
            },
            {
                title: '7e739dee52d745c9ace1883131cd8c0a',
                value: '2017-06-14'
            },
            {
                title: '80905345d5c34168b1975656907a1a17',
                value: '2014-06-11'
            },
            {
                title: '8b068965d24b4e57b0b7beb70b737fde',
                value: '2017-10-04'
            },
            {
                title: '8e7e0f751fa04d99be133b1acf80af29',
                value: '2016-04-20'
            },
            {
                title: '8ec53e2b21a44eb4af53a14f6ef74f2a',
                value: '2017-09-13)'
            },
            {
                title: '903f0abe9c3b452dafe1ca5b8dd858b9',
                value: '2014-02-20'
            },
            {
                title: '920d9c042eea4c119d44f67ebcf42ad3',
                value: '2014-05-14'
            },
            {
                title: '945d1a6828f642c1991ac6dfc137a007',
                value: '2015-11-18'
            },
            {
                title: '9563e36b0527473797dcc8397e292b2e',
                value: '2016-06-13'
            },
            {
                title: '982800ab3dac47b4ad540064c8305a45',
                value: '2017-06-27'
            },
            {
                title: '99264f40bd1249c98140d3eb88d4e3d9',
                value: '2017-05-17'
            },
            {
                title: '9badc1f6b6a64a609a87fc75e8a6b083',
                value: '2017-02-27'
            },
            {
                title: '9fc4b9df0cfa471daae1d217e0b07908',
                value: '2018-04-11'
            },
            {
                title: 'a07d33935177469d976ce63c185ef81e',
                value: '2015-09-16'
            },
            {
                title: 'a5fc12e9c4324663bafde942a7d1e1d3',
                value: '2014-10-29'
            },
            {
                title: 'a70ce255e5ce4a18b43287abece6838e',
                value: '2015-03-25'
            },
            {
                title: 'a87d911d19a94cd085d86118f98a1b9a',
                value: '2014-09-17'
            },
            {
                title: 'af9bb3197b6d4d0eb8039acf34a25b85',
                value: '2017-07-14'
            },
            {
                title: 'b75ef272f7f14e9c9cd7a96f0b5827c0',
                value: '2016-07-20'
            },
            {
                title: 'b794bc15295e4be3896b5b91ebfd2c20',
                value: '2017-11-16'
            },
            {
                title: 'b7d8c5793c784a3081798f8268c1adc6',
                value: '2017-01-25'
            },
            {
                title: 'ca9c65a9487b4188a4d7251e24acc0b6',
                value: '2014-07-02'
            },
            {
                title: 'cbb8bb93ddcf409b8615ba9fc2a04f0f',
                value: '2017-05-03'
            },
            {
                title: 'cd067f20d4d84588a66810e0d876df6f',
                value: '2016-07-06'
            },
            {
                title: 'd02f6b6905a142a2a3726844e7f3da2b',
                value: '2016-08-31'
            },
            {
                title: 'd16846fb68894fa38ea157da545a25ed',
                value: '2018-02-23'
            },
            {
                title: 'd722c8eca54d4adb8087870f5ca0ef78',
                value: '2018-01-08'
            },
            {
                title: 'db4f466b0a33403f99be46f36c2bf674',
                value: '2016-08-11'
            },
            {
                title: 'dbc370acb862499e8085a33e3393df77',
                value: '2014-03-26'
            },
            {
                title: 'dea581ad8542487ab36e01910b70820b',
                value: '2017-01-11'
            },
            {
                title: 'e321561769bc468586d19156de6cef3d',
                value: '2015-05-13'
            },
            {
                title: 'e87756d6de764c20b108f2bc576db1ba',
                value: '2015-04-15'
            },
            {
                title: 'eddb2fb76fe14d3ea40e05764919e84a',
                value: '2017-05-31'
            },
            {
                title: 'ef99934f006b433b8fc00f5ee33f196a',
                value: '2015-09-30'
            },
            {
                title: 'f736a7cd248b468ea60b21ee9d94ca04',
                value: '2016-09-14'
            },
            {
                title: 'feb0524c476a4c7b9fec7fc61f4aea4a',
                value: '2015-08-19'
            },
            {
                title: 'ff8cda5f98424ca78ad496112b8d1fff',
                value: '2014-04-30'
            },
            {
                title: '9b5f377a483a4c1c863f85250d1b707a',
                value: '2015-07-08'
            },
            {
                title: 'e23fe831aea34b1b87cfe0fd9073d319',
                value: '2014-10-01'
            },
            {
                title: '4291f5876e1040e2934a089149af59bd',
                value: '2018-07-25'
            },
            {
                title: 'f1d75d38d15240f7aa51b106cd0c9aae',
                value: '2018-11-07'
            },
            {
                title: '0c856c2460284b53b77568e8c6277ade',
                value: '2014-12-18'
            },
            {
                title: '01567d806dae4ff691b8ece20fb7b161',
                value: '2014-04-30'
            },
            {
                title: '0337461082474c90b851c14d2349e5f3',
                value: '2015-09-30'
            },
            {
                title: '0a3015f583d24de19373159cdbb68abc',
                value: '2017-11-16'
            },
            {
                title: '0a9c85cdcaa9493685f09e44a5b6a9b4',
                value: '2018-08-15'
            },
            {
                title: '0b5236f2b71a4a49b1ed16b30a62f4d7',
                value: '2014-06-25'
            },
            {
                title: '0bd0a98b790945b2b974e566fd534a81',
                value: '2017-07-14'
            },
            {
                title: '10ef8915488549a593a5fc6bc89e16b5',
                value: '2015-03-25'
            },
            {
                title: '1f64db2f11b74b198e4f75fe8c0a5903',
                value: '2015-04-30'
            },
            {
                title: '234abc4a86394cc1b85c20eb1dad20c1',
                value: '2016-09-14'
            },
            {
                title: '23574da8bb654caf81abb433ab0a7406',
                value: '2016-11-16'
            },
            {
                title: '25205586f7f64de3adb12ca9ca162a86',
                value: '2015-07-08'
            },
            {
                title: '261559547b144801abb96f5e777506b2',
                value: '2014-10-01'
            },
            {
                title: '2617aa47bdc94388ac866267fa8b4b04',
                value: '2014-06-11'
            },
            {
                title: '2d0e4c9540624a639ab43e4e379aa53f',
                value: '2016-01-13'
            },
            {
                title: '2fb0e37e7fff491f811afb3cb45c8bf6',
                value: '2018-06-27'
            },
            {
                title: '325273e5704f4fbd9d04abbd4edbfdac',
                value: '2014-09-17'
            },
            {
                title: '33548f6952e346328e7c3475be2cf3ac',
                value: '2016-02-17'
            },
            {
                title: '37ba23a63e0040ea8cfa91ed81fbf405',
                value: '2017-01-11'
            },
            {
                title: '33548f6952e346328e7c3475be2cf3ac',
                value: '2016-02-17'
            },
            {
                title: '37ba23a63e0040ea8cfa91ed81fbf405',
                value: '2017-01-11'
            },
            {
                title: '3b11a50cfd334369b727235d1ab1e852',
                value: '2016-03-02'
            },
            {
                title: '3b5305c60d654b0e8747b454673a6414',
                value: '2018-09-26'
            },
            {
                title: '47fefdc05b82441297e60dc0ac11b03c',
                value: '2015-10-28'
            },
            {
                title: '4a8fea00d7fc4eda8e238bfb6921df12',
                value: '2018-01-18'
            },
            {
                title: '4ce6e6d420594cd6889d421acf05f517',
                value: '2015-03-18'
            },
            {
                title: '51546fae7e3d4632a6423dc06bd2b6ed',
                value: '2017-03-15'
            },
            {
                title: '5174ea4fd9ac4c36b84bc2a9061b0072',
                value: '2016-04-20'
            },
            {
                title: '535b4f4238ec40de8b2d7932bfdf7236',
                value: '2015-09-16'
            },
            {
                title: '54d3327f34f54d40a79ee5902a765e87',
                value: '2016-03-16'
            },
            {
                title: '558f4a885f4d43bf8c59525ba6f429d1',
                value: '2017-10-04'
            },
            {
                title: '56dc5b51c3bf48529b2761c6a491d4c2',
                value: '2015-09-02'
            },
            {
                title: '596f276e627943afbb0108bb070b7251',
                value: '2017-05-03'
            },
            {
                title: '61e35d9c4c1f4a1eafe36ef9044fc12f',
                value: '2015-11-18'
            },
            {
                title: '621d5e5fc63a428e9ac6af1e4f215bfb',
                value: '2016-08-11'
            },
            {
                title: '62c71f4937f746b5a70fd59320fbc370',
                value: '2014-12-30'
            },
            {
                title: '683ba8d85d0b4ed985c90eba3aba34d8',
                value: '2017-04-19'
            },
            {
                title: '69be066e024b4bcda0a99d09692caacb',
                value: '2018-04-11'
            },
            {
                title: '6f10a2cd161240f5a12d6b32410416c1',
                value: '2018-01-31'
            },
            {
                title: '6f3b3d80c3f14f4388c544393f31b927',
                value: '2018-11-07'
            },
            {
                title: '72fcd0bee7b14f03a23c795c261ff511',
                value: '2018-02-23'
            },
            {
                title: '7346fb75d50b44dabea3c54cdaa757a1',
                value: '2017-02-08'
            },
            {
                title: '73c3467a0574448498c70c1eb8b9b133',
                value: '2018-03-28'
            },
            {
                title: '76c120b3108c41febdb6885614f62045',
                value: '2014-07-30'
            },
            {
                title: '779f21743c93436faba51dac7681b86f',
                value: '2017-06-27'
            },
            {
                title: '782698f12921482f8ff9c8d549f95f70',
                value: '2015-01-21'
            },
            {
                title: '78e801fab4d24ab9a6053c7a461479be',
                value: '2014-02-20'
            },
            {
                title: '7b70d1e21798410383f6db6efdaadad7',
                value: '2017-05-17'
            },
            {
                title: '849b247d319c4971a3a6303073523946',
                value: '2016-04-28'
            },
            {
                title: '8673474d256440a7b173c46f56c0cb23',
                value: '2017-06-14'
            },
            {
                title: '891b60661e6f4c09ac7e420537cb7f88',
                value: '2017-01-25'
            },
            {
                title: '8ddaa7b3b57944db90988ca0781292fe',
                value: '2016-10-25'
            },
            {
                title: '9318898a502c42a3af98ff9515ad9779',
                value: '2017-08-30'
            },
            {
                title: '943951144c2b4480bc37327e727ef375',
                value: '2017-02-27'
            },
            {
                title: '944d68755057498c8e63d127d29a27cb',
                value: '2015-04-15'
            },
            {
                title: '95023287d4834895bc13313da8022b41',
                value: '2015-02-18'
            },
            {
                title: '9842a352714c4331b26881da7991b1d8',
                value: '2015-08-19'
            },
            {
                title: '98d3d0fa245248788e0987e8a007901f',
                value: '2018-11-29'
            },
            {
                title: '9b2e9058b67c4803bcf023cf3afb2dbc',
                value: '2016-06-13'
            },
            {
                title: '9b4d424e37934adab36cdb5b500e7cb8',
                value: '2017-05-31'
            },
            {
                title: 'a9a96986fc7742378297f6581adc1028',
                value: '2016-07-06'
            },
            {
                title: 'b058e83839dc4fc09b0d3b626e28f105',
                value: '2017-09-13'
            },
            {
                title: 'b3f13d5debcc4d3b83e828130b9d3c45',
                value: '2014-10-29'
            },
            {
                title: 'b504c062129a45cf8b610e79ac71238f',
                value: '2017-03-29'
            },
            {
                title: 'b90cba400efd48a787e5a302d9a5bca8',
                value: '2016-05-11'
            },
            {
                title: 'bbabdfdaf9344183a5fe7cbd16540d78',
                value: '2015-12-16'
            },
            {
                title: 'bdd3092dd3594a13b9fb877a55449d48',
                value: '2014-07-02'
            },
            {
                title: 'be547629f0ae486c8f5784e7d41389f6',
                value: '2016-10-12'
            },
            {
                title: 'bf48492111ae4ba4b5de004435ad5709',
                value: '2016-12-20'
            },
            {
                title: 'bfa7b682d3e842cdbb687e492b6723db',
                value: '2016-12-07'
            },
            {
                title: 'c3fe9d9926454757b79710159519772f',
                value: '2018-01-08'
            },
            {
                title: 'cd1dc8a7491344448efcad8032ad994d',
                value: '2014-03-26'
            },
            {
                title: 'd2a6b92d80484fbe8fb27f3e00826a26',
                value: '2018-09-06'
            },
            {
                title: 'd5fec7bb1090452bb215aaf248e38133',
                value: '2016-07-20'
            },
            {
                title: 'dba9ecf3b0d54a8a824f6a1d993c6ad8',
                value: '2018-05-16'
            },
            {
                title: 'deb84ece94fb4a6ab70a5d627fb2afb2',
                value: '2014-11-12'
            },
            {
                title: 'df00c16165f94da0a305c2bf139605bc',
                value: '2018-07-25'
            },
            {
                title: 'e0231a759ec844ef96dd1c680564046f',
                value: '2018-10-17'
            },
            {
                title: 'e3e63ac9557742598e81d19dbce56741',
                value: '2014-05-14'
            },
            {
                title: 'e6c39b5f473b4a5da58e155da3997dd3',
                value: '2015-10-14'
            },
            {
                title: 'f0d980c63a6c452eafdc9da99af67777',
                value: '2016-08-31'
            },
            {
                title: 'f672a5e8779f4f8fbf9a487f1534c262',
                value: '2017-10-25'
            },
            {
                title: 'f6a23e021f044a2da02e66f6eb1acbac',
                value: '2016-02-04'
            },
            {
                title: 'f6bc1d0cff914f62ab7228eeb17e36e5',
                value: '2018-04-25'
            },
            {
                title: 'f8f446f2d1f34df0826c1eaf66daedb2',
                value: '2017-08-10'
            },
            {
                title: 'f97d079bb1124df5a59be515453396b0',
                value: '2018-03-14'
            },
            {
                title: 'fd9cbf1a96004dfab26d3f449637f128',
                value: '2018-06-06'
            },
            {
                title: 'ff7d8be6b25043469feeb7a3b958ef84',
                value: '2014-12-03'
            },
            {
                title: '147392cf3a6b452a9edaafe27be4dfd9',
                value: '2015-05-13'
            },
            {
                title: 'f065c285304a41bc85b9afb571846fae',
                value: '2015-06-24'
            },
            {
                title: '35cff056ecf549bd8ba2cc25574a8c56',
                value: '2018-12-14'
            },
            {
                title: 'ebaabc9116104ab481fa05ab1a3d9204',
                value: '2019-01-09'
            },
            {
                title: '43bfc491e1dd4d219ddf92f1be0f7786',
                value: '2019-01-09'
            },
            {
                title: 'f807b9b714d6418d82a37d08361e77b2',
                value: '2019-04-03'
            },
            {
                title: '83656c77d4474136ae842ee9deecd91f',
                value: '2019-04-03'
            },
            {
                title: '68d98c2d86ae41fab424dbb60fc0da54',
                value: '2019-04-24'
            },
            {
                title: '5b47d2bd3b5f4e81b97a94b0ac516850',
                value: '2019-04-24'
            },
            {
                title: '78ae2e3fb493448fbc2fe027c3cb2a59',
                value: '2019-05-15'
            },
            {
                title: '5b5620f3aaca467ba4f5415b7915e3a7',
                value: '2019-05-15'
            },
            {
                title: 'de8bb22f53914e9b906345e7e9dd2a38',
                value: '2019-06-05'
            },
            {
                title: 'a6eea03922ef4e58a5c3d7265a02bb47',
                value: '2019-06-05'
            },
            {
                title: '8472cf781fe14c96926ebe86081ac0e9',
                value: '2019-06-26'
            },
            {
                title: 'ef41000442ce45959e77ba11ce6c383d',
                value: '2019-06-26'
            },
            {
                title: '7c1935f664f148bdb36678becaf6c831',
                value: '2019-07-17'
            },
            {
                title: '2358815e9a5a4e4191a5e4450038e75d',
                value: '2019-07-17'
            },
            {
                title: 'a96fd901d81d420ba1f0147effa91471',
                value: '2019-08-07'
            },
            {
                title: '3a7067fb2830473bb31d335bf4b9813a',
                value: '2019-08-07'
            },
            {
                title: '0fc6ee4b90a74bb6ae0744fa28376d37',
                value: '2019-08-28'
            },
            {
                title: '9790b71d66794919856159034125b3be',
                value: '2019-08-28'
            },
            {
                title: '4af7689a43f34d4ea66484f809af9fff',
                value: '2019-09-18'
            },
            {
                title: 'fd0df159d90345dd84884aba1c34fc00',
                value: '2019-09-18'
            },
            {
                title: 'b0e67588080a4e2796289d2a5ea12944',
                value: '2019-10-09'
            },
            {
                title: '6c0287364c0548d0a281f5c5bb55269d',
                value: '2019-10-09'
            },
            {
                title: '3f8ecf5c65674611aa38e1dc335f7dae',
                value: '2019-10-30'
            },
            {
                title: 'b1410942bc9e4a1dbf3cf96b77bf2f61',
                value: '2019-10-30'
            },
            {
                title: '65380822d9024a578d57f49c804d8e82',
                value: '2019-12-12'
            },
            {
                title: '18a4da2c0f80418297f679b43852e6e6',
                value: '2019-12-12'
            },
            {
                title: 'ee512c9977394b73b03f31dedea394ff',
                value: '2020-01-08'
            },
            {
                title: '6403865b84794d2dabef0187317a9718',
                value: '2020-01-08'
            },
            {
                title: '81d0d6843c134a8c8ce076ac6672e89d',
                value: '2020-01-30'
            },
            {
                title: '9e9e756f3c724b7192d2b3d7504c040e',
                value: '2020-01-30'
            },
            {
                title: '443b537727ba4862b9855cfdab9c37d7',
                value: '2020-02-20'
            },
            {
                title: '91bf78f99b0f4a97be56ef53adabfe5c',
                value: '2020-02-20'
            },
            {
                title: 'fe3e91f4213b48d194b95d8d20959b47',
                value: '2020-03-23'
            },
            {
                title: '6c094de634be404f9335a4992f30fb68',
                value: '2020-03-23'
            },
            {
                title: '9f6c68fe20184bd6aebf34b9df440b9c',
                value: '2020-04-08'
            },
            {
                title: '409afbb268564046b7d94aa6df24bfca',
                value: '2020-04-08'
            },
            {
                title: 'd369b096ea924b16921f02e3bc07e9ba',
                value: '2020-04-29'
            },
            {
                title: '08216e98a0da45ec9e9ad1271c2bac01',
                value: '2020-04-29'
            },
            {
                title: 'ba2a36fa89ab4b5494b2995dcd037ec4',
                value: '2020-05-20'
            },
            {
                title: '9baf15d824ef4bff844acf60eb39dbff',
                value: '2020-05-20'
            },
            {
                title: 'ca2adf1589524e29a1c754405cde15af',
                value: '2020-06-10'
            },
            {
                title: '1d0acffe224c4a549e0353ba1667ad30',
                value: '2020-06-10'
            },
            {
                title: '8f89f28ac6e540a9a6e4fd640dbbf32c',
                value: '2020-07-01'
            },
            {
                title: '58ada5deb8ca478ab74e3aefe6459e09',
                value: '2020-07-01'
            },
            {
                title: '240b12076f264f1aad52fe1f93f7b92f',
                value: '2020-07-22'
            },
            {
                title: '3d1489c545a94ef8a226db15db82cafa',
                value: '2020-07-22'
            },
            {
                title: '89dc17b1ed714396abfd0858cf5b7ec4',
                value: '2020-08-12'
            },
            {
                title: 'c761da5a04ab459aa1dee89e9a5dcdc1',
                value: '2020-08-12'
            },
            {
                title: 'f6287aeb96b4434281220f159bd11219',
                value: '2020-09-02'
            },
            {
                title: '767634edd12447ebbdf0bde7e5a8f11a',
                value: '2020-09-02'
            },
            {
                title: 'e54323e95a6d47e08c11a9ce60a92b92',
                value: '2020-09-23'
            },
            {
                title: '3d2115f2a87644319e9816008996b2be',
                value: '2020-09-23'
            },
            {
                title: '829656a742924e189e63bfc9fde75225',
                value: '2020-10-14'
            },
            {
                title: '73b47bbc112b498daf85d40fb972738a',
                value: '2020-10-14'
            },
            {
                title: 'b8d44ca2648346a3b2a8b982b0a22862',
                value: '2020-11-18'
            },
            {
                title: '564948734b434432985b09ed2a431fe1',
                value: '2020-11-18'
            },
            {
                title: 'd2ef91bb520848cb8cf1f86dfb0eda39',
                value: '2020-12-16'
            },
            {
                title: '6827cb10b36d4eb1a0b54cd9fab6ae6a',
                value: '2020-12-16'
            },
            {
                title: '64e78c5d416e43689c770699e7b07fcd',
                value: '2021-01-13'
            },
            {
                title: '25741f8dd1ed498699f900b13297b947',
                value: '2021-01-13'
            },
            {
                title: '6989a23a67c0491687a399def789838d',
                value: '2021-02-24'
            },
            {
                title: '48bc9a91b46a490da6543153088008e7',
                value: '2021-02-24'
            },
            {
                title: 'e0e47e1253214c3cb4ed00a5fb513c53',
                value: '2021-03-17'
            },
            {
                title: '13dbf510228a4ac2a12451dfdf6fb4d1',
                value: '2021-03-17'
            },
            {
                title: 'b41b985520574b79b58d7c1b88cb14eb',
                value: '2021-04-08'
            },
            {
                title: 'b9d824335fd0440284a6b456698ed545',
                value: '2021-04-08'
            },
            {
                title: 'fd65d845e2e44b5098366a46fea489a6',
                value: '2021-04-28'
            },
            {
                title: 'b874b1ebbfb246a6a20fee954790b767',
                value: '2021-04-28'
            },
            {
                title: '252f9159236d4e9b8583198a735d23b1',
                value: '2021-05-19'
            },
            {
                title: 'fe66d88356664de79abcfa92142fcfac',
                value: '2021-05-19'
            },
            {
                title: '8c5b39861363444487a8e27fc19524a2',
                value: '2021-06-09'
            },
            {
                title: '6dde0827277042fc8a67c6a6369b0fb5',
                value: '2021-06-09'
            },
            {
                title: '2de04974bcf148838142e57d74aaf379',
                value: '2021-06-30'
            },
            {
                title: '3d89a062923546ecbaa91909a089a840',
                value: '2021-06-30'
            },
            {
                title: 'ee4136ebe42441d59c527b6e297ca8f9',
                value: '2021-07-21'
            },
            {
                title: '96f393c3dc234728871bfb1ecda0e9dc',
                value: '2021-07-21'
            },
            {
                title: 'b8cd9a3efc4a4f1ba6e889b54e74965d',
                value: '2021-08-11'
            },
            {
                title: '78ca016b500e44cf80ae6bdf7b4531b2',
                value: '2021-08-11'
            },
            {
                title: '1e3b8543171b43abbcdff6f613b8358e',
                value: '2021-09-01'
            },
            {
                title: '0528aea6897c46d88437e1eaf555afcd',
                value: '2021-09-01'
            },
            {
                title: 'ae4991e517f04b17a245803f52dce508',
                value: '2021-09-29'
            },
            {
                title: 'ec3ed590f7bc4961b55c7d9193dc95df',
                value: '2021-09-29'
            },
            {
                title: 'dd086f066be74484a0f6ba43ecda99d3',
                value: '2021-10-13'
            },
            {
                title: 'ae4addaadb5b41fd865bbca5fe82cb85',
                value: '2021-10-13'
            },
            {
                title: '5c8dfc57e18c48d2916f4130a89b2c49',
                value: '2021-11-03'
            },
            {
                title: '29189da079e440e6b0e048096779fb0d',
                value: '2021-11-03'
            },
            {
                title: '48cfb40af03449aea6ebc92207ef9300',
                value: '2021-11-30'
            },
            {
                title: 'db9db69b4f6c476683bbdceddd17c582',
                value: '2021-11-30'
            },
            {
                title: '534b917ee7c7472aa416f4b2f8b24f80',
                value: '2021-12-21'
            },
            {
                title: '93d4780f5a344f719a7190e11ea47869',
                value: '2021-12-21'
            },
            {
                title: '00d443f39e634614b76717a803d6923f',
                value: '2022-01-12'
            },
            {
                title: '67c0b2a116334687974ce8c6efc28a0f',
                value: '2022-01-12'
            },
            {
                title: '33688b0287f54946b271a61cde16da52',
                value: '2022-02-02'
            },
            {
                title: '7f78c282c434474d8eb5469257de81a6',
                value: '2022-02-02'
            },
            {
                title: '8058230522a0494994b59ac1fd598a3e',
                value: '2022-02-24'
            },
            {
                title: '9f934b51346e4efea3d3ea14cd096051',
                value: '2022-02-24'
            },
            {
                title: 'daf056c20b504f848109f09ca6b4ae94',
                value: '2022-03-16'
            },
            {
                title: '5c8314beb7ba43e19534464bfc812738',
                value: '2022-03-16'
            },
            {
                title: '50183d0a94484b2e9db6e432232db3f1',
                value: '2022-04-06'
            },
            {
                title: '5a14fdafcf424823906d1f288fee4421',
                value: '2022-04-06'
            },
            {
                title: 'cb386a1eb452456bb08767bfc215d4ca',
                value: '2022-04-27'
            },
            {
                title: '1c5bc033ded04579b83e2e3d207f4bee',
                value: '2022-04-27'
            },
            {
                title: 'e51a6700717d4db5ae0fcb01c9186ca7',
                value: '2022-05-18'
            },
            {
                title: '05aa0f8f65d449e7804e2ffd94d64bcf',
                value: '2022-05-18'
            },
            {
                title: '2cb162f16ead4c4e97033ced48e99635',
                value: '2022-06-08'
            },
            {
                title: 'eafd4606ce014a05814426a52e310688',
                value: '2022-06-08'
            },
            {
                title: 'b3d3eae1f3b343729d5e4b8729d81fcc',
                value: '2022-06-29'
            },
            {
                title: 'e4225914bdb5494ab455fbcf1a2a94b5',
                value: '2022-06-29'
            },
            {
                title: '8dcb11bfabb2493b893e5be933fcea3d',
                value: '2022-07-21'
            },
            {
                title: '204a203619cc4fe0bbe130130f06b97a',
                value: '2022-07-21'
            },
            {
                title: '5ec29361342b489b8c975b8674166bdc',
                value: '2022-08-10'
            },
            {
                title: '211d94946b784d83a0269289f794378e',
                value: '2022-08-10'
            },
            {
                title: 'edec6f1fa19a4b5997108349040c4dfc',
                value: '2022-08-31'
            },
            {
                title: 'baa58b3319c44fbe8fcdbb90bbae100c',
                value: '2022-08-31'
            },
            {
                title: '8f0dfa9398c6457999404ddce348a459',
                value: '2022-09-21'
            },
            {
                title: '39159ffc948e469eb1a358f1f6047e95',
                value: '2022-09-21'
            },
            {
                title: 'dec36821b2a6470cb5359babf5be2755',
                value: '2022-10-12'
            },
            {
                title: '3ca7cebafaee45c2b01af8ddfa277491',
                value: '2022-10-12'
            },
            {
                title: '5b7cef1b0dcc42698c1f52fb415f202c',
                value: '2022-11-02'
            },
            {
                title: '2dd2822b55e84dc58f697981e2b0ef40',
                value: '2022-11-02'
            },
            {
                title: '3746af87a2bb46a78d4846a728d017df',
                value: '2022-12-14'
            },
            {
                title: '543606af1b344a6fa6a1050e7e5d648d',
                value: '2023-01-11'
            },
            {
                title: '14bec57a71624fe287e9dbcd297c9dc4',
                value: '2023-01-11'
            },
            {
                title: 'fb0f4638a6894bddb3292499a0aeb7b3',
                value: '2023-02-23'
            },
            {
                title: 'cce9877770a140b9896c2e6daf928424',
                value: '2023-02-23'
            },
            {
                title: 'ee531a31beda4529ad66edcbe9fde701',
                value: '2023-03-15'
            },
            {
                title: '7f8ac379fa4f4fa190d8957f6b87dbad',
                value: '2023-03-15'
            },
            {
                title: '3c0618b4862d4028bcb3b48a8dce6949',
                value: '2023-04-05'
            },
            {
                title: '059ceff917494f0f90f8f2927517c53e',
                value: '2023-04-05'
            },
            {
                title: 'f95ee415e16145e4b70bf10e7a4dd6f5',
                value: '2023-05-03'
            },
            {
                title: 'e3f1ed7f1f4b465f8de96a6b66dc0551',
                value: '2023-05-03'
            },
            {
                title: 'c9ad5e63635a454cbb724140f4c7697c',
                value: '2023-06-13'
            },
            {
                title: 'ed816dd62bf449b082349e037dc8a679',
                value: '2023-06-13'
            },
            {
                title: '992178c4e2cb416384dfb6339de5ac7a',
                value: '2023-06-29'
            },
            {
                title: '8503715b6b8c4c7cbffa84b16918f36c',
                value: '2023-06-29'
            },
            {
                title: '644d1ef5d7eb45fe97d4c4e12dc54cf8',
                value: '2023-08-10'
            },
            {
                title: 'ab3cc12d5cea468b9fb32719f845ad27',
                value: '2023-08-10'
            },
            {
                title: 'c98ec6ff1b26457db28dfa9ca27f144a',
                value: '2023-08-31'
            },
            {
                title: 'aa88fbbee7c1443e8a5265e7d5983145',
                value: '2023-08-31'
            },
            {
                title: '3816afc616f44031817ddfe46d82554f',
                value: '2023-10-11'
            },
            {
                title: 'ff141e713b9b4a8abe62c5c164a62bb7',
                value: '2023-10-11'
            },
            {
                title: '4aca91302d9d4b6fafdaa591322f887b',
                value: '2023-11-01'
            },
            {
                title: 'a3d6bfc2b1b1481d9a974f2f56719983',
                value: '2023-11-01'
            },
        ];

        comboData.sort((a, b) => {
            const dateA = a.value;
            const dateB = b.value;

            return dateB.localeCompare(dateA);
        });

        waybackCombo.data(comboData);

        update();

        function update() {
            selection.selectAll('.background-wayback-item')
                .select('input');
        }
    }

    return section;
}
