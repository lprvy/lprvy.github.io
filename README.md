# lprvy.github.io

My portfolio site: **https://lprvy.github.io**

Hand-written HTML, CSS and a little JavaScript, no build step and no frameworks.

- **Prism light:** the hero beam follows your cursor into a glass prism. Each wavelength is refracted with its own index (Snell's law, with exaggerated dispersion), so the light leaves as a rainbow. Plain Canvas 2D; a blurred second canvas gives the glow. It pauses when the hero is off screen and stays still with `prefers-reduced-motion`.
- **ASCII ripple background:** a grid of faint ASCII characters behind the whole page. The cursor drops ripples into a small 2D wave simulation; where the water moves, characters are refracted, brightened and tinted red. Glyphs are pre-drawn into an atlas and copied, so only moving cells are redrawn.
- **Projects:** screenshots come from each project's own repository.

Run it locally:

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## License

Code: MIT. Project screenshots belong to their projects.
