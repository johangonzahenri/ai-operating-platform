# AR & 3D Virtual Fitting Room Governance

## 1. Asset Governance & Grammar

AR assets are uniquely addressed and governed using uniform resource names (URNs) and strict semantic versioning (SemVer):

- **URN Grammar**: `urn:tentaciones:ar:<category>:<productSlug>`
  - Categories: `footwear`, `apparel`, `outerwear`, `accessories`
  - Examples:
    - `urn:tentaciones:ar:footwear:runner-black-pro`
    - `urn:tentaciones:ar:apparel:jacket-leather-black`
- **Version Control**: Strict SemVer (`v1.0.0`, `v2.1.0-beta.1`).

---

## 2. Avatar Reference Profiles

To provide realistic try-on simulations, the system supports 3 calibrated avatar profiles:

| Profile | Build | Default Chest | Default Waist | Default Hips | Default Foot |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Nova** | Athletic / Slim | 88 cm | 72 cm | 92 cm | 25.5 cm |
| **Sora** | Standard / Regular | 98 cm | 82 cm | 100 cm | 27.0 cm |
| **Mateo** | Broad / Plus | 110 cm | 96 cm | 112 cm | 28.5 cm |

---

## 3. Resolution States & Graceful Degradation

- `AR_AVAILABLE`: 3D/AR model resolved and interactive preview URL generated.
- `AR_NOT_AVAILABLE`: Platform or asset catalog unavailable; gracefully degrades to `STANDARD_2D_VIEW`.
- `AR_ASSET_INVALID`: Malformed URN syntax; degrades safely to 2D view with validation feedback.
- `AR_ASSET_OUTDATED`: Unsupported asset version; degrades to standard preview.
- `AR_PREVIEW_FAILED`: Rendering error; triggers fallback mode without breaking user checkout.
