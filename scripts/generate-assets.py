import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
PALETTE = {
    "blue": (232, 247, 255),
    "peach": (215, 162, 109),
    "plum": (107, 76, 90),
    "white": (255, 255, 255),
}


class Canvas:
    def __init__(self, width, height, background, channels=3):
        self.width = width
        self.height = height
        self.channels = channels
        pixel = bytes(background)
        self.pixels = bytearray(pixel * (width * height))

    def set_pixel(self, x, y, color):
        if 0 <= x < self.width and 0 <= y < self.height:
            offset = (y * self.width + x) * self.channels
            self.pixels[offset:offset + self.channels] = bytes(color)

    def rounded_rect(self, x, y, width, height, radius, color):
        left, top = max(0, x), max(0, y)
        right, bottom = min(self.width, x + width), min(self.height, y + height)
        for py in range(top, bottom):
            cy = min(max(py + 0.5, y + radius), y + height - radius)
            for px in range(left, right):
                cx = min(max(px + 0.5, x + radius), x + width - radius)
                if (px + 0.5 - cx) ** 2 + (py + 0.5 - cy) ** 2 <= radius ** 2:
                    self.set_pixel(px, py, color)

    def circle(self, cx, cy, radius, color):
        for y in range(max(0, int(cy - radius)), min(self.height, int(cy + radius + 1))):
            for x in range(max(0, int(cx - radius)), min(self.width, int(cx + radius + 1))):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius ** 2:
                    self.set_pixel(x, y, color)

    def logo(self, cx, cy, scale, color=None):
        color = color or PALETTE["plum"]
        outer, inner = 270 * scale, 184 * scale
        for y in range(max(0, int(cy - outer - 1)), min(self.height, int(cy + outer + 1))):
            for x in range(max(0, int(cx - outer - 1)), min(self.width, int(cx + outer + 1))):
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                distance = math.hypot(dx, dy)
                angle = math.degrees(math.atan2(dy, dx)) % 360
                if inner <= distance <= outer and 43 <= angle <= 317:
                    self.set_pixel(x, y, color)
        for offset in (-66, 0, 66):
            self.circle(cx, cy + offset * scale, 18 * scale, PALETTE["white"])

    def text_coucou(self, x, y, scale, color=None):
        color = color or PALETTE["plum"]
        glyphs = {
            "C": ("01110", "11000", "10000", "10000", "10000", "11000", "01110"),
            "O": ("01110", "11011", "10001", "10001", "10001", "11011", "01110"),
            "U": ("10001", "10001", "10001", "10001", "10001", "11011", "01110"),
        }
        text = "COUCOU"
        letter_width = 5 * scale
        gap = scale
        x -= (len(text) * letter_width + (len(text) - 1) * gap) // 2
        for index, letter in enumerate(text):
            for row, bits in enumerate(glyphs[letter]):
                for column, bit in enumerate(bits):
                    if bit == "1":
                        self.rounded_rect(
                            x + index * (letter_width + gap) + column * scale,
                            y + row * scale,
                            scale,
                            scale,
                            max(1, scale // 5),
                            color,
                        )

    def save(self, filename):
        color_type = 6 if self.channels == 4 else 2
        rows = bytearray()
        stride = self.width * self.channels
        for y in range(self.height):
            rows.append(0)
            start = y * stride
            rows.extend(self.pixels[start:start + stride])

        def chunk(name, data):
            return (
                struct.pack(">I", len(data))
                + name
                + data
                + struct.pack(">I", zlib.crc32(name + data) & 0xFFFFFFFF)
            )

        header = struct.pack(">IIBBBBB", self.width, self.height, 8, color_type, 0, 0, 0)
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")
        (ASSETS / filename).write_bytes(png)


def create_icon():
    icon = Canvas(1024, 1024, PALETTE["blue"])
    icon.rounded_rect(96, 96, 832, 832, 220, PALETTE["peach"])
    icon.logo(512, 512, 1)
    icon.save("icon-only.png")

    foreground = Canvas(1024, 1024, (0, 0, 0, 0), channels=4)
    foreground.logo(512, 512, 1)
    foreground.save("icon-foreground.png")

    background = Canvas(1024, 1024, PALETTE["peach"])
    background.save("icon-background.png")


def create_splash():
    size = 2732
    splash = Canvas(size, size, PALETTE["blue"])
    splash.logo(size // 2, 1070, 1.05)
    splash.text_coucou(size // 2, 1550, 22)
    splash.save("splash.png")

    dark_splash = Canvas(size, size, (51, 51, 51))
    dark_splash.logo(size // 2, 1070, 1.05, PALETTE["peach"])
    dark_splash.text_coucou(size // 2, 1550, 22, PALETTE["blue"])
    dark_splash.save("splash-dark.png")


if __name__ == "__main__":
    ASSETS.mkdir(exist_ok=True)
    create_icon()
    create_splash()
