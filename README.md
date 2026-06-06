# SCORES — Olas de playa

Síntesis procedural de olas con audio espacial, presets, morph entre escenarios y grabación WAV/WebM.

## Uso local

```bash
python3 -m http.server 8765
```

Abre http://127.0.0.1:8765

## Despliegue (GitHub Pages)

Tras el primer push a `main`:

1. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. El workflow publica la app en `https://<usuario>.github.io/SCORES-Symphony/`

## Controles

- **Escuchar** / **Parar audio** — preview con fade
- **Grabar** — inicia grabación + fade-in del audio
- **Presets** — escenarios calibrados con transición progresiva
- **Suavizado (s)** — duración del fade al escuchar/grabar

Auriculares recomendados.
