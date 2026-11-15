// The package's own types are not found under the "exports" resolution this project uses; only this function is needed.
declare module 'dom-accessibility-api' {
  export function computeAccessibleName(element: Element): string
}
