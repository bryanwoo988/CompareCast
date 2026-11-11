/* MetMalaysia's official forecast: matching a plot to MetMalaysia's place,
   reading data.gov.my's reply, and translating its phrases. */
const test = require('node:test');
const assert = require('node:assert');
const m = require('../metlogic.js');

test('a plot is matched to its district first, then its state', () => {
  /* what OpenStreetMap returned for the two real plots */
  assert.deepStrictEqual(m.metPlaces({iso:'MY-10', state:'Selangor', district:'Petaling'}),
    [{name:'Petaling', type:'Ds'}, {name:'Selangor', type:'St'}]);
  assert.deepStrictEqual(m.metPlaces({iso:'MY-06', state:'Pahang', district:'Bentong'}),
    [{name:'Bentong', type:'Ds'}, {name:'Pahang', type:'St'}]);
});

test('names that differ from MetMalaysia\'s, or are missing, are mapped', () => {
  assert.strictEqual(m.metPlaces({iso:'MY-06', district:'Cameron Highlands'})[0].name, 'Tanah Tinggi Cameron');
  /* Kuala Lumpur, Putrajaya and Perlis have no district in OpenStreetMap */
  assert.deepStrictEqual(m.metPlaces({iso:'MY-14', state:'Kuala Lumpur'}),
    [{name:'Kuala Lumpur', type:'Ds'}, {name:'WP Kuala Lumpur', type:'St'}]);
  assert.strictEqual(m.metPlaces({iso:'MY-09'})[0].name, 'Perlis');
  /* case and a "Daerah" prefix do not matter; MetMalaysia's spelling is used */
  assert.strictEqual(m.metPlaces({iso:'MY-07', district:'daerah seberang perai tengah'})[0].name, 'Seberang Perai Tengah');
  /* Sarawak's county comes through as the district */
  assert.strictEqual(m.metPlaces({iso:'MY-13', district:'Kuching'})[0].name, 'Kuching');
});

test('an unknown district falls back to the state; outside Malaysia gets nothing', () => {
  assert.deepStrictEqual(m.metPlaces({iso:'MY-01', district:'Nowhere'}), [{name:'Johor', type:'St'}]);
  assert.deepStrictEqual(m.metPlaces({none:true}), []);
  assert.deepStrictEqual(m.metPlaces(null), []);
});

test('Sabah and Sarawak: district, then division, then state', () => {
  /* what OpenStreetMap returns for a plot in Tongod */
  assert.deepStrictEqual(m.metPlaces({iso:'MY-12', state:'Sabah', district:'Tongod', division:'Bahagian Sandakan'}),
    [{name:'Tongod', type:'Ds'}, {name:'Sandakan', type:'Dv'}, {name:'Sabah', type:'St'}]);
  /* an unmatched district is not replaced by a district that shares the division's name */
  assert.deepStrictEqual(m.metPlaces({iso:'MY-12', district:'Nowhere', division:'Bahagian Pantai Barat'}),
    [{name:'Pantai Barat', type:'Dv'}, {name:'Sabah', type:'St'}]);
  /* a division is never read as a district */
  assert.deepStrictEqual(m.metPlaces({iso:'MY-13', district:'', division:'Kuching'}),
    [{name:'Kuching', type:'Dv'}, {name:'Sarawak', type:'St'}]);
});

test('the request filters by the exact name, sorted by date', () => {
  assert.strictEqual(m.metUrl('Larut, Matang Dan Selama'),
    'https://api.data.gov.my/weather/forecast/?filter=Larut%2C%20Matang%20Dan%20Selama@location__location_name&sort=date&limit=100');
});

const rec = (id, date, extra) => Object.assign({location:{location_id:id, location_name:'Bentong'}, date,
  morning_forecast:'Tiada Hujan', afternoon_forecast:'Ribut petir di beberapa tempat', night_forecast:'Tiada Hujan',
  summary_forecast:'Ribut petir di beberapa tempat', summary_when:'Petang', min_temp:23, max_temp:32}, extra);

test('the reply is read for the place asked for, from today, oldest first', () => {
  /* Bentong is both a district (Ds059) and a town (Tn072) */
  const days = m.metDays([rec('Ds059', '2026-11-12'), rec('Tn072', '2026-11-11', {max_temp:40}),
    rec('Ds059', '2026-11-10'), rec('Ds059', '2026-11-11'), rec('Ds059', '2026-11-11')], 'Ds', '2026-11-11');
  assert.deepStrictEqual(days.map(d => d.date), ['2026-11-11', '2026-11-12']);
  assert.deepStrictEqual(days[0], {date:'2026-11-11', am:'Tiada Hujan', pm:'Ribut petir di beberapa tempat',
    night:'Tiada Hujan', sum:'Ribut petir di beberapa tempat', when:'Petang', min:23, max:32});
  assert.strictEqual(m.metDays([rec('Ds059', '2026-11-11', {min_temp:null})], 'Ds')[0].min, null);
  assert.deepStrictEqual(m.metDays({error:'x'}, 'Ds'), []);
});

test('every phrase MetMalaysia used this week is translated', () => {
  const zh = {
    'Tiada Hujan':'无雨', 'Ribut petir':'雷雨', 'Hujan':'有雨', 'Mendung':'阴天',
    'Ribut petir di beberapa tempat':'局部雷雨', 'Hujan di beberapa tempat':'局部有雨',
    'Ribut petir di kebanyakan tempat':'多处雷雨', 'Hujan di kebanyakan tempat':'多处有雨',
    'Hujan menyeluruh':'普遍有雨', 'Ribut petir menyeluruh':'普遍雷雨',
    'Ribut petir di beberapa tempat di kawasan pedalaman':'内陆局部雷雨',
    'Hujan di beberapa tempat di kawasan pedalaman':'内陆局部有雨',
    'Hujan di beberapa tempat di kawasan pantai':'沿海局部有雨',
    'Ribut petir di beberapa tempat di kawasan pantai':'沿海局部雷雨',
    'Ribut petir di kebanyakan tempat di kawasan pedalaman':'内陆多处雷雨'
  };
  for(const [ms, want] of Object.entries(zh)){
    assert.strictEqual(m.metPhrase(ms, 'zh'), want, ms);
    assert.notStrictEqual(m.metPhrase(ms, 'en'), ms, ms);
    assert.strictEqual(m.metPhrase(ms, 'ms'), ms);
  }
  assert.strictEqual(m.metPhrase('Hujan menyeluruh', 'en'), 'Widespread rain');
  assert.strictEqual(m.metPhrase('Ribut petir di beberapa tempat di kawasan pantai', 'en'), 'Thunderstorms in a few places (coastal)');
});

test('a phrase not seen before is shown as MetMalaysia wrote it', () => {
  assert.strictEqual(m.metPhrase('Jerebu', 'zh'), 'Jerebu');
  assert.strictEqual(m.metKind('Jerebu'), 'none');
});

test('the kind of weather picks the icon', () => {
  assert.strictEqual(m.metKind('Tiada Hujan'), 'none');
  assert.strictEqual(m.metKind('Hujan di beberapa tempat'), 'rain');
  assert.strictEqual(m.metKind('Ribut petir menyeluruh'), 'storm');
  assert.strictEqual(m.metKind('Mendung'), 'cloud');
});

test('when in the day', () => {
  assert.strictEqual(m.metWhen('Petang dan Malam', 'zh'), '下午和晚上');
  assert.strictEqual(m.metWhen('Sepanjang Hari', 'en'), 'all day');
  assert.strictEqual(m.metWhen('Pagi dan Petang', 'en'), 'morning and afternoon');
  assert.strictEqual(m.metWhen('Petang', 'ms'), 'Petang');
  assert.strictEqual(m.metWhen('', 'zh'), '');
});
