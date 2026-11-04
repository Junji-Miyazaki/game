// EXPEDITION の一覧（本編 v1.1）。並びはツアーで出会う順（月 → 火星 → タイタン → 冥王星）。
// id = 解放と記録のキー。body = POD が出るツアーの天体。sys = 太陽系マップの惑星系。shellId = 試作ページ時代のミッション id。
// task = MISSION ACCEPTED の任務文（JA/EN）。music = ミッション中に流すツアーの曲（その天体の近く）。
// バンドル（build.js）ではこのファイルは EXP_index という閉じたスコープに入る。
import { create as EXP_c1 } from './m1_phobos.js?v=b521887bc7';
import { create as EXP_c2 } from './m2_enceladus.js?v=28c888e47d';
import { create as EXP_c3 } from './m3_ryugu.js?v=1f01f5254a';
import { create as EXP_c4 } from './m4_comet.js?v=ff1d0945d1';

export const EXP_MISSIONS = [
  { id: 'ryugu', no: 3, name: 'RYUGU', title: 'RYUGU TOUCH-AND-GO', body: 'moon', sys: 'earth', shellId: 'touch_and_go', music: 'moon', create: EXP_c3,
    task: { ja: '小惑星に触れて試料を取り、すぐ離れる', en: 'Touch the asteroid, take a sample, get away' } },
  { id: 'phobos', no: 1, name: 'PHOBOS', title: 'PHOBOS SAMPLE RETURN', body: 'mars', sys: 'mars', shellId: 'sample_return', music: 'mars', create: EXP_c1,
    task: { ja: '火星の衛星から試料を母船へ持ち帰る', en: 'Bring a sample from Mars’ moon to the ship' } },
  { id: 'enceladus', no: 2, name: 'ENCELADUS', title: 'ENCELADUS GEYSER RUN', body: 'titan', sys: 'saturn', shellId: 'geyser_run', music: 'titan', create: EXP_c2,
    task: { ja: '氷の間欠泉から試料を集める', en: 'Collect samples from the ice geysers' } },
  { id: '67p', no: 4, name: '67P', title: 'COMET 67P ANCHOR', body: 'pluto', sys: 'pluto', shellId: 'anchor', music: 'pluto', create: EXP_c4,
    task: { ja: '彗星に錨を打ち込む', en: 'Fire an anchor into the comet' } },
];
export const EXP_IDS = EXP_MISSIONS.map((x) => x.id);
export function expMission(id) { return EXP_MISSIONS.find((x) => x.id === id) || null; }
export function expForBody(bodyId) { return EXP_MISSIONS.find((x) => x.body === bodyId) || null; }
