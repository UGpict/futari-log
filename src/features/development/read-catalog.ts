// Loaded only by the development route, on the server. Never imported by previews.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { CatalogData, ComponentEntry } from "./catalog-types";

export async function readCatalog(): Promise<CatalogData> {
  if (process.env.NODE_ENV !== "development") throw new Error("Development catalog is disabled");
  const root = process.cwd();
  const files = (await readdir(path.join(root, "src"), { recursive: true }))
    .map(file => `src/${file.replaceAll(path.sep, "/")}`)
    .filter(file => !file.includes("/development/") && !file.includes("/dev/") && !file.includes("/development-link"))
    .sort();
  const sources = await Promise.all(files.filter(file => file.endsWith(".tsx")).map(async file => ({
    file,
    source: ts.createSourceFile(file, await readFile(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  })));
  const inventory: ComponentEntry[] = [];
  for (const { file, source } of sources.filter(item => /^src\/(components|features)\//.test(item.file))) {
    function visit(node: ts.Node) {
      const name = ts.isFunctionDeclaration(node) ? node.name?.text
        : ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) ? node.name.text : undefined;
      if (name && /^[A-Z]/.test(name)) inventory.push({ name, file, kind: file.includes("/components/") ? "共通" : "画面・専用", usages: [] });
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  for (const item of inventory) {
    for (const { file, source } of sources) {
      const names = new Set<string>();
      if (file === item.file) names.add(item.name);
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const specifier = statement.moduleSpecifier.text;
        const resolved = specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : specifier.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)) : "";
        if (resolved !== item.file.replace(/\.tsx$/, "")) continue;
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
          if ((binding.propertyName ?? binding.name).text === item.name) names.add(binding.name.text);
        }
        if (statement.importClause?.name && source !== sources.find(s => s.file === item.file)?.source) {
          // Default imports are resolved to the component declared in the target file.
          const target = sources.find(s => s.file === item.file)?.source;
          if (target?.statements.some(s => ts.isFunctionDeclaration(s) && s.name?.text === item.name && s.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword))) names.add(statement.importClause.name.text);
        }
      }
      let count = 0;
      function countUsage(node: ts.Node) {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && names.has(node.tagName.getText(source))) count++;
        ts.forEachChild(node, countUsage);
      }
      countUsage(source);
      if (count) item.usages.push({ file, count });
    }
  }
  const colors = new Map<string, CatalogData["literalColors"][number]>();
  for (const file of files.filter(file => file.startsWith("src/features/") && file.endsWith(".css"))) {
    const css = (await readFile(path.join(root, file), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/#[\da-f]{3,8}\b/gi)) {
      const color = match[0].toLowerCase();
      const entry = colors.get(color) ?? { color, count: 0, files: [] };
      entry.count++;
      if (!entry.files.includes(file)) entry.files.push(file);
      colors.set(color, entry);
    }
  }
  const globalCss = (await readFile(path.join(root, "src/app/globals.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  const colorTokens = [...globalCss.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)]
    .filter(([, token, value]) => !token.startsWith("--font-") && /#|gradient\(|^(?:var\(--(?:surface|text|border|action|color|focus)-)/.test(value.trim()))
    .map(([, token, value]) => ({ token, value: value.trim() }));
  return { inventory, literalColors: [...colors.values()].sort((a, b) => b.count - a.count), colorTokens };
}
