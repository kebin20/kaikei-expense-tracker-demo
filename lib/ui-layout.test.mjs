import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Source/markup regressions, not a replacement for browser or iPhone visual QA.
const source = async (path) =>
  readFile(new URL('../' + path, import.meta.url), 'utf8');
const css = await source('app/globals.css');
function block(text, selector) {
  const start = text.indexOf(selector + ' {');
  assert.notEqual(start, -1, `Missing layout rule: ${selector}`);
  const open = text.indexOf('{', start);
  let depth = 1;
  for (let i = open + 1; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  assert.fail(`Unclosed layout rule: ${selector}`);
}
function jsxElements(text, tag) {
  const file = ts.createSourceFile(
    'view.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found = [];
  function visit(node) {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(file) === tag
    )
      found.push({ element: node, opening: node.openingElement, file });
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === tag)
      found.push({ element: node, opening: node, file });
    ts.forEachChild(node, visit);
  }
  visit(file);
  return found;
}
function attribute(opening, name) {
  return opening.attributes.properties.find(
    (item) => ts.isJsxAttribute(item) && item.name.text === name,
  );
}

const homeCode = ts
  .transpileModule(await source('app/home-primitives.tsx'), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    /from ['"](react(?:\/jsx-runtime)?)['"]/g,
    (_, name) => 'from ' + JSON.stringify(import.meta.resolve(name)),
  );
const { Card } = await import(
  'data:text/javascript;base64,' + Buffer.from(homeCode).toString('base64')
);

test('Home headers retain their title, action and full amount without extra wrappers', () => {
  const title = 'Estimate check for a longer category name';
  const html = renderToStaticMarkup(
    createElement(Card, {
      title,
      className: 'budget-pulse-card home-card-with-action',
      extra: createElement(
        'button',
        { type: 'button' },
        'View monthly expenses',
      ),
      children: createElement('strong', null, '¥9,999,999'),
    }),
  );
  assert.match(html, /kaikei-home-card.*home-card-with-action/);
  assert.ok(html.includes(title));
  assert.match(
    html,
    /ant-card-extra"><button type="button">View monthly expenses/,
  );
  assert.ok(html.includes('¥9,999,999'));
});

test('transaction heading actions are direct grid children, not Ant Space wrappers', async () => {
  const text = await source('app/transactions-view.tsx');
  const heading = jsxElements(text, 'div').find(
    ({ opening }) =>
      attribute(opening, 'className')?.initializer?.text ===
      'transaction-heading-actions',
  );
  assert.ok(heading);
  const buttons = heading.element.children.filter(ts.isJsxElement);
  assert.equal(buttons.length, 3);
  assert.ok(
    buttons.every(
      (child) =>
        child.openingElement.tagName.getText(heading.file) === 'Button',
    ),
  );
  assert.equal(
    attribute(buttons[0].openingElement, 'className').initializer.text,
    'export-month-button',
  );
  assert.match(block(css, '.transaction-heading-actions'), /display: flex/);
  const mobile = block(
    css,
    '@media (max-width: 760px),\n  (orientation: landscape) and (max-width: 960px) and (pointer: coarse)',
  );
  // Locate the action grid globally because earlier mobile blocks handle other screens.
  assert.match(
    css,
    /\.transaction-heading-actions\s*{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.ok(mobile);
  assert.match(
    block(css, '.transactions-heading .export-month-button'),
    /grid-column: 1 \/ -1/,
  );
});

test('budget and month setup dialogs opt into centered, bounded scrolling geometry', async () => {
  for (const path of ['app/budget-dialog.tsx', 'app/month-setup-dialog.tsx']) {
    const [{ opening }] = jsxElements(await source(path), 'Modal');
    assert.match(
      attribute(opening, 'className').initializer.text,
      /ledger-modal/,
    );
    assert.ok(attribute(opening, 'centered'));
    assert.ok(attribute(opening, 'confirmLoading'));
    assert.ok(attribute(opening, 'onOk'));
  }
  assert.match(
    block(css, '.ledger-modal .ant-modal-container'),
    /max-height: calc\(100dvh - 48px\)/,
  );
  assert.match(block(css, '.ledger-modal .ant-modal-body'), /overflow-y: auto/);
  assert.match(block(css, '.ledger-modal .ant-modal-footer'), /flex: none/);
  assert.doesNotMatch(block(css, '.month-setup-form'), /max-height|overflow-y/);
});

test('card-size queries prevent cramped action headers and fixed-cost columns', () => {
  assert.match(
    block(css, '.kaikei-home-card'),
    /container: home-card \/ inline-size/,
  );
  assert.match(
    block(css, '@container home-card (max-width: 640px)'),
    /\.fixed-cost-list\s*{\s*grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(
    block(css, '@container home-card (max-width: 420px)'),
    /\.home-card-with-action \.ant-card-head-wrapper\s*{\s*flex-direction: column/,
  );
  assert.match(block(css, '.fixed-cost-editor'), /grid-column: 1 \/ -1/);
});

test('long labels wrap while financial values retain tabular unbroken digits', () => {
  for (const selector of [
    '.fixed-cost-copy .ant-typography',
    '.transaction-ledger-copy > .ant-typography',
    '.month-setup-plan > .ant-typography',
  ])
    assert.match(block(css, selector), /overflow-wrap: anywhere/);
  assert.match(
    css,
    /\.mobile-transaction > span:nth-child\(2\) \.ant-typography\s*{[^}]*overflow-wrap: anywhere/,
  );
  assert.match(
    css,
    /\.budget-editable-label > \.ant-typography\s*{\s*white-space: normal;\s*overflow-wrap: anywhere/,
  );
  assert.match(
    css,
    /\.mobile-transaction > \.ant-typography:last-child\s*{\s*white-space: nowrap;\s*font-variant-numeric: tabular-nums/,
  );
  assert.match(css, /'planned planned planned actual actual actual'/);
  assert.match(css, /'variance variance variance variance variance variance'/);
});

test('short desktop sidebars scroll and keep the footer in normal document flow', () => {
  const footer = block(css, '.sidebar-footer');
  assert.match(footer, /margin-top: auto/);
  assert.doesNotMatch(footer, /position: absolute|bottom:/);
  assert.match(css, /\.desktop-sider\s*{\s*overflow-y: auto/);
  assert.match(
    block(css, '.desktop-sider .ant-layout-sider-children'),
    /flex-direction: column/,
  );
});

test('tablet headings and toolbars adapt to the width remaining beside the sidebar', () => {
  const marker =
    '/* A sidebar leaves tablet-sized windows less space than their viewport implies. */';
  const tablet = block(
    css.slice(css.indexOf(marker)),
    '@media (min-width: 761px) and (max-width: 1020px)',
  );
  assert.match(tablet, /\.budget-page-heading\s*{[^}]*flex-direction: column/);
  assert.match(tablet, /\.transaction-toolbar\s*{\s*display: grid/);
  assert.match(
    tablet,
    /\.overview-deferred-region.ready\s*{\s*grid-template-columns: minmax\(0, 1fr\)/,
  );
});
