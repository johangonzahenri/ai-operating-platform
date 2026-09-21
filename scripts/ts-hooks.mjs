export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.js') && (specifier.startsWith('./') || specifier.startsWith('../'))) {
    const tsSpecifier = specifier.slice(0, -3) + '.ts';
    try {
      return await nextResolve(tsSpecifier, context);
    } catch (e) {
      // fallback
    }
  }
  return nextResolve(specifier, context);
}
