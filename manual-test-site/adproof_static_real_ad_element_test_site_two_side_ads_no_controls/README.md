# AdProof static test page

This is a simple static sandbox for testing AdProof layout and ad-zone selectors.

## Important

The ad image source is hardcoded to:

```html
file:///C:/static_banner.jpg
```

Place your banner image here on Windows:

```text
C:/static_banner.jpg
```

Open `index.html` directly in the browser for this local file path to work. If you serve the page over `http://localhost`, most browsers will block loading a `file:///C:/...` image from an HTTP page.

## Selectors

```text
[data-adproof-slot="left-sidebar"]
[data-adproof-slot="middle-sidebar"]
[data-adproof-content="protected"]
```

Manual demo buttons were removed. Use real SDK checks, browser DevTools, uBlock, proxy tests, or backend scenarios for validation testing.
