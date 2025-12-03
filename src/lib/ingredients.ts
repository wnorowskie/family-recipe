import { ingredientUnitEnum, type RecipeIngredientUnit } from '@/lib/validation';

export const ingredientUnitLabels: Record<RecipeIngredientUnit, string> = {
  tsp: 'tsp',
  tbsp: 'tbsp',
  cup: 'Cup',
  fl_oz: 'Fl oz',
  pint: 'Pint',
  quart: 'Quart',
  gallon: 'Gallon',
  ml: 'mL',
  l: 'L',
  oz: 'oz',
  lb: 'lb',
  g: 'g',
  kg: 'kg',
  whole: 'Whole',
  piece: 'Piece',
  slice: 'Slice',
  clove: 'Clove',
  can: 'Can',
  jar: 'Jar',
  packet: 'Packet',
  stick: 'Stick',
  bunch: 'Bunch',
  head: 'Head',
  sprig: 'Sprig',
  dash: 'Dash',
  pinch: 'Pinch',
  drop: 'Drop',
  splash: 'Splash',
  unitless: 'Unitless',
};

export const ingredientUnitOptions = ingredientUnitEnum.options.map((unit) => ({
  value: unit,
  label: ingredientUnitLabels[unit] ?? unit,
}));

export function formatIngredientUnit(unit: RecipeIngredientUnit): string {
  return ingredientUnitLabels[unit] ?? unit;
}
