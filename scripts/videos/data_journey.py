"""Home page short: one temperature reading walks the six stops of the site's data path.

Same look as the other site videos (Manim, no narration, Chinese labels on screen).
Render from the parent project folder, which has the Manim environment:
  .venv-manim/Scripts/python.exe -X utf8 -m manim render --disable_caching -r 1280,720 --fps 24 \
      --media_dir .manim-render aiot-guide/scripts/videos/data_journey.py DataJourney
"""
from manim import *

BG = '#111E30'; INK = '#EDF4FA'; MUTED = '#BECDE0'; CYAN = '#67D9EC'; GOLD = '#FFD079'; BOX = '#203248'


def text(s, size=28, color=INK):
    return Text(s, font='Microsoft JhengHei', font_size=size, color=color)


STOPS = [  # name, chapters, what the reading looks like after this stop, one-line caption
    ('感測', '3.1', '−18.5°C → 電訊號', '探頭把溫度變成電壓。'),
    ('訊號', '3.2', '電壓 → 數字', 'ADC 定時取樣，把電壓轉成數字。'),
    ('控制器', '2-1', '數字 → 一筆紀錄', '微控制器讀值、判斷，打包成一筆紀錄。'),
    ('傳輸', '2.2・2.3', '紀錄 → 訊息', '經無線網路，用 MQTT 等協定送出去。'),
    ('平台', '2.4・2-2', '訊息 → 資料', '平台收下、存起來、畫成趨勢圖。'),
    ('分析與行動', '1.1・1.2・2-3', '資料 → 決策', '判斷超溫，發出告警，調整壓縮機。'),
]


class DataJourney(Scene):
    def construct(self):
        self.camera.background_color = BG
        title = text('一筆感測資料，從現場走到決策', 38).move_to([0, 3.2, 0])
        sub = text('冷凍櫃裡的一個溫度讀值，會經過這六站', 24, MUTED).move_to([0, 2.55, 0])
        self.play(FadeIn(title), FadeIn(sub), run_time=1)

        xs = [-5.5 + i * 2.2 for i in range(6)]
        nodes = []
        for (name, ch, _, _), x in zip(STOPS, xs):
            box = RoundedRectangle(width=1.95, height=1.05, corner_radius=.15, stroke_color=MUTED, fill_color=BOX, fill_opacity=1).move_to([x, .3, 0])
            nodes.append(VGroup(box, text(name, 25 if len(name) < 5 else 22).move_to(box), text(ch, 19, MUTED).next_to(box, DOWN, buff=.18)))
        links = VGroup(*[Line([xs[i] + 1, .3, 0], [xs[i + 1] - 1, .3, 0], color=MUTED, stroke_width=3) for i in range(5)])
        self.play(LaggedStart(*[FadeIn(n) for n in nodes], lag_ratio=.12), Create(links), run_time=2)

        dot = Dot([xs[0], 1.15, 0], radius=.13, color=GOLD)
        form = text('', 26, GOLD).move_to([0, 1.7, 0])
        CAP = [0, -2.2, 0]
        cap = text(' ', 28).move_to(CAP)
        self.play(FadeIn(dot), run_time=.4)
        for i, (name, ch, f, c) in enumerate(STOPS):
            new_form = text(f, 26, GOLD).move_to([xs[i], 1.7, 0])
            new_form.shift(RIGHT * min(0, 6.2 - new_form.get_right()[0]) + RIGHT * max(0, -6.2 - new_form.get_left()[0]))
            moves = [dot.animate.move_to([xs[i], 1.15, 0])] if i else []
            self.play(*moves, nodes[i][0].animate.set_stroke(GOLD, width=4), Transform(form, new_form), Transform(cap, text(c, 28).move_to(CAP)), run_time=.9)
            self.wait(2.4)
            self.play(nodes[i][0].animate.set_stroke(CYAN, width=2.5), run_time=.25)

        # back to the field: the decision changes the compressor, and the next reading starts over
        loop = CurvedArrow([xs[5], -.95, 0], [xs[0], -.95, 0], angle=-PI / 6, color=CYAN, stroke_width=4)
        self.play(Create(loop), FadeOut(form), Transform(cap, text('行動回到現場，下一筆讀值又從感測開始。', 28).move_to([0, -2.55, 0])), run_time=1.4)
        self.wait(2.2)
        across = text('貫穿全程：架構 2.1、1-1｜資安 2.5、1-3｜故障排除 1-2', 22, MUTED).move_to([0, -3.3, 0])
        self.play(FadeIn(across), Transform(cap, text('網站每一章，都是這條路上的一段。', 30).move_to([0, -2.55, 0])), run_time=.8)
        self.wait(3)
