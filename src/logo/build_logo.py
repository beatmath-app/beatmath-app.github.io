"""殴り算（BeatMath）のロゴ一式を生成するスクリプト。

使い方:
  pip install fonttools brotli skia-pathops
  python3 src/logo/build_logo.py <ドラマチック明朝.ttf> <RussoOne.woff2>

- ドラマチック明朝 = 新愚公拼搏体（XinYuGongPinBoTi, SIL OFL 1.1）。16MB あるのでリポジトリには入れていない
- Russo One（SIL OFL 1.1）は npm の @fontsource/russo-one などから取得できる
- 文字はすべてアウトライン（SVGのパス）にするので、アプリ側でフォントを読み込む必要はない

出力（リポジトリ直下の assets/）:
  logo.svg            ロゴ全体（盾と剣 ＋ 殴り算 ＋ BEATMATH ＋ MTG COMBAT QUIZ）
  favicon.svg         ファビコン
  og-image.svg        X などで共有したときのカード画像（1200×630）
src/logo/header-logo.html に画面ヘッダー用のインラインSVGを書き出す（src/template4.html の <header> に貼る）。
PNG（apple-touch-icon.png, og-image.png）は rsvg-convert で書き出す（このスクリプトの最後で実行）。
"""
import os
import shutil
import subprocess
import sys

import pathops
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

DRAMATIC, RUSSO = sys.argv[1], sys.argv[2]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets')
os.makedirs(OUT, exist_ok=True)

NAVY, ACCENT, WHITE, SUB = '#0F1B2D', '#FF6B2C', '#FFFFFF', '#AEB8C8'
GAP = 25  # ステンシルの切れ目の半幅（フォント単位）


# ---------- パスの基本処理 ----------
def font_path(font, ch, dx=0.0):
    gs, cm = font.getGlyphSet(), font.getBestCmap()
    g = cm[ord(ch)]
    rp = RecordingPen()
    gs[g].draw(rp)
    p = pathops.Path()
    pen = p.getPen()
    for op, args in rp.value:
        getattr(pen, op)(*[(x + dx, y) for x, y in args])
    p.simplify(fix_winding=True)
    return p, gs[g].width


def poly(points, dx=0.0):
    p = pathops.Path()
    pen = p.getPen()
    pen.moveTo((points[0][0] + dx, points[0][1]))
    for x, y in points[1:]:
        pen.lineTo((x + dx, y))
    pen.closePath()
    return p


def to_d(p):
    """pathops.Path → SVGの d（y軸を反転：ベースライン y=0、上がマイナス）"""
    out = []
    for verb, pts in p:
        pts = [(round(x, 1), round(-y, 1)) for x, y in pts]
        if verb == pathops.PathVerb.MOVE:
            out.append('M%g %g' % pts[0])
        elif verb == pathops.PathVerb.LINE:
            out.append('L%g %g' % pts[0])
        elif verb == pathops.PathVerb.QUAD:
            out.append('Q%g %g %g %g' % (pts[0] + pts[1]))
        elif verb == pathops.PathVerb.CUBIC:
            out.append('C%g %g %g %g %g %g' % (pts[0] + pts[1] + pts[2]))
        elif verb == pathops.PathVerb.CLOSE:
            out.append('Z')
    return ''.join(out)


# ---------- 文字のアウトライン ----------
dram = TTFont(DRAMATIC)
russo = TTFont(RUSSO)

# 殴り算（1文字 1000 単位、ベースライン y=0）
kanji = pathops.Path()
x = 0
for ch in '殴り算':
    p, w = font_path(dram, ch, x)
    kanji = pathops.op(kanji, p, pathops.PathOp.UNION)
    x += w
KANJI_D = to_d(kanji)


# BEATMATH（ステンシル加工：縦棒と曲線・横棒のつなぎ目に切れ目を入れる）
def stem(a, s, v1, v2, h=GAP):  # x = a + s*v に沿った帯
    return [(a + s * v1 - h, v1), (a + s * v2 - h, v2), (a + s * v2 + h, v2), (a + s * v1 + h, v1)]


def horiz(b, t, x0, x1, x2, h=GAP):  # v = b + t*(x - x0) に沿った帯
    return [(x1, b + t * (x1 - x0) - h), (x2, b + t * (x2 - x0) - h),
            (x2, b + t * (x2 - x0) + h), (x1, b + t * (x1 - x0) + h)]


CUTS = {
    'B': [stem(228, 0.2, 640, 780), stem(228, 0.2, 350, 470), stem(228, 0.2, -80, 70)],
    'E': [stem(231, 0.2, 630, 820), stem(231, 0.2, 330, 450), stem(231, 0.2, -80, 70)],
    'A': [stem(421, -0.14, 140, 780)],
    'T': [horiz(673, 0.195, 300, 280, 480)],
    'M': [stem(321, -0.22, 560, 730), stem(526, -0.21, -100, 230), stem(605, 0.215, 560, 850)],
    'H': [stem(228, 0.2, 300, 520), stem(466, 0.21, 300, 520)],
}
words, x = {}, 0
for word in ('BEAT', 'MATH'):
    acc = pathops.Path()
    for ch in word:
        p, w = font_path(dram, ch, x)
        for c in CUTS.get(ch, []):
            p = pathops.op(p, poly(c, x), pathops.PathOp.DIFFERENCE)
        acc = pathops.op(acc, p, pathops.PathOp.UNION)
        x += w
    words[word] = to_d(acc)
EN_W = x  # 6235

# MTG COMBAT QUIZ（Russo One、字間 0.3em）
sub = pathops.Path()
x = 0
for ch in 'MTG COMBAT QUIZ':
    if ch != ' ':
        p, w = font_path(russo, ch, x)
        sub = pathops.op(sub, p, pathops.PathOp.UNION)
    else:
        w = russo['hmtx'][russo.getBestCmap()[32]][0]
    x += w + 300
SUB_D, SUB_W = to_d(sub), x - 300

# ---------- 部品 ----------
# 盾と剣（220×220）。favicon では線を太くする
def emblem(bold=False, bg=NAVY):
    sw, r, gap = (14, 19, 6) if bold else (8, 15, 4)
    return (
        f'<path d="M110 14L188 40V108C188 158 152 188 110 206C68 188 32 158 32 108V40Z" fill="none" '
        f'stroke="{WHITE}" stroke-width="{sw}" stroke-linejoin="round"/>'
        f'<circle cx="110" cy="70" r="{r}" fill="{WHITE}"/><circle cx="110" cy="152" r="{r}" fill="{WHITE}"/>'
        f'<g transform="rotate(-45 110 110)" stroke="{bg}" stroke-width="{gap}" paint-order="stroke">'
        f'<path d="M62 101H210L236 110L210 119H62Z" fill="{ACCENT}"/>'
        f'<rect x="48" y="80" width="13" height="60" rx="3" fill="{WHITE}"/>'
        f'<rect x="18" y="104" width="31" height="12" rx="3" fill="{WHITE}"/>'
        f'<circle cx="12" cy="110" r="9" fill="{WHITE}"/></g>'
    )


# 殴り算を 45° で斬ってずらす（x + y = 1120 の線で切断、右側を (54,-54) ずらす）
def kanji_sliced(uid):
    return (
        f'<defs><clipPath id="{uid}L"><path d="M-500 -1500H2620L-500 1620Z"/></clipPath>'
        f'<clipPath id="{uid}R"><path d="M2620 -1500H4000V1500H-380Z"/></clipPath></defs>'
        f'<path d="{KANJI_D}" fill="{WHITE}" clip-path="url(#{uid}L)"/>'
        f'<g transform="translate(54 -54)"><path d="{KANJI_D}" fill="{WHITE}" clip-path="url(#{uid}R)"/></g>'
        f'<path d="M929 191L2071 -951" stroke="{ACCENT}" stroke-width="31"/>'
    )


def beatmath():
    return f'<path d="{words["BEAT"]}" fill="{ACCENT}"/><path d="{words["MATH"]}" fill="{WHITE}"/>'


# 文字列の列（幅390px）：殴り算（高さ130）→ 18 → BEATMATH（高さ60）→ 18 → サブタイトル
K = 0.13            # 殴り算 1000単位 → 130px
E = 390 / 6380      # BEATMATH の viewBox(-80..6300) を 390px に
S = 0.018           # Russo One 18px


def column(uid, with_sub=True):
    s = (f'<g transform="translate(0 114.4) scale({K})">{kanji_sliced(uid)}</g>'
         f'<g transform="translate({80 * E:.2f} {148 + 880 * E:.2f}) scale({E:.5f})">{beatmath()}</g>')
    if with_sub:
        s += f'<g transform="translate(0 {226 + 700 * S:.2f}) scale({S})"><path d="{SUB_D}" fill="{SUB}"/></g>'
    return s


def lockup(uid):  # 646×244 相当（盾 220 ＋ 36 ＋ 文字列 390）
    return (f'<g transform="translate(0 0)">{emblem()}</g>'
            f'<g transform="translate(256 -12)">{column(uid)}</g>')


def save(name, text):
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(text)


# logo.svg（800×520、C4 と同じ配置）
save('logo.svg',
     f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" width="800" height="520" role="img" aria-label="殴り算 BeatMath">'
     f'<rect width="800" height="520" fill="{NAVY}"/><g transform="translate(77 150)">{lockup("lg")}</g></svg>\n')

# og-image.svg（1200×630）
save('og-image.svg',
     f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">'
     f'<rect width="1200" height="630" fill="{NAVY}"/>'
     f'<g transform="translate(600 315) scale(1.5) translate(-323 -110)">{lockup("og")}</g></svg>\n')

# favicon.svg（角丸の紺地に盾と剣）
save('favicon.svg',
     f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220">'
     f'<rect width="220" height="220" rx="48" fill="{NAVY}"/>'
     f'<g transform="translate(110 110) scale(0.86) translate(-110 -110)">{emblem(bold=True)}</g></svg>\n')

# apple-touch-icon 用（角丸なし：iOS が角を丸める）
save('_touch.svg',
     f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220">'
     f'<rect width="220" height="220" fill="{NAVY}"/>'
     f'<g transform="translate(110 110) scale(0.78) translate(-110 -110)">{emblem(bold=True)}</g></svg>\n')

# 画面ヘッダー用（盾と剣 ＋ 殴り算/BEATMATH の2段、サブタイトルなし）
with open(os.path.join(ROOT, 'src', 'logo', 'header-logo.html'), 'w') as f:
    f.write(
     '<h1 class="logo" aria-label="殴り算 BeatMath">'
     f'<svg class="logo-emblem" viewBox="0 0 220 220" aria-hidden="true">{emblem(bg="#14161f")}</svg>'
     f'<svg class="logo-word" viewBox="-4 -12 404 224" aria-hidden="true">{column("hd", with_sub=False)}</svg>'
     '</h1>\n')

# PNG 書き出し
rsvg = shutil.which('rsvg-convert')
if rsvg:
    subprocess.run([rsvg, '-w', '180', '-h', '180', os.path.join(OUT, '_touch.svg'),
                    '-o', os.path.join(OUT, 'apple-touch-icon.png')], check=True)
    subprocess.run([rsvg, '-w', '1200', '-h', '630', os.path.join(OUT, 'og-image.svg'),
                    '-o', os.path.join(OUT, 'og-image.png')], check=True)
os.remove(os.path.join(OUT, '_touch.svg'))
print('BEATMATH幅', EN_W, 'サブタイトル幅', SUB_W)
