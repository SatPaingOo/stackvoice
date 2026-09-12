export type Child = Node | string | null | undefined | false;

export interface ElementProps {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly dataset?: Readonly<Record<string, string>>;
  readonly on?: { readonly [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };
}

/**
 * Builds an element in one expression.
 *
 * Text always goes in as text, never as markup, so nothing the server returns
 * or a person types can turn into HTML on the page.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className !== undefined) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) node.setAttribute(name, value);
  for (const [name, value] of Object.entries(props.dataset ?? {})) node.dataset[name] = value;
  for (const [type, listener] of Object.entries(props.on ?? {})) {
    node.addEventListener(type, listener as EventListener);
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

/** An element the server rendered. Missing means the page and its script disagree, which is a bug. */
export function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`#${id} is missing from the page`);
  return node as T;
}

let counter = 0;

/** A unique id, so a label can point at the control it belongs to. */
export function uniqueId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
