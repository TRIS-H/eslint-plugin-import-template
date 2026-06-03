# eslint-plugin-import-template

An ESLint plugin for Vue SFC templates that checks unresolved static asset paths in `src` and `href` attributes.

It helps find missing local images, icons, and other template assets referenced by Vue single-file components before they become runtime 404 errors.

Keywords: ESLint rule, Vue SFC, Vue template, vue-eslint-parser, static assets, asset exists, unresolved import, no-unresolved, src href, path alias.

## Install

```bash
npm install eslint-plugin-import-template --save-dev
```

## Usage

```js
module.exports = {
  plugins: ['import-template'],
  rules: {
    'import-template/vue-template-no-unresolved': 'error',
  },
};
```
