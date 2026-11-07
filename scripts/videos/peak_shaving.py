"""s2-11 short: a message queue turns the area above the write limit into a queue, then writes it out in the valley.

Same look as the other site videos (Manim, no narration, Chinese labels on screen). No real numbers on the axes.
Render from the parent project folder, which has the Manim environment:
  .venv-manim/Scripts/python.exe -X utf8 -m manim render --disable_caching -r 1280,720 --fps 24 \
      --media_dir .manim-render aiot-guide/scripts/videos/peak_shaving.py PeakShaving
"""
import numpy as np
from manim import *

BG = '#111E30'; INK = '#EDF4FA'; MUTED = '#BECDE0'; CYAN = '#67D9EC'; GOLD = '#FFD079'; RED = '#FF8C82'


def text(s, size=28, color=INK):
    return Text(s, font='Microsoft JhengHei', font_size=size, color=color)


T = np.linspace(0, 10, 801)
CAP = 2.4


def simulate(f, qmax=None):
    """Queue length, written rate and overflow rate over time for an inflow f(t)."""
    dt = T[1] - T[0]
    q = np.zeros_like(T); w = np.zeros_like(T); lost = np.zeros_like(T)
    for i in range(1, len(T)):
        inflow = f[i]
        out = CAP if (q[i - 1] > 1e-9 or inflow > CAP) else inflow
        nq = q[i - 1] + (inflow - out) * dt
        if qmax is not None and nq > qmax:
            lost[i] = (nq - qmax) / dt; nq = qmax
        q[i] = max(0.0, nq); w[i] = out
    return q, w, lost


class PeakShaving(Scene):
    def construct(self):
        self.camera.background_color = BG
        self.add(text('削峰填谷：尖峰多出來的資料去哪了', 36).move_to([0, 3.3, 0]),
                 text('考科二｜系統元件與架構　・　示意，不代表實際數值', 22, MUTED).move_to([0, 2.72, 0]))
        ax = Axes(x_range=[0, 10, 10], y_range=[0, 7.5, 10], x_length=8.6, y_length=4.1, tips=False,
                  axis_config={'color': MUTED, 'stroke_width': 2, 'include_ticks': False}).move_to([-1.55, -.15, 0])
        ylab = text('每秒寫入量', 22, MUTED).next_to(ax.y_axis, UP, buff=.12).align_to(ax.y_axis, LEFT)
        xlab = text('時間 →', 22, MUTED).next_to(ax.x_axis, DOWN, buff=.12).align_to(ax.x_axis, RIGHT)
        cap = DashedLine(ax.c2p(0, CAP), ax.c2p(10, CAP), color=GOLD, dash_length=.12)
        caplab = text('資料庫最多寫得這麼快', 21, GOLD).next_to(ax.c2p(10, CAP), UP, buff=.08).shift(LEFT * 1.6)
        CAPPOS = [0, -3.05, 0]
        cap_note = text(' ', 26).move_to(CAPPOS)
        self.add(ax, ylab, xlab)

        # queue bar on the right
        base = np.array([4.85, -2.2, 0]); BAR_H = 4.0
        frame = Rectangle(width=.8, height=BAR_H, color=MUTED, stroke_width=2).move_to(base + UP * BAR_H / 2)
        qlab = text('佇列', 24).next_to(frame, UP, buff=.12)
        qscale = BAR_H / 3.2

        def curve(y, color, width=4):
            return VMobject(color=color, stroke_width=width).set_points_as_corners([ax.c2p(x, v) for x, v in zip(T[::4], y[::4])])

        def band(lo, hi, mask, upto, color, op=.45):
            """Filled area between lo and hi where mask is true, drawn up to time upto."""
            parts = VGroup()
            idx = np.where(mask & (T <= upto))[0]
            if len(idx) < 2:
                return parts
            runs = np.split(idx, np.where(np.diff(idx) > 1)[0] + 1)
            for r in runs:
                if len(r) < 2:
                    continue
                pts = [ax.c2p(T[i], hi[i]) for i in r] + [ax.c2p(T[i], lo[i]) for i in r[::-1]]
                parts.add(Polygon(*pts, stroke_width=0, fill_color=color, fill_opacity=op))
            return parts

        # 1. direct write: the part above the line is simply too much
        f1 = 1 + 4.2 * np.exp(-((T - 3) / .75) ** 2)
        capv = np.full_like(T, CAP)
        inflow = curve(f1, INK)
        self.play(Create(cap), FadeIn(caplab), run_time=.8)
        self.play(Create(inflow), Transform(cap_note, text('全車隊同時開機：流入一下子衝高', 28).move_to(CAPPOS)), run_time=2)
        over = band(capv, f1, f1 > CAP, 10, RED)
        overlab = text('寫不及：變慢、逾時、出錯', 26, RED).move_to(ax.c2p(5.6, 5.4))
        self.play(FadeIn(over), FadeIn(overlab), Transform(cap_note, text('直接寫資料庫：高出虛線的這塊寫不進去', 28).move_to(CAPPOS)), run_time=1.2)
        self.wait(2.6)

        # 2. with a queue: the excess waits, then fills the valley after the peak
        q, w, _ = simulate(f1)
        t = ValueTracker(0)
        self.play(FadeOut(over), FadeOut(overlab), FadeIn(frame), FadeIn(qlab),
                  Transform(cap_note, text('中間加佇列：寫不及的先排隊', 28).move_to(CAPPOS)), run_time=1)
        excess = always_redraw(lambda: band(capv, f1, f1 > CAP, t.get_value(), CYAN, .4))
        fill = always_redraw(lambda: band(f1, capv, (q > 1e-6) & (f1 < CAP), t.get_value(), GOLD, .5))
        cursor = always_redraw(lambda: DashedLine(ax.c2p(t.get_value(), 0), ax.c2p(t.get_value(), 7.2), color=MUTED, stroke_width=2, dash_length=.08))
        bar = always_redraw(lambda: Rectangle(width=.8, height=max(.001, np.interp(t.get_value(), T, q) * qscale), stroke_width=0,
                                              fill_color=CYAN, fill_opacity=.85).move_to(base, aligned_edge=DOWN))
        self.add(excess, fill, cursor, bar)
        self.play(t.animate.set_value(3.6), run_time=4.5, rate_func=linear)
        self.play(Transform(cap_note, text('尖峰過後，佇列以最高速度慢慢寫完', 28).move_to(CAPPOS)), run_time=.4)
        self.play(t.animate.set_value(10), run_time=5, rate_func=linear)
        eq = text('峰上多出的面積 ＝ 谷裡補寫的面積', 26, GOLD).move_to(ax.c2p(6.4, 5.4))
        self.play(FadeIn(eq), Transform(cap_note, text('資料沒有丟，只是晚一點寫進去', 28).move_to(CAPPOS)), run_time=.8)
        self.wait(3)

        # 3. the queue has a limit too
        f2 = 1 + 6.2 * np.exp(-((T - 3) / 1.0) ** 2)
        QMAX = 2.6
        q2, w2, lost2 = simulate(f2, QMAX)
        limit = DashedLine(base + UP * QMAX * qscale + LEFT * .55, base + UP * QMAX * qscale + RIGHT * .55, color=RED)
        limlab = text('上限', 22, RED).next_to(limit, RIGHT, buff=.1)
        for m in (excess, fill, cursor, bar):
            m.clear_updaters()
        inflow2 = curve(f2, INK)
        self.play(FadeOut(eq), FadeOut(excess), FadeOut(fill), FadeOut(cursor), FadeOut(bar), Transform(inflow, inflow2), FadeIn(limit), FadeIn(limlab),
                  Transform(cap_note, text('佇列也有上限：尖峰更高更久時……', 28).move_to(CAPPOS)), run_time=1.2)
        t2 = ValueTracker(0)
        queued = always_redraw(lambda: band(capv, np.minimum(f2, capv + np.where(lost2 > 0, 0, f2 - capv)), (f2 > CAP) & (lost2 == 0), t2.get_value(), CYAN, .4))
        dropped = always_redraw(lambda: band(capv, f2, lost2 > 0, t2.get_value(), RED, .55))
        cursor2 = always_redraw(lambda: DashedLine(ax.c2p(t2.get_value(), 0), ax.c2p(t2.get_value(), 7.2), color=MUTED, stroke_width=2, dash_length=.08))
        bar2 = always_redraw(lambda: Rectangle(width=.8, height=max(.001, np.interp(t2.get_value(), T, q2) * qscale), stroke_width=0,
                                               fill_color=RED if np.interp(t2.get_value(), T, lost2) > 0 else CYAN, fill_opacity=.85).move_to(base, aligned_edge=DOWN))
        self.add(queued, dropped, cursor2, bar2)
        t_end = T[np.where(lost2 > 0)[0][-1]]  # stop while it is still overflowing
        self.play(t2.animate.set_value(t_end), run_time=4.5, rate_func=linear)
        self.play(Transform(cap_note, text('佇列滿了，超出的還是會掉（沒持久化時重開機也會掉）', 26).move_to(CAPPOS)), run_time=.5)
        self.wait(3.2)
