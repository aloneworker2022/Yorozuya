"""背後體位的玩家（第一人稱往下看自己）：畫面最底一大片腹部（圓頂、肚臍），陰莖從腹部頂端往上伸到她的陰唇。
跟正面一樣是影子男：實心黑、外框一圈；陰莖形狀照 trace128.py（龜頭 9.5 格、冠狀溝最寬、莖往根部微微變粗）。"""
import math
N, MIDX = 128, 64
BG = (40, 34, 50)
EDGE, BASE = (70, 62, 82, 255), (20, 18, 26, 255)
PEN_GLANS = 9.5
BELLY = dict(cx=64, cy=152, rx=60, ry=43)        # 腹部圓頂：頂在 y109，到畫面底大約佔滿左右


def draw_pov(im, tip):
    px = im.load()
    shadow = set()
    cor = tip + PEN_GLANS
    def shaft_w(y): return 4.8 + 1.4 * min(1, (y - cor) / (N - cor))
    def glans_w(y):
        t = (y - tip) / PEN_GLANS
        return 5.9 * max(0, math.sin(math.pi / 2 * min(1, t * 1.25))) ** .5 if t >= 0 else 0
    top_belly = BELLY['cy'] - BELLY['ry']
    for y in range(int(tip), int(top_belly) + 3):
        w = glans_w(y + .5) if y < cor else shaft_w(y + .5)
        for x in range(MIDX - 8, MIDX + 9):
            if abs(x + .5 - MIDX) <= w: shadow.add((x, y))
    for y in range(int(top_belly), N):
        for x in range(N):
            if ((x + .5 - BELLY['cx']) / BELLY['rx']) ** 2 + ((y + .5 - BELLY['cy']) / BELLY['ry']) ** 2 <= 1: shadow.add((x, y))
    for (x, y) in shadow:
        edge = any((x + dx, y + dy) not in shadow and 0 <= y + dy < N and 0 <= x + dx < N for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        px[x, y] = EDGE if edge else BASE
    for x in range(MIDX - 2, MIDX + 2): px[x, int(top_belly) + 6] = EDGE          # 肚臍
    for (x, y) in shadow:                                                          # 黑影外面碰到底色的地方一圈白邊
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in shadow and 0 <= q[0] < N and 0 <= q[1] < N and px[q[0], q[1]][:3] == BG: px[q[0], q[1]] = (255, 255, 255, 255)
    return im
