import next from 'eslint-config-next';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['node_modules/**', '.next/**', 'public/uploads/**', 'figma/**'] },
  ...next,
  prettier,
  {
    rules: {
      'react/jsx-props-no-spreading': 'off',
    },
  },
];
