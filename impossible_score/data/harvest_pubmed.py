#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SCORE FOR EVIDENCE — 関係史の採取（PubMed E-utilities）

方針:
  DAG の構造（どの概念があり、因果の矢印がどちらを向くか）は作者のモデルであり、
  データからは導かない。実際の疫学研究においても DAG は研究者のモデルに依存する。
  データが決めるのは、その DAG 上を流れる「関係史」——
  各辺の強度 w（共起の Dice 係数）、状態（強いデザインの占有率）、撤回の実数——である。

取得するもの（各相 × 各辺）:
  c(A)        : 概念 A の論文数
  c(B)        : 概念 B の論文数
  c(A∧B)      : 共起数                    → Dice = 2c(A∧B) / (c(A)+c(B))
  c(A∧B∧強) : メタ解析/RCT/システマティックレビュー の共起数 → 強いデザインの占有率
  c(A∧B∧撤) : Retracted Publication の共起数            → 赤い休符の実数

概念 → MeSH 記述子の対応は作者の選択である（開示事項）。
古い年代を取りこぼさぬよう、新旧の記述子を OR で束ねている。
"""
import json, time, sys, urllib.parse, urllib.request, os

EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
PAUSE  = 0.36          # NCBI: APIキーなしで 3 req/sec まで
STRONG = '("Meta-Analysis"[pt] OR "Randomized Controlled Trial"[pt] OR "Systematic Review"[pt])'
RETRACT = '"Retracted Publication"[pt]'

M = lambda t: '"%s"[MeSH]' % t
OR = lambda *ts: '(' + ' OR '.join(M(t) for t in ts) + ')'

MOVEMENTS = [
  {
    'no': 'I', 'key': 'fat',
    'context': None,
    # 中性脂肪(TG)を媒介層に追加し、ほぼ無音だった塩分を外して7声を保つ。
    # 媒介が2ノード（LDL/総コレsteroールと中性脂肪）になりDAGが見やすくなる。
    # TG→CVD は「独立した危険因子か否か」で長く係争された辺（音楽的にも生きる）
    'concepts': {
      'SFA':  OR('Dietary Fats', 'Fatty Acids'),
      'SUGR': OR('Dietary Sucrose', 'Dietary Carbohydrates'),
      'SMOK': OR('Smoking'),
      'CHOL': OR('Cholesterol'),
      'TG':   OR('Triglycerides', 'Hypertriglyceridemia'),
      'STAT': OR('Hydroxymethylglutaryl-CoA Reductase Inhibitors'),
      'CVD':  OR('Coronary Disease', 'Myocardial Infarction'),
    },
    'pairs': [('SFA','CHOL'), ('SFA','TG'), ('SFA','CVD'),
              ('SUGR','TG'), ('SUGR','CHOL'), ('SUGR','CVD'),
              ('SMOK','CVD'), ('CHOL','CVD'), ('TG','CVD'),
              ('STAT','CHOL'), ('STAT','TG'), ('STAT','CVD')],
    'epochs': [(1950,'1950:1959'), (1960,'1960:1969'), (1970,'1970:1979'), (1980,'1980:1989'),
               (1990,'1990:1999'), (2000,'2000:2009'), (2010,'2010:2019'), (2020,'2020:2026')],
  },
  {
    'no': 'II', 'key': 'alcohol',
    'context': None,
    'concepts': {
      'ALC':  OR('Alcohol Drinking'),
      'BP':   OR('Hypertension', 'Blood Pressure'),
      'HDL':  OR('Cholesterol, HDL', 'Lipoproteins, HDL'),
      'MI':   OR('Myocardial Infarction'),
      'ISCH': OR('Brain Ischemia', 'Cerebral Infarction', 'Ischemic Stroke'),
      'ICH':  OR('Cerebral Hemorrhage', 'Intracranial Hemorrhages'),
      'DOSE': OR('Dose-Response Relationship, Drug'),
    },
    'pairs': [('ALC','BP'), ('ALC','HDL'), ('ALC','MI'), ('ALC','ISCH'), ('ALC','ICH'),
              ('BP','ICH'), ('BP','ISCH'), ('BP','MI'), ('HDL','MI'),
              ('DOSE','MI'), ('DOSE','ISCH'), ('DOSE','ICH')],
    'epochs': [(1970,'1970:1989'), (1990,'1990:1999'), (2000,'2000:2009'),
               (2010,'2010:2017'), (2018,'2018:2019'), (2020,'2020:2026')],
  },
  {
    'no': 'III', 'key': 'reperfusion',
    # 第III曲だけ領域固定子を置く。置かねば血栓溶解の辺が心筋梗塞の文献に埋もれる（開示事項）
    'context': OR('Stroke', 'Brain Ischemia', 'Cerebral Infarction'),
    'concepts': {
      'ONSET':  OR('Time-to-Treatment'),
      'TPA':    OR('Tissue Plasminogen Activator', 'Thrombolytic Therapy'),
      'EVT':    OR('Thrombectomy', 'Mechanical Thrombolysis'),
      'REPERF': OR('Reperfusion', 'Cerebral Revascularization'),
      'INF':    OR('Brain Infarction', 'Brain Ischemia'),
      'SICH':   OR('Intracranial Hemorrhages', 'Cerebral Hemorrhage'),
      'MRS':    OR('Recovery of Function', 'Treatment Outcome'),
    },
    'pairs': [('ONSET','TPA'), ('ONSET','REPERF'), ('TPA','REPERF'), ('TPA','MRS'),
              ('TPA','SICH'), ('EVT','REPERF'), ('EVT','MRS'), ('EVT','SICH'),
              ('REPERF','MRS'), ('INF','MRS')],
    'epochs': [(1995,'1995:2004'), (2005,'2005:2012'), (2013,'2013:2014'),
               (2015,'2015:2017'), (2018,'2018:2019'), (2020,'2020:2026')],
  },
]

cache = {}
CACHE_PATH = os.path.join(os.path.dirname(__file__), '_count_cache.json')
if os.path.exists(CACHE_PATH):
    cache = json.load(open(CACHE_PATH))

def count(term):
    if term in cache:
        return cache[term]
    url = EUTILS + '?' + urllib.parse.urlencode(
        {'db': 'pubmed', 'retmode': 'json', 'rettype': 'count', 'term': term})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                n = int(json.load(r)['esearchresult']['count'])
            cache[term] = n
            time.sleep(PAUSE)
            return n
        except Exception as e:
            sys.stderr.write('retry(%d) %s :: %s\n' % (attempt, e, term[:60]))
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError('failed: ' + term)

out = {'_provenance': {
    'source': 'NCBI PubMed E-utilities (esearch, rettype=count)',
    'harvested': time.strftime('%Y-%m-%d'),
    'note': 'DAGの構造と因果の向きは作者のモデル。データが決めるのは辺の強度・状態・撤回数のみ。',
    'strong_designs': STRONG,
}}

total_q = 0
for mv in MOVEMENTS:
    ctx = (' AND ' + mv['context']) if mv['context'] else ''
    res = {'context': mv['context'], 'concepts': mv['concepts'], 'epochs': {}}
    for year, dp in mv['epochs']:
        dpf = ' AND %s[dp]' % dp
        singles = {}
        for cid, q in mv['concepts'].items():
            singles[cid] = count(q + ctx + dpf); total_q += 1
        pairs = {}
        for a, b in mv['pairs']:
            qa, qb = mv['concepts'][a], mv['concepts'][b]
            both = '%s AND %s%s%s' % (qa, qb, ctx, dpf)
            co = count(both); total_q += 1
            st = count(both + ' AND ' + STRONG); total_q += 1
            rt = count(both + ' AND ' + RETRACT); total_q += 1
            pairs['%s-%s' % (a, b)] = {'co': co, 'strong': st, 'retracted': rt}
        res['epochs'][str(year)] = {'dp': dp, 'singles': singles, 'pairs': pairs}
        sys.stderr.write('  %s %s done (%d queries)\n' % (mv['no'], year, total_q))
        json.dump(cache, open(CACHE_PATH, 'w'))
    out[mv['key']] = res

json.dump(cache, open(CACHE_PATH, 'w'))
path = os.path.join(os.path.dirname(__file__), 'pubmed_counts.json')
json.dump(out, open(path, 'w'), ensure_ascii=False, indent=1)
sys.stderr.write('\nWROTE %s  (%d queries)\n' % (path, total_q))
