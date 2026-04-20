import next from 'eslint-config-next';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['node_modules/**', '.next/**', 'public/uploads/**', 'figma/**'] },
  ...next,
  prettier,
  {
    rules: {
      'react/jsx-props-no-spreading': 'off',
      // Next 16 / eslint-plugin-react-hooks 7 introduced this rule; demoted to
      // warn for the upgrade so pre-existing effect patterns don't block CI.
      // Track cleanup separately.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];
