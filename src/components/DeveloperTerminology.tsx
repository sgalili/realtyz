import { useEffect } from 'react';
import { useUserRole } from '@/hooks/useUserRole';

/**
 * For developer (יזם) accounts, swaps broker wording ("מתווך") for developer wording ("יזם")
 * across the signed-in interface. Typed content (inputs/textareas/editable areas) and
 * anything marked data-keep-terms is left untouched.
 */
const RULES: [RegExp, string][] = [
  [/מתווכים/g, 'יזמים'],
  [/מתווכות/g, 'יזמיות'],
  [/מתווכת/g, 'יזמת'],
  [/מתווך/g, 'יזם'],
];
const SKIP = new Set(['INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'CODE', 'PRE']);

function shouldSkip(el: Element | null) {
  while (el) {
    if (SKIP.has(el.tagName) || (el as HTMLElement).isContentEditable || el.hasAttribute('data-keep-terms')) return true;
    el = el.parentElement;
  }
  return false;
}
function fixText(node: Text) {
  const v = node.nodeValue;
  if (!v || !v.includes('מתוו')) return;
  if (shouldSkip(node.parentElement)) return;
  let out = v;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  if (out !== v) node.nodeValue = out;
}
function fixAttrs(el: Element) {
  for (const a of ['placeholder', 'title', 'aria-label']) {
    const v = el.getAttribute(a);
    if (v && v.includes('מתוו')) {
      let out = v;
      for (const [re, rep] of RULES) out = out.replace(re, rep);
      el.setAttribute(a, out);
    }
  }
}
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return fixText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  fixAttrs(root as Element);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null;
  while ((n = w.nextNode())) n.nodeType === Node.TEXT_NODE ? fixText(n as Text) : fixAttrs(n as Element);
}

export function DeveloperTerminology() {
  const { isDeveloper, isSuperAdmin } = useUserRole();
  const active = isDeveloper && !isSuperAdmin;
  useEffect(() => {
    if (!active) return;
    walk(document.body);
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') fixText(m.target as Text);
        else if (m.type === 'attributes') fixAttrs(m.target as Element);
        else m.addedNodes.forEach(walk);
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
    return () => obs.disconnect();
  }, [active]);
  return null;
}
