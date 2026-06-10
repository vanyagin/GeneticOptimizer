# -*- coding: utf-8 -*-
import os, json
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_LABEL_POSITION
from pptx.oxml.ns import qn

APP = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(APP, '_bench_results.json'), encoding='utf-8') as f:
    DATA = json.load(f)
ROWS = DATA['rows']
P = DATA['params']

DE_COLOR  = RGBColor(0x2E, 0x6F, 0xB5)   # синий
WOA_COLOR = RGBColor(0xF0, 0x58, 0x1E)   # оранжевый
INK       = RGBColor(0x2B, 0x2B, 0x2B)
HEAD_BG   = RGBColor(0x33, 0x3F, 0x50)
ROW_ALT   = RGBColor(0xF2, 0xF4, 0xF7)

ORDER = [("Сфера",2),("Сфера",10),("Сфера",30),("Розенброк",2),("Розенброк",10),
         ("Растригин",2),("Растригин",10),("Экли",2),("Экли",10),("Химмельблау",2)]

def get(algo, name, n):
    for r in ROWS:
        if r['algo']==algo and r['name']==name and r['n']==n:
            return r
    raise KeyError((algo,name,n))

def fmt_f(v):
    if v == 0:        return "≈0"
    if abs(v) < 1e-4: return f"{v:.1e}"
    return f"{v:.3g}"

def fmt_err(v):
    if v == 0:        return "<1e-7"
    if abs(v) < 1e-4: return f"{v:.1e}"
    return f"{v:.3g}"

def fmt_x(v):
    if v == 0:        return "0"
    if abs(v) < 1e-4: return f"{v:.1e}"
    return f"{v:.3g}"

prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
SW, SH = prs.slide_width, prs.slide_height

def add_title_only(title):
    s = prs.slides.add_slide(prs.slide_layouts[5])
    s.shapes.title.text = title
    tf = s.shapes.title.text_frame
    tf.paragraphs[0].font.size = Pt(30)
    tf.paragraphs[0].font.bold = True
    tf.paragraphs[0].font.color.rgb = HEAD_BG
    return s

def set_log_axis(chart):
    scaling = chart.value_axis._element.find(qn('c:scaling'))
    lb = scaling.makeelement(qn('c:logBase'), {'val': '10'})
    scaling.insert(0, lb)

# ---------- Слайд 1: титул ----------
s = prs.slides.add_slide(prs.slide_layouts[0])
s.shapes.title.text = "Тестирование и оценка эффективности\njDE и WOA"
s.placeholders[1].text = ("Поиск минимума функций, заданных пользователем\n"
                          f"Популяция {P['POP']} · бюджет {P['ITERS']} поколений · "
                          f"цель ε = 10⁻{P['E']} · seed = 42 (детерминированно)")
for p in s.shapes.title.text_frame.paragraphs:
    p.font.color.rgb = HEAD_BG

# ---------- Слайд 2: методика ----------
s = prs.slides.add_slide(prs.slide_layouts[1])
s.shapes.title.text = "Методика тестирования"
body = s.placeholders[1].text_frame
pts = [
 "Режим: функция задаётся пользователем (чтение из data.txt).",
 "Алгоритмы: jDE (current-to-pbest/1, самоадаптация F, CR) и WOA (bubble-net).",
 "Единые условия: популяция 50, 500 поколений, цель ε = 10⁻⁶.",
 "10 эталонных функций (f* = 0): Сфера, Розенброк, Растригин, Экли, Химмельблау.",
 "Размерности: n = 2, 10, 30 — от простых унимодальных до мультимодальных.",
 "Метрики: итераций до ε, найденное f(x*), |f−f*|, ‖x−x*‖, время, факт достижения ε.",
 "Seed фиксирован (42): результаты детерминированы и воспроизводимы.",
]
for i, t in enumerate(pts):
    para = body.paragraphs[0] if i == 0 else body.add_paragraph()
    para.text = t
    para.font.size = Pt(18)
    para.level = 0

# ---------- Таблицы ----------
HEADERS = ["Функция", "n", "Итер. до ε", "f(x*)", "|f−f*|", "‖x−x*‖", "Время, с", "ε"]
COL_W = [Inches(2.3), Inches(0.8), Inches(1.6), Inches(1.7),
         Inches(1.7), Inches(1.7), Inches(1.5), Inches(0.9)]

def add_table_slide(title, algo):
    s = add_title_only(title)
    nrows = len(ORDER) + 1
    ncols = len(HEADERS)
    left, top = Inches(0.5), Inches(1.35)
    width = sum(COL_W, Emu(0))
    height = Inches(5.6)
    tbl = s.shapes.add_table(nrows, ncols, left, top, width, height).table
    for j, w in enumerate(COL_W):
        tbl.columns[j].width = w
    # шапка
    for j, h in enumerate(HEADERS):
        c = tbl.cell(0, j)
        c.text = h
        c.fill.solid(); c.fill.fore_color.rgb = HEAD_BG
        pr = c.text_frame.paragraphs[0]
        pr.font.bold = True; pr.font.size = Pt(12)
        pr.font.color.rgb = RGBColor(0xFF,0xFF,0xFF)
        pr.alignment = PP_ALIGN.CENTER
        c.vertical_anchor = MSO_ANCHOR.MIDDLE
    # данные
    for i, (name, n) in enumerate(ORDER, start=1):
        r = get(algo, name, n)
        vals = [
            name, str(n),
            "—" if r['eps_iter'] < 0 else str(r['eps_iter']),
            fmt_f(r['fbest']),
            fmt_err(r['ferr']),
            fmt_x(r['xerr']),
            f"{r['time']:.2f}",
            "да" if r['reached'] else "нет",
        ]
        for j, v in enumerate(vals):
            c = tbl.cell(i, j)
            c.text = v
            pr = c.text_frame.paragraphs[0]
            pr.font.size = Pt(11)
            pr.font.color.rgb = INK
            pr.alignment = PP_ALIGN.LEFT if j == 0 else PP_ALIGN.CENTER
            c.vertical_anchor = MSO_ANCHOR.MIDDLE
            if i % 2 == 0:
                c.fill.solid(); c.fill.fore_color.rgb = ROW_ALT
            else:
                c.fill.solid(); c.fill.fore_color.rgb = RGBColor(0xFF,0xFF,0xFF)
            if j == 7:
                pr.font.bold = True
                pr.font.color.rgb = DE_COLOR if r['reached'] else WOA_COLOR

add_table_slide("Результаты — jDE (дифференциальная эволюция)", "de")
add_table_slide("Результаты — WOA (алгоритм китов)", "woa")

def style_series(chart, de_first=True):
    chart.series[0].format.fill.solid()
    chart.series[0].format.fill.fore_color.rgb = DE_COLOR if de_first else WOA_COLOR
    chart.series[1].format.fill.solid()
    chart.series[1].format.fill.fore_color.rgb = WOA_COLOR if de_first else DE_COLOR

# ---------- График 1: скорость сходимости (где обе достигли ε) ----------
s = add_title_only("Скорость сходимости: WOA быстрее на гладких функциях")
both = [(nm,n) for (nm,n) in ORDER
        if get("de",nm,n)['reached'] and get("woa",nm,n)['reached']]
cats = [f"{nm}-{n}" for (nm,n) in both]
cd = CategoryChartData()
cd.categories = cats
cd.add_series("jDE",  [get("de", nm,n)['eps_iter']  for (nm,n) in both])
cd.add_series("WOA",  [get("woa",nm,n)['eps_iter']  for (nm,n) in both])
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED,
                        Inches(0.5), Inches(1.5), Inches(12.3), Inches(5.3), cd)
chart = gf.chart
chart.has_legend = True; chart.legend.position = XL_LEGEND_POSITION.TOP
chart.legend.include_in_layout = False
chart.value_axis.axis_title.text_frame.text = "Итераций до ε = 10⁻⁶"
style_series(chart)

# ---------- График 2: масштабируемость на Сфере ----------
s = add_title_only("Масштабируемость (Сфера): WOA устойчив к росту размерности")
cd = CategoryChartData()
cd.categories = ["n = 2", "n = 10", "n = 30"]
cd.add_series("jDE", [get("de","Сфера",n)['eps_iter']  for n in (2,10,30)])
cd.add_series("WOA", [get("woa","Сфера",n)['eps_iter'] for n in (2,10,30)])
gf = s.shapes.add_chart(XL_CHART_TYPE.LINE_MARKERS,
                        Inches(0.5), Inches(1.5), Inches(12.3), Inches(5.3), cd)
chart = gf.chart
chart.has_legend = True; chart.legend.position = XL_LEGEND_POSITION.TOP
chart.legend.include_in_layout = False
chart.value_axis.axis_title.text_frame.text = "Итераций до ε = 10⁻⁶"
chart.series[0].format.line.color.rgb = DE_COLOR
chart.series[1].format.line.color.rgb = WOA_COLOR
for sr in chart.series:
    sr.format.line.width = Pt(2.5)
chart.plots[0].has_data_labels = True
chart.plots[0].data_labels.font.size = Pt(11)

# ---------- График 3: надёжность на сложных функциях (лог-шкала) ----------
s = add_title_only("Надёжность на мультимодальных задачах (n=10): сильная сторона jDE")
hard = [("Розенброк",10), ("Растригин",10)]
cd = CategoryChartData()
cd.categories = [f"{nm}-{n}" for (nm,n) in hard]
cd.add_series("jDE", [max(get("de", nm,n)['ferr'], 1e-7) for (nm,n) in hard])
cd.add_series("WOA", [max(get("woa",nm,n)['ferr'], 1e-7) for (nm,n) in hard])
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED,
                        Inches(1.2), Inches(1.5), Inches(10.9), Inches(5.0), cd)
chart = gf.chart
chart.has_legend = True; chart.legend.position = XL_LEGEND_POSITION.TOP
chart.legend.include_in_layout = False
chart.value_axis.axis_title.text_frame.text = "Итоговая ошибка |f−f*| (лог. шкала)"
style_series(chart)
set_log_axis(chart)
chart.plots[0].has_data_labels = True
dl = chart.plots[0].data_labels
dl.number_format = '0.0E+00'; dl.number_format_is_linked = False
dl.font.size = Pt(11)
dl.position = XL_LABEL_POSITION.OUTSIDE_END

# ---------- Слайд выводов ----------
s = prs.slides.add_slide(prs.slide_layouts[1])
s.shapes.title.text = "Выводы"
body = s.placeholders[1].text_frame
pts = [
 "Обе методики решают 8 из 10 задач до точности 10⁻⁶.",
 "WOA сходится быстрее на гладких/унимодальных функциях (Сфера-30: 40 итераций против 242 у jDE).",
 "Преимущество WOA по скорости растёт с размерностью на простом рельефе.",
 "jDE надёжнее на сложной мультимодальной задаче: Растригин-10 — ошибка 1.4·10⁻⁶ против 57.7 у WOA.",
 "По времени при равном бюджете алгоритмы сопоставимы (нет досрочной остановки).",
 "Рекомендация: WOA — для быстрых гладких задач; jDE — для трудных многоэкстремальных.",
]
for i, t in enumerate(pts):
    para = body.paragraphs[0] if i == 0 else body.add_paragraph()
    para.text = t
    para.font.size = Pt(18)

out = os.path.join(APP, "Результаты_тестирования.pptx")
prs.save(out)
print("Saved:", out)
print("Slides:", len(prs.slides._sldIdLst))
