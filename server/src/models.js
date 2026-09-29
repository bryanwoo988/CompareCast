/* The forecast models a plot can be set to — the same eight the app offers,
   pinned by a test so the two lists cannot drift apart. */
const MODEL_IDS = ['best_match', 'ecmwf_ifs025', 'gfs_seamless', 'icon_seamless',
                   'gem_seamless', 'meteofrance_seamless', 'jma_seamless', 'ukmo_seamless'];

const known = m => MODEL_IDS.includes(m) ? m : 'best_match';

/* Best Match always rides along: it is the only source whose chance of rain
   exists for every plot, and it is where the app takes that number from. */
function modelsParam(model){
  const m = known(model);
  return m === 'best_match' ? 'best_match' : `${m},best_match`;
}

/* One hourly table in the shape aggregate() reads, built from a response that
   may carry two models' suffixed series. Amounts come from the plot's model,
   chance of rain from Best Match — the same split the detail page makes, so a
   reminder and the page it summarises quote the same figures. */
function forModel(hourly, model){
  if(!hourly || !Array.isArray(hourly.time)) return null;
  const m = known(model);
  if(m === 'best_match') return hourly;
  const s = k => hourly[`${k}_${m}`];
  return {
    time:hourly.time,
    temperature_2m:s('temperature_2m'),
    precipitation:s('precipitation'),
    wind_speed_10m:s('wind_speed_10m'),
    wind_gusts_10m:s('wind_gusts_10m'),
    precipitation_probability:hourly.precipitation_probability_best_match
  };
}

export {MODEL_IDS, modelsParam, forModel};
