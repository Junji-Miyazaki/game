#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SCORE FOR EVIDENCE — 関係史 → 場（field）への導出

データが決めるもの:
  w      : Dice 係数 = 2·c(A∧B) / (c(A)+c(B))。概念の人気度で割り、共起の「密度」を測る。
           曲ごとに最大値で正規化して 0.15..0.95 に写す。
  status : 強いデザイン（メタ解析/RCT/システマティックレビュー）の占有率 strongShare と
           共起の絶対量から、'establishing' / 'established' を決める。
  retr   : 撤回論文の実数 → 赤い休符の回数。

作者が決めるもの（開示事項。実際の疫学でも DAG はモデル依存である）:
  - 概念の集合と、因果の矢印の向き（曝露→治療→媒介→アウトカム）
  - 'contested'（係争）と 'reversed'（逆転）の注釈。
    これは文献の解釈であり、件数からは導けない。史実として作者が引き受ける。
"""
import json, os, sys

D = os.path.dirname(__file__)
counts = json.load(open(os.path.join(D, 'pubmed_counts.json')))

# 作者の注釈: 係争と逆転。(曲, 相, 'A-B') → 状態
OVERLAY = {
  ('fat',   2010, 'SFA-CVD'):  'reversed',    # Siri-Tarino 2010 以降、定説が覆る
  ('fat',   2020, 'SFA-CVD'):  'reversed',
  ('fat',   2000, 'SFA-CVD'):  'contested',
  ('fat',   1970, 'SALT-CVD'): 'contested',
  ('fat',   1990, 'SALT-CVD'): 'contested',

  ('alcohol', 2018, 'ALC-MI'):   'reversed',  # GBD 2018「安全な量はない」
  ('alcohol', 2020, 'ALC-MI'):   'reversed',
  ('alcohol', 2018, 'ALC-HDL'):  'reversed',
  ('alcohol', 2010, 'ALC-MI'):   'contested',
  ('alcohol', 2010, 'ALC-ISCH'): 'contested',
  ('alcohol', 2010, 'ALC-HDL'):  'contested',
  ('alcohol', 2000, 'ALC-ISCH'): 'contested',

  ('reperfusion', 2013, 'EVT-REPERF'): 'contested',  # IMS III / MR RESCUE の陰性試験
  ('reperfusion', 2013, 'EVT-MRS'):    'contested',
  ('reperfusion', 1995, 'TPA-SICH'):   'contested',
  ('reperfusion', 2005, 'TPA-SICH'):   'contested',
  ('reperfusion', 2018, 'EVT-SICH'):   'contested',
  ('reperfusion', 2020, 'EVT-SICH'):   'contested',
}

# 各曲の重心（パラダイムの中心）— 作者の史観。開示事項
ROOTS = {
  'fat':        {1950:'CVD', 1960:'CHOL', 1970:'SFA', 1980:'SFA',
                 1990:'STAT', 2000:'STAT', 2010:'SUGR', 2020:'SUGR'},
  'alcohol':    {1970:'MI', 1990:'ALC', 2000:'ALC', 2010:'BP', 2018:'ALC', 2020:'ALC'},
  'reperfusion':{1995:'TPA', 2005:'TPA', 2013:'ONSET', 2015:'EVT', 2018:'REPERF', 2020:'REPERF'},
}

def dice(co, ca, cb):
    return 0.0 if (ca + cb) == 0 else 2.0 * co / (ca + cb)

report = []
result = {}
for key in ('fat', 'alcohol', 'reperfusion'):
    mv = counts[key]
    raw = {}
    for yr, ep in mv['epochs'].items():
        for pk, pv in ep['pairs'].items():
            a, b = pk.split('-')
            raw[(int(yr), pk)] = dice(pv['co'], ep['singles'][a], ep['singles'][b])
    dmax = max(raw.values()) or 1.0

    decades = []
    for yr in sorted(int(y) for y in mv['epochs']):
        ep = mv['epochs'][str(yr)]
        edges = []
        for pk, pv in ep['pairs'].items():
            d = raw[(yr, pk)]
            w = 0.15 + 0.80 * (d / dmax) ** 0.55          # 正規化（べきで裾を持ち上げる）
            w = round(min(0.95, max(0.15, w)), 2)
            share = (pv['strong'] / pv['co']) if pv['co'] else 0.0
            # データが決める基礎状態
            status = 'established' if (share >= 0.06 and pv['co'] >= 25 and w >= 0.35) else 'establishing'
            # 作者が引き受ける注釈で上書き
            status = OVERLAY.get((key, yr, pk), status)
            a, b = pk.split('-')
            edges.append({'a': a, 'b': b, 'w': w, 'status': status,
                          'co': pv['co'], 'strong': pv['strong'], 'retr': pv['retracted'],
                          'share': round(share, 3)})
            report.append((key, yr, pk, pv['co'], pv['strong'], pv['retracted'],
                           round(d, 4), w, status))
        edges = [e for e in edges if e['co'] > 0]
        decades.append({'year': yr, 'root': ROOTS[key][yr], 'edges': edges,
                        'retr': sum(e['retr'] for e in edges)})
    result[key] = decades

json.dump(result, open(os.path.join(D, 'field_derived.json'), 'w'),
          ensure_ascii=False, indent=1)

print('%-12s %-6s %-14s %7s %7s %5s %8s %6s  %s' %
      ('movement','epoch','pair','co','strong','retr','dice','w','status'))
for r in report:
    print('%-12s %-6d %-14s %7d %7d %5d %8.4f %6.2f  %s' % r)
print('\nWROTE field_derived.json')
