## Build setup

1. `npm install` (initial setup)
2. `npm run build`

## How to embedd

```html
<link href="/loomicons/build/loomicons.css" rel="stylesheet" />
```

```css

:root {
  font-family: basic, sans-serif;
}

```

### Drupal library

```yml

loomicons:
  base:
    assets/loomicons/build/loomicons.css:
      minified: false
```
