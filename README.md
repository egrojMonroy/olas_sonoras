# SCORES — Olas de playa

Síntesis procedural de olas con audio espacial, presets, morph entre escenarios y grabación WAV/WebM.

## Uso local

```bash
python3 -m http.server 8765
```

Abre http://127.0.0.1:8765

## Despliegue (GitHub Pages)

### 1. Activar Pages (obligatorio, solo una vez)

En el repo: **Settings → Pages → Build and deployment**

- **Source:** elige **GitHub Actions** (no “Deploy from a branch”)

Si no ves “GitHub Actions”, guarda cualquier opción, recarga la página y vuelve a entrar en Settings → Pages.

### 2. Desplegar

Tras el push a `main`, el workflow **Deploy GitHub Pages** corre solo.

Si falla con `404 Not Found`, casi siempre falta el paso 1. Luego ve a **Actions → Deploy GitHub Pages → Re-run all jobs**.

URL final: `https://egrojMonroy.github.io/olas_sonoras/`

## Controles

- **Escuchar** / **Parar audio** — preview con fade
- **Grabar** — inicia grabación + fade-in del audio
- **Presets** — escenarios calibrados con transición progresiva
- **Suavizado (s)** — duración del fade al escuchar/grabar

Auriculares recomendados.
