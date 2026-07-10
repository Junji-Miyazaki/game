#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""field_derived.json → v2.8.html に差し込む decades 配列（JS）を生成する。"""
import json, os
D = os.path.dirname(__file__)
f = json.load(open(os.path.join(D, 'field_derived.json')))

HDR = {
 'fat': '    // 関係史はPubMedの実カウントから導出（辺 = [a, b, w, status, co, strong, retracted]）',
 'alcohol': '    // 同上',
 'reperfusion': '    // 同上。ONSET は MeSH "Time-to-Treatment" が2013年新設のため初期は沈黙する（実在の索引の歴史）',
}

for key in ('fat', 'alcohol', 'reperfusion'):
    lines = []
    for d in f[key]:
        es = []
        for e in d['edges']:
            es.append("['%s','%s',%.2f,'%s',%d,%d,%d]" %
                      (e['a'], e['b'], e['w'], e['status'], e['co'], e['strong'], e['retr']))
        lines.append("      { year:%d, root:'%s', edges:[%s] }," % (d['year'], d['root'], ','.join(es)))
    body = '\n'.join(lines).rstrip(',')
    print('=== %s ===' % key)
    print(HDR[key])
    print('    decades:[')
    print(body)
    print('    ] },')
    print()
