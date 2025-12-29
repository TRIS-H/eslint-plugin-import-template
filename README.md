# eslint-plugin-import-template

An eslint plugin that checks the existence of static resources in the template, for example, checks whether the static resource files introduced in the sfc module exist. 

This plugin currently only supports static resource checking of the vue-sfc template. 

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
