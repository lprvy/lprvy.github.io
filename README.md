# lprvy.github.io

My portfolio site: **https://lprvy.github.io**

Hand-written HTML, CSS and a little JavaScript, no build step and no frameworks.

Everything on the page is text: one monospace font, ASCII art headings and an ASCII background.

- **ASCII prism:** the hero beam follows your cursor into a glass prism. Each wavelength is refracted with its own index (Snell's law, with exaggerated dispersion), so the light leaves as a rainbow. The prism and the light are drawn with background characters: the glass with `/ \ _`, the beam and the rainbow as coloured glyphs.
- **ASCII ripple background:** a grid of faint ASCII characters behind the whole page. The cursor drops ripples into a small 2D wave simulation; where the water moves, characters are refracted, brightened and tinted red. Glyphs are pre-drawn into an atlas and copied, so only moving cells are redrawn.
- **ASCII headings:** big letters are drawn off screen and sampled into characters.
- **Stack strip:** a marquee made of single characters. Move the cursor (or a finger) over it and the letters scatter, mutate and drift back home.
- **Evolving projects:** phone-sized cards sit side by side; scrolling moves the row sideways. As a card nears the focus line its ASCII picture evolves in five steps: 1-bit, dots, ramp, dense, colour.
- **Projects:** screenshots come from each project's own repository.
- With `prefers-reduced-motion` nothing animates; the project row becomes a normal horizontal scroller.

Run it locally:

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## License

Code: MIT. Project screenshots belong to their projects.
